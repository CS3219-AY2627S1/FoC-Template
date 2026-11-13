package com.friendoncampus.admin;

import java.util.*;
import org.slf4j.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

/** At-least-once delivery; only the relay coordinator is locked across bounded broker I/O. */
@Component
@ConditionalOnProperty(name={"app.kafka.enabled","app.case-events.enabled"},havingValue="true")
public class CaseEventRelay {
    private static final Logger log=LoggerFactory.getLogger(CaseEventRelay.class);
    private final JdbcTemplate db;
    private final CaseEventSender sender;
    private final TransactionTemplate tx;
    private final long retrySeconds;
    private final JsonMapper json=JsonMapper.builder().build();
    public enum Result { IDLE, BUSY, SENT, FAILED, BLOCKED }
    public CaseEventRelay(JdbcTemplate db,CaseEventSender sender,PlatformTransactionManager manager,
            @Value("${app.case-events.retry-seconds:10}") long retrySeconds) {
        if(retrySeconds<1||retrySeconds>3600)throw new IllegalArgumentException("Case event retry must be 1–3600 seconds");
        this.db=db;this.sender=sender;this.retrySeconds=retrySeconds;
        tx=new TransactionTemplate(manager);tx.setTimeout(30);
    }
    @Scheduled(scheduler="caseEventScheduler",fixedDelayString="${app.case-events.delay:2000}",initialDelayString="${app.case-events.initial-delay:2000}")
    public void tick() {
        try { publishOnce(); }
        catch(RuntimeException e) { log.warn("Case event delivery progress unconfirmed; original outbox retained code=DATABASE_UNCONFIRMED"); }
    }
    public Result publishOnce() {
        return tx.execute(status->{
            if(db.queryForList("SELECT id FROM admin_case_event_relay WHERE id=1 FOR UPDATE SKIP LOCKED").isEmpty())return Result.BUSY;
            // A delayed or blocked earlier event must not be overtaken within its case.
            var rows=db.queryForList("SELECT o.*,c.order_id,c.correlation_id FROM admin_case_outbox o JOIN admin_cases c ON c.id=o.case_id WHERE o.published_at IS NULL AND o.next_attempt_at<=clock_timestamp() AND NOT EXISTS (SELECT 1 FROM admin_case_outbox earlier WHERE earlier.case_id=o.case_id AND earlier.source_sequence<o.source_sequence AND earlier.published_at IS NULL) ORDER BY o.next_attempt_at,o.created_at,o.event_id LIMIT 1");
            if(rows.isEmpty())return Result.IDLE;
            var row=rows.get(0);UUID event=(UUID)row.get("event_id"),caseId=(UUID)row.get("case_id");
            long sequence=((Number)row.get("source_sequence")).longValue();
            long expected=db.queryForObject("SELECT COALESCE(MAX(source_sequence),0)+1 FROM admin_case_outbox WHERE case_id=? AND published_at IS NOT NULL",Long.class,caseId);
            String failure=sequence==expected?validate(row):"SOURCE_SEQUENCE_GAP";
            if(failure!=null){failed(event,failure);log.warn("Case event blocked eventId={} caseId={} sequence={} code={}",event,caseId,sequence,failure);return Result.BLOCKED;}
            try { sender.send(caseId,(String)row.get("payload"),()->db.queryForObject("SELECT id FROM admin_case_event_relay WHERE id=1 FOR UPDATE",Integer.class)); }
            catch(RuntimeException e){failed(event,"BROKER_UNCONFIRMED");log.warn("Case event unconfirmed eventId={} caseId={} sequence={}",event,caseId,sequence);return Result.FAILED;}
            // If this transaction fails after Kafka commit, retry the same event before advancing.
            db.update("UPDATE admin_case_outbox SET published_at=clock_timestamp(),attempts=attempts+1,last_error=NULL WHERE event_id=? AND published_at IS NULL",event);
            log.info("Case event broker-confirmed eventId={} caseId={} sequence={}",event,caseId,sequence);
            return Result.SENT;
        });
    }
    private void failed(UUID id,String code){
        db.update("UPDATE admin_case_outbox SET attempts=attempts+1,next_attempt_at=clock_timestamp()+(? * INTERVAL '1 second'),last_error=? WHERE event_id=? AND published_at IS NULL",retrySeconds,code,id);
    }
    private String validate(Map<String,Object> row){
        try {
            var e=json.readTree((String)row.get("payload"));String type=(String)row.get("event_type");
            var data=e.path("data");long sequence=((Number)row.get("source_sequence")).longValue();
            EvidenceValidation.require("admin.events".equals(row.get("topic"))&&Set.of("CaseOpened","CaseClaimed","CaseActionCompleted","CaseResolved").contains(type));
            EvidenceValidation.require(sequence!=1||"CaseOpened".equals(type));
            EvidenceValidation.require(!"CaseOpened".equals(type)||sequence==1);
            EvidenceValidation.equalUuid(e,"eventId",(UUID)row.get("event_id"));
            EvidenceValidation.equalUuid(e,"aggregateId",(UUID)row.get("case_id"));
            EvidenceValidation.equalUuid(data,"caseId",(UUID)row.get("case_id"));
            EvidenceValidation.equalUuid(data,"orderId",(UUID)row.get("order_id"));
            EvidenceValidation.equalUuid(e,"correlationId",(UUID)row.get("correlation_id"));
            EvidenceValidation.require("admin-service".equals(e.path("producer").asText())&&"AdminCase".equals(e.path("aggregateType").asText())&&type.equals(e.path("eventType").asText()));
            EvidenceValidation.require(e.path("eventVersion").isIntegralNumber()&&e.path("eventVersion").asInt()==1);
            EvidenceValidation.number(e,"aggregateVersion");EvidenceValidation.require(e.path("aggregateVersion").asLong()>0);
            EvidenceValidation.number(data,"sourceSequence");EvidenceValidation.require(data.path("sourceSequence").asLong()==sequence);
            EvidenceValidation.time(e,"occurredAt");EvidenceValidation.require("USER".equals(e.path("actor").path("type").asText()));
            UUID actor=EvidenceValidation.uuid(e.path("actor"),"userId");
            EvidenceValidation.choice(e.path("actor"),"role","CaseOpened".equals(type)?Set.of("REQUESTER","COURIER"):Set.of("ADMIN"));
            if("CaseActionCompleted".equals(type)){
                EvidenceValidation.uuid(data,"operationId");UUID owner=EvidenceValidation.uuid(data,"ownerEventId");
                EvidenceValidation.equalUuid(e,"causationId",owner);EvidenceValidation.uuid(data,"targetUserId");
                EvidenceValidation.choice(data,"result",Set.of("APPLIED","REJECTED","NO_CHANGE"));
            }else{
                EvidenceValidation.equalUuid(data,"CaseOpened".equals(type)?"reporterId":"reviewerId",actor);
                EvidenceValidation.require(e.has("causationId")&&e.path("causationId").isNull());
            }
            if("CaseResolved".equals(type))EvidenceValidation.time(data,"resolvedAt");
            return null;
        }catch(Exception e){return "INVALID_STORED_EVENT";}
    }
}
