package sg.edu.nus.foc.order.application.reportresolution;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import sg.edu.nus.foc.order.api.dto.response.OrderResponse;
import sg.edu.nus.foc.order.api.dto.response.ReportResolutionResponse;
import sg.edu.nus.foc.order.api.mapper.OrderMapper;
import sg.edu.nus.foc.order.application.OrderCompletionHoldService;
import sg.edu.nus.foc.order.application.OrderOutboxDispatchRequested;
import sg.edu.nus.foc.order.domain.CommandReceipt;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.repository.OrderCompletionHoldRepository;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;
import tools.jackson.databind.json.JsonMapper;

/** Each method is a short local transaction. No HTTP call or publication occurs inside it. */
@Service
@RequiredArgsConstructor
@ConditionalOnProperty(name = "order.reports.resolution.enabled", havingValue = "true")
public class ReportResolutionJournal {
    public record Start(ReportResolutionMessages.Command command, String owner, boolean execute) { }
    private final JdbcTemplate jdbc;
    private final JsonMapper json;
    private final OrderRepository orders;
    private final OrderCompletionHoldRepository holds;
    private final OrderCompletionHoldService releases;
    private final OrderMapper mapper;
    private final ApplicationEventPublisher events;
    @jakarta.persistence.PersistenceContext
    private jakarta.persistence.EntityManager entityManager;

    @Transactional
    public Start begin(String key, String orderId, String reportId, String adminId, String reply) {
        requireId(key, 128); requireId(orderId, 36); requireId(reportId, 128); requireId(adminId, 128);
        if (reply == null || reply.isBlank() || reply.strip().length() > 2000)
            throw new OrderProblem("VALIDATION_ERROR", "An admin reply of 1 through 2000 characters is required.");
        String normalized = reply.strip();
        String fingerprint = CommandReceipt.fingerprint("REPORT_RESOLVE", orderId, reportId, adminId, normalized);
        var previous = jdbc.queryForList("select * from order_report_resolutions where command_id=?", key);
        if (!previous.isEmpty()) return replay(previous.getFirst(), fingerprint);

        var order = orders.getForLifecycleUpdate(orderId).orElseThrow(() -> OrderProblem.notFound("Order not found."));
        var hold = holds.findByReportId(reportId).orElseThrow(() -> OrderProblem.notFound("Report hold not found."));
        hold.requireBinding(orderId, order.getRequesterId());
        if (hold.getReleasedAt() != null || !order.isCompletionHold())
            throw OrderProblem.conflict("This report does not have an active completion hold.");
        if (Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from order_report_resolutions where report_id=? and state in ('PENDING','COMPENSATING','RECONCILIATION_REQUIRED'))", Boolean.class, reportId)))
            throw OrderProblem.conflict("This report already has an unresolved resolution request.");
        String owner = UUID.randomUUID().toString();
        int inserted = jdbc.update("""
                insert into order_report_resolutions(command_id,order_id,report_id,requester_id,courier_id,admin_id,reply,input_hash,owner)
                values (?,?,?,?,?,?,?,?,?) on conflict(command_id) do nothing
                """, key, orderId, reportId, order.getRequesterId(), order.getCourierId(), adminId, normalized, fingerprint, owner);
        var saved = locked(key);
        return inserted == 1 ? new Start(command(saved), owner, true) : replay(saved, fingerprint);
    }

    private Start replay(Map<String, Object> row, String fingerprint) {
        if (!fingerprint.equals(row.get("input_hash"))) throw OrderProblem.conflict("Command ID belongs to a different report resolution.");
        return new Start(command(row), (String) row.get("owner"), false);
    }

    @Transactional
    public void possibleEffect(Start start) {
        owned(start);
        jdbc.update("update order_report_resolutions set possible_effect=true,updated_at=clock_timestamp() where command_id=?", start.command().commandId());
    }

    @Transactional
    public void confirm(Start start, ReportResolutionMessages.Resolution result) {
        owned(start);
        var c = start.command();
        if (result == null || !matches(c, result.commandId(), result.reportId(), result.orderId(), result.requesterId(), result.courierId(), result.adminId())
                || result.generation() != 1 || !("APPLIED".equals(result.outcome()) || "NO_EFFECT".equals(result.outcome()))
                || !id(result.code(), 80)) throw OrderProblem.conflict("Report response does not match the saved resolution.");
        if ("NO_EFFECT".equals(result.outcome())) {
            jdbc.update("update order_report_resolutions set state='REJECTED',reason='REPORT_REJECTED',updated_at=clock_timestamp() where command_id=?", c.commandId());
        } else {
            jdbc.update("update order_report_resolutions set remote_confirmed=true,updated_at=clock_timestamp() where command_id=?", c.commandId());
        }
    }

