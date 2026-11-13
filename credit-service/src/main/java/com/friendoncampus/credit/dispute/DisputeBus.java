package com.friendoncampus.credit.dispute;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.*;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Database-owned delivery. A broker offset is acknowledged only after durable inbox/quarantine. */
@Component
public class DisputeBus {
    public record Message(UUID eventId, int eventVersion, String type, String producer,
            UUID operationId, UUID caseId, UUID orderId, UUID actorId, String actorRole,
            Instant occurredAt, JsonNode data) {}
    public interface Handler {
        /** Remote current-account READ checks run before opening the mutation transaction. */
        void authorize(Message message);
        void handle(Message message);
    }
    private static final Logger log=LoggerFactory.getLogger(DisputeBus.class);
    private final JdbcTemplate db;
    private final TransactionTemplate tx;
    private final ObjectProvider<Handler> handler;
    private final ObjectProvider<KafkaTemplate<String,String>> kafka;
    private final boolean enabled;
    private final JsonMapper json=JsonMapper.builder().build();
    public DisputeBus(JdbcTemplate db, PlatformTransactionManager manager, ObjectProvider<Handler> handler,
            ObjectProvider<KafkaTemplate<String,String>> kafka, @Value("${app.kafka.enabled:false}") boolean enabled) {
        this.db=db;this.tx=new TransactionTemplate(manager);this.handler=handler;this.kafka=kafka;this.enabled=enabled;
        tx.setTimeout(20);
    }
    public static String topicProducer(String topic) {
        return switch(topic) {
            case "admin.dispute.commands" -> "admin-service";
            case "order.dispute.commands","order.dispute.events" -> "order-service";
            case "chat.dispute.events" -> "chat-service";
            case "credit.dispute.events" -> "credit-service";
            default -> throw new IllegalArgumentException("Unknown dispute topic");
        };
    }
    public static void validate(Message m,String topic,String key) {
        if(m==null||m.eventId()==null||m.eventVersion()!=1||m.operationId()==null||m.caseId()==null||
            m.orderId()==null||m.actorId()==null||m.actorRole()==null||!Set.of("ADMIN","REQUESTER","COURIER").contains(m.actorRole())||
            m.type()==null||!m.type().matches("[A-Za-z]{1,50}")||!topicProducer(topic).equals(m.producer())||
            !m.orderId().toString().equals(key)||m.occurredAt()==null||m.occurredAt().isAfter(Instant.now().plusSeconds(30))||
            m.data()==null||!m.data().isObject()) throw new IllegalArgumentException("Invalid dispute envelope");
        String expected=switch(m.type()){
            case "PrepareReview","PrepareResolution" -> "admin.dispute.commands";
            case "SettleDisputeCredits" -> "order.dispute.commands";
            case "OrderReviewFrozen","OrderDisputeFinalized" -> "order.dispute.events";
            case "ErrandReviewPrepared","CaseClosurePrepared" -> "chat.dispute.events";
            case "DisputeCreditsSettled" -> "credit.dispute.events";
            default -> throw new IllegalArgumentException("Unknown dispute type");
        };
        if(!expected.equals(topic))throw new IllegalArgumentException("Wrong producer topic for event type");
        for(String field:List.of("orderId","caseId","operationId"))if(m.data().has(field)){
            UUID value=UUID.fromString(m.data().path(field).asText());
            UUID root=field.equals("orderId")?m.orderId():field.equals("caseId")?m.caseId():m.operationId();
            if(!root.equals(value))throw new IllegalArgumentException("Mismatched outcome identity");
        }
        if(Set.of("PrepareResolution","SettleDisputeCredits","DisputeCreditsSettled","OrderDisputeFinalized").contains(m.type())&&(!"ADMIN".equals(m.actorRole())||!Set.of("RETURN_TO_REQUESTER","PAY_COURIER","KEEP_EXISTING").contains(m.data().path("disposition").asText())))throw new IllegalArgumentException("Invalid decision identity or disposition");
        if("PrepareReview".equals(m.type())&&(!Set.of("REPORT","LEGACY").contains(m.data().path("intent").asText())||("LEGACY".equals(m.data().path("intent").asText())&&!"ADMIN".equals(m.actorRole()))))throw new IllegalArgumentException("Invalid review intent");
        if(Set.of("OrderReviewFrozen","OrderDisputeFinalized").contains(m.type())){
            var participants=m.data().path("participants");if(!participants.isArray()||participants.isEmpty())throw new IllegalArgumentException("Incomplete membership confirmation");
            var ids=new HashSet<UUID>();for(var id:participants)if(!ids.add(UUID.fromString(id.asText())))throw new IllegalArgumentException("Duplicate participant");
            if(!ids.contains(UUID.fromString(m.data().path("requesterId").asText())))throw new IllegalArgumentException("Missing requester");
            if(!m.data().path("courierId").isNull()&&!ids.contains(UUID.fromString(m.data().path("courierId").asText())))throw new IllegalArgumentException("Missing courier");
            if(!m.data().path("resolved").isBoolean()||!m.data().has("creditStatus"))throw new IllegalArgumentException("Incomplete Order confirmation");
        }
        if(Set.of("ErrandReviewPrepared","CaseClosurePrepared").contains(m.type())&&!m.data().path("readOnly").asBoolean())throw new IllegalArgumentException("Barrier not confirmed");
        if("ErrandReviewPrepared".equals(m.type()))UUID.fromString(m.data().path("orderConfirmationId").asText());
        if("OrderDisputeFinalized".equals(m.type())){if(!m.data().path("resolved").asBoolean())throw new IllegalArgumentException("Order not finalized");UUID.fromString(m.data().path("creditConfirmationId").asText());}
        if("DisputeCreditsSettled".equals(m.type())&&(!m.data().path("complete").asBoolean()||!Set.of("ABSENT","RELEASED","SETTLED","COMPENSATED").contains(m.data().path("reservationStatus").asText())))throw new IllegalArgumentException("Credit is not finalized");
        rejectCredentials(m.data());
    }
    private static void rejectCredentials(JsonNode node) {
        if(node.isObject())for(var entry:node.properties()){
            if(entry.getKey().toLowerCase(Locale.ROOT).matches(".*(token|password|authorization|privatekey|secret).*"))
                throw new IllegalArgumentException("Credentials are forbidden in dispute records");
            rejectCredentials(entry.getValue());
        }else if(node.isArray())for(var child:node)rejectCredentials(child);
    }
    private Object canonical(JsonNode node){
        if(node.isObject()){var map=new TreeMap<String,Object>();for(var p:node.properties())map.put(p.getKey(),canonical(p.getValue()));return map;}
        if(node.isArray()){var values=new ArrayList<Object>();for(var child:node)values.add(canonical(child));return values;}
        return json.convertValue(node,Object.class);
    }
    public String fingerprint(Object value){return digest(json.writeValueAsString(canonical(json.valueToTree(value))));}
    public static String digest(String value){
        try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}
        catch(Exception ex){throw new IllegalStateException(ex);}
    }
    public Message decode(String value){rejectCredentials(json.readTree(value));return json.readValue(value,Message.class);}
    /** Caller and this outbox write must share the owner's domain transaction. */
    public void emit(String topic,String type,Message source,Object data,boolean repeat){
        String producer=topicProducer(topic);
        UUID event=UUID.nameUUIDFromBytes((producer+":"+type+":"+source.operationId()).getBytes(StandardCharsets.UTF_8));
        var payload=new Message(event,1,type,producer,source.operationId(),source.caseId(),source.orderId(),source.actorId(),source.actorRole(),Instant.now(),json.valueToTree(data));
        validate(payload,topic,source.orderId().toString());
        String fp=fingerprint(List.of(type,producer,source.operationId(),source.caseId(),source.orderId(),source.actorId(),source.actorRole(),data));
        var old=db.queryForList("SELECT fingerprint FROM dispute_outbox WHERE event_id=?",event);
        if(!old.isEmpty()){
            if(!fp.equals(old.get(0).get("fingerprint")))throw new IllegalArgumentException("Conflicting operation outcome");
            return;
        }
        db.update("INSERT INTO dispute_outbox(event_id,operation_id,topic,message_key,payload,fingerprint,repeat_until_done) VALUES (?,?,?,?,?,?,?)",
            event,source.operationId(),topic,source.orderId().toString(),json.writeValueAsString(payload),fp,repeat);
    }
    public void stop(UUID operation){db.update("UPDATE dispute_outbox SET active=false WHERE operation_id=? AND repeat_until_done",operation);}
    /** A stage is immutable, even if an attacker changes event ID to evade inbox deduplication. */
    public boolean remember(Message m,String stage){
        String fp=fingerprint(List.of(m.caseId(),m.orderId(),m.actorId(),m.actorRole(),m.data()));
        db.update("INSERT INTO dispute_operations(operation_id,stage,fingerprint,payload) VALUES (?,?,?,?) ON CONFLICT DO NOTHING",m.operationId(),stage,fp,json.writeValueAsString(m));
        String original=db.queryForObject("SELECT fingerprint FROM dispute_operations WHERE operation_id=? AND stage=?",String.class,m.operationId(),stage);
        if(!fp.equals(original))throw new IllegalArgumentException("Conflicting operation identity or payload");
        return true;
    }
    public Optional<Message> fact(UUID operation,String stage){
        return db.query("SELECT payload FROM dispute_operations WHERE operation_id=? AND stage=?",r->r.next()?Optional.of(decode(r.getString(1))):Optional.empty(),operation,stage);
    }
    @KafkaListener(topics={"order.dispute.commands"},groupId="${spring.application.name}-disputes",containerFactory="disputeKafkaListenerContainerFactory",autoStartup="${app.kafka.enabled:false}")
    public void receive(ConsumerRecord<String,String> record,Acknowledgment ack){
        tx.executeWithoutResult(s->{
            String hash=digest(String.valueOf(record.value()));
            try {
                Message m=decode(record.value());validate(m,record.topic(),record.key());
                var previous=db.queryForList("SELECT content_hash FROM dispute_inbox WHERE event_id=? FOR UPDATE",m.eventId());
                if(!previous.isEmpty()){
                    if(!hash.equals(previous.get(0).get("content_hash")))throw new IllegalArgumentException("Conflicting event replay");
                    // A repeated command asks for the original recorded outcomes, never another effect.
                    db.update("UPDATE dispute_outbox SET active=true,next_attempt_at=now(),lease_until=NULL WHERE operation_id=? AND NOT repeat_until_done",m.operationId());
                }else db.update("INSERT INTO dispute_inbox(event_id,operation_id,topic,payload,content_hash) VALUES (?,?,?,?,?)",m.eventId(),m.operationId(),record.topic(),record.value(),hash);
            }catch(IllegalArgumentException | tools.jackson.core.JacksonException ex){
                db.update("INSERT INTO dispute_quarantine(topic,partition_id,source_offset,content_hash,reason) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING",record.topic(),record.partition(),record.offset(),hash,"INVALID_OR_CONFLICTING_RECORD");
            }
        });
        ack.acknowledge();
    }
    @Scheduled(fixedDelayString="${app.dispute.worker-delay-ms:1000}")
    public void work(){
        if(enabled)drain();
    }
    public void drain(){
        var claimed=tx.execute(s->db.queryForList("""
            UPDATE dispute_inbox SET lease_until=now()+interval '60 seconds',attempts=attempts+1
            WHERE event_id IN (SELECT event_id FROM dispute_inbox WHERE status='PENDING' AND next_attempt_at<=now()
            AND (lease_until IS NULL OR lease_until<now()) ORDER BY created_at LIMIT 8 FOR UPDATE SKIP LOCKED) RETURNING *
            """));
        for(var row:claimed){
            UUID event=(UUID)row.get("event_id");Message m=decode((String)row.get("payload"));
            try{
                Handler owner=handler.getObject();owner.authorize(m);
                tx.executeWithoutResult(s->{
                    var current=db.queryForMap("SELECT status,lease_until FROM dispute_inbox WHERE event_id=? FOR UPDATE",event);
                    if(!"PENDING".equals(current.get("status"))||!Objects.equals(current.get("lease_until"),row.get("lease_until")))return;
                    db.query("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",r->null,"dispute-operation:"+m.operationId());
                    owner.handle(m);
                    db.update("UPDATE dispute_inbox SET status='DONE',lease_until=NULL,last_error=NULL WHERE event_id=?",event);
                });
                log.info("Dispute handled operationId={} eventId={} type={}",m.operationId(),event,m.type());
            }catch(Exception ex){
                // Retry transient owner/auth/DB failures indefinitely; no timeout becomes success.
                db.update("UPDATE dispute_inbox SET lease_until=NULL,next_attempt_at=now()+interval '10 seconds',last_error=? WHERE event_id=? AND lease_until=?",
                    ex instanceof IllegalArgumentException?"CONFLICT_OR_INVALID":"OWNER_UNAVAILABLE",event,row.get("lease_until"));
                log.warn("Dispute pending operationId={} eventId={} type={} code={}",m.operationId(),event,m.type(),ex.getClass().getSimpleName());
            }
        }
    }
    @Scheduled(fixedDelayString="${app.dispute.relay-delay-ms:1000}")
    public void publish(){
        if(!enabled)return;
        var rows=tx.execute(s->db.queryForList("""
            UPDATE dispute_outbox SET lease_until=now()+interval '30 seconds',attempts=attempts+1
            WHERE event_id IN (SELECT event_id FROM dispute_outbox WHERE active AND next_attempt_at<=now()
            AND (lease_until IS NULL OR lease_until<now()) ORDER BY created_at LIMIT 8 FOR UPDATE SKIP LOCKED) RETURNING *
            """));
        for(var row:rows)try{
            kafka.getObject().send((String)row.get("topic"),(String)row.get("message_key"),(String)row.get("payload")).get(10,TimeUnit.SECONDS);
            db.update("UPDATE dispute_outbox SET published_at=now(),active=repeat_until_done,lease_until=NULL,next_attempt_at=now()+interval '60 seconds' WHERE event_id=? AND lease_until=?",row.get("event_id"),row.get("lease_until"));
        }catch(Exception ex){
            if(ex instanceof InterruptedException){Thread.currentThread().interrupt();return;}
            db.update("UPDATE dispute_outbox SET lease_until=NULL,next_attempt_at=now()+interval '10 seconds' WHERE event_id=? AND lease_until=?",row.get("event_id"),row.get("lease_until"));
            log.warn("Dispute publication pending eventId={}",row.get("event_id"));
        }
    }
}
