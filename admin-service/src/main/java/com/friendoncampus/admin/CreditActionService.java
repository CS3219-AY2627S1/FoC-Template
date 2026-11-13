package com.friendoncampus.admin;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.*;
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

/** Shared case-action tracking. Credit owns balances; User owns account status. */
@Service
public class CreditActionService {
    private final JdbcTemplate db;
    private final UserEligibilityClient users;
    private final TransactionTemplate tx;
    private final long deadlineSeconds;
    private final ReviewerIndependenceService independence;
    private final JsonMapper json=JsonMapper.builder().build();
    public CreditActionService(JdbcTemplate db,UserEligibilityClient users,PlatformTransactionManager manager,
            @Value("${app.actions.outcome-timeout-seconds:30}") long deadlineSeconds, ReviewerIndependenceService independence){
        if(deadlineSeconds<1)throw new IllegalArgumentException("Outcome timeout must be positive");
        this.db=db;this.users=users;this.tx=new TransactionTemplate(manager);tx.setTimeout(15);this.deadlineSeconds=deadlineSeconds;
        this.independence=independence;
    }
    public record Action(UUID operationId,UUID caseId,UUID targetUserId,String type,Integer amount,String reason,String status,String reasonCode,Instant createdAt,Instant completedAt) { }
    public CaseViews.Mutation create(Jwt jwt,UUID caseId,UUID key,String type,UUID target,JsonNode amount,String reason){
        UUID actor=authorize(jwt);
        String text=reason==null?"":reason.strip();
        boolean ban="BAN".equals(type);
        if(key==null||target==null||(!ban&&!"CREDIT_ADJUSTMENT".equals(type))||
            (ban?amount!=null&&!amount.isNull():amount==null||!amount.isIntegralNumber()||!amount.canConvertToInt()||amount.asInt()==0)||text.isEmpty()||text.length()>2000)
            throw problem(400,"Choose a participant and a reason of 1–2000 characters. Credit corrections require nonzero whole credits; bans must omit the amount.");
        Integer delta=ban?null:amount.asInt();String route="/api/admin/cases/"+caseId+"/actions";
        String fingerprint=hash(json.writeValueAsString(Arrays.asList(type,target.toString(),delta,text)));
        var initial=db.queryForList("SELECT order_id,state,reviewer_id FROM admin_cases WHERE id=?",caseId);
        if(initial.isEmpty())throw problem(404,"Case not found.");
        var first=initial.get(0);
        if(!actor.equals(first.get("reviewer_id")))throw problem(403,"Only the assigned reviewer can request case actions.");
        // Terminal replays return the immutable receipt; no new effect is authorized.
        boolean replay=Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM admin_mutation_receipts WHERE idempotency_key=? AND actor_id=? AND route=? AND request_hash=?)",Boolean.class,key,actor,route,fingerprint));
        if(!replay){
            if(!"UNDER_REVIEW".equals(first.get("state")))throw problem(409,"Case actions require a case under review.");
            independence.verify(jwt,caseId,(UUID)first.get("order_id"));
            authorize(jwt);
        }
        return tx.execute(status->{
            db.execute("SET LOCAL lock_timeout='5s'");
            db.query("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",r->null,"request:"+key);
            var receipts=db.queryForList("SELECT actor_id,route,request_hash,response_status,response_body FROM admin_mutation_receipts WHERE idempotency_key=?",key);
            if(!receipts.isEmpty()){
                var receipt=receipts.get(0);
                if(!actor.equals(receipt.get("actor_id"))||!route.equals(receipt.get("route"))||!fingerprint.equals(receipt.get("request_hash")))throw problem(409,"This request key belongs to a different operation.");
                // Current administrator checks precede replay. The original accepted response is immutable.
                return new CaseViews.Mutation(((Number)receipt.get("response_status")).intValue(),(String)receipt.get("response_body"));
            }
            var cases=db.queryForList("SELECT order_id,state,reviewer_id,correlation_id FROM admin_cases WHERE id=? FOR UPDATE",caseId);
            if(cases.isEmpty())throw problem(404,"Case not found.");
            var c=cases.get(0);
            independence.require(caseId,(UUID)c.get("order_id"),actor);
            if(!actor.equals(c.get("reviewer_id")))throw problem(403,"Only the assigned reviewer can request case actions.");
            if(!"UNDER_REVIEW".equals(c.get("state")))throw problem(409,"Case actions require a case under review.");
            if(Boolean.TRUE.equals(db.queryForObject("SELECT closure_operation_id IS NOT NULL FROM admin_cases WHERE id=?",Boolean.class,caseId)))throw problem(409,"Resolution is being prepared. Resume the existing resolution before taking further actions.");
            if(!Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM admin_case_participants WHERE case_id=? AND user_id=?)",Boolean.class,caseId,target)))throw problem(404,"Eligible case participant not found.");
            UUID operation=UUID.randomUUID(),eventId=UUID.randomUUID(),order=(UUID)c.get("order_id"),correlation=(UUID)c.get("correlation_id");Instant now=Instant.now();
            db.update("UPDATE admin_cases SET revision=revision+1 WHERE id=?",caseId);
            long revision=db.queryForObject("SELECT revision FROM admin_cases WHERE id=?",Long.class,caseId);
            db.update("INSERT INTO admin_actions(operation_id,case_id,order_id,target_user_id,requested_by,amount,reason,status,created_at,deadline_at,command_event_id,correlation_id,type) VALUES (?,?,?,?,?,?,?,'PENDING',?,?,?,?,?)",
                operation,caseId,order,target,actor,delta,text,at(now),at(now.plusSeconds(deadlineSeconds)),eventId,correlation,type);
            Map<String,Object> data=new LinkedHashMap<>();data.put("operationId",operation);data.put("caseId",caseId);data.put("orderId",order);data.put("caseRevision",revision);data.put("targetUserId",target);data.put("requestedBy",actor);data.put("reason",text);if(!ban)data.put("amount",delta);
            String payload=json.writeValueAsString(envelope(eventId,ban?"AdminUserBanRequested":"AdminCreditCorrectionRequested","AdminAction",target,1,now,"admin-service",correlation,null,actor,data));
            db.update("INSERT INTO admin_action_outbox(event_id,operation_id,target_user_id,payload,created_at,next_attempt_at,topic) VALUES (?,?,?,?,?,?,?)",eventId,operation,target,payload,at(now),at(now),ban?"admin.user.commands":"admin.credit.commands");
            audit(caseId,revision,actor,ban?"BAN_REQUESTED":"CREDIT_ACTION_REQUESTED",now);
            Action result=new Action(operation,caseId,target,type,delta,text,"PENDING",null,now,null);
            String body=json.writeValueAsString(result);
            db.update("INSERT INTO admin_mutation_receipts(idempotency_key,actor_id,route,request_hash,response_status,response_body) VALUES (?,?,?,?,202,?)",key,actor,route,fingerprint,body);
            return new CaseViews.Mutation(202,body);
        });
    }
    public Action read(Jwt jwt,UUID caseId,UUID operation){authorize(jwt);return find(caseId,operation);}
    UUID authorize(Jwt jwt){
        if(!"ADMIN".equals(jwt.getClaimAsString("role")))throw problem(403,"Select Admin mode.");
        UUID actor=UUID.fromString(jwt.getSubject());var current=users.find(actor);
        if(!current.active()||!current.administrator())throw problem(403,"Current active administrator access is required.");return actor;
    }
    public List<Action> list(UUID caseId){return db.query("SELECT *, CASE WHEN status='PENDING' AND deadline_at<=CURRENT_TIMESTAMP THEN 'UNKNOWN' ELSE status END AS visible_status FROM admin_actions WHERE case_id=? ORDER BY created_at,operation_id",this::action,caseId);}
    private Action find(UUID caseId,UUID operation){return list(caseId).stream().filter(a->a.operationId().equals(operation)).findFirst().orElseThrow(()->problem(404,"Action not found."));}
    private Action action(ResultSet r,int n)throws SQLException{return new Action(r.getObject("operation_id",UUID.class),r.getObject("case_id",UUID.class),r.getObject("target_user_id",UUID.class),r.getString("type"),(Integer)r.getObject("amount"),r.getString("reason"),r.getString("visible_status"),r.getString("reason_code"),r.getObject("created_at",OffsetDateTime.class).toInstant(),r.getObject("completed_at",OffsetDateTime.class)==null?null:r.getObject("completed_at",OffsetDateTime.class).toInstant());}

    /** Returns only after an inbox/result/audit transaction commits, or quarantines invalid input. */
    public boolean outcome(String key,String raw){return outcome(key,raw,"credit-service");}
    public boolean outcome(String key,String raw,String owner){
        if(raw==null)raw="null";
        try { applyOutcome(key,raw,owner); return true; }
        catch(IllegalArgumentException e){
            db.update("INSERT INTO admin_action_quarantine(content_hash,payload,failure_code) VALUES (?,?,'INVALID_OR_CONFLICTING_OUTCOME') ON CONFLICT DO NOTHING",hash(key+":"+raw),raw);
            return false; // Retained poison is also signalled to the metadata-only DLT by transport.
        }
    }
    private void applyOutcome(String key,String raw,String owner){
        final JsonNode e;try{e=json.readTree(raw);}catch(Exception ex){throw new IllegalArgumentException("Invalid outcome");}
        JsonNode d=e.path("data");String type=e.path("eventType").asText();boolean ban="user-service".equals(owner);
        require(ban||"credit-service".equals(owner));
        boolean applied=(ban?"AdminUserBanApplied":"AdminCreditCorrectionApplied").equals(type);
        require(applied||(ban?"AdminUserBanRejected":"AdminCreditCorrectionRejected").equals(type));require(owner.equals(e.path("producer").asText()));require("AdminAction".equals(e.path("aggregateType").asText()));
        require(e.path("eventVersion").isIntegralNumber()&&e.path("eventVersion").asInt()==1);require(e.path("aggregateVersion").isIntegralNumber()&&e.path("aggregateVersion").asLong()==1);
        UUID event=id(e,"eventId"),operation=id(d,"operationId"),caseId=id(d,"caseId"),target=id(d,"targetUserId"),actor=id(d,"requestedBy");
        require(target.equals(id(e,"aggregateId"))&&target.toString().equals(key));require("USER".equals(e.path("actor").path("type").asText())&&"ADMIN".equals(e.path("actor").path("role").asText())&&actor.equals(id(e.path("actor"),"userId")));
        time(e,"occurredAt");Instant completed=time(d,"completedAt");if(!ban)require(d.path("amount").isIntegralNumber()&&d.path("amount").canConvertToInt()&&d.path("amount").asInt()!=0);else require(!d.hasNonNull("amount"));
        require(applied?(ban?Set.of("APPLIED","NO_CHANGE").contains(d.path("result").asText()):"APPLIED".equals(d.path("result").asText())):"REJECTED".equals(d.path("result").asText()));
        Set<String> reasons=Set.of("ACTOR_NOT_AUTHORIZED","ACCOUNT_NOT_FOUND","INVALID_REQUEST","INSUFFICIENT_AVAILABLE_CREDITS","NUMERIC_LIMIT","SELF_SANCTION_FORBIDDEN","LAST_ADMIN_PROTECTED","INVALID_ACCOUNT_STATE");
        if(ban&&applied){require("BANNED".equals(d.path("status").asText()));require(("NO_CHANGE".equals(d.path("result").asText())?"BANNED":"ACTIVE").equals(d.path("previousStatus").asText()));}
        else if(applied){id(d,"ledgerEntryId");for(String f:List.of("availableBalance","reservedBalance"))require(d.path(f).isIntegralNumber()&&d.path(f).canConvertToInt()&&d.path(f).asInt()>=0);}else require((ban?Set.of("ACTOR_NOT_AUTHORIZED","ACCOUNT_NOT_FOUND","INVALID_REQUEST","SELF_SANCTION_FORBIDDEN","LAST_ADMIN_PROTECTED","INVALID_ACCOUNT_STATE"):reasons).contains(d.path("reasonCode").asText()));
        String content=hash(json.writeValueAsString(canonical(e)));
        // Ignore extra producer fields for terminal comparison, but preserve original completion time.
        Map<String,Object> terminalData=new TreeMap<>();
        for(String field:List.of("operationId","caseId","orderId","targetUserId","requestedBy","completedAt","result"))terminalData.put(field,d.path(field));
        for(String field:ban?(applied?List.of("previousStatus","status"):List.of("reasonCode")):(applied?List.of("amount","availableBalance","reservedBalance","ledgerEntryId"):List.of("amount","reasonCode")))terminalData.put(field,d.path(field));
        String terminal=hash(json.writeValueAsString(terminalData));
        tx.executeWithoutResult(s->{
            db.execute("SET LOCAL lock_timeout='5s'");
            db.query("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",r->null,"outcome:"+event);
            var inbox=db.queryForList("SELECT content_hash FROM admin_action_inbox WHERE event_id=?",event);
            if(!inbox.isEmpty()){require(content.equals(inbox.get(0).get("content_hash")));return;}
            // Case lock comes first on every mutation; resolution must share this lock in its iteration.
            var locked=db.queryForList("SELECT id FROM admin_cases WHERE id=? FOR UPDATE",caseId);require(!locked.isEmpty());
            var actions=db.queryForList("SELECT * FROM admin_actions WHERE operation_id=? FOR UPDATE",operation);require(!actions.isEmpty());var a=actions.get(0);
            require(caseId.equals(a.get("case_id"))&&target.equals(a.get("target_user_id"))&&actor.equals(a.get("requested_by"))&&id(d,"orderId").equals(a.get("order_id"))&&id(e,"correlationId").equals(a.get("correlation_id"))&&id(e,"causationId").equals(a.get("command_event_id"))&&(ban?"BAN":"CREDIT_ADJUSTMENT").equals(a.get("type"))&&(ban?a.get("amount")==null:d.path("amount").asInt()==((Number)a.get("amount")).intValue()));
            if(a.get("terminal_hash")!=null){require(terminal.equals(a.get("terminal_hash")));}
            else {
                db.update("UPDATE admin_actions SET status=?,reason_code=?,completed_at=?,terminal_hash=?,owner_event_id=? WHERE operation_id=?",applied?"SUCCEEDED":"REJECTED",applied?null:d.path("reasonCode").asText(),at(completed),terminal,event,operation);
                db.update("UPDATE admin_cases SET revision=revision+1,source_sequence=source_sequence+1 WHERE id=?",caseId);
                long revision=db.queryForObject("SELECT revision FROM admin_cases WHERE id=?",Long.class,caseId),sequence=db.queryForObject("SELECT source_sequence FROM admin_cases WHERE id=?",Long.class,caseId);
                Instant now=Instant.now();audit(caseId,revision,actor,ban?"BAN_COMPLETED":"CREDIT_ACTION_COMPLETED",now);
                UUID factId=UUID.randomUUID();var factData=new LinkedHashMap<String,Object>();factData.put("caseId",caseId);factData.put("orderId",a.get("order_id"));factData.put("sourceSequence",sequence);factData.put("operationId",operation);factData.put("ownerEventId",event);factData.put("targetUserId",target);factData.put("result",d.path("result").asText());
                db.update("INSERT INTO admin_case_outbox(event_id,case_id,source_sequence,event_type,topic,payload,created_at) VALUES (?,?,?,'CaseActionCompleted','admin.events',?,?)",factId,caseId,sequence,json.writeValueAsString(envelope(factId,"CaseActionCompleted","AdminCase",caseId,revision,now,"admin-service",(UUID)a.get("correlation_id"),event,actor,factData)),at(now));
            }
            db.update("INSERT INTO admin_action_inbox(event_id,operation_id,content_hash) VALUES (?,?,?)",event,operation,content);
        });
    }
    static Map<String,Object> envelope(UUID event,String type,String aggregate,UUID id,long version,Instant at,String producer,UUID correlation,UUID cause,UUID actor,Map<String,Object> data){
        Map<String,Object> e=new LinkedHashMap<>();e.put("eventId",event);e.put("eventType",type);e.put("eventVersion",1);e.put("aggregateType",aggregate);e.put("aggregateId",id);e.put("aggregateVersion",version);e.put("occurredAt",at);e.put("producer",producer);e.put("correlationId",correlation);e.put("causationId",cause);e.put("actor",Map.of("type","USER","userId",actor,"role","ADMIN"));e.put("data",data);return e;
    }
    private void audit(UUID c,long revision,UUID actor,String action,Instant now){db.update("INSERT INTO admin_case_audit(id,case_id,case_revision,actor_id,action,occurred_at) VALUES (?,?,?,?,?,?)",UUID.randomUUID(),c,revision,actor,action,at(now));}
    private Object canonical(JsonNode n){if(n.isObject()){Map<String,Object> m=new TreeMap<>();n.properties().forEach(entry->m.put(entry.getKey(),canonical(entry.getValue())));return m;}if(n.isArray()){List<Object> a=new ArrayList<>();n.forEach(v->a.add(canonical(v)));return a;}return n;}
    static UUID id(JsonNode n,String field){require(n.path(field).isString()&&n.path(field).asText().matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"));return UUID.fromString(n.path(field).asText());}
    static Instant time(JsonNode n,String field){try{return OffsetDateTime.parse(n.path(field).asText()).toInstant();}catch(Exception ex){throw new IllegalArgumentException("Invalid timestamp");}}
    static void require(boolean valid){if(!valid)throw new IllegalArgumentException("Invalid or conflicting outcome");}
    static String hash(String text){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
    static OffsetDateTime at(Instant t){return t.atOffset(ZoneOffset.UTC);}
    static ResponseStatusException problem(int code,String detail){return new ResponseStatusException(HttpStatus.valueOf(code),detail);}
}
