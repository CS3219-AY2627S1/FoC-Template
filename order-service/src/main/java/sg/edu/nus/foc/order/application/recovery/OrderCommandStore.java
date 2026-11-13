package sg.edu.nus.foc.order.application.recovery;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import sg.edu.nus.foc.order.api.dto.response.OrderResponse;
import sg.edu.nus.foc.order.domain.OrderProblem;

@Repository
@RequiredArgsConstructor
public class OrderCommandStore {
    private final JdbcTemplate jdbc;
    private final JsonMapper json;
    private final sg.edu.nus.foc.order.domain.repository.UserDeletionGuard deletionGuard;

    public record Entry(String key, String actorId, String kind, String orderId,
                        CommandRequest input, String inputHash, String status, String outcome,
                        String reason, String message, int attempts, long generation,
                        String owner, Instant leaseExpiry, Instant nextRetry, boolean possibleEffect,
                        OrderResponse result, String candidateOrderId, Instant createdAt) { }

    @Transactional
    public Entry register(String key, CommandRequest request) {
        return register(key, request, "RETRY", 120);
    }

    @Transactional
    public Entry register(String key, CommandRequest request, String policy, int resolutionSeconds) {
        return register(key, request, policy, resolutionSeconds, false);
    }

    @Transactional
    public Entry registerAutomatic(String key, CommandRequest request, int resolutionSeconds) {
        return register(key, request, "COMPENSATE", resolutionSeconds, true);
    }

    private Entry register(String key, CommandRequest request, String policy, int resolutionSeconds, boolean automatic) {
        if (policy == null || !List.of("RETRY", "COMPENSATE").contains(policy) || resolutionSeconds < 1) {
            throw new OrderProblem("VALIDATION_ERROR", "Invalid recovery policy or deadline.");
        }
        if (request == null || invalidIdentity(key, 128) || invalidIdentity(request.actorId(), 128)
                || request.kind() == null || !List.of("CREATE", "ACCEPT", "ABORT", "REPOST").contains(request.kind())
                || (!request.kind().equals("CREATE") && invalidIdentity(request.orderId(), 36))) {
            throw new OrderProblem("VALIDATION_ERROR", "Invalid command identity or operation.");
        }
        // Predictable scheduler keys must not be claimable through a browser command.
        if (automatic != key.startsWith("AUTO_REPOST:") || automatic && !"REPOST".equals(request.kind())) {
            throw new OrderProblem("VALIDATION_ERROR", "Automatic repost command keys are reserved for the scheduler.");
        }
        deletionGuard.requireAllowed(request.actorId());
        String payload = json.writeValueAsString(request);
        String target = request.kind().equals("CREATE") ? UUID.randomUUID().toString() : request.orderId();
        String candidate = request.kind().equals("REPOST") ? UUID.randomUUID().toString() : null;
        try {
            jdbc.update("""
                insert into order_commands(command_id, actor_id, kind, order_id, input_hash, payload,
                  candidate_order_id,recovery_policy,resolution_deadline_at,automatic_execution)
                values (?, ?, ?, ?, ?, ?::jsonb, ?, ?, clock_timestamp()+(? * interval '1 second'), ?)
                on conflict(command_id) do nothing
                """, key, request.actorId(), request.kind(), target, digest(payload), payload, candidate, policy, resolutionSeconds, automatic);
        } catch (DuplicateKeyException conflict) {
            throw OrderProblem.conflict("An unresolved request already guards this order.");
        }
        Entry saved = get(key);
        if (!saved.actorId().equals(request.actorId()) || !saved.inputHash().equals(digest(payload))
                || !policy.equals(recoveryPolicy(key)) || automatic != automaticExecution(key)) {
            throw OrderProblem.conflict("This command key belongs to different request details.");
        }
        return saved;
    }

    /** Match Credit's existing opaque identifier contract before saving intent. */
    private static boolean invalidIdentity(String value, int max) {
        return value == null || value.isBlank() || value.length() > max || value.contains("/")
                || value.equals(".") || value.equals("..")
                || value.startsWith("__") && value.endsWith("__");
    }

    public Entry get(String key) {
        return find(key).orElseThrow(() -> OrderProblem.notFound("Command not found."));
    }

    public Optional<Entry> find(String key) {
        return jdbc.query("select * from order_commands where command_id=?", this::map, key).stream().findFirst();
    }

    /** Actor-scoped SQL can use the existing actor/time index; return only the newest attempt. */
    public Optional<Entry> latestAutomatic(String orderId, String requesterId) {
        return jdbc.query("""
            select * from order_commands where actor_id=? and order_id=? and automatic_execution
            order by created_at desc,command_id desc limit 1
            """, this::map, requesterId, orderId).stream().findFirst();
    }