    @Transactional
    public void complete(Start start) {
        // Same order-first lock order as begin and ordinary hold release; never lock across the remote call.
        var c = start.command();
        var order = orders.getForLifecycleUpdate(c.orderId()).orElseThrow(() -> OrderProblem.notFound("Order not found."));
        var row = owned(start);
        if (!Boolean.TRUE.equals(row.get("remote_confirmed"))
                || !Objects.equals(order.getRequesterId(), c.requesterId()) || !Objects.equals(order.getCourierId(), c.courierId()))
            throw OrderProblem.conflict("Report confirmation or Order participants changed.");
        var saved = releases.releaseForReportResolution(c.orderId(), c.reportId(), c.adminId(), c.commandId(), start.owner());
        entityManager.flush(); // Save the committed optimistic version in the immutable retry response.
        OrderResponse result = mapper.toResponse(saved);
        jdbc.update("""
                update order_report_resolutions set state='SUCCEEDED',reason='RESOLVED',result=cast(? as jsonb),
                  updated_at=clock_timestamp() where command_id=?
                """, json.writeValueAsString(result), c.commandId());
    }

    @Transactional
    public void abandon(Start start) {
        var row = locked(start.command().commandId());
        if (!"PENDING".equals(row.get("state")) || !start.owner().equals(row.get("owner"))) return;
        compensate(row);
    }

    public ReportResolutionResponse get(String key) {
        requireId(key, 128);
        var rows = jdbc.queryForList("select * from order_report_resolutions where command_id=?", key);
        if (rows.isEmpty()) throw OrderProblem.notFound("Report resolution not found.");
        var row = rows.getFirst();
        OrderResponse result = row.get("result") == null ? null : json.readValue(row.get("result").toString(), OrderResponse.class);
        return new ReportResolutionResponse(key, (String) row.get("order_id"), (String) row.get("report_id"),
                (String) row.get("state"), (String) row.get("reason"), result);
    }

    public List<String> due(int limit) {
        return jdbc.queryForList("""
                select command_id from order_report_resolutions
                where state in ('PENDING','COMPENSATING') and next_retry_at<=clock_timestamp()
                  and (state<>'PENDING' or lease_until<=clock_timestamp())
                order by next_retry_at,command_id limit ?
                """, String.class, limit);
    }

    @Transactional
    public void recover(String key) {
        var row = locked(key);
        Boolean due = jdbc.queryForObject("select next_retry_at<=clock_timestamp() and (state<>'PENDING' or lease_until<=clock_timestamp()) from order_report_resolutions where command_id=?", Boolean.class, key);
        if (!Boolean.TRUE.equals(due)) return;
        if ("PENDING".equals(row.get("state"))) compensate(row);
        else if ("COMPENSATING".equals(row.get("state"))) {
            String eventId = (String) row.get("compensation_id");
            // Preserve the ID/payload. FAILED and IN_PROGRESS rows are never stolen or silently redriven.
            int rearmed = jdbc.update("update order_event_outbox set state='PENDING',attempt_count=0,next_attempt_at=clock_timestamp(),lease_until=null,last_error=null where event_id=? and state='PUBLISHED'", eventId);
            jdbc.update("update order_report_resolutions set next_retry_at=clock_timestamp()+interval '30 seconds' where command_id=?", key);
            if (rearmed == 1) events.publishEvent(new OrderOutboxDispatchRequested(eventId));
        }
    }

    private void compensate(Map<String, Object> row) {
        String key = (String) row.get("command_id");
        if (!Boolean.TRUE.equals(row.get("possible_effect"))) {
            jdbc.update("update order_report_resolutions set state='REJECTED',reason='NO_REMOTE_EFFECT',updated_at=clock_timestamp() where command_id=?", key);
            return;
        }
        String eventId = UUID.nameUUIDFromBytes(("ReportResolutionCompensationRequested:" + key).getBytes(StandardCharsets.UTF_8)).toString();
        var c = command(row);
        var message = new ReportResolutionMessages.Compensation(eventId, key, c.reportId(), c.orderId(), c.requesterId(), c.courierId(), c.adminId(), 2);
        jdbc.update("""
                update order_report_resolutions set state='COMPENSATING',reason='COMPENSATING',generation=2,
                  compensation_id=?,next_retry_at=clock_timestamp()+interval '30 seconds',updated_at=clock_timestamp()
                where command_id=?
                """, eventId, key);
        jdbc.update("""
                insert into order_event_outbox(event_id,order_id,event_type,event_version,order_version,payload,state,attempt_count,created_at,next_attempt_at)
                values (?,?,'ReportResolutionCompensationRequested',1,0,?,'PENDING',0,clock_timestamp(),clock_timestamp())
                on conflict(event_id) do nothing
                """, eventId, c.orderId(), json.writeValueAsString(message));
        events.publishEvent(new OrderOutboxDispatchRequested(eventId));
    }

