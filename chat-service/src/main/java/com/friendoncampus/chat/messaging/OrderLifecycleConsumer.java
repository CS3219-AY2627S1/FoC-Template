package com.friendoncampus.chat.messaging;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.chat.service.ChatConversationService;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Component
@ConditionalOnProperty(name = "app.kafka.enabled", havingValue = "true", matchIfMissing = true)
public class OrderLifecycleConsumer {
    private static final Set<String> TERMINAL =
            Set.of("COMPLETED", "CANCELLED", "EXPIRED", "RESERVATION_FAILED");
    private static final Map<String, String> ACTIVITY_TEXT = Map.ofEntries(
            Map.entry("REVIEW_STARTED", "This errand is under review. Normal errand actions and chat are paused."),
            Map.entry("DISPUTE_RESOLVED", "This errand was finished after dispute review."),
            Map.entry("ACCEPT", "Courier accepted the errand."),
            Map.entry("WITHDRAW", "Courier withdrew from the errand."),
            Map.entry("PICK_UP", "Courier marked the errand as picked up."),
            Map.entry("DELIVER", "Courier marked the errand as delivered."),
            Map.entry("COMPLETE", "Requester confirmed the errand was completed."),
            Map.entry("CANCEL", "The errand was cancelled."),
            Map.entry("EXPIRE", "The errand expired."),
            Map.entry("EDIT", "The errand details were updated."),
            Map.entry("REWARD_CHANGE_APPLIED", "The credit reward was updated."),
            Map.entry("REWARD_CHANGE_REJECTED", "The credit reward update was not applied."));

    private final JdbcClient db;
    private final Clock clock;
    private final ChatConversationService chats;
    private final JsonMapper json = JsonMapper.builder().build();

    public OrderLifecycleConsumer(JdbcClient db, Clock clock, ChatConversationService chats) {
        this.db = db;
        this.clock = clock;
        this.chats = chats;
    }

    @Transactional
    public void process(String payload) {
        JsonNode root = json.readTree(payload);
        UUID eventId = uuid(root, "eventId");
        String payloadHash = hash(payload);
        String priorHash = db.sql("SELECT payload_hash FROM chat_processed_events WHERE event_id=:id")
                .param("id", eventId).query(String.class).optional().orElse(null);
        if (priorHash != null) {
            if (!priorHash.equals(payloadHash)) {
                throw new IllegalStateException("Conflicting lifecycle event " + eventId);
            }
            return;
        }
        if (!"OrderTransitioned".equals(root.path("eventType").asText())) {
            throw new IllegalArgumentException("Unsupported lifecycle event");
        }

        JsonNode data = root.path("data");
        UUID orderId = uuid(data, "orderId");
        long sourceSequence = data.path("sourceSequence").asLong(-1);
        if (sourceSequence < 1) throw new IllegalArgumentException("sourceSequence must be positive");
        String sequenceHash = db.sql("""
                SELECT payload_hash FROM chat_processed_events
                WHERE order_id=:orderId AND source_sequence=:sequence
                """).param("orderId", orderId).param("sequence", sourceSequence)
                .query(String.class).optional().orElse(null);
        if (sequenceHash != null) {
            throw new IllegalStateException("Conflicting lifecycle sequence " + orderId + "/" + sourceSequence);
        }

        UUID requesterId = uuid(data, "requesterId");
        String action = data.path("action").asText();
        String fromState = nullableText(data, "fromState");
        String toState = data.path("toState").asText();
        OffsetDateTime occurredAt = OffsetDateTime.parse(root.path("occurredAt").asText());

        var evidenceData = data.deepCopy();
        ((tools.jackson.databind.node.ObjectNode) evidenceData).put("kind", "ORDER");
        UUID actorUserId = nullableUuid(root.path("actor"), "userId");
        db.sql("""
                INSERT INTO chat_evidence_records(event_id,source,stream,aggregate_id,source_sequence,
                    order_id,action,actor_user_id,occurred_at,ingested_at,data,payload_hash)
                VALUES(:eventId,'order-service','order.lifecycle.events',:orderId,:sequence,
                    :orderId,:action,:actor,:occurredAt,:ingestedAt,CAST(:data AS jsonb),:hash)
                ON CONFLICT(event_id) DO NOTHING
                """).param("eventId",eventId).param("orderId",orderId).param("sequence",sourceSequence)
                .param("action",action).param("actor",actorUserId,java.sql.Types.OTHER)
                .param("occurredAt",occurredAt).param("ingestedAt",OffsetDateTime.now(clock))
                .param("data",json.writeValueAsString(evidenceData)).param("hash",payloadHash).update();
        db.sql("""
                INSERT INTO chat_projection_checkpoints(source,stream,aggregate_id,committed_sequence,checked_at)
                VALUES('order-service','order.lifecycle.events',:orderId,:sequence,:checkedAt)
                ON CONFLICT(source,stream,aggregate_id) DO UPDATE SET
                  committed_sequence=GREATEST(chat_projection_checkpoints.committed_sequence,EXCLUDED.committed_sequence),
                  checked_at=EXCLUDED.checked_at
                """).param("orderId",orderId).param("sequence",sourceSequence)
                .param("checkedAt",OffsetDateTime.now(clock)).update();

        if ("ACCEPT".equals(action)) {
            accept(orderId, requesterId, uuid(data, "courierId"), occurredAt);
            appendActivity(orderId, eventId, sourceSequence, action, fromState, toState, occurredAt);
        } else {
            // Record withdrawal and terminal facts while the outgoing courier is still part of the
            // active assignment epoch. The subsequent permission update makes that history read-only.
            appendActivity(orderId, eventId, sourceSequence, action, fromState, toState, occurredAt);
            if ("WITHDRAW".equals(action)) {
                withdraw(orderId, nullableUuid(data, "previousCourierId"), occurredAt);
            }
        }
        if (TERMINAL.contains(toState) || "REVIEW_STARTED".equals(action) || "DISPUTE_RESOLVED".equals(action)) lock(orderId, occurredAt);

        db.sql("""
                INSERT INTO chat_processed_events(event_id,order_id,source_sequence,payload_hash,processed_at)
                VALUES(:id,:orderId,:sequence,:hash,:processedAt)
                """).param("id", eventId).param("orderId", orderId)
                .param("sequence", sourceSequence).param("hash", payloadHash)
                .param("processedAt", OffsetDateTime.now(clock)).update();
    }

