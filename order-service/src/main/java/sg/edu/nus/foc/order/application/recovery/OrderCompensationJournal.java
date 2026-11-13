package sg.edu.nus.foc.order.application.recovery;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import sg.edu.nus.foc.order.application.OrderOutboxDispatchRequested;
import sg.edu.nus.foc.order.domain.OrderProblem;

/** Order-owned compensation intent, atomic outbox and result inbox; no Credit ledger replica. */
@Service
@RequiredArgsConstructor
public class OrderCompensationJournal {
    private final JdbcTemplate jdbc;
    private final JsonMapper json;
    private final OrderCommandStore commands;
    private final ApplicationEventPublisher events;

    @Transactional
    public void remoteSucceeded(OrderCommandStore.Entry claim) {
        commands.assertOwned(claim);
        jdbc.update("update order_commands set credit_step_status='SUCCESS', updated_at=clock_timestamp() where command_id=?", claim.key());
    }

    /** Called inside the transaction containing every local business write. */
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.MANDATORY)
    public void localSucceeded(OrderCommandStore.Entry claim) {
        commands.assertOwned(claim);
        var row = locked(claim.key());
        if (!"SUCCESS".equals(row.get("credit_step_status")) || row.get("compensation_id") != null) {
            throw OrderProblem.conflict("Credit success is not confirmed or compensation has started.");
        }
    }

    @Transactional
    public void rejected(OrderCommandStore.Entry claim, String code) {
        commands.assertOwned(claim);
        finishRejected(claim.key(), "FAILED", code == null ? "REJECTED" : code,
                "Request was rejected without a Credit effect.");
    }

    @Transactional
    public void abandon(OrderCommandStore.Entry claim, String code) {
        abandon(claim, code, null);
    }

    @Transactional
    public void abandon(OrderCommandStore.Entry claim, String code, String businessMessage) {
        var row = locked(claim.key());
        // A lost commit acknowledgment, or a newer worker/decision, must not
        // allow this caller to compensate committed success or steal ownership.
        if (!pending(row) || !Objects.equals(claim.owner(), row.get("owner"))
                || ((Number) row.get("generation")).longValue() != claim.generation()) return;
        chooseCompensation(row, code, businessMessage);
    }

    public List<String> due(int limit) {
        return jdbc.queryForList("""
            select command_id from order_commands where recovery_policy='COMPENSATE' and status='PENDING'
              and (lease_expires_at is null or lease_expires_at<=clock_timestamp())
              and ((compensation_id is null and resolution_deadline_at<=clock_timestamp())
                or (compensation_id is not null and next_retry_at<=clock_timestamp()))
            order by resolution_deadline_at limit ?
            """, String.class, limit);
    }

    @Transactional
    public void recover(String key) {
        var row = locked(key);
        if (!pending(row)) return;
        // Recheck database time after locking; selecting an ID never grants a claim.
        Boolean eligible = jdbc.queryForObject("""
            select (lease_expires_at is null or lease_expires_at<=clock_timestamp()) and
              ((compensation_id is null and resolution_deadline_at<=clock_timestamp()) or
               (compensation_id is not null and next_retry_at<=clock_timestamp()))
            from order_commands where command_id=?
            """, Boolean.class, key);
        if (!Boolean.TRUE.equals(eligible)) return;
        if (row.get("compensation_id") == null) chooseCompensation(row, "RECOVERY_DEADLINE");
        else {
            String id = (String) row.get("compensation_id");
            // Semantic retry after a lost result: preserve C and payload. Never
            // steal an in-progress publisher or silently redrive exhausted FAILED.
            jdbc.update("""
                update order_event_outbox set state='PENDING', attempt_count=0,
                  next_attempt_at=clock_timestamp(), lease_until=null, last_error=null
                where event_id=? and state='PUBLISHED'
                """, id);
            jdbc.update("update order_commands set next_retry_at=clock_timestamp()+interval '30 seconds' where command_id=?", key);
            events.publishEvent(new OrderOutboxDispatchRequested(id));
        }
    }

    private void chooseCompensation(Map<String,Object> row, String code) {
        chooseCompensation(row, code, null);
    }

    private void chooseCompensation(Map<String,Object> row, String code, String businessMessage) {
        String key = (String) row.get("command_id");
        if (!Boolean.TRUE.equals(row.get("possible_effect"))) {
            finishRejected(key, "FAILED", code, businessMessage == null || businessMessage.isBlank()
                    ? "We could not complete this request. Please refresh the order and try again."
                    : businessMessage);
            return;
        }
        if (row.get("compensation_id") != null) return;
        OrderCommandStore.Entry command = commands.get(key);
        long generation = ((Number) row.get("generation")).longValue() + 1;
        String id = UUID.nameUUIDFromBytes(("CreditCompensationRequested:" + key).getBytes(StandardCharsets.UTF_8)).toString();
        String operation = operation(command.kind());
        String order = "REPOST".equals(command.kind()) ? command.candidateOrderId() : command.orderId();
        Long amount = "RESERVE".equals(operation) ? command.input().creation().amount() : null;
        var message = new CreditCompensationRequest(id, key, operation, order, command.actorId(), generation, amount);
        jdbc.update("""
            update order_commands set compensation_id=?, compensation_generation=?, generation=?,
              owner=null, lease_expires_at=null, reason='COMPENSATING',
              message='We are reversing or fencing the Credit request. Please wait.',
              next_retry_at=clock_timestamp()+interval '30 seconds', updated_at=clock_timestamp()
            where command_id=?
            """, id, generation, generation, key);
        jdbc.update("""
            insert into order_event_outbox(event_id,order_id,command_id,event_type,event_version,order_version,payload,
              state,attempt_count,created_at,next_attempt_at)
            values (?,null,?,'CreditCompensationRequested',1,0,?,'PENDING',0,clock_timestamp(),clock_timestamp())
            on conflict(event_id) do nothing
            """, id, key, json.writeValueAsString(message));
        events.publishEvent(new OrderOutboxDispatchRequested(id));
    }

    /** Trusted receiver boundary; called only after broker authentication and envelope validation. */
    @Transactional
    public void accept(CreditCompensationResult result) {
        validate(result);
        var row = locked(result.commandId());
        OrderCommandStore.Entry command = commands.get(result.commandId());
        String order = "REPOST".equals(command.kind()) ? command.candidateOrderId() : command.orderId();
        if (!Objects.equals(result.compensationId(), row.get("compensation_id"))
                || !Objects.equals(order, result.orderId()) || !operation(command.kind()).equals(result.operation())
                || !Objects.equals(row.get("compensation_generation"), Long.valueOf(result.generation()))) {
            throw OrderProblem.conflict("Credit compensation result does not match the saved request.");
        }
        String hash = hash(json.writeValueAsString(result));
        var prior = jdbc.queryForList("select payload_hash from order_compensation_result_inbox where event_id=?", String.class, result.eventId());
        if (!prior.isEmpty()) {
            if (!hash.equals(prior.getFirst())) throw OrderProblem.conflict("Compensation event ID has different content.");
            return;
        }
        if ("SUCCESS".equals(row.get("final_stage_status"))) throw OrderProblem.conflict("Cannot compensate a committed success.");
        if ("SUCCESS".equals(row.get("credit_step_status")) && "FENCED_NO_EFFECT".equals(result.code())) {
            throw OrderProblem.conflict("A no-effect result contradicts the confirmed Credit effect.");
        }
        if ("FULLY_COMPENSATED".equals(row.get("final_stage_status")) && !"COMPENSATED".equals(result.outcome())) {
            throw OrderProblem.conflict("A later result cannot undo confirmed compensation.");
        }
        jdbc.update("insert into order_compensation_result_inbox(event_id,compensation_id,command_id,payload_hash) values (?,?,?,?)",
                result.eventId(), result.compensationId(), result.commandId(), hash);
        // A duplicate semantic result with a different delivery/result ID may be
        // audited, but must not repeat finalization or repost failure versioning.
        if ("FULLY_COMPENSATED".equals(row.get("final_stage_status"))) return;
        if ("COMPENSATED".equals(result.outcome())) {
            finishRejected(result.commandId(), "COMPENSATED", "COMPENSATED", "Request did not complete; Credit confirmed reversal or fencing.");
        } else {
            jdbc.update("""
                update order_commands set reason='RECONCILIATION_REQUIRED',
                  message='The Credit outcome requires investigation. This request remains unresolved.',
                  next_retry_at=clock_timestamp()+interval '5 minutes', updated_at=clock_timestamp()
                where command_id=? and status='PENDING'
                """, result.commandId());
        }
    }

    private static void validate(CreditCompensationResult result) {
        if (result == null || !uuid(result.eventId()) || !uuid(result.compensationId())
                || result.commandId() == null || result.commandId().isBlank() || result.commandId().length()>128
                || result.orderId() == null || result.orderId().isBlank() || result.orderId().length()>36
                || result.generation()<1 || result.operation() == null || !List.of("RESERVE","ASSIGN_COURIER","CLEAR_COURIER").contains(result.operation())
                || result.code() == null || result.code().isBlank() || result.code().length()>80
                || !("RECONCILIATION_REQUIRED".equals(result.outcome()) ||
                     ("COMPENSATED".equals(result.outcome()) && List.of("REVERSED","FENCED_NO_EFFECT").contains(result.code())))) {
            throw new OrderProblem("VALIDATION_ERROR", "Invalid Credit compensation result.");
        }
    }
    private static boolean uuid(String value) {
        try { return value != null && UUID.fromString(value).toString().equals(value); }
        catch (IllegalArgumentException invalid) { return false; }
    }
    private Map<String,Object> locked(String key) {
        var rows = jdbc.queryForList("select * from order_commands where command_id=? and recovery_policy='COMPENSATE' for update nowait", key);
        if (rows.isEmpty()) throw OrderProblem.notFound("Compensation command not found.");
        return rows.getFirst();
    }
    private boolean pending(Map<String,Object> row) { return "PENDING".equals(row.get("status")); }
    private void finishRejected(String key, String step, String code, String message) {
        OrderCommandStore.Entry command = commands.get(key);
        if ("REPOST".equals(command.kind())) {
            if (commands.automaticExecution(key)) {
                message = automaticRejectionMessage(code, message);
            }
            // Preserve the existing requester-visible failure audit. NOWAIT avoids
            // waiting on an ingress transaction that already holds the original.
            jdbc.queryForList("select id from orders where id=? for update nowait", String.class, command.orderId());
            jdbc.update("""
                update orders set repost_failure_code=?, repost_failure_message=?,
                  repost_failure_at=clock_timestamp(), version=version+1
                where id=? and requester_id=? and status='EXPIRED' and reposted_order_id is null
                """, code, message, command.orderId(), command.actorId());
        }
        jdbc.update("""
            update order_commands set status='COMPLETED', outcome='REJECTED', credit_step_status=?,
              final_stage_status='FULLY_COMPENSATED', reason=?, message=?, owner=null, lease_expires_at=null,
              updated_at=clock_timestamp() where command_id=? and status='PENDING'
            """, step, code, message, key);
    }
    private static String automaticRejectionMessage(String code, String fallback) {
        return switch (code) {
            case "INSUFFICIENT_CREDITS" -> "Automatic repost stopped: insufficient available credits. Review the order before reposting manually.";
            case "FORBIDDEN" -> "Automatic repost stopped: the requester is no longer eligible.";
            case "ACCOUNT_NOT_FOUND", "NOT_FOUND" -> "Automatic repost stopped: a required account or location no longer exists.";
            case "VALIDATION_ERROR" -> "Automatic repost stopped: the saved repost details are no longer valid.";
            case "REPOST_EXPIRED" -> "Automatic repost stopped: its expiry has passed.";
            default -> fallback;
        };
    }

    private static String operation(String kind) {
        return switch (kind) {
            case "CREATE","REPOST" -> "RESERVE";
            case "ACCEPT" -> "ASSIGN_COURIER";
            case "ABORT" -> "CLEAR_COURIER";
            default -> throw new IllegalArgumentException("Unsupported compensation operation.");
        };
    }
    private static String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
}
