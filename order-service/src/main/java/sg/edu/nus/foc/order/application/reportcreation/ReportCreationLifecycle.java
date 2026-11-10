/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Mode: Implementation.
 * Scope: Generated durable report-creation compensation implementation.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.order.application.reportcreation;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import sg.edu.nus.foc.order.application.*;
import sg.edu.nus.foc.order.domain.*;
import sg.edu.nus.foc.order.domain.repository.*;
import tools.jackson.databind.json.JsonMapper;

@Service
@RequiredArgsConstructor
public class ReportCreationLifecycle {
    private final JdbcTemplate jdbc;
    private final OrderRepository orders;
    private final OrderCompletionHoldRepository holds;
    private final OrderAuditLogger audit;
    private final JsonMapper json;
    private final ApplicationEventPublisher events;

    @Transactional
    public boolean registerPlacement(String reportId,String submissionId,String orderId,String reporterId){
        requireUuid(submissionId);
        boolean created=createLifecycle(reportId,submissionId,orderId,reporterId,"ACTIVE");
        Map<String,Object> row=locked(reportId);
        requireBinding(row,submissionId,orderId,reporterId);
        if("CANCELLED".equals(row.get("state"))) throw OrderProblem.conflict("This report creation has been cancelled.");
        return created;
    }

    @Transactional
    public void holdCreated(String reportId){
        Map<String,Object> row=locked(reportId);
        if("CANCELLED".equals(row.get("state"))) throw OrderProblem.conflict("This report creation has been cancelled.");
        jdbc.update("update order_report_creation_lifecycles set hold_ever_created=true,updated_at=clock_timestamp() where report_id=?",reportId);
    }

    @Transactional
    public ReportCreationMessages.Result compensate(ReportCreationMessages.Compensation request){
        validate(request);
        String hash=CommandReceipt.fingerprint(json.writeValueAsString(request));
        var old=jdbc.queryForList("select * from order_report_creation_compensations where event_id=?",request.eventId());
        if(!old.isEmpty()){
            if(!hash.equals(old.getFirst().get("input_hash")))throw OrderProblem.conflict("Creation compensation event ID has different content.");
            var replay=result(request,(String)old.getFirst().get("outcome"));
            int rearmed=jdbc.update("update order_event_outbox set state='PENDING',attempt_count=0,next_attempt_at=clock_timestamp(),lease_until=null,last_error=null where event_id=? and state in ('PUBLISHED','FAILED')",replay.eventId());
            if(rearmed==1)events.publishEvent(new OrderOutboxDispatchRequested(replay.eventId()));
            return replay;
        }
        // Match placement's order-first lock order before locking/creating the lifecycle row.
        Order order=orders.getForLifecycleUpdate(request.orderId()).orElseThrow(()->OrderProblem.notFound("Order not found."));
        createLifecycle(request.reportId(),request.submissionId(),request.orderId(),request.reporterId(),"CANCELLED");
        Map<String,Object> lifecycle=locked(request.reportId());
        String outcome;
        if(!binding(lifecycle,request.submissionId(),request.orderId(),request.reporterId())){
            outcome="BINDING_MISMATCH";
        }else{
            Optional<OrderCompletionHold> hold=holds.findByReportId(request.reportId());
            if(hold.isEmpty()) outcome="NOT_FOUND";
            else if(!request.orderId().equals(hold.get().getOrderId())||!order.getRequesterId().equals(hold.get().getRequesterId())) outcome="BINDING_MISMATCH";
            else if(hold.get().getReleasedAt()!=null) outcome="ALREADY_RELEASED";
            else{
                String actor="creation:"+request.submissionId();
                hold.get().release(actor,Instant.now());
                holds.release(hold.get());
                order.reconcileReportHolds(holds.hasActiveForOrder(request.orderId()));
                orders.save(order);
                audit.action("COMPENSATE_REPORT_CREATION",request.orderId(),request.reporterId(),request.reportId(),"released");
                outcome="RELEASED";
            }
            if(!"BINDING_MISMATCH".equals(outcome))jdbc.update("update order_report_creation_lifecycles set state='CANCELLED',updated_at=clock_timestamp() where report_id=?",request.reportId());
        }
        var result=result(request,outcome);String payload=json.writeValueAsString(result);
        jdbc.update("insert into order_report_creation_compensations(event_id,report_id,submission_id,input_hash,outcome,result_event_id) values (?,?,?,?,?,?)",
                request.eventId(),request.reportId(),request.submissionId(),hash,outcome,result.eventId());
        jdbc.update("""
                insert into order_event_outbox(event_id,order_id,event_type,event_version,order_version,payload,state,attempt_count,created_at,next_attempt_at)
                values (?,?,'ReportCreationCompensationResult',1,0,?,'PENDING',0,clock_timestamp(),clock_timestamp())
                on conflict(event_id) do nothing
                """,result.eventId(),request.orderId(),payload);
        events.publishEvent(new OrderOutboxDispatchRequested(result.eventId()));
        return result;
    }

