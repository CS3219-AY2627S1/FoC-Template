package com.friendoncampus.notification.messaging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import com.friendoncampus.notification.domain.NotificationMessages;
import com.friendoncampus.notification.repository.NotificationRepository;

import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(properties = "app.kafka.enabled=false")
@Testcontainers
class ChatMessageEventHandlerIntegrationTest {
    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    @MockitoBean JwtDecoder jwtDecoder;
    @Autowired ChatMessageEventHandler handler;
    @Autowired NotificationRepository notifications;
    @Autowired JdbcTemplate jdbc;
    private final JsonMapper json = JsonMapper.builder().build();

    @Test
    void notifiesOnlyTheDeclaredRecipientWithTheBoundedPreview() {
        var event = event();
        assertThat(handler.handle(event.conversationId().toString(), event.json()))
                .isEqualTo(CreditEventHandler.Outcome.NOTIFIED);

        var stored = notifications.findAll().stream()
                .filter(n -> n.getSourceEventId().equals(event.eventId())).findFirst().orElseThrow();
        assertThat(stored.getRecipientId()).isEqualTo(event.recipientId());
        assertThat(stored.getBusinessKey()).isEqualTo(event.messageId().toString());
        assertThat(NotificationMessages.messageFor(stored)).isEqualTo("Meet me at COM 2.");
        assertThat(stored.getParams()).contains("Meet me at COM 2.");
    }

    @Test
    void supportsImageCopyAndLegacyEventsWithoutAPreview() {
        var image = event(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                "IMAGE", "Image sent in chat");
        handler.handle(image.conversationId().toString(), image.json());
        var imageNotification = notifications.findAll().stream()
                .filter(n -> n.getSourceEventId().equals(image.eventId())).findFirst().orElseThrow();
        assertThat(NotificationMessages.messageFor(imageNotification)).isEqualTo("Image sent in chat");

        var legacy = event(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                "TEXT", null);
        handler.handle(legacy.conversationId().toString(), legacy.json());
        var legacyNotification = notifications.findAll().stream()
                .filter(n -> n.getSourceEventId().equals(legacy.eventId())).findFirst().orElseThrow();
        assertThat(NotificationMessages.messageFor(legacyNotification)).isEqualTo("New message in chat");
    }

    @Test
    void redeliveryAndRepublishingTheSameMessageNotifyOnce() {
        var first = event();
        assertThat(handler.handle(first.conversationId().toString(), first.json()))
                .isEqualTo(CreditEventHandler.Outcome.NOTIFIED);
        assertThat(handler.handle(first.conversationId().toString(), first.json()))
                .isEqualTo(CreditEventHandler.Outcome.DUPLICATE);

        var republished = event(first.messageId(), first.recipientId(), first.orderId(), first.conversationId());
        assertThat(handler.handle(republished.conversationId().toString(), republished.json()))
                .isEqualTo(CreditEventHandler.Outcome.DUPLICATE_OPERATION);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notifications WHERE business_key=?",
                Integer.class,first.messageId().toString())).isEqualTo(1);
    }

    @Test
    void rejectsWrongKeySelfNotificationAndSystemMessage() {
        var valid=event();
        assertThatThrownBy(() -> handler.handle(UUID.randomUUID().toString(),valid.json()))
                .isInstanceOf(EventRejectedException.class);
        assertThatThrownBy(() -> handler.handle(valid.conversationId().toString(),
                eventJson(valid.eventId(),valid.messageId(),valid.conversationId(),valid.orderId(),
                        valid.recipientId(),valid.recipientId(),"TEXT")))
                .isInstanceOf(EventRejectedException.class);
        assertThatThrownBy(() -> handler.handle(valid.conversationId().toString(),
                eventJson(valid.eventId(),valid.messageId(),valid.conversationId(),valid.orderId(),
                        UUID.randomUUID(),valid.recipientId(),"SYSTEM")))
                .isInstanceOf(EventRejectedException.class);
        assertThatThrownBy(() -> handler.handle(valid.conversationId().toString(),
                valid.json().replace("\"messageType\":\"TEXT\"",
                        "\"messageType\":\"TEXT\",\"text\":\"private words\"")))
                .isInstanceOf(EventRejectedException.class);
        assertThat(notifications.count()).isZero();
    }

    private Event event() {
        return event(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID());
    }

    private Event event(UUID messageId,UUID recipientId,UUID orderId,UUID conversationId) {
        return event(messageId,recipientId,orderId,conversationId,"TEXT","Meet me at COM 2.");
    }

    private Event event(UUID messageId,UUID recipientId,UUID orderId,UUID conversationId,
            String messageType,String preview) {
        UUID eventId=UUID.randomUUID(),senderId=UUID.randomUUID();
        return new Event(eventId,messageId,conversationId,orderId,recipientId,
                eventJson(eventId,messageId,conversationId,orderId,senderId,recipientId,messageType,preview));
    }

    private String eventJson(UUID eventId,UUID messageId,UUID conversationId,UUID orderId,
            UUID senderId,UUID recipientId,String messageType) {
        return eventJson(eventId,messageId,conversationId,orderId,senderId,recipientId,messageType,
                "Meet me at COM 2.");
    }

    private String eventJson(UUID eventId,UUID messageId,UUID conversationId,UUID orderId,
            UUID senderId,UUID recipientId,String messageType,String preview) {
        Map<String,Object> data=new LinkedHashMap<>();
        data.put("messageId",messageId); data.put("conversationId",conversationId); data.put("orderId",orderId);
        data.put("senderUserId",senderId); data.put("recipientUserId",recipientId); data.put("messageType",messageType);
        if (preview != null) data.put("messagePreview",preview);
        Map<String,Object> envelope=new LinkedHashMap<>();
        envelope.put("eventId",eventId); envelope.put("eventType","ChatMessageSent"); envelope.put("eventVersion",1);
        envelope.put("aggregateType","Conversation"); envelope.put("aggregateId",conversationId);
        envelope.put("aggregateVersion",1); envelope.put("occurredAt",OffsetDateTime.parse("2026-11-10T06:00:00Z"));
        envelope.put("producer","chat-service"); envelope.put("correlationId",orderId);
        envelope.put("causationId",messageId); envelope.put("actor",Map.of("type","USER","userId",senderId));
        envelope.put("data",data);
        return json.writeValueAsString(envelope);
    }

    private record Event(UUID eventId,UUID messageId,UUID conversationId,UUID orderId,
            UUID recipientId,String json) {}
}
