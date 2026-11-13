package com.friendoncampus.notification.messaging;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.notification.domain.Notification;
import com.friendoncampus.notification.domain.NotificationType;
import com.friendoncampus.notification.repository.NotificationRepository;
import com.friendoncampus.notification.repository.ProcessedEventRepository;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Consumes privacy-minimal ChatMessageSent facts and notifies the other errand participant. */
@Component
public class ChatMessageEventHandler {
    public static final String TOPIC = "chat.events";
    private static final Logger log = LoggerFactory.getLogger(ChatMessageEventHandler.class);
    private final ProcessedEventRepository processedEvents;
    private final NotificationRepository notifications;
    private final Clock clock;
    private final JsonMapper json = JsonMapper.builder().build();

    public ChatMessageEventHandler(ProcessedEventRepository processedEvents,
            NotificationRepository notifications, Clock clock) {
        this.processedEvents = processedEvents;
        this.notifications = notifications;
        this.clock = clock;
    }

    @Transactional
    public CreditEventHandler.Outcome handle(String raw) {
        return handle(null, raw);
    }

    @Transactional
    public CreditEventHandler.Outcome handle(String key, String raw) {
        JsonNode envelope = parse(raw);
        UUID eventId = requiredUuid(envelope, "eventId");
        String fingerprint = fingerprint(raw);
        Optional<ProcessedEvent> previous = processedEvents.findById(eventId);
        if (previous.isPresent()) {
            if (!previous.get().getFingerprint().equals(fingerprint)) {
                throw reject("EVENT_ID_CONFLICT", "eventId was reused with different content");
            }
            return CreditEventHandler.Outcome.DUPLICATE;
        }
        Event event = validate(envelope);
        if (key != null && !event.conversationId().toString().equals(key)) {
            throw reject("INVALID_EVENT", "Kafka key must match aggregateId");
        }
        String businessKey = event.messageId().toString();
        CreditEventHandler.Outcome outcome;
        if (notifications.findByRecipientIdAndTypeAndBusinessKey(event.recipientId(),
                NotificationType.CHAT_MESSAGE_RECEIVED, businessKey).isPresent()) {
            outcome = CreditEventHandler.Outcome.DUPLICATE_OPERATION;
        } else {
            String params = json.writeValueAsString(Map.of("messagePreview", event.messagePreview()));
            notifications.save(new Notification(UUID.randomUUID(), event.recipientId(),
                    NotificationType.CHAT_MESSAGE_RECEIVED, event.orderId(), params, eventId,
                    businessKey, event.occurredAt(), OffsetDateTime.now(clock)));
            outcome = CreditEventHandler.Outcome.NOTIFIED;
        }
        processedEvents.save(new ProcessedEvent(eventId, TOPIC, "ChatMessageSent",
                event.conversationId(), event.orderId(), fingerprint, outcome.name(), OffsetDateTime.now(clock)));
        log.info("{} ChatMessageSent eventId={} messageId={} conversationId={}", outcome,
                eventId, event.messageId(), event.conversationId());
        return outcome;
    }