    private ReportCreationMessages.Result result(ReportCreationMessages.Compensation c,String outcome){
        String id=UUID.nameUUIDFromBytes(("ReportCreationCompensationResult:"+c.eventId()).getBytes(StandardCharsets.UTF_8)).toString();
        return new ReportCreationMessages.Result(id,c.eventId(),c.submissionId(),c.reportId(),c.orderId(),c.reporterId(),2,outcome);
    }
    private boolean createLifecycle(String reportId,String submissionId,String orderId,String reporterId,String state){
        try{
            return jdbc.update("""
                    insert into order_report_creation_lifecycles(report_id,submission_id,order_id,reporter_id,state)
                    values (?,?,?,?,?) on conflict(report_id) do nothing
                    """,reportId,submissionId,orderId,reporterId,state)==1;
        }catch(DataIntegrityViolationException conflict){
            throw OrderProblem.conflict("Report creation lifecycle binding conflicts.");
        }
    }
    private Map<String,Object> locked(String reportId){var rows=jdbc.queryForList("select * from order_report_creation_lifecycles where report_id=? for update",reportId);if(rows.isEmpty())throw OrderProblem.notFound("Report creation lifecycle not found.");return rows.getFirst();}
    private static void requireBinding(Map<String,Object> row,String submission,String order,String reporter){if(!binding(row,submission,order,reporter))throw OrderProblem.conflict("Report creation lifecycle binding conflicts.");}
    private static boolean binding(Map<String,Object> row,String submission,String order,String reporter){return Objects.equals(row.get("submission_id"),submission)&&Objects.equals(row.get("order_id"),order)&&Objects.equals(row.get("reporter_id"),reporter);}
    private static void validate(ReportCreationMessages.Compensation c){
        if(c==null||c.generation()!=2)throw new OrderProblem("VALIDATION_ERROR","Invalid creation compensation.");
        requireUuid(c.eventId());requireUuid(c.submissionId());
        String expected=UUID.nameUUIDFromBytes(("ReportCreationCompensationRequested:"+c.submissionId()).getBytes(StandardCharsets.UTF_8)).toString();
        if(!expected.equals(c.eventId())||c.reportId()==null||c.reportId().isBlank()||c.reportId().length()>128
                ||c.orderId()==null||c.orderId().isBlank()||c.orderId().length()>36
                ||c.reporterId()==null||c.reporterId().isBlank()||c.reporterId().length()>128)
            throw new OrderProblem("VALIDATION_ERROR","Invalid creation compensation binding.");
    }
    private static void requireUuid(String value){try{if(!UUID.fromString(value).toString().equals(value))throw new IllegalArgumentException();}catch(RuntimeException e){throw new OrderProblem("VALIDATION_ERROR","A canonical UUID is required.");}}
}
