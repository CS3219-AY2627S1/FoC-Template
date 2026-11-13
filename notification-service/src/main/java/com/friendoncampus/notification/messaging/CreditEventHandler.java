package com.friendoncampus.notification.messaging;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;
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

/**
 * Turns {@code credit.events} into notifications, following the event communication blueprint's
 * consumer rules: validate the envelope, deduplicate by {@code eventId} (inbox) and by
 * {@code operationId} (business key), then store the inbox receipt and any notification in one
 * transaction. The Kafka listener acknowledges the record
 * only after this commits. Recipients come from the event itself; nothing is looked up elsewhere.
 *
 * <p>Only three Credit events notify anyone (see DESIGN.md "Event mapping"). Every other type,
 * including ones Credit adds later, is recorded as {@code IGNORED}.
 */
@Component
public class CreditEventHandler {

    public static final String TOPIC = "credit.events";

    private static final Logger log = LoggerFactory.getLogger(CreditEventHandler.class);
    private static final String CREDIT_PRODUCER = "credit-service";
    private static final int EVENT_VERSION = 1;

    /**
     * What happened to one received event. DUPLICATE (same eventId) is not stored; the first receipt
     * already is. DUPLICATE_OPERATION is a new eventId for an operation that already notified its
     * recipient, for example Credit republishing an outcome during reconciliation.
     */
    public enum Outcome {
        NOTIFIED,
        IGNORED,
        DUPLICATE,
        DUPLICATE_OPERATION
    }

    /** One Credit event that notifies someone: who, what, and where the values come from. */
    private record Mapping(String aggregateType, String recipientField, NotificationType type,
            String amountField, boolean linksToOrder) {
    }

    private static final Map<String, Mapping> MAPPINGS = Map.of(
            "CreditAccountAllocated",
            new Mapping("User", "userId", NotificationType.CREDITS_WELCOME, "allocatedAmount", false),
            "CreditSettled",
            new Mapping("Order", "courierId", NotificationType.CREDITS_RECEIVED, "transferredAmount", true),
            // The requester cancelled, so only the courier is told: the actor is never notified.
            "CourierCompensated",
            new Mapping("Order", "courierId", NotificationType.CREDITS_COMPENSATED, "transferredAmount", true));

    private final ProcessedEventRepository processedEventRepository;
    private final NotificationRepository notificationRepository;
    private final Clock clock;
    private final JsonMapper jsonMapper = JsonMapper.builder().build();

    public CreditEventHandler(ProcessedEventRepository processedEventRepository,
            NotificationRepository notificationRepository, Clock clock) {
        this.processedEventRepository = processedEventRepository;
        this.notificationRepository = notificationRepository;
        this.clock = clock;
    }

    @Transactional
    public Outcome handle(String json) {
        JsonNode envelope = parse(json);
        UUID eventId = requiredUuid(envelope, "eventId");
        String eventType = requiredText(envelope, "eventType");
        try {
            return handle(envelope, eventId, eventType, fingerprint(json));
        } catch (EventRejectedException rejected) {
            log.warn("Rejected credit event eventId={} eventType={} correlationId={} reason={}: {}",
                    eventId, eventType, text(envelope, "correlationId"), rejected.getReasonCode(),
                    rejected.getMessage());
            throw rejected;
        }
    }

    private Outcome handle(JsonNode envelope, UUID eventId, String eventType, String fingerprint) {
        Optional<ProcessedEvent> previous = processedEventRepository.findById(eventId);
        if (previous.isPresent()) {
            if (!previous.get().getFingerprint().equals(fingerprint)) {
                throw reject("EVENT_ID_CONFLICT", "eventId " + eventId + " was reused with different content");
            }
            log.info("Ignored duplicate credit event eventId={} eventType={}", eventId, eventType);
            return Outcome.DUPLICATE;
        }

        if (!CREDIT_PRODUCER.equals(text(envelope, "producer"))) {
            throw reject("INVALID_EVENT", "Unexpected producer " + text(envelope, "producer"));
        }
        UUID aggregateId = requiredUuid(envelope, "aggregateId");
        UUID correlationId = requiredUuid(envelope, "correlationId");

        Mapping mapping = MAPPINGS.get(eventType);
        Outcome outcome = mapping == null ? Outcome.IGNORED : notify(envelope, eventId, aggregateId, mapping);
        processedEventRepository.save(new ProcessedEvent(eventId, TOPIC, eventType, aggregateId, correlationId,
                fingerprint, outcome.name(), OffsetDateTime.now(clock)));
        log.info("{} credit event eventId={} eventType={} correlationId={}", switch (outcome) {
            case NOTIFIED -> "Notified for";
            case DUPLICATE_OPERATION -> "Ignored repeated operation in";
            default -> "Ignored";
        }, eventId, eventType, correlationId);
        return outcome;
    }