    private Event validate(JsonNode envelope) {
        if (envelope.size() != 12) {
            throw reject("INVALID_EVENT", "Unexpected Chat event fields");
        }
        if (!"ChatMessageSent".equals(text(envelope, "eventType"))
                || !envelope.path("eventVersion").isIntegralNumber()
                || envelope.path("eventVersion").asInt() != 1
                || !"chat-service".equals(text(envelope, "producer"))
                || !"Conversation".equals(text(envelope, "aggregateType"))) {
            throw reject("INVALID_EVENT", "Unexpected Chat event envelope");
        }
        UUID conversationId = requiredUuid(envelope, "aggregateId");
        if (!envelope.path("aggregateVersion").isIntegralNumber()
                || envelope.path("aggregateVersion").asLong() < 1) {
            throw reject("INVALID_EVENT", "aggregateVersion must be a positive whole number");
        }
        UUID orderId = requiredUuid(envelope, "correlationId");
        OffsetDateTime occurredAt = requiredTimestamp(envelope, "occurredAt");
        JsonNode data = envelope.get("data");
        if (data == null || !data.isObject()) throw reject("INVALID_EVENT", "data must be an object");
        Set<String> allowedDataFields = Set.of("messageId", "conversationId", "orderId",
                "senderUserId", "recipientUserId", "messageType", "messagePreview");
        if ((data.size() != 6 && data.size() != 7)
                || !data.propertyNames().stream().allMatch(allowedDataFields::contains)) {
            throw reject("INVALID_EVENT", "Unexpected Chat event data fields");
        }
        UUID dataConversation = requiredUuid(data, "conversationId");
        UUID dataOrder = requiredUuid(data, "orderId");
        UUID messageId = requiredUuid(data, "messageId");
        if (!messageId.equals(requiredUuid(envelope, "causationId"))) {
            throw reject("INVALID_EVENT", "causationId must match data.messageId");
        }
        UUID sender = requiredUuid(data, "senderUserId");
        UUID recipient = requiredUuid(data, "recipientUserId");
        String messageType = requiredText(data, "messageType");
        if (!conversationId.equals(dataConversation) || !orderId.equals(dataOrder)) {
            throw reject("INVALID_EVENT", "aggregate or correlation ID does not match data");
        }
        if (sender.equals(recipient)) throw reject("INVALID_EVENT", "sender and recipient must differ");
        if (!java.util.Set.of("TEXT", "QUICK_REPLY", "IMAGE").contains(messageType)) {
            throw reject("INVALID_EVENT", "Unsupported messageType");
        }
        String messagePreview = text(data, "messagePreview");
        if (messagePreview == null) {
            messagePreview = "IMAGE".equals(messageType)
                    ? "Image sent in chat" : "New message in chat";
        } else if (messagePreview.isBlank()
                || messagePreview.codePointCount(0, messagePreview.length()) > 160) {
            throw reject("INVALID_EVENT", "messagePreview must contain 1 to 160 characters");
        }
        JsonNode actor = envelope.get("actor");
        if (actor == null || !"USER".equals(text(actor, "type"))
                || !sender.equals(requiredUuid(actor, "userId"))) {
            throw reject("INVALID_EVENT", "actor must match senderUserId");
        }
        String role = text(actor, "role");
        if ((actor.size() != 2 && actor.size() != 3)
                || (role != null && !java.util.Set.of("REQUESTER", "COURIER").contains(role))) {
            throw reject("INVALID_EVENT", "Unexpected Chat actor fields");
        }
        return new Event(conversationId, orderId, messageId, recipient, messagePreview, occurredAt);
    }

    private JsonNode parse(String raw) {
        try {
            JsonNode node = json.readTree(raw);
            if (node == null || !node.isObject()) throw reject("INVALID_EVENT", "Event must be an object");
            return node;
        } catch (EventRejectedException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw reject("INVALID_EVENT", "Event is not valid JSON");
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asString();
    }

    private static String requiredText(JsonNode node, String field) {
        String value = text(node, field);
        if (value == null || value.isBlank()) throw reject("INVALID_EVENT", field + " is required");
        return value;
    }

    private static UUID requiredUuid(JsonNode node, String field) {
        try {
            return UUID.fromString(requiredText(node, field));
        } catch (IllegalArgumentException exception) {
            throw reject("INVALID_EVENT", field + " must be a UUID");
        }
    }

    private static OffsetDateTime requiredTimestamp(JsonNode node, String field) {
        try {
            return OffsetDateTime.parse(requiredText(node, field));
        } catch (DateTimeParseException exception) {
            throw reject("INVALID_EVENT", field + " must be an ISO-8601 timestamp");
        }
    }

    private static String fingerprint(String raw) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(raw.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static EventRejectedException reject(String reason, String detail) {
        return new EventRejectedException(reason, detail);
    }

    private record Event(UUID conversationId, UUID orderId, UUID messageId,
            UUID recipientId, String messagePreview, OffsetDateTime occurredAt) {}
}
