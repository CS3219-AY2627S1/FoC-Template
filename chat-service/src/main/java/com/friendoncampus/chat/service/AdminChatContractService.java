package com.friendoncampus.chat.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import java.util.HexFormat;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.*;
import tools.jackson.databind.json.JsonMapper;

@Service
public class AdminChatContractService {
    private final JdbcClient db; private final Clock clock; private final JwtDecoder users;
    private final com.friendoncampus.chat.authorization.CurrentAuthorization current;
    private final InternalServiceClient internal; private final JsonMapper json=JsonMapper.builder().build();
    private com.friendoncampus.chat.storage.AttachmentStorageRouter attachmentStorage;
    @org.springframework.beans.factory.annotation.Autowired
    public void attachmentStorage(com.friendoncampus.chat.storage.AttachmentStorageRouter storage){this.attachmentStorage=storage;}
    public AdminChatContractService(JdbcClient db,Clock clock,JwtDecoder userJwtDecoder,InternalServiceClient internal,com.friendoncampus.chat.authorization.CurrentAuthorization current){
        this.db=db;this.clock=clock;this.users=userJwtDecoder;this.internal=internal;this.current=current;
    }
    public Jwt actor(String raw){
        if(raw==null||raw.isBlank())throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"A user token is required");
        final Jwt jwt;
        try{jwt=users.decode(raw.startsWith("Bearer ")?raw.substring(7):raw);}catch(JwtException ex){throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"A valid user token is required");}
        current.require(jwt);return jwt;
    }
    @Transactional
    public Map<String,Object> eligibility(UUID orderId,UUID userId,Jwt actor){
        UUID actorId=UUID.fromString(actor.getSubject());if(!actorId.equals(userId))throw hidden();
        String role=actor.getClaimAsString("role");if(!Set.of("REQUESTER","COURIER").contains(role))throw hidden();
        var pages=internal.orderEvidence(orderId);JsonNode account=internal.userEligibility(userId);
        reconcile(pages);var evidence=orderEvidence(orderId);boolean participant=evidence.stream().anyMatch(r->{JsonNode d=r.data();return userId.toString().equals(d.path("requesterId").asText())||userId.toString().equals(d.path("courierId").asText())||userId.toString().equals(d.path("previousCourierId").asText());});
        boolean eligible=participant&&account.path("active").asBoolean(false);
        return response(orderId,userId,eligible,evidence);
    }
    @Transactional
    public Map<String,Object> timeline(UUID caseId,Jwt actor,String cursor,int limit){
        requireAdmin(actor);if(limit<1||limit>100)throw bad("Limit must be between 1 and 100");
        UUID actorId=UUID.fromString(actor.getSubject());JsonNode access=internal.caseAccess(caseId,actorId,null);
        if(!access.path("canReadEvidence").asBoolean())throw hidden();UUID orderId=UUID.fromString(access.path("orderId").asText());
        if(cursor!=null)return snapshotPage(caseId,cursor,limit);
        var orderPages=internal.orderEvidence(orderId);var creditPages=internal.creditEvidence(orderId);var adminPages=internal.adminEvidence(orderId,caseId);
        var operations=operationEvidence(caseId,orderId,adminPages); // All producer HTTP reads precede projection writes.
        reconcile(orderPages);reconcile(creditPages);reconcile(adminPages);
        for(var entry:operations.results.entrySet()){
            var value=entry.getValue();String serialized=json.writeValueAsString(value);
            var prior=db.sql("SELECT payload FROM chat_operation_evidence WHERE operation_id=:id").param("id",entry.getKey()).query(String.class).optional();
            if(prior.isPresent()&&!json.readTree(prior.get()).equals(value))throw new ChatConflictException("Owner operation evidence conflicts with its original result");
            db.sql("INSERT INTO chat_operation_evidence(operation_id,case_id,order_id,source,event_id,payload) VALUES(:id,:caseId,:orderId,:source,:event,:payload) ON CONFLICT(operation_id) DO NOTHING")
                    .param("id",entry.getKey()).param("caseId",caseId).param("orderId",orderId).param("source",value.path("producer").asText())
                    .param("event",UUID.fromString(value.path("eventId").asText())).param("payload",serialized).update();
        }
        List<Record> all=allEvidence(orderId);List<Record> orderRecords=all.stream().filter(r->"ORDER".equals(r.data().path("kind").asText())).sorted(Comparator.comparingLong(Record::sequence)).toList();
        all=new ArrayList<>(all);all.addAll(operationRecords(caseId,orderId));
        var messages=messageRecords(caseId,orderId);all.addAll(messages);
        all.sort(Comparator.comparing(Record::occurredAt).thenComparing(Record::source).thenComparingLong(Record::sequence).thenComparing(r->r.eventId().toString()));
        List<Map<String,Object>> records=all.stream().map(Record::wire).toList();
        JsonNode snapshot=orderRecords.isEmpty()?json.createObjectNode():orderRecords.get(orderRecords.size()-1).data().path("snapshot");
        if(snapshot.isMissingNode()||!snapshot.isObject())throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Order evidence baseline is unavailable");
        String revision=revision(all);
        Map<String,Object> result=new LinkedHashMap<>();result.put("caseId",caseId);result.put("orderId",orderId);result.put("evidenceRevision",revision);
        result.put("order",json.convertValue(snapshot,Map.class));result.put("participants",participants(orderRecords));result.put("records",records);
        var coverage=new LinkedHashMap<>(coverage(orderId,caseId,all));
        @SuppressWarnings("unchecked") var checkpoints=new ArrayList<>((List<Map<String,Object>>)coverage.get("checkpoints"));
        checkpoints.add(Map.of("source","chat-service","stream","chat.messages","aggregateId",caseId,"committedSequence",messages.size(),"projectedSequence",messages.size(),"checkedAt",OffsetDateTime.now(clock).toString()));
        coverage.put("checkpoints",checkpoints);
        var failures=db.sql("SELECT DISTINCT topic FROM chat_evidence_failures WHERE order_id=:orderId OR order_id IS NULL").param("orderId",orderId).query(String.class).list();
        if(!failures.isEmpty()){
            @SuppressWarnings("unchecked") var gaps=new ArrayList<>((List<Map<String,Object>>)coverage.get("blockingGaps"));
            for(String topic:failures)gaps.add(Map.of("source","chat-service","stream",topic,"aggregateId",orderId,"fromSequence",0,"toSequence",0,"reason","FAILED_INGESTION"));
            coverage.put("blockingGaps",gaps);coverage.put("status","INCOMPLETE");
        }
        if(!operations.missing.isEmpty()){
            @SuppressWarnings("unchecked") var gaps=new ArrayList<>((List<Map<String,Object>>)coverage.get("blockingGaps"));
            for(String owner:operations.missing)gaps.add(Map.of("source",owner,"stream",owner.equals("user-service")?"user.admin.events":"credit.admin.events","aggregateId",caseId,"fromSequence",0,"toSequence",0,"reason","BACKFILL_PENDING"));
            coverage.put("blockingGaps",gaps);coverage.put("status","INCOMPLETE");
        }
        result.put("coverage",coverage);result.put("nextCursor",null);
        UUID snapshotId=UUID.randomUUID();
        db.sql("INSERT INTO chat_timeline_snapshots(id,case_id,payload,expires_at) VALUES(:id,:caseId,:payload,:expires)")
                .param("id",snapshotId).param("caseId",caseId).param("payload",json.writeValueAsString(result))
                .param("expires",OffsetDateTime.now(clock).plusMinutes(10)).update();
        db.sql("DELETE FROM chat_timeline_snapshots WHERE expires_at<:now").param("now",OffsetDateTime.now(clock)).update();
        return page(result,snapshotId,0,limit);
    }
    @Transactional
    public Map<String,Object> openConversation(UUID caseId,UUID participantId,UUID key,Jwt actor){
        requireAdmin(actor);UUID actorId=UUID.fromString(actor.getSubject());JsonNode access=internal.caseAccess(caseId,actorId,participantId);
        if(!access.path("canReadConversation").asBoolean())throw hidden();UUID orderId=UUID.fromString(access.path("orderId").asText());
        String requestHash=sha256(actorId+":"+participantId);
        lockCase(caseId);
        var prior=db.sql("SELECT request_hash,conversation_id FROM chat_case_conversation_requests WHERE case_id=:caseId AND idempotency_key=:key")
                .param("caseId",caseId).param("key",key).query((rs,n)->Map.of("hash",rs.getString(1),"id",rs.getObject(2,UUID.class))).optional();
        UUID conversationId;
        if(prior.isPresent()){
            if(!requestHash.equals(prior.get().get("hash")))throw new ChatConflictException("Idempotency-Key was already used for another participant");
            conversationId=(UUID)prior.get().get("id");
        }else{
            conversationId=db.sql("SELECT id FROM chat_conversations WHERE case_id=:caseId AND case_participant_id=:participant")
                    .param("caseId",caseId).param("participant",participantId).query(UUID.class).optional().orElse(null);
            boolean writable=access.path("canWriteConversation").asBoolean();OffsetDateTime now=OffsetDateTime.now(clock);
            if(!writable||!actorId.toString().equals(access.path("reviewerId").asText())||closureExists(caseId))throw new ChatConflictException("Only the assigned reviewer may create an active case conversation");
            if(conversationId==null){conversationId=UUID.randomUUID();db.sql("INSERT INTO chat_conversations(id,conversation_type,order_id,case_id,case_participant_id,status,next_sequence,created_at,updated_at) VALUES(:id,'CASE',:orderId,:caseId,:participant,:status,1,:now,:now)")
                    .param("id",conversationId).param("orderId",orderId).param("caseId",caseId).param("participant",participantId).param("status",writable?"ACTIVE":"READ_ONLY").param("now",now).update();}
            final UUID cid=conversationId;
            addParticipant(cid,participantId,"CASE_PARTICIPANT",writable,now);addParticipant(cid,actorId,"ADMIN_REVIEWER",writable,now);
            db.sql("INSERT INTO chat_case_conversation_requests(case_id,idempotency_key,request_hash,conversation_id,created_at) VALUES(:caseId,:key,:hash,:conversation,:now)")
                    .param("caseId",caseId).param("key",key).param("hash",requestHash).param("conversation",conversationId).param("now",now).update();
        }
        if(access.path("canWriteConversation").asBoolean()&&actorId.toString().equals(access.path("reviewerId").asText())&&!closureExists(caseId)){
            // An explicit reviewer POST repairs CASE rows locked by old ERRAND terminal handling.
            // The authoritative active case and durable closure barrier are checked first.
            db.sql("UPDATE chat_conversations SET status='ACTIVE',locked_at=NULL,updated_at=:now WHERE id=:id AND conversation_type='CASE'")
                    .param("id",conversationId).param("now",OffsetDateTime.now(clock)).update();
            addParticipant(conversationId,participantId,"CASE_PARTICIPANT",true,OffsetDateTime.now(clock));
            addParticipant(conversationId,actorId,"ADMIN_REVIEWER",true,OffsetDateTime.now(clock));
        }
        String status=db.sql("SELECT status FROM chat_conversations WHERE id=:id").param("id",conversationId).query(String.class).single();
        return Map.of("conversationId",conversationId,"caseId",caseId,"orderId",orderId,"participantUserId",participantId,"readOnly","READ_ONLY".equals(status)||!access.path("canWriteConversation").asBoolean());
    }
    @Transactional(readOnly=true)
    public Map<String,Object> findConversation(UUID caseId,UUID participantId,Jwt actor) {
        UUID actorId=UUID.fromString(actor.getSubject());var access=internal.caseAccess(caseId,actorId,participantId);
        if(!access.path("canReadConversation").asBoolean())throw hidden();
        UUID order=UUID.fromString(access.path("orderId").asText());
        UUID id=db.sql("SELECT id FROM chat_conversations WHERE case_id=:caseId AND case_participant_id=:participant AND conversation_type='CASE'")
                .param("caseId",caseId).param("participant",participantId).query(UUID.class).optional().orElse(null);
        if(id==null)throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Conversation not found");
        String status=db.sql("SELECT status FROM chat_conversations WHERE id=:id").param("id",id).query(String.class).single();
        return Map.of("conversationId",id,"caseId",caseId,"orderId",order,"participantUserId",participantId,
                "readOnly",!"ACTIVE".equals(status)||!access.path("canWriteConversation").asBoolean());
    }
    @Transactional
    public Map<String,Object> drainClosure(UUID caseId,UUID operation) {
        lockCase(caseId);
        var prior=db.sql("SELECT operation_id FROM chat_case_closures WHERE case_id=:caseId").param("caseId",caseId).query(UUID.class).optional();
        if(prior.isPresent()&&!operation.equals(prior.get()))throw new ChatConflictException("Different closure operation");
        db.sql("INSERT INTO chat_case_closures(case_id,operation_id) VALUES(:caseId,:operation) ON CONFLICT(case_id) DO NOTHING")
                .param("caseId",caseId).param("operation",operation).update();
        // UPDATE waits for in-flight message/upload row locks; subsequent writers see this barrier.
        db.sql("UPDATE chat_conversations SET status='READ_ONLY',locked_at=COALESCE(locked_at,:now),updated_at=:now WHERE case_id=:caseId AND conversation_type='CASE'")
                .param("caseId",caseId).param("now",OffsetDateTime.now(clock)).update();
        return Map.of("caseId",caseId,"operationId",operation,"readOnly",true);
    }
    private void lockCase(UUID caseId){db.sql("SELECT pg_advisory_xact_lock(hashtextextended(:id,0))").param("id","chat-case:"+caseId).query((rs,n)->true).single();}
    private boolean closureExists(UUID caseId){return db.sql("SELECT count(*) FROM chat_case_closures WHERE case_id=:id").param("id",caseId).query(Integer.class).single()>0;}

    @Transactional
    public Map<String,Object> applyReviewBarrier(UUID orderId,UUID caseId){
        db.sql("INSERT INTO chat_errand_reviews(order_id,case_id) VALUES(:orderId,:caseId) ON CONFLICT(order_id) DO NOTHING").param("orderId",orderId).param("caseId",caseId).update();
        UUID original=db.sql("SELECT case_id FROM chat_errand_reviews WHERE order_id=:orderId").param("orderId",orderId).query(UUID.class).single();if(!caseId.equals(original))throw new ChatConflictException("Another case owns this review");
        db.sql("UPDATE chat_conversations SET status='READ_ONLY',locked_at=COALESCE(locked_at,:at),updated_at=:at WHERE order_id=:orderId AND conversation_type='ERRAND'").param("orderId",orderId).param("at",OffsetDateTime.now(clock)).update();
        return Map.of("orderId",orderId,"caseId",caseId,"readOnly",true);
    }
    private List<Record> messageRecords(UUID caseId,UUID orderId){
        return db.sql("""
            SELECT m.*,c.conversation_type,c.case_participant_id,a.content_type,a.original_filename,a.size_bytes
            FROM chat_messages m JOIN chat_conversations c ON c.id=m.conversation_id
            LEFT JOIN chat_attachments a ON a.id=m.attachment_id
            WHERE c.order_id=:orderId AND (c.conversation_type='ERRAND' OR c.case_id=:caseId)
              AND m.message_type IN ('TEXT','QUICK_REPLY','IMAGE')
            ORDER BY m.created_at,m.conversation_id,m.sequence,m.id
            """).param("orderId",orderId).param("caseId",caseId).query((rs,n)->{
                Map<String,Object> data=new LinkedHashMap<>();data.put("kind","CHAT");data.put("caseId",caseId);
                data.put("conversationId",rs.getObject("conversation_id",UUID.class));data.put("conversationType",rs.getString("conversation_type"));
                data.put("participantUserId",rs.getObject("case_participant_id",UUID.class));data.put("messageId",rs.getObject("id",UUID.class));
                data.put("messageType",rs.getString("message_type"));data.put("text",rs.getString("text_content"));
                UUID attachment=rs.getObject("attachment_id",UUID.class);
                data.put("attachment",attachment==null?null:Map.of("id",attachment,"contentType",rs.getString("content_type"),"filename",rs.getString("original_filename"),"size",rs.getLong("size_bytes")));
                OffsetDateTime at=rs.getObject("created_at",OffsetDateTime.class);
                return new Record(rs.getObject("id",UUID.class),"chat-service","chat.messages",rs.getLong("sequence"),orderId,"IMAGE".equals(rs.getString("message_type"))?"ImageShared":"MessageSent",rs.getObject("sender_user_id",UUID.class),at,at,json.valueToTree(data));
            }).list();
    }
    public ChatConversationService.StoredAttachment evidenceAttachment(UUID caseId,UUID messageId,Jwt actor){
        requireAdmin(actor);UUID actorId=UUID.fromString(actor.getSubject());
        JsonNode access=internal.caseAccess(caseId,actorId,null);
        if(!access.path("canReadEvidence").asBoolean())throw hidden();
        UUID order=UUID.fromString(access.path("orderId").asText());
        var image=db.sql("""
            SELECT a.* FROM chat_attachments a JOIN chat_messages m ON m.attachment_id=a.id
            JOIN chat_conversations c ON c.id=m.conversation_id
            WHERE m.id=:messageId AND m.message_type='IMAGE' AND c.order_id=:orderId
              AND (c.conversation_type='ERRAND' OR c.case_id=:caseId)
            """).param("messageId",messageId).param("orderId",order).param("caseId",caseId)
            .query((rs,n)->new ChatConversationService.StoredAttachment(rs.getString("content_type"),rs.getString("original_filename"),attachmentStorage.get(rs.getString("storage_provider"),rs.getString("object_key"),rs.getBytes("content")))).optional().orElseThrow(AdminChatContractService::hidden);
        current.require(actor); // Recheck revocation after external object storage returned.
        return image;
    }

    private record Operations(Map<UUID,JsonNode> results,Set<String> missing){}
    private Operations operationEvidence(UUID caseId,UUID orderId,List<JsonNode> pages){
        Map<UUID,JsonNode> results=new LinkedHashMap<>();Set<String> missing=new LinkedHashSet<>();
        for(JsonNode page:pages)for(JsonNode record:page.path("records"))if("CaseActionCompleted".equals(record.path("action").asText())){
            JsonNode data=record.path("data");UUID operation=UUID.fromString(data.path("operationId").asText());String owner=data.path("ownerService").asText();
            if(!Set.of("user-service","credit-service").contains(owner))throw new ChatConflictException("Missing action owner identity");
            var outcome=internal.operation(owner,operation);
            if(outcome.isEmpty()){missing.add(owner);continue;}
            JsonNode e=outcome.get(),d=e.path("data");
            if(!validOutcome(e,owner)||!owner.equals(e.path("producer").asText())||!data.path("ownerEventId").asText().equals(e.path("eventId").asText())
                    ||!operation.toString().equals(d.path("operationId").asText())||!caseId.toString().equals(d.path("caseId").asText())
                    ||!orderId.toString().equals(d.path("orderId").asText())||!data.path("targetUserId").asText().equals(d.path("targetUserId").asText())
                    ||!data.path("result").asText().equals(d.path("result").asText())||!record.path("actorUserId").asText().equals(d.path("requestedBy").asText())){
                missing.add(owner);continue;
            }
            results.put(operation,e);
        }
        return new Operations(results,missing);
    }
    private boolean validOutcome(JsonNode e,String owner){
        try{
            var d=e.path("data");String result=d.path("result").asText();boolean credit="credit-service".equals(owner),rejected="REJECTED".equals(result);
            if(!e.path("eventVersion").isIntegralNumber()||e.path("eventVersion").asInt()!=1||!e.path("aggregateVersion").isIntegralNumber()||e.path("aggregateVersion").asInt()!=1
                    ||!"AdminAction".equals(e.path("aggregateType").asText())||!e.path("aggregateId").asText().equals(d.path("targetUserId").asText())
                    ||!"USER".equals(e.path("actor").path("type").asText())||!"ADMIN".equals(e.path("actor").path("role").asText())
                    ||!e.path("actor").path("userId").asText().equals(d.path("requestedBy").asText())
                    ||!(credit?(rejected?"AdminCreditCorrectionRejected":"AdminCreditCorrectionApplied"):(rejected?"AdminUserBanRejected":"AdminUserBanApplied")).equals(e.path("eventType").asText()))return false;
            UUID.fromString(e.path("correlationId").asText());UUID.fromString(e.path("causationId").asText());
            Instant.parse(e.path("occurredAt").asText());Instant.parse(d.path("completedAt").asText());
            if(rejected)return d.path("reasonCode").isString()&&!d.path("reasonCode").asText().isBlank();
            if(credit){UUID.fromString(d.path("ledgerEntryId").asText());return "APPLIED".equals(result)&&d.path("amount").isIntegralNumber()&&d.path("amount").asLong()!=0&&d.path("availableBalance").isIntegralNumber()&&d.path("availableBalance").asLong()>=0&&d.path("reservedBalance").isIntegralNumber()&&d.path("reservedBalance").asLong()>=0;}
            return Set.of("APPLIED","NO_CHANGE").contains(result)&&Set.of("ACTIVE","BANNED").contains(d.path("previousStatus").asText())&&"BANNED".equals(d.path("status").asText());
        }catch(Exception ex){return false;}
    }
    private List<Record> operationRecords(UUID caseId,UUID orderId){
        return db.sql("SELECT source,payload,ingested_at FROM chat_operation_evidence WHERE case_id=:caseId AND order_id=:orderId")
                .param("caseId",caseId).param("orderId",orderId).query((rs,n)->{
                    var e=json.readTree(rs.getString("payload"));var d=e.path("data");String source=rs.getString("source");
                    Map<String,Object> data=new LinkedHashMap<>();data.put("operationId",d.path("operationId").asText());data.put("result",d.path("result").asText());
                    if("credit-service".equals(source)){
                        data.put("kind","CREDIT");data.put("reasonCode",d.path("reasonCode").asText(null));
                        data.put("ledgerEntries","APPLIED".equals(d.path("result").asText())?List.of(Map.of("ledgerEntryId",d.path("ledgerEntryId").asText(),"userId",d.path("targetUserId").asText(),"availableDelta",d.path("amount").asLong(),"reservedDelta",0,"availableBalance",d.path("availableBalance").asLong(),"reservedBalance",d.path("reservedBalance").asLong())):List.of());
                    }else{data.put("kind","ADMIN");data.put("caseId",caseId);data.put("targetUserId",d.path("targetUserId").asText());}
                    // Owner outcomes have operation identity, not a contiguous global User sequence.
                    return new Record(UUID.fromString(e.path("eventId").asText()),source,source.equals("user-service")?"user.admin.events":"credit.admin.events",0,orderId,e.path("eventType").asText(),UUID.fromString(d.path("requestedBy").asText()),OffsetDateTime.parse(e.path("occurredAt").asText()),rs.getObject("ingested_at",OffsetDateTime.class),json.valueToTree(data));
                }).list();
    }
    @SuppressWarnings("unchecked")
    private Map<String,Object> snapshotPage(UUID caseId,String cursor,int limit) {
        try {
            String[] parts=new String(Base64.getUrlDecoder().decode(cursor),java.nio.charset.StandardCharsets.UTF_8).split(":");
            if(parts.length!=2)throw new IllegalArgumentException();UUID id=UUID.fromString(parts[0]);int offset=Integer.parseInt(parts[1]);
            String payload=db.sql("SELECT payload FROM chat_timeline_snapshots WHERE id=:id AND case_id=:caseId AND expires_at>:now")
                    .param("id",id).param("caseId",caseId).param("now",OffsetDateTime.now(clock)).query(String.class).optional()
                    .orElseThrow(()->new ResponseStatusException(HttpStatus.CONFLICT,"Snapshot expired; restart the timeline"));
            return page(json.readValue(payload,LinkedHashMap.class),id,offset,limit);
        }catch(ResponseStatusException ex){throw ex;}catch(Exception ex){throw bad("Invalid timeline cursor");}
    }
    @SuppressWarnings("unchecked")
    private Map<String,Object> page(Map<String,Object> full,UUID id,int offset,int limit){
        List<Map<String,Object>> records=(List<Map<String,Object>>)full.get("records");
        if(offset<0||offset>records.size())throw bad("Invalid timeline cursor");int end=Math.min(offset+limit,records.size());
        Map<String,Object> result=new LinkedHashMap<>(full);result.put("records",records.subList(offset,end));
        result.put("nextCursor",end<records.size()?Base64.getUrlEncoder().withoutPadding().encodeToString((id+":"+end).getBytes(java.nio.charset.StandardCharsets.UTF_8)):null);
        return result;
    }
    private void addParticipant(UUID conversation,UUID user,String relationship,boolean writable,OffsetDateTime now){db.sql("INSERT INTO chat_participants(conversation_id,user_id,assignment_epoch,relationship,can_write,valid_from) VALUES(:c,:u,1,:r,:w,:n) ON CONFLICT(conversation_id,user_id,assignment_epoch) DO UPDATE SET can_write=EXCLUDED.can_write,valid_until=NULL")
            .param("c",conversation).param("u",user).param("r",relationship).param("w",writable).param("n",now).update();}
    private void requireAdmin(Jwt actor){if(!"ADMIN".equals(actor.getClaimAsString("role")))throw hidden();JsonNode e=internal.userEligibility(UUID.fromString(actor.getSubject()));if(!e.path("active").asBoolean()||!e.path("administrator").asBoolean())throw hidden();}
    private List<Record> orderEvidence(UUID orderId){return db.sql("SELECT event_id,source,stream,source_sequence,order_id,action,actor_user_id,occurred_at,ingested_at,data::text FROM chat_evidence_records WHERE order_id=:orderId AND source='order-service' ORDER BY source_sequence")
            .param("orderId",orderId).query((rs,n)->new Record(rs.getObject(1,UUID.class),rs.getString(2),rs.getString(3),rs.getLong(4),rs.getObject(5,UUID.class),rs.getString(6),rs.getObject(7,UUID.class),rs.getObject(8,OffsetDateTime.class),rs.getObject(9,OffsetDateTime.class),json.readTree(rs.getString(10)))).list();}
    private List<Record> allEvidence(UUID orderId){return db.sql("SELECT event_id,source,stream,source_sequence,order_id,action,actor_user_id,occurred_at,ingested_at,data::text FROM chat_evidence_records WHERE order_id=:orderId ORDER BY occurred_at,source,source_sequence,event_id").param("orderId",orderId).query((rs,n)->new Record(rs.getObject(1,UUID.class),rs.getString(2),rs.getString(3),rs.getLong(4),rs.getObject(5,UUID.class),rs.getString(6),rs.getObject(7,UUID.class),rs.getObject(8,OffsetDateTime.class),rs.getObject(9,OffsetDateTime.class),json.readTree(rs.getString(10)))).list();}
    private void reconcile(List<JsonNode> pages) {
        for (JsonNode page : pages) {
            JsonNode checkpoint = page.path("checkpoint");
            String source = checkpoint.path("source").asText();
            String stream = checkpoint.path("stream").asText();
            UUID aggregate = UUID.fromString(checkpoint.path("aggregateId").asText());
            long committed = checkpoint.path("committedSequence").asLong();
            OffsetDateTime checked = OffsetDateTime.parse(checkpoint.path("checkedAt").asText());

            for (JsonNode record : page.path("records")) {
                UUID eventId = UUID.fromString(record.path("eventId").asText());
                if (evidenceExists(eventId)) {
                    if (!sameEvidence(eventId, source, stream, aggregate, record)) {
                        throw new ChatConflictException("Conflicting evidence event " + eventId);
                    }
                    continue;
                }

                String hash = sha256(canonicalEvidence(source, stream, aggregate, record));
                db.sql("""
                        INSERT INTO chat_evidence_records(
                            event_id,source,stream,aggregate_id,source_sequence,order_id,action,
                            actor_user_id,occurred_at,ingested_at,data,payload_hash)
                        VALUES(:event,:source,:stream,:aggregate,:sequence,:orderId,:action,
                            :actor,:occurred,:ingested,CAST(:data AS jsonb),:hash)
                        """)
                        .param("event", eventId)
                        .param("source", source)
                        .param("stream", stream)
                        .param("aggregate", aggregate)
                        .param("sequence", record.path("sourceSequence").asLong())
                        .param("orderId", UUID.fromString(record.path("orderId").asText()))
                        .param("action", record.path("action").asText())
                        .param("actor", nullableUuid(record, "actorUserId"), java.sql.Types.OTHER)
                        .param("occurred", OffsetDateTime.parse(record.path("occurredAt").asText()).truncatedTo(java.time.temporal.ChronoUnit.MICROS))
                        .param("ingested", OffsetDateTime.parse(record.path("ingestedAt").asText()))
                        .param("data", record.path("data").toString())
                        .param("hash", hash)
                        .update();
            }

            db.sql("""
                    INSERT INTO chat_projection_checkpoints(
                        source,stream,aggregate_id,committed_sequence,checked_at)
                    VALUES(:source,:stream,:aggregate,:committed,:checked)
                    ON CONFLICT(source,stream,aggregate_id) DO UPDATE SET
                        committed_sequence=EXCLUDED.committed_sequence,
                        checked_at=EXCLUDED.checked_at
                    """)
                    .param("source", source)
                    .param("stream", stream)
                    .param("aggregate", aggregate)
                    .param("committed", committed)
                    .param("checked", checked)
                    .update();
        }
    }

    private boolean evidenceExists(UUID eventId) {
        return db.sql("SELECT EXISTS(SELECT 1 FROM chat_evidence_records WHERE event_id=:id)")
                .param("id", eventId)
                .query(Boolean.class)
                .single();
    }

    private boolean sameEvidence(UUID eventId, String source, String stream, UUID aggregate,
            JsonNode record) {
        return db.sql("""
                SELECT source,stream,aggregate_id,source_sequence,order_id,action,actor_user_id,
                    occurred_at,data::text
                FROM chat_evidence_records WHERE event_id=:id
                """)
                .param("id", eventId)
                .query((rs, row) -> source.equals(rs.getString(1))
                        && stream.equals(rs.getString(2))
                        && aggregate.equals(rs.getObject(3, UUID.class))
                        && record.path("sourceSequence").asLong() == rs.getLong(4)
                        && UUID.fromString(record.path("orderId").asText())
                                .equals(rs.getObject(5, UUID.class))
                        && record.path("action").asText().equals(rs.getString(6))
                        && Objects.equals(nullableUuid(record, "actorUserId"),
                                rs.getObject(7, UUID.class))
                        && Duration.between(OffsetDateTime.parse(record.path("occurredAt").asText()).toInstant(),
                                rs.getObject(8, OffsetDateTime.class).toInstant()).abs().compareTo(Duration.ofNanos(1000))<0
                        && record.path("data").equals(json.readTree(rs.getString(9))))
                .optional()
                .orElse(false);
    }

    private String canonicalEvidence(String source, String stream, UUID aggregate, JsonNode record) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("source", source);
        value.put("stream", stream);
        value.put("aggregateId", aggregate);
        value.put("sourceSequence", record.path("sourceSequence").asLong());
        value.put("orderId", UUID.fromString(record.path("orderId").asText()));
        value.put("action", record.path("action").asText());
        value.put("actorUserId", nullableUuid(record, "actorUserId"));
        value.put("occurredAt", OffsetDateTime.parse(record.path("occurredAt").asText()).toInstant());
        value.put("data", record.path("data"));
        return json.writeValueAsString(value);
    }

    private static UUID nullableUuid(JsonNode node, String field) {
        String value = node.path(field).asText(null);
        return value == null || value.isBlank() ? null : UUID.fromString(value);
    }
    private Map<String,Object> response(UUID orderId,UUID userId,boolean eligible,List<Record> records){return Map.of("orderId",orderId,"userId",userId,"eligible",eligible,"evidenceRevision",revision(records),"coverage",coverage(orderId,null,records));}
    private Map<String,Object> coverage(UUID orderId,UUID caseId,List<Record> records){
        List<SourceKey> required=new ArrayList<>();required.add(new SourceKey("order-service","order.lifecycle.events",orderId));if(caseId!=null){required.add(new SourceKey("credit-service","credit.events",orderId));required.add(new SourceKey("admin-service","admin.events",caseId));}List<Map<String,Object>> checkpoints=new ArrayList<>(),gaps=new ArrayList<>();Instant now=Instant.now(clock);
        for(SourceKey key:required){long projected=contiguous(records.stream().filter(r->r.source().equals(key.source)&&r.stream().equals(key.stream)&&r.orderId().equals(orderId)).sorted(Comparator.comparingLong(Record::sequence)).toList());var cp=db.sql("SELECT committed_sequence,checked_at FROM chat_projection_checkpoints WHERE source=:source AND stream=:stream AND aggregate_id=:id").param("source",key.source).param("stream",key.stream).param("id",key.aggregate).query((rs,n)->Map.of("sequence",rs.getLong(1),"checked",rs.getObject(2,OffsetDateTime.class))).optional();long committed=cp.map(v->(Long)v.get("sequence")).orElse(0L);Instant checked=cp.map(v->((OffsetDateTime)v.get("checked")).toInstant()).orElse(now);checkpoints.add(Map.of("source",key.source,"stream",key.stream,"aggregateId",key.aggregate,"committedSequence",committed,"checkedAt",checked,"projectedSequence",projected));if(cp.isEmpty()||projected<committed)gaps.add(Map.of("source",key.source,"stream",key.stream,"aggregateId",key.aggregate,"fromSequence",projected+1,"toSequence",Math.max(projected+1,committed),"reason",cp.isEmpty()?"SOURCE_UNAVAILABLE":"MISSING_SEQUENCE"));}
        return Map.of("status",gaps.isEmpty()?"COMPLETE":"INCOMPLETE","asOf",now,"checkpoints",checkpoints,"blockingGaps",gaps);
    }
    private static long contiguous(List<Record> rows){long expected=1;for(Record row:rows){if(row.sequence()!=expected)break;expected++;}return expected-1;}
    static List<Map<String,Object>> participants(List<Record> rows) {
        List<Map<String,Object>> result=new ArrayList<>();
        Set<UUID> requesters=new HashSet<>();Map<UUID,Map<String,Object>> active=new LinkedHashMap<>();
        for(Record r:rows) {
            JsonNode data=r.data();UUID requester=nullableUuid(data,"requesterId");
            if(requester!=null&&requesters.add(requester))result.add(period(requester,"REQUESTER",null,null));
            UUID courier=nullableUuid(data,"courierId"),previous=nullableUuid(data,"previousCourierId");
            if(previous!=null&&!previous.equals(courier)) {
                Map<String,Object> ended=active.remove(previous);
                if(ended!=null)ended.put("unassignedAt",r.occurredAt());
            }
            if(courier!=null&&!active.containsKey(courier)) {
                var assignment=period(courier,"HISTORICAL_COURIER",r.occurredAt(),null);
                result.add(assignment);active.put(courier,assignment);
            }
            if(Set.of("COMPLETED","CANCELLED","EXPIRED","RESERVATION_FAILED").contains(data.path("toState").asText())) {
                active.values().forEach(p->p.put("unassignedAt",r.occurredAt()));active.clear();
            }
        }
        return result;
    }
    private static Map<String,Object> period(UUID user,String relationship,OffsetDateTime start,OffsetDateTime end){
        Map<String,Object> value=new LinkedHashMap<>();value.put("userId",user);value.put("relationship",relationship);
        value.put("assignedAt",start);value.put("unassignedAt",end);return value;
    }
    private static String revision(List<Record> rows){return sha256(rows.stream().map(r->r.eventId()+":"+r.sequence()).reduce("",String::concat));}
    private static String encodeCursor(String revision,int offset){return Base64.getUrlEncoder().withoutPadding().encodeToString((revision+":"+offset).getBytes(StandardCharsets.UTF_8));}
    private static int decodeCursor(String cursor,String revision){try{String[] p=new String(Base64.getUrlDecoder().decode(cursor),StandardCharsets.UTF_8).split(":",2);if(!revision.equals(p[0]))throw new IllegalArgumentException();return Integer.parseInt(p[1]);}catch(Exception ex){throw new ResponseStatusException(HttpStatus.CONFLICT,"Evidence cursor is no longer valid");}}
    private static String sha256(String text){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));}catch(Exception ex){throw new IllegalStateException(ex);}}
    private static ResponseStatusException hidden(){return new ResponseStatusException(HttpStatus.NOT_FOUND,"Resource not found");}
    private static ResponseStatusException bad(String message){return new ResponseStatusException(HttpStatus.BAD_REQUEST,message);}
    private record Record(UUID eventId,String source,String stream,long sequence,UUID orderId,String action,UUID actor,OffsetDateTime occurredAt,OffsetDateTime ingestedAt,JsonNode data){Map<String,Object> wire(){Map<String,Object> m=new LinkedHashMap<>();m.put("eventId",eventId);m.put("source",source);m.put("stream",stream);m.put("sourceSequence",sequence);m.put("orderId",orderId);m.put("action",action);m.put("actorUserId",actor);m.put("occurredAt",occurredAt);m.put("ingestedAt",ingestedAt);m.put("data",JsonMapper.builder().build().convertValue(data,Map.class));return m;}}
    private record SourceKey(String source,String stream,UUID aggregate){}
}
