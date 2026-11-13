package com.friendoncampus.admin;

import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** No remote calls under the case lock. All closure facts and the original receipt commit together. */
@Service
public class ResolutionService {
    public record Explanation(UUID operationId, String explanation) { }
    private final JdbcTemplate db;
    private com.friendoncampus.admin.dispute.DisputeBus disputes;
    @org.springframework.beans.factory.annotation.Autowired public void disputes(com.friendoncampus.admin.dispute.DisputeBus bus){this.disputes=bus;}
    private final CaseService cases;
    private final TimelineService timeline;
    private final ChatConversationClient chat;
    private final TransactionTemplate tx;
    private final long maxAge;
    private final ReviewerIndependenceService independence;
    private final JsonMapper json=JsonMapper.builder().build();
    public ResolutionService(JdbcTemplate db, CaseService cases, TimelineService timeline,
            PlatformTransactionManager manager, ChatConversationClient chat, @Value("${app.resolution.evidence-max-age-seconds:60}") long maxAge, ReviewerIndependenceService independence) {
        if(maxAge<1)throw new IllegalArgumentException("Evidence age must be positive");
        this.db=db;this.cases=cases;this.timeline=timeline;this.maxAge=maxAge;this.chat=chat;
        this.independence=independence;
        tx=new TransactionTemplate(manager);tx.setTimeout(15);
    }
    public CaseViews.Mutation resolve(Jwt actor, UUID id, UUID key, String resolution, long revision, List<Explanation> explanations) {
        return resolve(actor,id,key,resolution,revision,explanations,"KEEP_EXISTING");
    }
    public CaseViews.Mutation resolve(Jwt actor,UUID id,UUID key,String resolution,long revision,List<Explanation> explanations,String disposition){
        var initial=cases.evidenceCase(actor,id);UUID reviewer=UUID.fromString(actor.getSubject());
        String reason=resolution==null?"":resolution.strip();
        if(disposition==null||!Set.of("RETURN_TO_REQUESTER","PAY_COURIER","KEEP_EXISTING").contains(disposition))throw error(400,"Choose the reserved-credit outcome.");
        if(key==null||revision<0||reason.isEmpty()||reason.length()>2000)throw error(400,"Provide a resolution of 1–2000 characters, a revision and a request key.");
        SortedMap<String,String> rejected=new TreeMap<>();
        if(explanations!=null)for(var e:explanations){
            if(e==null||e.operationId()==null||e.explanation()==null||e.explanation().isBlank()||e.explanation().strip().length()>2000||rejected.put(e.operationId().toString(),e.explanation().strip())!=null)throw error(400,"Provide one nonblank explanation per rejected action, without duplicates.");
        }
        String route="/api/admin/cases/"+id+"/resolve";
        String hash=CreditActionService.hash(json.writeValueAsString(List.of(reason,revision,rejected,disposition)));
        var previous=receipt(key,reviewer,route,hash);if(previous!=null)return previous;
        eligible(initial,reviewer,revision);
        if(!"READY".equals(initial.reviewStatus()))throw error(409,"Review preparation is pending. Wait for owner confirmations.");
        validateDisposition(id,disposition);
        var evidence=timeline.read(actor,id,null,100);
        cases.evidenceCase(actor,id);
        return tx.execute(s->{
            db.query("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",r->null,"request:"+key);
            var replay=receipt(key,reviewer,route,hash);if(replay!=null)return replay;
            var c=db.queryForMap("SELECT * FROM admin_cases WHERE id=? FOR UPDATE",id);
            independence.require(id,(UUID)c.get("order_id"),reviewer);
            eligible(new CaseViews.Summary(id,(UUID)c.get("order_id"),AdminCase.State.valueOf((String)c.get("state")),(UUID)c.get("reviewer_id"),((Number)c.get("revision")).longValue(),initial.createdAt()),reviewer,revision);
            if(c.get("closure_operation_id")!=null)throw error(409,"Resume the original prepared resolution with its original request key and body.");
            validateActions(id,rejected.keySet());validateEvidence(evidence,id,(UUID)c.get("order_id"),((Number)c.get("source_sequence")).longValue());
            db.update("INSERT INTO admin_resolution_preparations(operation_id,case_id,actor_id,request_hash,resolution,case_revision,explanations,credit_disposition,initial_evidence) VALUES (?,?,?,?,?,?,?,?,?)",key,id,reviewer,hash,reason,revision,json.writeValueAsString(rejected),disposition,json.writeValueAsString(evidence));
            db.update("UPDATE admin_cases SET closure_operation_id=? WHERE id=?",key,id);
            var m=new com.friendoncampus.admin.dispute.DisputeBus.Message(key,1,"PrepareResolution","admin-service",key,id,initial.orderId(),reviewer,"ADMIN",Instant.now(),json.valueToTree(Map.of("disposition",disposition)));
            disputes.remember(m,"REQUEST");disputes.emit("admin.dispute.commands","PrepareResolution",m,m.data(),true);
            String body=json.writeValueAsString(cases.localDetail(id));
            db.update("INSERT INTO admin_mutation_receipts(idempotency_key,actor_id,route,request_hash,response_status,response_body) VALUES (?,?,?,?,202,?)",key,reviewer,route,hash,body);
            return new CaseViews.Mutation(202,body);
        });
    }
    /** Called only after matching committed Chat and Order outcomes; never invents a fresh timeline. */
    public void finishConfirmed(com.friendoncampus.admin.dispute.DisputeBus.Message m,Object confirmations){
        var preparation=db.queryForMap("SELECT * FROM admin_resolution_preparations WHERE operation_id=? FOR UPDATE",m.operationId());
        if("READY".equals(preparation.get("status")))return;
        var c=db.queryForMap("SELECT * FROM admin_cases WHERE id=? FOR UPDATE",m.caseId());
        long revision=((Number)preparation.get("case_revision")).longValue();
        if(!m.actorId().equals(c.get("reviewer_id"))||!m.operationId().equals(c.get("closure_operation_id"))||!"UNDER_REVIEW".equals(c.get("state"))||((Number)c.get("revision")).longValue()!=revision)throw error(409,"Resolution identity changed.");
        if(Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM admin_case_participants WHERE case_id=? AND user_id=?)",Boolean.class,m.caseId(),m.actorId())))throw error(403,"An independent reviewer is required.");
        var rejected=json.readTree((String)preparation.get("explanations"));Set<String> required=new HashSet<>();for(var e:rejected.properties())required.add(e.getKey());validateActions(m.caseId(),required);
        var evidence=json.readTree((String)preparation.get("initial_evidence"));
        Instant now=Instant.now();long next=revision+1,sequence=((Number)c.get("source_sequence")).longValue()+1;
        db.update("INSERT INTO admin_case_decisions(case_id,reviewer_id,resolution,rejected_action_explanations,evidence_revision,evidence_coverage,resolved_at,case_revision,owner_confirmations) VALUES (?,?,?,?,?,?,?,?,?)",m.caseId(),m.actorId(),preparation.get("resolution"),preparation.get("explanations"),evidence.path("evidenceRevision").asText(),json.writeValueAsString(evidence.path("coverage")),now.atOffset(ZoneOffset.UTC),next,json.writeValueAsString(confirmations));
        db.update("UPDATE admin_cases SET state='RESOLVED',revision=?,source_sequence=? WHERE id=?",next,sequence,m.caseId());
        db.update("INSERT INTO admin_case_audit(id,case_id,case_revision,actor_id,action,occurred_at) VALUES (?,?,?,?,'CASE_RESOLVED',?)",UUID.randomUUID(),m.caseId(),next,m.actorId(),now.atOffset(ZoneOffset.UTC));
        UUID event=UUID.randomUUID();Map<String,Object> data=Map.of("caseId",m.caseId(),"orderId",m.orderId(),"sourceSequence",sequence,"reviewerId",m.actorId(),"resolvedAt",now.toString());
        var envelope=CreditActionService.envelope(event,"CaseResolved","AdminCase",m.caseId(),next,now,"admin-service",(UUID)c.get("correlation_id"),null,m.actorId(),data);
        db.update("INSERT INTO admin_case_outbox(event_id,case_id,source_sequence,event_type,topic,payload,created_at) VALUES (?,?,?,'CaseResolved','admin.events',?,?)",event,m.caseId(),sequence,json.writeValueAsString(envelope),now.atOffset(ZoneOffset.UTC));
        db.update("UPDATE admin_resolution_preparations SET status='READY' WHERE operation_id=?",m.operationId());
        db.update("UPDATE admin_mutation_receipts SET response_status=200,response_body=? WHERE idempotency_key=?",json.writeValueAsString(cases.localDetail(m.caseId())),m.operationId());
    }    private void validateDisposition(UUID id,String disposition){
        var snapshots=db.queryForList("SELECT payload FROM dispute_operations WHERE stage='OrderReviewFrozen' AND payload::jsonb->>'caseId'=? ORDER BY (payload::jsonb->>'occurredAt') DESC LIMIT 1",String.class,id.toString());
        if(snapshots.isEmpty())throw error(409,"Review preparation is pending. Wait for owner confirmations.");
        var frozen=json.readTree(snapshots.get(0)).path("data");
        String status=frozen.path("creditStatus").asText();
        if(!Set.of("RESERVED","RELEASED","SETTLED","COMPENSATED").contains(status))throw error(503,"Confirmed reservation status is unavailable.");
        boolean reserved="RESERVED".equals(status);
        if(reserved&&"KEEP_EXISTING".equals(disposition)||!reserved&&!"KEEP_EXISTING".equals(disposition)||"PAY_COURIER".equals(disposition)&&frozen.path("courierId").isNull())throw error(409,"Choose a credit outcome consistent with the confirmed reservation.");
    }
    private void validateActions(UUID id,Set<String> explanations){
        Set<String> required=new HashSet<>();
        for(var action:db.queryForList("SELECT operation_id,status FROM admin_actions WHERE case_id=?",id)){
            if(Set.of("PENDING","UNKNOWN").contains(action.get("status")))throw error(409,"This case has pending or unknown actions. Wait for owner confirmation before resolving.");
            if("REJECTED".equals(action.get("status")))required.add(action.get("operation_id").toString());
        }
        if(!required.equals(explanations))throw error(400,"Explain every rejected action and only rejected actions before resolving.");
    }
    private void validateEvidence(JsonNode e,UUID id,UUID order,long sequence){
        try{
            EvidenceValidation.timeline(e,id,order);
            if(!"COMPLETE".equals(e.path("coverage").path("status").asText())||!e.path("coverage").path("blockingGaps").isEmpty())throw new IllegalArgumentException();
            Instant now=Instant.now(),floor=now.minusSeconds(maxAge);
            checkTime(e.path("coverage").path("asOf").asText(),floor,now);
            boolean covered=false;
            for(var cp:e.path("coverage").path("checkpoints")){
                checkTime(cp.path("checkedAt").asText(),floor,now);
                if("admin-service".equals(cp.path("source").asText())&&"admin.events".equals(cp.path("stream").asText())&&id.toString().equals(cp.path("aggregateId").asText()))
                    covered=cp.path("committedSequence").asLong()>=sequence&&cp.path("projectedSequence").asLong()>=sequence;
            }
            if(!covered)throw new IllegalArgumentException();
        }catch(Exception ex){throw error(503,"Fresh complete Chat evidence is required. Evidence is unavailable, stale, has blocking gaps, or does not cover the current case. The case remains open.");}
    }
    private static void checkTime(String value,Instant floor,Instant now){Instant t=Instant.parse(value);if(t.isBefore(floor)||t.isAfter(now.plusSeconds(5)))throw new IllegalArgumentException();}
    private void eligible(CaseViews.Summary c,UUID actor,long revision){
        if(!actor.equals(c.reviewerId()))throw error(403,"Only the assigned reviewer can resolve this case.");
        if(c.state()!=AdminCase.State.UNDER_REVIEW||c.revision()!=revision)throw error(409,"This case has changed or is already resolved. Refresh before resolving.");
    }
    private CaseViews.Mutation receipt(UUID key,UUID actor,String route,String hash){
        return db.query("SELECT * FROM admin_mutation_receipts WHERE idempotency_key=?",r->{
            if(!r.next())return null;
            if(!actor.equals(r.getObject("actor_id",UUID.class))||!route.equals(r.getString("route"))||!hash.equals(r.getString("request_hash")))throw error(409,"This request key belongs to a different request.");
            return new CaseViews.Mutation(r.getInt("response_status"),r.getString("response_body"));
        },key);
    }
    private static ResponseStatusException error(int status,String text){return new ResponseStatusException(HttpStatus.valueOf(status),text);}
}