    private void appendActivity(UUID orderId, UUID eventId, long sourceSequence, String action,
            String fromState, String toState, OffsetDateTime occurredAt) {
        String text = ACTIVITY_TEXT.get(action);
        if (text == null) return;
        UUID conversationId = db.sql("""
                SELECT id FROM chat_conversations
                WHERE order_id=:orderId AND conversation_type='ERRAND'
                """).param("orderId", orderId).query(UUID.class).optional().orElse(null);
        if (conversationId == null) return;
        Integer epoch = db.sql("""
                SELECT assignment_epoch FROM chat_participants
                WHERE conversation_id=:conversationId AND relationship='COURIER' AND valid_until IS NULL
                ORDER BY assignment_epoch DESC LIMIT 1
                """).param("conversationId", conversationId).query(Integer.class).optional().orElse(null);
        chats.appendLifecycleMessage(conversationId, eventId, sourceSequence, action, fromState,
                toState, text, epoch, occurredAt);
    }

    private void accept(UUID orderId, UUID requesterId, UUID courierId, OffsetDateTime occurredAt) {
        UUID conversationId = db.sql("""
                SELECT id FROM chat_conversations
                WHERE order_id=:orderId AND conversation_type='ERRAND'
                """).param("orderId", orderId).query(UUID.class).optional().orElse(null);
        if (conversationId == null) {
            conversationId = UUID.randomUUID();
            db.sql("""
                    INSERT INTO chat_conversations(
                        id,conversation_type,order_id,status,next_sequence,created_at,updated_at)
                    VALUES(:id,'ERRAND',:orderId,'ACTIVE',1,:occurredAt,:occurredAt)
                    """).param("id", conversationId).param("orderId", orderId)
                    .param("occurredAt", occurredAt).update();
        }
        db.sql("""
                INSERT INTO chat_participants(
                    conversation_id,user_id,assignment_epoch,relationship,can_write,valid_from)
                VALUES(:conversationId,:userId,1,'REQUESTER',true,:occurredAt)
                ON CONFLICT(conversation_id,user_id,assignment_epoch)
                DO UPDATE SET can_write=true,valid_until=NULL
                """).param("conversationId", conversationId).param("userId", requesterId)
                .param("occurredAt", occurredAt).update();
        Integer epoch = db.sql("""
                SELECT COALESCE(MAX(assignment_epoch),0)+1 FROM chat_participants
                WHERE conversation_id=:conversationId AND relationship='COURIER'
                """).param("conversationId", conversationId).query(Integer.class).single();
        db.sql("""
                UPDATE chat_participants SET can_write=false,valid_until=:occurredAt
                WHERE conversation_id=:conversationId AND relationship='COURIER' AND valid_until IS NULL
                """).param("occurredAt", occurredAt).param("conversationId", conversationId).update();
        db.sql("""
                INSERT INTO chat_participants(
                    conversation_id,user_id,assignment_epoch,relationship,can_write,valid_from)
                VALUES(:conversationId,:userId,:epoch,'COURIER',true,:occurredAt)
                ON CONFLICT(conversation_id,user_id,assignment_epoch) DO NOTHING
                """).param("conversationId", conversationId).param("userId", courierId)
                .param("epoch", epoch).param("occurredAt", occurredAt).update();
    }

    private void withdraw(UUID orderId, UUID courierId, OffsetDateTime occurredAt) {
        if (courierId == null) return;
        db.sql("""
                UPDATE chat_participants SET can_write=false,valid_until=:occurredAt
                WHERE user_id=:userId AND valid_until IS NULL AND conversation_id IN(
                    SELECT id FROM chat_conversations WHERE order_id=:orderId)
                """).param("occurredAt", occurredAt).param("userId", courierId)
                .param("orderId", orderId).update();
    }

    private void lock(UUID orderId, OffsetDateTime occurredAt) {
        db.sql("""
                UPDATE chat_conversations
                SET status='READ_ONLY',locked_at=:occurredAt,updated_at=:occurredAt
                WHERE order_id=:orderId AND conversation_type='ERRAND'
                """).param("occurredAt", occurredAt).param("orderId", orderId).update();
        db.sql("""
                UPDATE chat_participants SET can_write=false,valid_until=COALESCE(valid_until,:occurredAt)
                WHERE conversation_id IN(SELECT id FROM chat_conversations WHERE order_id=:orderId AND conversation_type='ERRAND')
                """).param("occurredAt", occurredAt).param("orderId", orderId).update();
    }

    private static UUID uuid(JsonNode node, String field) {
        return UUID.fromString(node.path(field).asText());
    }

    private static UUID nullableUuid(JsonNode node, String field) {
        String value = node.path(field).asText(null);
        return value == null || value.isBlank() ? null : UUID.fromString(value);
    }

    private static String nullableText(JsonNode node, String field) {
        String value = node.path(field).asText(null);
        return value == null || value.isBlank() ? null : value;
    }

    private static String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }
}
