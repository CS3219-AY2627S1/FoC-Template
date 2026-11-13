package com.friendoncampus.chat.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.oauth2.jwt.Jwt;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.friendoncampus.chat.domain.ChatLanguage;
import com.friendoncampus.chat.repository.ChatPreferenceRepository;
import com.friendoncampus.chat.messaging.OrderLifecycleConsumer;
import com.friendoncampus.chat.translation.ChatTranslationService;
import com.friendoncampus.chat.translation.TranslationProvider;

@SpringBootTest(properties = {"app.kafka.enabled=false", "app.rabbit.enabled=false", "app.translation.provider=test"})
@Testcontainers(disabledWithoutDocker = true)
class ChatPreferencePersistenceIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17-alpine");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired
    ChatPreferenceService preferences;

    @Autowired
    ChatPreferenceRepository repository;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired JdbcClient jdbcClient;
    @Autowired Clock clock;
    @Autowired ChatConversationService chats;
    @Autowired ChatTranslationService translations;

    @Autowired AdminChatContractService adminChat;

    @MockitoBean InternalServiceClient internalServices;
    @MockitoBean TranslationProvider translationProvider;

    @BeforeEach
    void clearPreferences() {
        jdbc.execute("TRUNCATE chat_messages,chat_attachments,chat_participants,chat_conversations,chat_processed_events,chat_preferences,chat_evidence_records,chat_projection_checkpoints,chat_case_conversation_requests CASCADE");
        when(translationProvider.name()).thenReturn("test-provider");
        when(translationProvider.model()).thenReturn("test-model");
    }

    @Test
    void translatesIncomingTextOnceAndKeepsTheOriginalMessage() {
        UUID order=UUID.randomUUID(),requester=UUID.randomUUID(),courier=UUID.randomUUID();
        preferences.put(courier,"zh");
        new OrderLifecycleConsumer(jdbcClient,clock,chats).process(event(order,requester,courier,"ACCEPT","ACCEPTED",1));
        var conversation=chats.byOrder(order,requester);
        var original=chats.sendText(conversation.id(),requester,UUID.randomUUID(),"TEXT","Meet at the library",null);

        assertThat(jdbc.queryForObject("SELECT count(*) FROM chat_translations WHERE message_id=?",Integer.class,original.id())).isEqualTo(1);
        when(translationProvider.translate("Meet at the library","en","zh")).thenReturn("在图书馆见。");
        var jobs=translations.claimPending(10);
        assertThat(jobs).hasSize(1);
        translations.process(jobs.get(0));

        var storedOriginal=chats.messages(conversation.id(),courier,0,100).stream()
                .filter(message->message.id().equals(original.id())).findFirst().orElseThrow();
        assertThat(storedOriginal.text()).isEqualTo("Meet at the library");
        var translated=translations.get(conversation.id(),original.id(),courier,"zh");
        assertThat(translated.sourceLanguage()).isEqualTo("en");
        assertThat(translated.targetLanguage()).isEqualTo("zh");
        assertThat(translated.status()).isEqualTo("READY");
        assertThat(translated.text()).isEqualTo("在图书馆见。");
        assertThat(translations.request(conversation.id(),original.id(),courier,"zh"))
                .isEqualTo(translated);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM chat_translations WHERE message_id=?",Integer.class,original.id())).isEqualTo(1);
    }

    @Test
    void boundsProviderRetriesAndLeavesOriginalReadable() {
        UUID order=UUID.randomUUID(),requester=UUID.randomUUID(),courier=UUID.randomUUID();
        preferences.put(courier,"ms");
        new OrderLifecycleConsumer(jdbcClient,clock,chats).process(event(order,requester,courier,"ACCEPT","ACCEPTED",1));
        var conversation=chats.byOrder(order,requester);
        var original=chats.sendText(conversation.id(),requester,UUID.randomUUID(),"TEXT","Please wait near the entrance",null);
        when(translationProvider.translate("Please wait near the entrance","en","ms"))
                .thenThrow(new IllegalStateException("provider unavailable"));

        for(int attempt=1;attempt<=3;attempt++) {
            var jobs=translations.claimPending(10);
            assertThat(jobs).hasSize(1);
            translations.process(jobs.get(0));
            if(attempt<3) jdbc.update("UPDATE chat_translations SET next_attempt_at=now() WHERE message_id=?",original.id());
        }

        var failed=translations.get(conversation.id(),original.id(),courier,"ms");
        assertThat(failed.status()).isEqualTo("FAILED");
        assertThat(failed.text()).isNull();
        assertThat(jdbc.queryForObject("SELECT attempts FROM chat_translations WHERE message_id=?",Integer.class,original.id())).isEqualTo(3);
        assertThat(chats.messages(conversation.id(),courier,0,100)).anySatisfy(message->{
            assertThat(message.id()).isEqualTo(original.id());
            assertThat(message.text()).isEqualTo("Please wait near the entrance");
        });
    }

    @Test
    void defaultsWithoutCreatingARecordAndKeepsUsersIsolated() {
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();

        assertThat(preferences.get(first)).isEqualTo(ChatLanguage.EN);
        assertThat(repository.count()).isZero();

        assertThat(preferences.put(first, "ta")).isEqualTo(ChatLanguage.TA);
        assertThat(preferences.get(first)).isEqualTo(ChatLanguage.TA);
        assertThat(preferences.get(second)).isEqualTo(ChatLanguage.EN);
        assertThat(repository.count()).isEqualTo(1);
    }

    @Test
    void databaseRejectsUnsupportedLanguageValues() {
        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO chat_preferences (user_id, preferred_language, created_at, updated_at)
                VALUES (?, 'XX', now(), now())
                """, UUID.randomUUID()))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void userMessagesCreateOneBoundedNotificationPreviewButLifecycleMessagesDoNot() {
        UUID order=UUID.randomUUID(),requester=UUID.randomUUID(),courier=UUID.randomUUID();
        new OrderLifecycleConsumer(jdbcClient,clock,chats).process(
                event(order,requester,courier,"ACCEPT","ACCEPTED",1));
        var conversation=chats.byOrder(order,requester);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM chat_notification_outbox",Integer.class)).isZero();

        UUID clientMessageId=UUID.randomUUID();
        var message=chats.sendText(conversation.id(),requester,clientMessageId,"TEXT","private words",null);
        chats.sendText(conversation.id(),requester,clientMessageId,"TEXT","private words",null);

        assertThat(jdbc.queryForObject("SELECT count(*) FROM chat_notification_outbox",Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT recipient_id FROM chat_notification_outbox WHERE message_id=?",
                UUID.class,message.id())).isEqualTo(courier);
        String payload=jdbc.queryForObject("SELECT payload::text FROM chat_notification_outbox WHERE message_id=?",
                String.class,message.id());
        assertThat(payload).contains("ChatMessageSent",message.id().toString(),order.toString(),courier.toString())
                .contains("private words")
                .doesNotContain("attachmentId","filename","contentType");

        chats.sendText(conversation.id(),courier,UUID.randomUUID(),"QUICK_REPLY",null,"ARRIVED");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM chat_notification_outbox",Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM chat_notification_outbox WHERE recipient_id=?",
                Integer.class,requester)).isEqualTo(1);
    }

    @Test
    void lifecycleCreatesPrivateChatSegmentsCourierHistoryAndLocksTerminalConversation() {
        UUID order=UUID.randomUUID(), requester=UUID.randomUUID(), first=UUID.randomUUID(), second=UUID.randomUUID();
        OrderLifecycleConsumer consumer=new OrderLifecycleConsumer(jdbcClient,clock,chats);
        OffsetDateTime acceptedAt=OffsetDateTime.parse("2026-11-08T04:30:00Z");
        String accepted=event(order,requester,first,"ACCEPT","ACCEPTED",1,first,acceptedAt);
        consumer.process(accepted);
        consumer.process(accepted); // exact Kafka retry is harmless
        var acceptedActivity=chats.messages(chats.byOrder(order,requester).id(),requester,0,100).get(0);
        assertThat(acceptedActivity.messageType()).isEqualTo("SYSTEM");
        assertThat(acceptedActivity.senderUserId()).isNull();
        assertThat(acceptedActivity.clientMessageId()).isNull();
        assertThat(acceptedActivity.lifecycleAction()).isEqualTo("ACCEPT");
        assertThat(acceptedActivity.lifecycleToState()).isEqualTo("ACCEPTED");
        assertThat(acceptedActivity.sourceEventId()).isNotNull();
        assertThat(acceptedActivity.sourceSequence()).isEqualTo(1L);
        assertThat(acceptedActivity.text()).isEqualTo("Courier accepted the errand.");
        assertThat(acceptedActivity.createdAt()).isEqualTo(acceptedAt);
        assertThatThrownBy(() -> consumer.process(event(order,requester,first,"ACCEPT","ACCEPTED",1)))
                .isInstanceOf(IllegalStateException.class);
        var conversation=chats.byOrder(order,requester);
        var firstMessage=chats.sendText(conversation.id(),first,UUID.randomUUID(),"TEXT","Meet at the library",null);
        assertThat(chats.messageRecipients(firstMessage.id())).containsExactlyInAnyOrder(requester,first);
        consumer.process(event(order,requester,null,"WITHDRAW","OPEN",2,first));
        consumer.process(event(order,requester,second,"ACCEPT","ACCEPTED",3));
        var requesterMessage=chats.sendText(conversation.id(),requester,UUID.randomUUID(),"TEXT","Meet at COM2",null);
        assertThat(jdbc.queryForObject("SELECT recipient_id FROM chat_notification_outbox WHERE message_id=?",
                UUID.class,requesterMessage.id())).isEqualTo(second);
        assertThat(chats.messageRecipients(requesterMessage.id())).containsExactlyInAnyOrder(requester,second);
        var secondMessage=chats.sendText(conversation.id(),second,UUID.randomUUID(),"TEXT","On my way",null);
        assertThat(chats.messageRecipients(secondMessage.id())).containsExactlyInAnyOrder(requester,second);
        assertThatThrownBy(() -> translations.request(conversation.id(),secondMessage.id(),first,"zh"))
                .isInstanceOf(ChatAccessException.class);

        assertThat(chats.messages(conversation.id(),requester,0,100)).hasSize(6);
        var secondHistory=chats.messages(conversation.id(),second,0,100);
        assertThat(secondHistory).extracting(ChatConversationService.Message::messageType)
                .containsExactly("SYSTEM", "TEXT", "TEXT");
        assertThat(secondHistory.get(0).lifecycleAction()).isEqualTo("ACCEPT");
        assertThat(secondHistory.get(1).id()).isEqualTo(requesterMessage.id());
        assertThat(secondHistory.get(2).id()).isEqualTo(secondMessage.id());
        assertThat(chats.byOrder(order,first).readOnly()).isTrue();
        assertThatThrownBy(() -> chats.sendText(conversation.id(),first,UUID.randomUUID(),"TEXT","still here",null))
                .isInstanceOf(ChatConflictException.class);

        byte[] png={(byte)0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a};
        var attachment=chats.upload(conversation.id(),second,new MockMultipartFile("file","proof.png","image/png",png));
        chats.sendImage(conversation.id(),second,UUID.randomUUID(),attachment.id());
        assertThat(chats.attachment(conversation.id(),attachment.id(),requester).content()).isEqualTo(png);
        assertThat(jdbc.queryForMap("""
                SELECT storage_provider,object_key,checksum_sha256,content IS NOT NULL AS has_content
                FROM chat_attachments WHERE id=?
                """, attachment.id()))
                .containsEntry("storage_provider", "DATABASE")
                .containsEntry("object_key", null)
                .containsEntry("has_content", true);
        assertThatThrownBy(() -> chats.attachment(conversation.id(),attachment.id(),first)).isInstanceOf(ChatAccessException.class);
        assertThatThrownBy(() -> chats.upload(conversation.id(),second,new MockMultipartFile("file","fake.png","image/png","not an image".getBytes())))
                .isInstanceOf(IllegalArgumentException.class);

        consumer.process(event(order,requester,second,"PICK_UP","PICKED_UP",4));
        consumer.process(event(order,requester,second,"DELIVER","DELIVERED",5));
        consumer.process(event(order,requester,second,"COMPLETE","COMPLETED",6));
        assertThat(chats.messages(conversation.id(),requester,0,100).stream()
                .filter(message -> "SYSTEM".equals(message.messageType()))
                .map(ChatConversationService.Message::lifecycleAction))
                .containsExactly("ACCEPT", "WITHDRAW", "ACCEPT", "PICK_UP", "DELIVER", "COMPLETE");
        assertThat(chats.byOrder(order,requester).readOnly()).isTrue();
        assertThatThrownBy(() -> chats.sendText(conversation.id(),requester,UUID.randomUUID(),"TEXT","thanks",null))
                .isInstanceOf(ChatConflictException.class);
    }

    @Test
    void lifecycleAfterWithdrawalRemainsVisibleToRequesterWithoutLeakingToFormerCourier() {
        UUID order=UUID.randomUUID(), requester=UUID.randomUUID(), courier=UUID.randomUUID();
        OrderLifecycleConsumer consumer=new OrderLifecycleConsumer(jdbcClient,clock,chats);
        consumer.process(event(order,requester,courier,"ACCEPT","ACCEPTED",1));
        var conversation=chats.byOrder(order,requester);
        consumer.process(event(order,requester,null,"WITHDRAW","OPEN",2,courier));
        consumer.process(event(order,requester,null,"EXPIRE","EXPIRED",3,null));

        assertThat(chats.messages(conversation.id(),requester,0,100))
                .extracting(ChatConversationService.Message::lifecycleAction)
                .containsExactly("ACCEPT", "WITHDRAW", "EXPIRE");
        assertThat(chats.messages(conversation.id(),courier,0,100))
                .extracting(ChatConversationService.Message::lifecycleAction)
                .containsExactly("ACCEPT", "WITHDRAW");
        assertThat(chats.byOrder(order,requester).readOnly()).isTrue();
    }

    @Test
    void liveKafkaAndBackfillOverlapIsIdempotentButChangedEvidenceConflicts() {
        UUID eventId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        UUID requesterId = UUID.randomUUID();
        UUID courierId = UUID.randomUUID();
        OffsetDateTime occurredAt = OffsetDateTime.parse("2026-11-08T04:30:00Z");
        String payload = """
                {"eventId":"%s","eventType":"OrderTransitioned","occurredAt":"%s",
                 "actor":{"userId":"%s"},"data":{"orderId":"%s","requesterId":"%s",
                 "courierId":"%s","previousCourierId":null,"action":"ACCEPT",
                 "toState":"ACCEPTED","sourceSequence":1}}
                """.formatted(eventId, occurredAt, courierId, orderId, requesterId, courierId);
        new OrderLifecycleConsumer(jdbcClient, clock, chats).process(payload);

        var mapper = tools.jackson.databind.json.JsonMapper.builder().build();
        var exported = mapper.createObjectNode();
        exported.put("eventId", eventId.toString());
        exported.put("sourceSequence", 1);
        exported.put("orderId", orderId.toString());
        exported.put("action", "ACCEPT");
        exported.put("actorUserId", courierId.toString());
        exported.put("occurredAt", occurredAt.toString());
        exported.put("ingestedAt", occurredAt.toString());
        var data = mapper.readTree(payload).path("data").deepCopy();
        ((tools.jackson.databind.node.ObjectNode) data).put("kind", "ORDER");
        exported.set("data", data);
        var checkpoint = mapper.createObjectNode();
        checkpoint.put("source", "order-service");
        checkpoint.put("stream", "order.lifecycle.events");
        checkpoint.put("aggregateId", orderId.toString());
        checkpoint.put("committedSequence", 1);
        checkpoint.put("checkedAt", occurredAt.toString());
        var page = mapper.createObjectNode();
        page.set("checkpoint", checkpoint);
        page.putArray("records").add(exported);

        when(internalServices.orderEvidence(orderId)).thenReturn(java.util.List.of(page));
        when(internalServices.userEligibility(requesterId))
                .thenReturn(mapper.readTree("{\"active\":true}"));
        Jwt requester = Jwt.withTokenValue("actor")
                .header("alg", "none")
                .subject(requesterId.toString())
                .claim("role", "REQUESTER")
                .build();

        assertThat(adminChat.eligibility(orderId, requesterId, requester))
                .containsEntry("eligible", true);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM chat_evidence_records", Long.class))
                .isEqualTo(1L);

        exported.put("action", "WITHDRAW");
        assertThatThrownBy(() -> adminChat.eligibility(orderId, requesterId, requester))
                .isInstanceOf(ChatConflictException.class);
    }

    @Test
    void resolvedAdminCaseDeniesTheNextParticipantWriteWithoutTreatingActorDenialAsClosure() {
        UUID caseId=UUID.randomUUID(), orderId=UUID.randomUUID(), participant=UUID.randomUUID(), reviewer=UUID.randomUUID();
        var mapper=tools.jackson.databind.json.JsonMapper.builder().build();
        when(internalServices.caseAccess(caseId,reviewer,participant)).thenReturn(mapper.readTree("""
                {"caseId":"%s","orderId":"%s","state":"UNDER_REVIEW",
                 "reviewerId":"%s","allowedParticipantIds":["%s"],
                 "canReadEvidence":true,"canReadConversation":true,"canWriteConversation":true}
                """.formatted(caseId,orderId,reviewer,participant)));
        when(internalServices.userEligibility(reviewer))
                .thenReturn(mapper.readTree("{\"active\":true,\"administrator\":true}"));
        Jwt admin=Jwt.withTokenValue("actor").header("alg","none").subject(reviewer.toString())
                .claim("role","ADMIN").build();
        UUID conversationId=(UUID)adminChat.openConversation(caseId,participant,UUID.randomUUID(),admin)
                .get("conversationId");

        when(internalServices.caseAccess(caseId,participant,participant)).thenReturn(mapper.readTree("""
                {"caseId":"%s","orderId":"%s","state":"RESOLVED",
                 "reviewerId":"%s","allowedParticipantIds":["%s"],
                 "canReadEvidence":false,"canReadConversation":true,"canWriteConversation":false}
                """.formatted(caseId,orderId,reviewer,participant)));

        assertThatThrownBy(() -> chats.sendText(conversationId,participant,UUID.randomUUID(),"TEXT","late message",null))
                .isInstanceOf(ChatConflictException.class)
                .hasMessage("This conversation is read-only");
        assertThat(chats.get(conversationId,participant).readOnly()).isTrue();
        assertThat(jdbc.queryForObject("SELECT status FROM chat_conversations WHERE id=?",String.class,conversationId))
                .isEqualTo("ACTIVE");
    }

    private static String event(UUID order,UUID requester,UUID courier,String action,String to,long version){return event(order,requester,courier,action,to,version,courier);}
    private static String event(UUID order,UUID requester,UUID courier,String action,String to,long version,UUID previous){
        return event(order,requester,courier,action,to,version,previous,OffsetDateTime.now());
    }
    private static String event(UUID order,UUID requester,UUID courier,String action,String to,long version,UUID previous,OffsetDateTime occurredAt){
        return "{\"eventId\":\""+UUID.randomUUID()+"\",\"eventType\":\"OrderTransitioned\",\"occurredAt\":\""+occurredAt+"\",\"data\":{\"orderId\":\""+order+"\",\"requesterId\":\""+requester+"\",\"courierId\":"+(courier==null?"null":"\""+courier+"\"")+",\"previousCourierId\":"+(previous==null?"null":"\""+previous+"\"")+",\"action\":\""+action+"\",\"toState\":\""+to+"\",\"sourceSequence\":"+version+"}}";
    }
}
