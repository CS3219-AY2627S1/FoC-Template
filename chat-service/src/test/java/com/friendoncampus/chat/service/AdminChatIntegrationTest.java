package com.friendoncampus.chat.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import com.friendoncampus.chat.messaging.OrderLifecycleConsumer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Real Chat transactions/storage; producer HTTP responses are explicitly test-owned fixtures. */
@SpringBootTest(properties={"app.kafka.enabled=false","app.rabbit.enabled=false"})
@Testcontainers
class AdminChatIntegrationTest {
    @Container static PostgreSQLContainer postgres=new PostgreSQLContainer("postgres:17-alpine");
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r){r.add("spring.datasource.url",postgres::getJdbcUrl);r.add("spring.datasource.username",postgres::getUsername);r.add("spring.datasource.password",postgres::getPassword);}
    @Autowired AdminChatContractService admin;
    @Autowired ChatConversationService chats;
    @Autowired JdbcTemplate db;
    @Autowired JdbcClient jdbc;
    @Autowired Clock clock;
    @Autowired PlatformTransactionManager manager;
    @MockitoBean InternalServiceClient internal;
    @MockitoBean com.friendoncampus.chat.authorization.CurrentAuthorization current;
    final JsonMapper json=JsonMapper.builder().build();
    UUID caseId,order,reviewer,participant,other;
    final OffsetDateTime at=OffsetDateTime.parse("2026-11-09T01:00:00.123456789Z");
    Jwt actor(UUID id,String role){return Jwt.withTokenValue("TEST-ONLY").header("alg","RS256").subject(id.toString()).claim("role",role).issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(600)).build();}
    JsonNode access(boolean write,UUID operation){
        var value=json.createObjectNode();value.put("caseId",caseId.toString());value.put("orderId",order.toString());value.put("state","UNDER_REVIEW");value.put("reviewerId",reviewer.toString());value.put("canReadEvidence",true);value.put("canReadConversation",true);value.put("canWriteConversation",write);
        if(operation!=null)value.put("closureOperationId",operation.toString());return value;
    }
    @BeforeEach void setup(){
        db.execute("TRUNCATE chat_conversations,chat_evidence_records,chat_projection_checkpoints,chat_timeline_snapshots,chat_case_closures,chat_operation_evidence,chat_errand_reviews CASCADE");
        caseId=UUID.randomUUID();order=UUID.randomUUID();reviewer=UUID.randomUUID();participant=UUID.randomUUID();other=UUID.randomUUID();
        when(internal.userEligibility(any())).thenReturn(json.readTree("{\"active\":true,\"administrator\":true}"));
        when(internal.caseAccess(eq(caseId),any(),any())).thenReturn(access(true,null));
    }
    UUID open(){return (UUID)admin.openConversation(caseId,participant,UUID.randomUUID(),actor(reviewer,"ADMIN")).get("conversationId");}
    @Test void anotherReviewerMayReadButCannotPermanentlyLockTheAssignedReviewersThread(){
        UUID conversation=open();chats.sendText(conversation,reviewer,UUID.randomUUID(),"TEXT","TEST ONLY message",null);
        when(internal.caseAccess(caseId,other,participant)).thenReturn(access(false,null));
        assertTrue(chats.get(conversation,other).readOnly());assertEquals(1,chats.messages(conversation,other,0,20).size());
        assertThrows(ChatConflictException.class,()->chats.sendText(conversation,other,UUID.randomUUID(),"TEXT","denied",null));
        assertEquals("ACTIVE",db.queryForObject("SELECT status FROM chat_conversations WHERE id=?",String.class,conversation));
        assertNotNull(chats.sendText(conversation,reviewer,UUID.randomUUID(),"TEXT","still writable",null));
        when(internal.caseAccess(caseId,other,participant)).thenThrow(new ChatAccessException());
        assertThrows(ChatAccessException.class,()->chats.get(conversation,other));assertThrows(ChatAccessException.class,()->chats.messages(conversation,other,0,20));
    }
    @Test void readOnlyCreationIsDeniedAndOperationIdentityBindsTheInitiatingActor(){
        when(internal.caseAccess(caseId,other,participant)).thenReturn(access(false,null));
        assertThrows(ChatConflictException.class,()->admin.openConversation(caseId,participant,UUID.randomUUID(),actor(other,"ADMIN")));
        assertEquals(0,db.queryForObject("SELECT count(*) FROM chat_conversations",Integer.class));
        UUID key=UUID.randomUUID();var first=admin.openConversation(caseId,participant,key,actor(reviewer,"ADMIN"));
        assertEquals(first,admin.openConversation(caseId,participant,key,actor(reviewer,"ADMIN")));
        when(internal.caseAccess(caseId,other,participant)).thenReturn(access(true,null));
        assertThrows(ChatConflictException.class,()->admin.openConversation(caseId,participant,key,actor(other,"ADMIN")));
        assertEquals(first.get("conversationId"),admin.findConversation(caseId,participant,actor(participant,"REQUESTER")).get("conversationId"));
        assertEquals(1,db.queryForObject("SELECT count(*) FROM chat_case_conversation_requests",Integer.class));
    }
    @Test void orderCancellationDoesNotCloseAnUnresolvedCaseConversation(){
        UUID conversation=open();var data=json.createObjectNode();data.put("orderId",order.toString());data.put("requesterId",participant.toString());data.putNull("courierId");data.putNull("previousCourierId");data.put("action","CANCEL");data.put("toState","CANCELLED");data.put("sourceSequence",1);
        var event=json.createObjectNode();event.put("eventId",UUID.randomUUID().toString());event.put("eventType","OrderTransitioned");event.put("occurredAt",at.toString());event.set("data",data);
        new OrderLifecycleConsumer(jdbc,clock,chats).process(event.toString());
        assertEquals("ACTIVE",db.queryForObject("SELECT status FROM chat_conversations WHERE id=?",String.class,conversation));
        assertNotNull(chats.sendText(conversation,reviewer,UUID.randomUUID(),"TEXT","case remains open",null));
    }
    @Test void privateImagesAndLiveRecipientsRevalidateCurrentCaseAccess(){
        UUID conversation=open();byte[] png=Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVOsAAAAASUVORK5CYII=");
        var attachment=chats.upload(conversation,reviewer,new org.springframework.mock.web.MockMultipartFile("image","TEST-ONLY.png","image/png",png));
        var message=chats.sendImage(conversation,reviewer,UUID.randomUUID(),attachment.id());
        when(internal.caseAccess(caseId,other,participant)).thenReturn(access(false,null));
        assertArrayEquals(png,chats.attachment(conversation,attachment.id(),other).content());
        when(internal.caseAccess(caseId,other,participant)).thenThrow(new ChatAccessException());
        assertThrows(ChatAccessException.class,()->chats.attachment(conversation,attachment.id(),other));
        when(internal.caseAccess(caseId,participant,participant)).thenThrow(new ChatAccessException());
        assertFalse(chats.messageRecipients(message.id()).contains(participant));
        assertTrue(chats.messageRecipients(message.id()).contains(reviewer));
    }
    @Test void anExplicitCurrentReviewerPostRepairsOnlyAnUnresolvedLegacyLock(){
        UUID conversation=open();
        db.update("UPDATE chat_conversations SET status='READ_ONLY',locked_at=CURRENT_TIMESTAMP WHERE id=?",conversation);
        db.update("UPDATE chat_participants SET can_write=false,valid_until=CURRENT_TIMESTAMP WHERE conversation_id=?",conversation);
        assertEquals(conversation,admin.openConversation(caseId,participant,UUID.randomUUID(),actor(reviewer,"ADMIN")).get("conversationId"));
        assertNotNull(chats.sendText(conversation,reviewer,UUID.randomUUID(),"TEXT","restored without replacing history",null));
        assertEquals(1,db.queryForObject("SELECT count(*) FROM chat_conversations",Integer.class));
    }
    @Test void closureDrainsInFlightWritesAndBlocksAStaleAuthorizationAfterTheBarrier()throws Exception{
        UUID conversation=open(),operation=UUID.randomUUID();var locked=new CountDownLatch(1);var release=new CountDownLatch(1);var pool=Executors.newFixedThreadPool(2);
        when(internal.caseAccess(caseId,reviewer,null)).thenReturn(access(false,operation));
        try{
            var writer=pool.submit(()->new TransactionTemplate(manager).execute(s->{db.queryForObject("SELECT id FROM chat_conversations WHERE id=? FOR UPDATE",UUID.class,conversation);locked.countDown();try{assertTrue(release.await(10,TimeUnit.SECONDS));}catch(InterruptedException ex){throw new IllegalStateException(ex);}return chats.sendText(conversation,reviewer,UUID.randomUUID(),"TEXT","in flight",null);}));
            assertTrue(locked.await(5,TimeUnit.SECONDS));
            var barrier=pool.submit(()->admin.drainClosure(caseId,operation));
            assertThrows(TimeoutException.class,()->barrier.get(200,TimeUnit.MILLISECONDS));release.countDown();assertNotNull(writer.get(10,TimeUnit.SECONDS));
            assertEquals(true,barrier.get(10,TimeUnit.SECONDS).get("readOnly"));
            assertEquals(true,admin.drainClosure(caseId,operation).get("readOnly"));
            assertThrows(ChatConflictException.class,()->chats.sendText(conversation,reviewer,UUID.randomUUID(),"TEXT","late",null));
            assertEquals(1,db.queryForObject("SELECT count(*) FROM chat_messages",Integer.class));
        }finally{release.countDown();pool.shutdownNow();}
    }
    JsonNode page(String source,String stream,UUID aggregate,List<JsonNode> records,long sequence){
        var page=json.createObjectNode();page.set("checkpoint",json.valueToTree(Map.of("source",source,"stream",stream,"aggregateId",aggregate,"committedSequence",sequence,"checkedAt",Instant.now().toString())));page.set("records",json.valueToTree(records));return page;
    }
    JsonNode orderRecord(UUID event,long sequence,UUID courier,UUID previous,String action){
        Map<String,Object> snapshot=new LinkedHashMap<>(Map.of("orderId",order,"requesterId",participant,"status",courier==null?"OPEN":"ACCEPTED","title","TEST ONLY","description","TEST ONLY snapshot","creditReward",1,"pickupDeadline",at.plusDays(1).toString(),"pickupLocationId",UUID.randomUUID(),"dropoffLocationId",UUID.randomUUID()));snapshot.put("courierId",courier);snapshot.put("pickupLocationName","Test A");snapshot.put("dropoffLocationName","Test B");
        Map<String,Object> data=new LinkedHashMap<>();data.put("kind","ORDER");data.put("requesterId",participant);data.put("courierId",courier);data.put("previousCourierId",previous);data.put("fromState",null);data.put("toState",snapshot.get("status"));data.put("snapshot",snapshot);
        Map<String,Object> row=new LinkedHashMap<>(Map.of("eventId",event,"source","order-service","stream","order.lifecycle.events","sourceSequence",sequence,"orderId",order,"action",action,"occurredAt",at.plusSeconds(sequence).toString(),"ingestedAt",at.toString(),"data",data));row.put("actorUserId",participant);return json.valueToTree(row);
    }
    void producerPages(List<JsonNode> orders){
        when(internal.orderEvidence(order)).thenReturn(List.of(page("order-service","order.lifecycle.events",order,orders,orders.size())));
        when(internal.creditEvidence(order)).thenReturn(List.of(page("credit-service","credit.events",order,List.of(),0)));
        var data=new LinkedHashMap<String,Object>();data.put("kind","ADMIN");data.put("caseId",caseId);data.put("operationId",null);data.put("targetUserId",null);data.put("result",null);
        var record=new LinkedHashMap<String,Object>(Map.of("eventId",UUID.randomUUID(),"source","admin-service","stream","admin.events","sourceSequence",1,"orderId",order,"action","CaseOpened","actorUserId",participant,"occurredAt",at.toString(),"ingestedAt",at.toString(),"data",data));
        when(internal.adminEvidence(order,caseId)).thenReturn(List.of(page("admin-service","admin.events",caseId,List.of(json.valueToTree(record)),1)));
    }
    @Test void originalTextAndProtectedImagesJoinTimelineAndPinnedPagesExcludeLaterMessages(){
        producerPages(List.of(orderRecord(UUID.randomUUID(),1,null,null,"CREATE")));
        UUID conversation=open();String original="TEST ONLY: two bowls. One missing — exact original text.";
        chats.sendText(conversation,reviewer,UUID.randomUUID(),"TEXT",original,null);
        byte[] png=Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVOsAAAAASUVORK5CYII=");
        var attachment=chats.upload(conversation,reviewer,new org.springframework.mock.web.MockMultipartFile("image","original.png","image/png",png));
        var image=chats.sendImage(conversation,reviewer,UUID.randomUUID(),attachment.id());
        var first=admin.timeline(caseId,actor(reviewer,"ADMIN"),null,1);String cursor=(String)first.get("nextCursor");
        chats.sendText(conversation,reviewer,UUID.randomUUID(),"TEXT","TEST ONLY later message",null);
        var pinned=json.valueToTree(admin.timeline(caseId,actor(reviewer,"ADMIN"),cursor,100));
        assertFalse(pinned.toString().contains("TEST ONLY later message"));
        var fresh=json.valueToTree(admin.timeline(caseId,actor(reviewer,"ADMIN"),null,100));
        var records=fresh.path("records");assertTrue(records.toString().contains(original));assertTrue(records.toString().contains("IMAGE"));
        assertFalse(records.toString().contains("object_key"));assertFalse(records.toString().contains("storage_provider"));
        assertArrayEquals(png,admin.evidenceAttachment(caseId,image.id(),actor(reviewer,"ADMIN")).content());
        when(internal.caseAccess(caseId,other,null)).thenReturn(json.createObjectNode().put("canReadEvidence",false));
        assertThrows(ResponseStatusException.class,()->admin.evidenceAttachment(caseId,image.id(),actor(other,"ADMIN")));
        assertThrows(ResponseStatusException.class,()->admin.evidenceAttachment(caseId,UUID.randomUUID(),actor(reviewer,"ADMIN")));
    }
    @Test void errandReviewBarrierDoesNotLockPrivateCaseChat(){
        var record=(tools.jackson.databind.node.ObjectNode)orderRecord(UUID.randomUUID(),1,null,null,"REVIEW_STARTED");
        ((tools.jackson.databind.node.ObjectNode)record.path("data").path("snapshot")).put("reviewCaseId",caseId.toString());
        producerPages(List.of(record));
        UUID errand=UUID.randomUUID();
        db.update("INSERT INTO chat_conversations(id,conversation_type,order_id,status,next_sequence,created_at,updated_at) VALUES (?,'ERRAND',?,'ACTIVE',1,?,?)",errand,order,at,at);
        db.update("INSERT INTO chat_participants(conversation_id,user_id,relationship,can_write,valid_from) VALUES (?,?,'REQUESTER',true,?)",errand,participant,at);
        assertEquals(true,admin.applyReviewBarrier(order,caseId).get("readOnly"));
        assertThrows(ChatConflictException.class,()->chats.sendText(errand,participant,UUID.randomUUID(),"TEXT","blocked",null));
        UUID privateChat=open();assertNotNull(chats.sendText(privateChat,reviewer,UUID.randomUUID(),"TEXT","TEST ONLY admin follow-up",null));
        assertEquals(true,admin.applyReviewBarrier(order,caseId).get("readOnly"));
    }
    @Test void snapshotsRemainStableAcrossNewFactsAndEmptyConfirmedCreditBaselineIsComplete(){
        UUID courier=UUID.randomUUID();var first=orderRecord(UUID.randomUUID(),1,null,null,"CREATE");var second=orderRecord(UUID.randomUUID(),2,courier,null,"ACCEPT");producerPages(List.of(first,second));
        var snapshot=admin.timeline(caseId,actor(reviewer,"ADMIN"),null,1);String cursor=(String)snapshot.get("nextCursor");assertNotNull(cursor);
        assertEquals("COMPLETE",json.valueToTree(snapshot).path("coverage").path("status").asText());
        var withdrawn=orderRecord(UUID.randomUUID(),3,null,courier,"WITHDRAW");
        when(internal.orderEvidence(order)).thenReturn(List.of(page("order-service","order.lifecycle.events",order,List.of(first,second,withdrawn),3)));
        var next=admin.timeline(caseId,actor(reviewer,"ADMIN"),cursor,1);assertEquals(snapshot.get("evidenceRevision"),next.get("evidenceRevision"));
        var fresh=admin.timeline(caseId,actor(reviewer,"ADMIN"),null,100);assertNotEquals(snapshot.get("evidenceRevision"),fresh.get("evidenceRevision"));
        var participants=json.valueToTree(fresh).path("participants");assertTrue(participants.get(0).path("assignedAt").isNull());assertFalse(participants.get(1).path("unassignedAt").isNull());
        var reassigned=orderRecord(UUID.randomUUID(),4,courier,null,"ACCEPT");
        when(internal.orderEvidence(order)).thenReturn(List.of(page("order-service","order.lifecycle.events",order,List.of(first,second,withdrawn,reassigned),4)));
        var repeated=json.valueToTree(admin.timeline(caseId,actor(reviewer,"ADMIN"),null,100)).path("participants");
        assertEquals(3,repeated.size());assertTrue(repeated.get(2).path("unassignedAt").isNull());
        db.update("UPDATE chat_timeline_snapshots SET expires_at=CURRENT_TIMESTAMP-INTERVAL '1 second'");
        assertEquals(409,assertThrows(ResponseStatusException.class,()->admin.timeline(caseId,actor(reviewer,"ADMIN"),cursor,1)).getStatusCode().value());
    }
    @Test void completedActionsNeedTheOriginalOwnerOutcomeBeforeCoverageCanBeComplete(){
        producerPages(List.of(orderRecord(UUID.randomUUID(),1,null,null,"CREATE")));
        UUID operation=UUID.randomUUID(),ownerEvent=UUID.randomUUID();
        var adminPage=(tools.jackson.databind.node.ObjectNode)internal.adminEvidence(order,caseId).get(0).deepCopy();
        var data=Map.of("kind","ADMIN","caseId",caseId,"operationId",operation,"targetUserId",participant,"result","APPLIED","ownerEventId",ownerEvent,"ownerService","credit-service");
        var completion=Map.of("eventId",UUID.randomUUID(),"source","admin-service","stream","admin.events","sourceSequence",2,"orderId",order,"action","CaseActionCompleted","actorUserId",reviewer,"occurredAt",at.plusSeconds(10).toString(),"ingestedAt",at.toString(),"data",data);
        ((tools.jackson.databind.node.ArrayNode)adminPage.path("records")).add(json.valueToTree(completion));
        ((tools.jackson.databind.node.ObjectNode)adminPage.path("checkpoint")).put("committedSequence",2);
        when(internal.adminEvidence(order,caseId)).thenReturn(List.of(adminPage));when(internal.operation("credit-service",operation)).thenReturn(Optional.empty());
        assertEquals("INCOMPLETE",json.valueToTree(admin.timeline(caseId,actor(reviewer,"ADMIN"),null,100)).path("coverage").path("status").asText());
        Map<String,Object> outcomeData=new LinkedHashMap<>(Map.of("operationId",operation,"caseId",caseId,"orderId",order,"targetUserId",participant,"requestedBy",reviewer,"result","APPLIED","amount",2,"availableBalance",12,"reservedBalance",0,"ledgerEntryId",UUID.randomUUID()));
        outcomeData.put("completedAt",at.plusSeconds(9).toString());
        var outcome=(tools.jackson.databind.node.ObjectNode)json.valueToTree(Map.of("eventId",ownerEvent,"producer","credit-service","eventType","AdminCreditCorrectionApplied","occurredAt",at.plusSeconds(9).toString(),"data",outcomeData));
        outcome.put("eventVersion",1);outcome.put("aggregateVersion",1);outcome.put("aggregateType","AdminAction");outcome.put("aggregateId",participant.toString());outcome.put("correlationId",UUID.randomUUID().toString());outcome.put("causationId",UUID.randomUUID().toString());outcome.set("actor",json.valueToTree(Map.of("type","USER","role","ADMIN","userId",reviewer)));
        when(internal.operation("credit-service",operation)).thenReturn(Optional.of(outcome));
        var complete=json.valueToTree(admin.timeline(caseId,actor(reviewer,"ADMIN"),null,100));assertEquals("COMPLETE",complete.path("coverage").path("status").asText());
        assertEquals(1,db.queryForObject("SELECT count(*) FROM chat_operation_evidence WHERE operation_id=?",Integer.class,operation));
    }
}
