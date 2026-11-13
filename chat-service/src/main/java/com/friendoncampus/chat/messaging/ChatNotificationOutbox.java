package com.friendoncampus.chat.messaging;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.chat.service.ChatConversationService.Message;

import tools.jackson.databind.json.JsonMapper;

/** Durable, privacy-minimal handoff from Chat to Notification. */
@Component
public class ChatNotificationOutbox {
    public static final String TOPIC = "chat.events";
    private static final int PREVIEW_LENGTH = 160;

    private final JdbcClient db;
    private final Clock clock;
    private final JsonMapper json = JsonMapper.builder().build();

    public ChatNotificationOutbox(JdbcClient db, Clock clock) {
        this.db = db;
        this.clock = clock;
    }

    /** Called in the message transaction. SYSTEM entries never call this method. */
    public void enqueue(Message message) {
        Recipient recipient = recipient(message);
        if (recipient == null) {
            return;
        }
        UUID eventId = UUID.randomUUID();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("messageId", message.id());
        data.put("conversationId", message.conversationId());
        data.put("orderId", recipient.orderId());
        data.put("senderUserId", message.senderUserId());
        data.put("recipientUserId", recipient.userId());
        data.put("messageType", message.messageType());
        data.put("messagePreview", preview(message));

        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("eventId", eventId);
        envelope.put("eventType", "ChatMessageSent");
        envelope.put("eventVersion", 1);
        envelope.put("aggregateType", "Conversation");
        envelope.put("aggregateId", message.conversationId());
        envelope.put("aggregateVersion", message.sequence());
        envelope.put("occurredAt", message.createdAt());
        envelope.put("producer", "chat-service");
        envelope.put("correlationId", recipient.orderId());
        envelope.put("causationId", message.id());
        envelope.put("actor", Map.of("type", "USER", "userId", message.senderUserId()));
        envelope.put("data", data);

        db.sql("""
                INSERT INTO chat_notification_outbox(
                    event_id,message_id,conversation_id,order_id,recipient_id,payload,
                    created_at,next_attempt_at)
                VALUES(:eventId,:messageId,:conversationId,:orderId,:recipientId,
                    CAST(:payload AS jsonb),:createdAt,:createdAt)
                ON CONFLICT (message_id) DO NOTHING
                """).param("eventId", eventId).param("messageId", message.id())
                .param("conversationId", message.conversationId()).param("orderId", recipient.orderId())
                .param("recipientId", recipient.userId()).param("payload", json.writeValueAsString(envelope))
                .param("createdAt", message.createdAt()).update();
    }

    /** Short leases let several Chat replicas relay without double-claiming a row. */
    @Transactional
    public List<Delivery> claim(int limit) {
        OffsetDateTime now = OffsetDateTime.now(clock);
        List<Delivery> claimed = new ArrayList<>();
        var rows = db.sql("""
                SELECT event_id,conversation_id,payload FROM chat_notification_outbox
                WHERE published_at IS NULL AND next_attempt_at<=:now
                  AND (lease_until IS NULL OR lease_until<:now)
                ORDER BY created_at,event_id LIMIT :limit FOR UPDATE SKIP LOCKED
                """).param("now", now).param("limit", limit)
                .query((rs, n) -> new Pending(rs.getObject("event_id", UUID.class),
                        rs.getObject("conversation_id", UUID.class), rs.getString("payload"))).list();
        for (Pending row : rows) {
            UUID lease = UUID.randomUUID();
            db.sql("""
                    UPDATE chat_notification_outbox
                    SET lease_id=:lease,lease_until=:leaseUntil,publish_attempts=publish_attempts+1
                    WHERE event_id=:eventId
                    """).param("lease", lease).param("leaseUntil", now.plusSeconds(30))
                    .param("eventId", row.eventId()).update();
            claimed.add(new Delivery(row.eventId(), row.conversationId(), row.payload(), lease));
        }
        return claimed;
    }

    public void confirmed(Delivery delivery) {
        db.sql("""
                UPDATE chat_notification_outbox
                SET published_at=:now,lease_id=NULL,lease_until=NULL,last_error=NULL
                WHERE event_id=:eventId AND lease_id=:lease
                """).param("now", OffsetDateTime.now(clock)).param("eventId", delivery.eventId())
                .param("lease", delivery.leaseId()).update();
    }

    public void failed(Delivery delivery, Exception error) {
        String detail = error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
        if (detail.length() > 500) detail = detail.substring(0, 500);
        db.sql("""
                UPDATE chat_notification_outbox
                SET lease_id=NULL,lease_until=NULL,next_attempt_at=:retryAt,last_error=:error
                WHERE event_id=:eventId AND lease_id=:lease
                """).param("retryAt", OffsetDateTime.now(clock).plusSeconds(5)).param("error", detail)
                .param("eventId", delivery.eventId()).param("lease", delivery.leaseId()).update();
    }

    private Recipient recipient(Message message) {
        List<Recipient> recipients = db.sql("""
                SELECT DISTINCT c.order_id,p.user_id
                FROM chat_conversations c
                JOIN chat_participants p ON p.conversation_id=c.id
                WHERE c.id=:conversationId AND c.conversation_type='ERRAND'
                  AND p.user_id<>:sender AND p.valid_until IS NULL
                  AND p.can_write AND p.relationship IN ('REQUESTER','COURIER')
                """).param("conversationId", message.conversationId()).param("sender", message.senderUserId())
                .query((rs, n) -> new Recipient(rs.getObject("order_id", UUID.class),
                        rs.getObject("user_id", UUID.class))).list();
        if (recipients.size() > 1) {
            throw new IllegalStateException("An errand chat message resolved to multiple notification recipients");
        }
        return recipients.isEmpty() ? null : recipients.get(0);
    }

    private static String preview(Message message) {
        if ("IMAGE".equals(message.messageType())) {
            return "Image sent in chat";
        }
        String text = message.text();
        if (text == null || text.isBlank()) {
            return "New message in chat";
        }
        if (text.codePointCount(0, text.length()) <= PREVIEW_LENGTH) {
            return text;
        }
        int end = text.offsetByCodePoints(0, PREVIEW_LENGTH - 1);
        return text.substring(0, end) + "…";
    }

    public record Delivery(UUID eventId, UUID conversationId, String payload, UUID leaseId) {}
    private record Pending(UUID eventId, UUID conversationId, String payload) {}
    private record Recipient(UUID orderId, UUID userId) {}
}