    /**
     * Stores the notification unless this recipient was already told about the same operation. The
     * lookup runs before the insert so the inbox row still commits. The unique business key is only a
     * backstop: a concurrent duplicate fails, rolls back, and on retry is found here.
     */
    private Outcome notify(JsonNode envelope, UUID eventId, UUID aggregateId, Mapping mapping) {
        Notification notification = notificationFor(envelope, eventId, aggregateId, mapping);
        Optional<Notification> existing = notificationRepository.findByRecipientIdAndTypeAndBusinessKey(
                notification.getRecipientId(), notification.getType(), notification.getBusinessKey());
        if (existing.isPresent()) {
            // Compared as JSON: PostgreSQL jsonb does not keep the original text.
            JsonNode firstParams = jsonMapper.readTree(existing.get().getParams());
            if (!firstParams.equals(jsonMapper.readTree(notification.getParams()))) {
                log.warn("Repeated credit operationId={} has different values: first eventId={}, now eventId={}",
                        notification.getBusinessKey(), existing.get().getSourceEventId(), eventId);
            }
            return Outcome.DUPLICATE_OPERATION;
        }
        notificationRepository.save(notification);
        return Outcome.NOTIFIED;
    }

    private Notification notificationFor(JsonNode envelope, UUID eventId, UUID aggregateId, Mapping mapping) {
        if (envelope.path("eventVersion").asInt() != EVENT_VERSION) {
            throw reject("INVALID_EVENT", "Unsupported eventVersion");
        }
        if (!mapping.aggregateType().equals(text(envelope, "aggregateType"))) {
            throw reject("INVALID_EVENT", "Expected aggregateType " + mapping.aggregateType());
        }
        OffsetDateTime occurredAt = requiredTimestamp(envelope, "occurredAt");
        JsonNode data = envelope.get("data");
        if (data == null || !data.isObject()) {
            throw reject("INVALID_EVENT", "data must be an object");
        }
        String aggregateField = mapping.linksToOrder() ? "orderId" : "userId";
        if (!aggregateId.equals(requiredUuid(data, aggregateField))) {
            throw reject("INVALID_EVENT", "aggregateId does not match data." + aggregateField);
        }
        UUID recipientId = requiredUuid(data, mapping.recipientField());
        UUID operationId = requiredUuid(data, "operationId");
        String params = jsonMapper.writeValueAsString(Map.of("amount", positiveInteger(data, mapping.amountField())));
        return new Notification(UUID.randomUUID(), recipientId, mapping.type(),
                mapping.linksToOrder() ? aggregateId : null, params, eventId, operationId.toString(), occurredAt,
                OffsetDateTime.now(clock));
    }

    private JsonNode parse(String json) {
        JsonNode node;
        try {
            node = jsonMapper.readTree(json);
        } catch (RuntimeException exception) {
            throw reject("INVALID_EVENT", "Event is not valid JSON");
        }
        if (node == null || !node.isObject()) {
            throw reject("INVALID_EVENT", "Event must be a JSON object");
        }
        return node;
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asString();
    }

    private static String requiredText(JsonNode node, String field) {
        String value = text(node, field);
        if (value == null || value.isBlank()) {
            throw reject("INVALID_EVENT", field + " is required");
        }
        return value;
    }

    private static UUID requiredUuid(JsonNode node, String field) {
        String value = requiredText(node, field);
        try {
            return UUID.fromString(value);
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

    private static int positiveInteger(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isIntegralNumber() || !value.canConvertToInt() || value.asInt() <= 0) {
            throw reject("INVALID_EVENT", field + " must be a positive whole number");
        }
        return value.asInt();
    }

    private static String fingerprint(String json) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(json.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static EventRejectedException reject(String reasonCode, String message) {
        return new EventRejectedException(reasonCode, message);
    }
}