    /** Financially safe is necessary, but a business rejection also stops the saved plan. */
    public boolean automaticRetrySafe(String key) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
            select exists(select 1 from order_commands c where c.command_id=? and c.automatic_execution
              and c.kind='REPOST' and c.recovery_policy='COMPENSATE' and c.status='COMPLETED' and c.outcome='REJECTED'
              and c.final_stage_status='FULLY_COMPENSATED' and c.credit_step_status in ('FAILED','COMPENSATED')
              and not exists(select 1 from order_commands rejected
                where rejected.actor_id=c.actor_id and rejected.order_id=c.order_id and rejected.automatic_execution
                  and rejected.status='COMPLETED' and rejected.outcome='REJECTED'
                  and rejected.reason in ('INSUFFICIENT_CREDITS','FORBIDDEN','ACCOUNT_NOT_FOUND',
                    'NOT_FOUND','VALIDATION_ERROR','REPOST_EXPIRED')))
            """, Boolean.class, key));
    }

    public String recoveryPolicy(String key) {
        return jdbc.queryForObject("select recovery_policy from order_commands where command_id=?", String.class, key);
    }

    public boolean automaticExecution(String key) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "select automatic_execution from order_commands where command_id=?", Boolean.class, key));
    }

    @Transactional
    public Optional<Entry> claim(String key, String owner, int seconds, boolean authorizedResume) {
        int changed = jdbc.update("""
            update order_commands set owner=?, lease_expires_at=clock_timestamp() + (? * interval '1 second'),
              generation=generation+1, attempt_count=attempt_count+1, reason='PROCESSING',
              message='Processing your request.', updated_at=clock_timestamp()
            where command_id=? and status='PENDING' and compensation_id is null
              and (next_retry_at<=clock_timestamp() or ?)
              and (lease_expires_at is null or lease_expires_at<=clock_timestamp())
              and (reason<>'AUTHORIZATION_REQUIRED' or ?)
            """, owner, seconds, key, authorizedResume, authorizedResume);
        return changed == 1 ? Optional.of(get(key)) : Optional.empty();
    }

    public void assertOwned(Entry claim) {
        List<String> owned = jdbc.queryForList("""
            select command_id from order_commands where command_id=? and status='PENDING' and compensation_id is null
              and owner=? and generation=? and lease_expires_at>clock_timestamp() for update
            """, String.class, claim.key(), claim.owner(), claim.generation());
        if (owned.isEmpty()) throw OrderProblem.conflict("Command ownership changed; checking its outcome.");
    }

    public void markPossibleEffect(Entry claim) {
        assertOwned(claim);
        int changed = jdbc.update("""
            update order_commands set possible_effect=true where command_id=?
              and (recovery_policy<>'COMPENSATE' or resolution_deadline_at>clock_timestamp())
            """, claim.key());
        if (changed != 1) throw OrderProblem.conflict("The command recovery deadline has passed.");
    }

    public void complete(Entry claim, String outcome, String reason, String message, OrderResponse result) {
        assertOwned(claim);
        jdbc.update("""
            update order_commands set status='COMPLETED', outcome=?, reason=?, message=?, result=?::jsonb,
              final_stage_status=case when recovery_policy='COMPENSATE' then
                case when ?='SUCCESS' then 'SUCCESS' else 'FULLY_COMPENSATED' end
                else final_stage_status end,
              owner=null, lease_expires_at=null, updated_at=clock_timestamp() where command_id=?
            """, outcome, reason, message, result == null ? null : json.writeValueAsString(result), outcome, claim.key());
    }

    @Transactional
    public void defer(Entry claim, String reason, String message, int delay) {
        jdbc.update("""
            update order_commands set reason=?, message=?, next_retry_at=clock_timestamp()+(? * interval '1 second'),
              owner=null, lease_expires_at=null, updated_at=clock_timestamp()
            where command_id=? and status='PENDING' and owner=? and generation=?
            """, reason, message, delay, claim.key(), claim.owner(), claim.generation());
    }

    public List<String> due(int limit) {
        return due(limit, "RETRY");
    }

    public List<String> due(int limit, String policy) {
        return jdbc.queryForList("""
            select command_id from order_commands where status='PENDING' and next_retry_at<=clock_timestamp()
              and recovery_policy=? and compensation_id is null
              and (lease_expires_at is null or lease_expires_at<=clock_timestamp())
              and reason<>'AUTHORIZATION_REQUIRED' order by next_retry_at limit ?
            """, String.class, policy, limit);
    }

    public List<Entry> pendingFor(String actor, int page, int size) {
        return jdbc.query("select * from order_commands where actor_id=? and status='PENDING' order by created_at,command_id limit ? offset ?",
                this::map, actor, size, (long) (page - 1) * size);
    }

    public long pendingCount(String actor) {
        Long count = jdbc.queryForObject("select count(*) from order_commands where actor_id=? and status='PENDING'", Long.class, actor);
        return count == null ? 0 : count;
    }

    public void guard(String orderId) {
        Integer count = jdbc.queryForObject("""
            select count(*) from order_commands where order_id=? and status='PENDING'
              and command_id<>coalesce(?, '')
            """, Integer.class, orderId, CommandScope.current());
        if (count != null && count > 0) throw OrderProblem.conflict("This order has an unresolved request. Please wait.");
    }

    private Entry map(ResultSet r, int row) throws SQLException {
        return new Entry(r.getString("command_id"), r.getString("actor_id"), r.getString("kind"),
            r.getString("order_id"), json.readValue(r.getString("payload"), CommandRequest.class),
            r.getString("input_hash"), r.getString("status"), r.getString("outcome"),
            r.getString("reason"), r.getString("message"), r.getInt("attempt_count"), r.getLong("generation"),
            r.getString("owner"), instant(r, "lease_expires_at"), instant(r, "next_retry_at"),
            r.getBoolean("possible_effect"), r.getString("result") == null ? null
                : json.readValue(r.getString("result"), OrderResponse.class),
            r.getString("candidate_order_id"), instant(r, "created_at"));
    }
    private static Instant instant(ResultSet r, String column) throws SQLException {
        var value = r.getTimestamp(column); return value == null ? null : value.toInstant();
    }
    private static String digest(String payload) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(payload.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
}
