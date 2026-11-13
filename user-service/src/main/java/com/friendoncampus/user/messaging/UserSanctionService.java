package com.friendoncampus.user.messaging;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.friendoncampus.user.domain.AdminLifecycleState;
import com.friendoncampus.user.repository.AdminLifecycleStateRepository;
import com.friendoncampus.user.service.AdminLifecycleService;
import com.friendoncampus.user.service.UserAccountAudit;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** User-owned effect + result + inbox + outcome outbox share the lifecycle transaction. */
@Service
public class UserSanctionService {
    private final JdbcTemplate db;
    private final AdminLifecycleStateRepository guard;
    private final AdminLifecycleService lifecycle;
    private final UserAccountAudit audit;
    private final JsonMapper json = JsonMapper.builder().build();
    public UserSanctionService(JdbcTemplate db, AdminLifecycleStateRepository guard,
            AdminLifecycleService lifecycle, UserAccountAudit audit) {
        this.db=db; this.guard=guard; this.lifecycle=lifecycle; this.audit=audit;
    }
    record Command(UUID event, UUID operation, UUID target, UUID actor, UUID caseId, UUID order,
                   UUID correlation, long revision, String reason, String contentHash, String requestHash) { }

    @Transactional
    public boolean receive(String key, String raw) {
        final Command c;
        try { c=parse(key,raw); }
        catch (IllegalArgumentException ex) { quarantine(key,raw,"INVALID_COMMAND"); return false; }
        // Serialize with User's REST ban/reactivation/role changes, not with Admin's database.
        guard.lockForLifecycleChange(AdminLifecycleState.ID).orElseThrow();
        var inbox=db.queryForList("SELECT content_hash FROM user_sanction_inbox WHERE event_id=?",c.event);
        if (!inbox.isEmpty() && !c.contentHash.equals(inbox.get(0).get("content_hash"))) {
            quarantine(key,raw,"EVENT_ID_CONFLICT"); return false;
        }
        var existing=db.queryForList("SELECT request_hash FROM user_sanction_operations WHERE operation_id=?",c.operation);
        if (!existing.isEmpty()) {
            if (!c.requestHash.equals(existing.get(0).get("request_hash"))) {
                quarantine(key,raw,"OPERATION_ID_CONFLICT"); return false;
            }
            if (inbox.isEmpty()) inbox(c);
            // Republish the ORIGINAL result even after reactivation or actor revocation.
            // Generation check prevents an in-flight publisher from losing this republication.
            db.update("UPDATE user_sanction_outbox SET published_at=NULL,next_attempt_at=CURRENT_TIMESTAMP,dispatch_version=dispatch_version+1 WHERE operation_id=?",c.operation);
            return true;
        }
        var decision=lifecycle.banForCase(c.actor,c.target);
        UUID outcomeId=UUID.randomUUID(); String at=Instant.now().toString();
        Map<String,Object> data=new LinkedHashMap<>();
        data.put("operationId",c.operation); data.put("caseId",c.caseId); data.put("orderId",c.order);
        data.put("targetUserId",c.target); data.put("requestedBy",c.actor); data.put("completedAt",at); data.put("result",decision.result());
        boolean rejected="REJECTED".equals(decision.result());
        if (rejected) data.put("reasonCode",decision.reasonCode());
        else { data.put("previousStatus",decision.previousStatus()); data.put("status","BANNED"); }
        Map<String,Object> e=new LinkedHashMap<>();
        e.put("eventId",outcomeId); e.put("eventType",rejected?"AdminUserBanRejected":"AdminUserBanApplied");
        e.put("eventVersion",1); e.put("aggregateType","AdminAction"); e.put("aggregateId",c.target); e.put("aggregateVersion",1);
        e.put("occurredAt",at); e.put("producer","user-service"); e.put("correlationId",c.correlation); e.put("causationId",c.event);
        e.put("actor",Map.of("type","USER","userId",c.actor,"role","ADMIN")); e.put("data",data);
        String payload=json.writeValueAsString(e);
        db.update("INSERT INTO user_sanction_operations(operation_id,request_hash,outcome_event_id,target_user_id,payload) VALUES (?,?,?,?,?)",c.operation,c.requestHash,outcomeId,c.target,payload);
        inbox(c);
        audit.record(c.actor,c.target,c.operation,"CASE_BAN",decision.result(),c.reason);
        db.update("INSERT INTO user_sanction_outbox(event_id,operation_id,target_user_id,payload) VALUES (?,?,?,?)",outcomeId,c.operation,c.target,payload);
        return true;
    }
    private void inbox(Command c) { db.update("INSERT INTO user_sanction_inbox(event_id,operation_id,content_hash) VALUES (?,?,?)",c.event,c.operation,c.contentHash); }
    private void quarantine(String key,String raw,String code) {
        db.update("INSERT INTO user_sanction_quarantine(content_hash,payload,failure_code) VALUES (?,?,?) ON CONFLICT DO NOTHING",hash(key+":"+raw),raw==null?"null":raw,code);
    }
    private Command parse(String key,String raw) {
        try {
            JsonNode e=json.readTree(raw),d=e.path("data");
            check("admin-service".equals(e.path("producer").asText()) && "AdminUserBanRequested".equals(e.path("eventType").asText()));
            check("AdminAction".equals(e.path("aggregateType").asText()));
            for (String f:List.of("eventVersion","aggregateVersion")) check(e.path(f).isIntegralNumber() && e.path(f).canConvertToLong() && e.path(f).asLong()==1);
            check(e.has("causationId") && e.path("causationId").isNull()); OffsetDateTime.parse(e.path("occurredAt").asText());
            UUID event=id(e,"eventId"),operation=id(d,"operationId"),target=id(d,"targetUserId"),actor=id(d,"requestedBy"),
                 caseId=id(d,"caseId"),order=id(d,"orderId"),correlation=id(e,"correlationId");
            check(target.equals(id(e,"aggregateId")) && target.toString().equals(key));
            check("USER".equals(e.path("actor").path("type").asText()) && "ADMIN".equals(e.path("actor").path("role").asText()) && actor.equals(id(e.path("actor"),"userId")));
            check(d.path("caseRevision").isIntegralNumber() && d.path("caseRevision").canConvertToLong() && d.path("caseRevision").asLong()>0);
            check(d.path("reason").isString() && !d.path("reason").asText().isBlank() && d.path("reason").asText().length()<=2000 && !d.hasNonNull("amount"));
            String reason=d.path("reason").asText().strip(); long revision=d.path("caseRevision").asLong();
            String request=hash(json.writeValueAsString(List.of("BAN",caseId.toString(),order.toString(),target.toString(),actor.toString(),reason,revision,correlation.toString())));
            return new Command(event,operation,target,actor,caseId,order,correlation,revision,reason,hash(json.writeValueAsString(canonical(e))),request);
        } catch (Exception ex) { throw new IllegalArgumentException("Invalid sanction command"); }
    }
    private Object canonical(JsonNode n) {
        if(n.isObject()){Map<String,Object> m=new TreeMap<>(); n.properties().forEach(e->m.put(e.getKey(),canonical(e.getValue())));return m;}
        if(n.isArray()){List<Object> a=new ArrayList<>();n.forEach(v->a.add(canonical(v)));return a;}return n;
    }
    private static UUID id(JsonNode n,String f) { check(n.path(f).isString() && n.path(f).asText().matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")); return UUID.fromString(n.path(f).asText()); }
    private static void check(boolean b) { if(!b)throw new IllegalArgumentException(); }
    static String hash(String value) { try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);} }
}