    @Transactional
    public void accept(ReportResolutionMessages.Result result) {
        if (result == null || !uuid(result.eventId()) || !uuid(result.compensationId()) || !id(result.commandId(), 128)
                || result.generation() != 2 || !id(result.code(), 80)
                || !("RECONCILIATION_REQUIRED".equals(result.outcome()) || ("COMPENSATED".equals(result.outcome())
                    && List.of("REVERSED", "FENCED_NO_EFFECT").contains(result.code()))))
            throw new OrderProblem("VALIDATION_ERROR", "Invalid Report compensation result.");
        var row = locked(result.commandId());
        var c = command(row);
        if (!Objects.equals(row.get("compensation_id"), result.compensationId())
                || !matches(c, result.commandId(), result.reportId(), result.orderId(), result.requesterId(), result.courierId(), result.adminId())
                || "SUCCEEDED".equals(row.get("state")) || "REJECTED".equals(row.get("state")))
            throw OrderProblem.conflict("Report compensation result does not match the saved request.");
        if (Boolean.TRUE.equals(row.get("remote_confirmed")) && "FENCED_NO_EFFECT".equals(result.code()))
            throw OrderProblem.conflict("No-effect result contradicts confirmed Report resolution.");
        if ("COMPENSATED".equals(row.get("state")) && !"COMPENSATED".equals(result.outcome()))
            throw OrderProblem.conflict("A later result cannot undo confirmed compensation.");
        String fingerprint = CommandReceipt.fingerprint(json.writeValueAsString(result));
        int inserted = jdbc.update("insert into order_report_resolution_results(event_id,command_id,compensation_id,payload_hash) values (?,?,?,?) on conflict(event_id) do nothing", result.eventId(), result.commandId(), result.compensationId(), fingerprint);
        if (inserted == 0) {
            String previous = jdbc.queryForObject("select payload_hash from order_report_resolution_results where event_id=?", String.class, result.eventId());
            if (!fingerprint.equals(previous)) throw OrderProblem.conflict("Result event ID has different content.");
            return;
        }
        if (!"COMPENSATED".equals(row.get("state")))
            jdbc.update("update order_report_resolutions set state=?,reason=?,updated_at=clock_timestamp() where command_id=?",
                    result.outcome(), result.code(), result.commandId());
    }

    private Map<String, Object> owned(Start start) {
        var row = locked(start.command().commandId());
        Boolean live = jdbc.queryForObject("select lease_until>clock_timestamp() from order_report_resolutions where command_id=?", Boolean.class, start.command().commandId());
        if (!"PENDING".equals(row.get("state")) || !start.owner().equals(row.get("owner"))
                || ((Number) row.get("generation")).longValue() != 1 || !Boolean.TRUE.equals(live))
            throw OrderProblem.conflict("The Report resolution lease no longer belongs to this request.");
        return row;
    }
    private Map<String, Object> locked(String key) {
        var rows = jdbc.queryForList("select * from order_report_resolutions where command_id=? for update nowait", key);
        if (rows.isEmpty()) throw OrderProblem.notFound("Report resolution not found.");
        return rows.getFirst();
    }
    private ReportResolutionMessages.Command command(Map<String, Object> row) {
        return new ReportResolutionMessages.Command((String) row.get("command_id"), (String) row.get("report_id"),
                (String) row.get("order_id"), (String) row.get("requester_id"), (String) row.get("courier_id"),
                (String) row.get("admin_id"), 1, (String) row.get("reply"));
    }
    private static boolean matches(ReportResolutionMessages.Command c, String key, String report, String order, String requester, String courier, String admin) {
        return Objects.equals(c.commandId(), key) && Objects.equals(c.reportId(), report) && Objects.equals(c.orderId(), order)
                && Objects.equals(c.requesterId(), requester) && Objects.equals(c.courierId(), courier) && Objects.equals(c.adminId(), admin);
    }
    private static boolean uuid(String value) {
        try { return value != null && UUID.fromString(value).toString().equals(value); } catch (IllegalArgumentException invalid) { return false; }
    }
    private static boolean id(String value, int max) {
        return value != null && !value.isBlank() && value.length() <= max && value.equals(value.strip()) && value.chars().noneMatch(Character::isISOControl);
    }
    private static void requireId(String value, int max) {
        if (!id(value, max)) throw new OrderProblem("VALIDATION_ERROR", "Invalid report resolution identifier.");
    }
}
