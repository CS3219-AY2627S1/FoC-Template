package com.friendoncampus.chat.messaging;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Retains original lifecycle/outcome facts; authoritative exports reconcile their safe timeline view. */
@Service
public class CaseEvidenceInbox {
    private final JdbcTemplate db;
    private final JsonMapper json=JsonMapper.builder().build();
    public CaseEvidenceInbox(JdbcTemplate db){this.db=db;}
    @Transactional
    public void record(String topic,String key,String payload){
        String source=switch(topic){case "admin.events"->"admin-service";case "user.admin.events"->"user-service";case "credit.admin.events"->"credit-service";default->throw new IllegalArgumentException("Unsupported evidence topic");};
        JsonNode e=json.readTree(payload);UUID id=UUID.fromString(e.path("eventId").asText()),aggregate=UUID.fromString(e.path("aggregateId").asText());
        if(!source.equals(e.path("producer").asText())||!aggregate.toString().equals(key)||!e.path("eventVersion").isIntegralNumber()||!e.path("eventVersion").canConvertToLong()||e.path("eventVersion").asLong()!=1)throw new IllegalArgumentException("Invalid evidence envelope");
        Set<String> types=switch(source){case "admin-service"->Set.of("CaseOpened","CaseClaimed","CaseActionCompleted","CaseResolved");case "user-service"->Set.of("AdminUserBanApplied","AdminUserBanRejected");default->Set.of("AdminCreditCorrectionApplied","AdminCreditCorrectionRejected");};
        if(!types.contains(e.path("eventType").asText()))throw new IllegalArgumentException("Invalid evidence type");
        JsonNode data=e.path("data");UUID.fromString(data.path("caseId").asText());UUID.fromString(data.path("orderId").asText());
        java.time.OffsetDateTime.parse(e.path("occurredAt").asText());
        if("admin-service".equals(source)){
            if(!"AdminCase".equals(e.path("aggregateType").asText())||!aggregate.toString().equals(data.path("caseId").asText())
                    ||!data.path("sourceSequence").isIntegralNumber()||data.path("sourceSequence").asLong()<1)throw new IllegalArgumentException("Invalid Admin case identity/sequence");
        }else{
            UUID.fromString(data.path("operationId").asText());
            if(!"AdminAction".equals(e.path("aggregateType").asText())||!aggregate.toString().equals(data.path("targetUserId").asText())
                    ||!Set.of("APPLIED","REJECTED","NO_CHANGE").contains(data.path("result").asText()))throw new IllegalArgumentException("Invalid owner outcome identity");
        }
        String content=hash(json.writeValueAsString(canonical(e)));
        db.query("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",r->null,"chat-event:"+id);
        var previous=db.queryForList("SELECT source,topic,aggregate_key,content_hash FROM chat_case_event_inbox WHERE event_id=?",id);
        if(!previous.isEmpty()){
            var p=previous.get(0);
            if(!source.equals(p.get("source"))||!topic.equals(p.get("topic"))||!aggregate.equals(p.get("aggregate_key"))||!content.equals(p.get("content_hash")))throw new IllegalStateException("Conflicting original case evidence event");
            return;
        }
        db.update("INSERT INTO chat_case_event_inbox(event_id,source,topic,aggregate_key,content_hash,payload) VALUES (?,?,?,?,?,?)",id,source,topic,aggregate,content,payload);
    }
    private Object canonical(JsonNode n){if(n.isObject()){Map<String,Object>m=new TreeMap<>();n.properties().forEach(e->m.put(e.getKey(),canonical(e.getValue())));return m;}if(n.isArray()){List<Object>a=new ArrayList<>();n.forEach(v->a.add(canonical(v)));return a;}return n;}
    private static String hash(String s){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));}catch(Exception ex){throw new IllegalStateException(ex);}}
    @Transactional(propagation=org.springframework.transaction.annotation.Propagation.REQUIRES_NEW)
    public void failed(String topic,int partition,long offset,String raw){
        UUID order=null;try{order=UUID.fromString(json.readTree(raw).path("data").path("orderId").asText());}catch(Exception ignored){}
        db.update("INSERT INTO chat_evidence_failures(topic,partition_id,record_offset,order_id,payload,failure_code) VALUES (?,?,?,?,?,'INVALID_OR_CONFLICTING_EVIDENCE') ON CONFLICT DO NOTHING",topic,partition,offset,order,raw==null?"null":raw);
    }
}
