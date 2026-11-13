package com.friendoncampus.credit.integration;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Credit alone applies corrections. Every result, ledger effect and outgoing intent is atomic. */
@Service
public class AdminCreditCorrectionService {
    private final JdbcTemplate db;
    private final AdminActorClient actors;
    private final TransactionTemplate tx;
    private final JsonMapper json=JsonMapper.builder().build();
    public AdminCreditCorrectionService(JdbcTemplate db, AdminActorClient actors, PlatformTransactionManager manager) {
        this.db=db; this.actors=actors; tx=new TransactionTemplate(manager); tx.setTimeout(15);
    }
    record Command(UUID event, UUID operation, UUID target, UUID actor, UUID caseId, UUID order,
            UUID correlation, long revision, String reason, long amount, String contentHash, String requestHash) { }
    public boolean receive(String key, String raw) {
        final Command c;
        try { c=parse(key,raw); }
        catch (IllegalArgumentException ex) { tx.executeWithoutResult(s->quarantine(key,raw,"INVALID_COMMAND")); return false; }
        // Replays return their immutable result even after actor revocation or a User outage.
        Boolean replay=tx.execute(s->{ lock(c); return replay(c,key,raw); });
        if (replay!=null) return replay;
        boolean eligible=actors.eligible(c.actor); // No database lock/transaction spans HTTP.
        return tx.execute(s->{
            lock(c);
            Boolean repeated=replay(c,key,raw); if(repeated!=null)return repeated;
            var rows=db.queryForList("SELECT available_balance,reserved_balance FROM credit_accounts WHERE user_id=? FOR UPDATE",c.target);
            String rejection=!eligible?"ACTOR_NOT_AUTHORIZED":rows.isEmpty()?"ACCOUNT_NOT_FOUND":null;
            int available=rows.isEmpty()?0:((Number)rows.get(0).get("available_balance")).intValue();
            int reserved=rows.isEmpty()?0:((Number)rows.get(0).get("reserved_balance")).intValue();
            long after=0;
            if(rejection==null) {
                if(c.amount<Integer.MIN_VALUE||c.amount>Integer.MAX_VALUE)rejection="NUMERIC_LIMIT";
                else {
                    try { after=Math.addExact((long)available,c.amount); }
                    catch(ArithmeticException ex){rejection="NUMERIC_LIMIT";}
                    if(rejection==null && after<0)rejection="INSUFFICIENT_AVAILABLE_CREDITS";
                    if(rejection==null && (after>Integer.MAX_VALUE-reserved || c.amount<Integer.MIN_VALUE || c.amount>Integer.MAX_VALUE))rejection="NUMERIC_LIMIT";
                }
            }
            UUID outcome=UUID.randomUUID(),ledger=UUID.randomUUID(); String at=Instant.now().toString();
            db.update("INSERT INTO credit_operations(id,operation_type,order_id,request_hash,result_code) VALUES (?,'ADMIN_CORRECTION',?,?,?)",
                    c.operation,c.order,c.requestHash,rejection==null?"CORRECTED":rejection);
            Map<String,Object> data=new LinkedHashMap<>();
            data.put("operationId",c.operation);data.put("caseId",c.caseId);data.put("orderId",c.order);
            data.put("targetUserId",c.target);data.put("requestedBy",c.actor);data.put("completedAt",at);data.put("amount",c.amount);
            data.put("result",rejection==null?"APPLIED":"REJECTED");
            if(rejection==null) {
                db.update("UPDATE credit_accounts SET available_balance=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE user_id=?",(int)after,c.target);
                db.update("INSERT INTO credit_ledger_entries(id,operation_id,account_id,entry_type,available_delta,reserved_delta,available_balance_after,reserved_balance_after) VALUES (?,?,?,'ADMIN_CORRECTION',?,0,?,?)",
                        ledger,c.operation,c.target,(int)c.amount,(int)after,reserved);
                data.put("availableBalance",after);data.put("reservedBalance",reserved);data.put("ledgerEntryId",ledger);
            } else data.put("reasonCode",rejection);
            Map<String,Object> e=new LinkedHashMap<>();
            e.put("eventId",outcome);e.put("eventType",rejection==null?"AdminCreditCorrectionApplied":"AdminCreditCorrectionRejected");
            e.put("eventVersion",1);e.put("aggregateType","AdminAction");e.put("aggregateId",c.target);e.put("aggregateVersion",1);
            e.put("occurredAt",at);e.put("producer","credit-service");e.put("correlationId",c.correlation);e.put("causationId",c.event);
            e.put("actor",Map.of("type","USER","userId",c.actor,"role","ADMIN"));e.put("data",data);
            String payload=json.writeValueAsString(e);
            db.update("INSERT INTO credit_admin_operations(operation_id,request_hash,outcome_event_id,target_user_id,case_id,order_id,requested_by,reason,payload) VALUES (?,?,?,?,?,?,?,?,?)",
                    c.operation,c.requestHash,outcome,c.target,c.caseId,c.order,c.actor,c.reason,payload);
            inbox(c);
            db.update("INSERT INTO credit_admin_outbox(event_id,operation_id,target_user_id,payload) VALUES (?,?,?,?)",outcome,c.operation,c.target,payload);
            return true;
        });
    }
    private void lock(Command c) {
        db.execute("SET LOCAL lock_timeout='5s'");
        // Same event with a different operation must also serialize before inbox validation.
        db.query("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",r->null,"credit-admin-event:"+c.event);
        db.query("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",r->null,"credit-admin-operation:"+c.operation);
    }
    private Boolean replay(Command c,String key,String raw) {
        var inbox=db.queryForList("SELECT content_hash FROM credit_admin_inbox WHERE event_id=?",c.event);
        if(!inbox.isEmpty()&&!c.contentHash.equals(inbox.get(0).get("content_hash"))){quarantine(key,raw,"EVENT_ID_CONFLICT");return false;}
        var previous=db.queryForList("SELECT request_hash FROM credit_admin_operations WHERE operation_id=?",c.operation);
        if(previous.isEmpty())return null;
        if(!c.requestHash.equals(previous.get(0).get("request_hash"))){quarantine(key,raw,"OPERATION_ID_CONFLICT");return false;}
        if(inbox.isEmpty())inbox(c);
        db.update("UPDATE credit_admin_outbox SET published_at=NULL,next_attempt_at=CURRENT_TIMESTAMP,dispatch_version=dispatch_version+1 WHERE operation_id=?",c.operation);
        return true;
    }
    private void inbox(Command c){db.update("INSERT INTO credit_admin_inbox(event_id,operation_id,content_hash) VALUES (?,?,?)",c.event,c.operation,c.contentHash);}
    private void quarantine(String key,String raw,String code){db.update("INSERT INTO credit_admin_quarantine(content_hash,payload,failure_code) VALUES (?,?,?) ON CONFLICT DO NOTHING",hash(key+":"+raw),raw==null?"null":raw,code);}
    private Command parse(String key,String raw) {
        try {
            JsonNode e=json.readTree(raw),d=e.path("data");
            check("admin-service".equals(e.path("producer").asText())&&"AdminCreditCorrectionRequested".equals(e.path("eventType").asText())&&"AdminAction".equals(e.path("aggregateType").asText()));
            for(String f:List.of("eventVersion","aggregateVersion"))check(e.path(f).isIntegralNumber()&&e.path(f).canConvertToLong()&&e.path(f).asLong()==1);
            check(e.has("causationId")&&e.path("causationId").isNull());OffsetDateTime.parse(e.path("occurredAt").asText());
            UUID event=id(e,"eventId"),operation=id(d,"operationId"),target=id(d,"targetUserId"),actor=id(d,"requestedBy"),caseId=id(d,"caseId"),order=id(d,"orderId"),correlation=id(e,"correlationId");
            check(target.equals(id(e,"aggregateId"))&&target.toString().equals(key));
            check("USER".equals(e.path("actor").path("type").asText())&&"ADMIN".equals(e.path("actor").path("role").asText())&&actor.equals(id(e.path("actor"),"userId")));
            check(d.path("caseRevision").isIntegralNumber()&&d.path("caseRevision").canConvertToLong()&&d.path("caseRevision").asLong()>0);
            check(d.path("reason").isString()&&!d.path("reason").asText().isBlank()&&d.path("reason").asText().length()<=2000);
            check(d.path("amount").isIntegralNumber()&&d.path("amount").canConvertToLong()&&d.path("amount").asLong()!=0);
            String reason=d.path("reason").asText().strip();long revision=d.path("caseRevision").asLong(),amount=d.path("amount").asLong();
            String request=hash(json.writeValueAsString(List.of("CREDIT",caseId.toString(),order.toString(),target.toString(),actor.toString(),reason,amount,revision,correlation.toString())));
            return new Command(event,operation,target,actor,caseId,order,correlation,revision,reason,amount,hash(json.writeValueAsString(canonical(e))),request);
        }catch(Exception ex){throw new IllegalArgumentException("Invalid correction command");}
    }
    private Object canonical(JsonNode n){if(n.isObject()){Map<String,Object>m=new TreeMap<>();n.properties().forEach(e->m.put(e.getKey(),canonical(e.getValue())));return m;}if(n.isArray()){List<Object>a=new ArrayList<>();n.forEach(v->a.add(canonical(v)));return a;}return n;}
    private static UUID id(JsonNode n,String f){check(n.path(f).isString()&&n.path(f).asText().matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"));return UUID.fromString(n.path(f).asText());}
    private static void check(boolean b){if(!b)throw new IllegalArgumentException();}
    static String hash(String value){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}catch(Exception ex){throw new IllegalStateException(ex);}}
}
