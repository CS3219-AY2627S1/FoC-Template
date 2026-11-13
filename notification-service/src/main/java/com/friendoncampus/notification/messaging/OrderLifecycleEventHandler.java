package com.friendoncampus.notification.messaging;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.notification.domain.Notification;
import com.friendoncampus.notification.domain.NotificationType;
import com.friendoncampus.notification.reminder.ReminderScheduler;
import com.friendoncampus.notification.repository.NotificationRepository;
import com.friendoncampus.notification.repository.ProcessedEventRepository;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Turns {@code OrderTransitioned} on {@code order.lifecycle.events} into notifications, with the same
 * consumer rules as {@link CreditEventHandler}: validate the envelope, deduplicate by {@code eventId}
 * (inbox) and by {@code orderId:sourceSequence} (business key), then store the inbox receipt and any
 * notification in one transaction. Recipients come from the event (DESIGN.md "Event mapping"); the
 * actor is never notified.
 *
 * <p>A {@code sourceSequence} more than one above the last one seen for the order is logged as a
 * gap. The event is still handled; the missing transition is never guessed.
 *
 * <p>Every valid event also brings the errand's pickup reminders up to date
 * ({@link ReminderScheduler}), in the same transaction.
 */
@Component
public class OrderLifecycleEventHandler {

    public static final String TOPIC = "order.lifecycle.events";

    private static final Logger log = LoggerFactory.getLogger(OrderLifecycleEventHandler.class);
    private static final String ORDER_PRODUCER = "order-service";
    private static final String EVENT_TYPE = "OrderTransitioned";
    private static final int EVENT_VERSION = 1;

    /** One notification to store: who and what. */
    private record Recipient(UUID userId, NotificationType type) {
    }

    private final ProcessedEventRepository processedEventRepository;
    private final NotificationRepository notificationRepository;
    private final ReminderScheduler reminderScheduler;
    private final Clock clock;
    private final JsonMapper jsonMapper = JsonMapper.builder().build();

    public OrderLifecycleEventHandler(ProcessedEventRepository processedEventRepository,
            NotificationRepository notificationRepository, ReminderScheduler reminderScheduler, Clock clock) {
        this.processedEventRepository = processedEventRepository;
        this.notificationRepository = notificationRepository;
        this.reminderScheduler = reminderScheduler;
        this.clock = clock;
    }

    @Transactional
    public CreditEventHandler.Outcome handle(String json) {
        JsonNode envelope = parse(json);
        UUID eventId = requiredUuid(envelope, "eventId");
        String eventType = requiredText(envelope, "eventType");
        try {
            return handle(envelope, eventId, eventType, fingerprint(json));
        } catch (EventRejectedException rejected) {
            log.warn("Rejected order lifecycle event eventId={} eventType={} correlationId={} reason={}: {}",
                    eventId, eventType, text(envelope, "correlationId"), rejected.getReasonCode(),
                    rejected.getMessage());
            throw rejected;
        }
    }

    private CreditEventHandler.Outcome handle(JsonNode envelope, UUID eventId, String eventType, String fingerprint) {
        Optional<ProcessedEvent> previous = processedEventRepository.findById(eventId);
        if (previous.isPresent()) {
            if (!previous.get().getFingerprint().equals(fingerprint)) {
                throw reject("EVENT_ID_CONFLICT", "eventId " + eventId + " was reused with different content");
            }
            log.info("Ignored duplicate order lifecycle event eventId={}", eventId);
            return CreditEventHandler.Outcome.DUPLICATE;
        }

        Transition transition = validate(envelope, eventType);
        warnOnGap(transition);

        Optional<Recipient> recipient = recipient(transition);
        CreditEventHandler.Outcome outcome = recipient.isEmpty()
                ? CreditEventHandler.Outcome.IGNORED : notify(transition, eventId, recipient.get());
        reminderScheduler.apply(new ReminderScheduler.ErrandState(transition.orderId(), transition.sourceSequence(),
                transition.toState(), transition.requesterId(), transition.courierId(), transition.pickupDeadline(),
                transition.title(), eventId), OffsetDateTime.now(clock));
        processedEventRepository.save(new ProcessedEvent(eventId, TOPIC, eventType, transition.orderId(),
                transition.correlationId(), fingerprint, outcome.name(), OffsetDateTime.now(clock),
                transition.sourceSequence()));
        log.info("{} order lifecycle event eventId={} orderId={} sourceSequence={} action={} correlationId={}",
                switch (outcome) {
                    case NOTIFIED -> "Notified for";
                    case DUPLICATE_OPERATION -> "Ignored repeated transition in";
                    default -> "Ignored";
                }, eventId, transition.orderId(), transition.sourceSequence(), transition.action(),
                transition.correlationId());
        return outcome;
    }

    /** What one event says, after validation. */
    private record Transition(UUID orderId, UUID correlationId, UUID actorId, long sourceSequence, String action,
            String fromState, String toState, UUID requesterId, UUID courierId, UUID previousCourierId,
            String reasonCode, String title, OffsetDateTime pickupDeadline, OffsetDateTime occurredAt) {
    }

    private Transition validate(JsonNode envelope, String eventType) {
        if (!EVENT_TYPE.equals(eventType)) {
            throw reject("INVALID_EVENT", "Unexpected eventType " + eventType);
        }
        if (!ORDER_PRODUCER.equals(text(envelope, "producer"))) {
            throw reject("INVALID_EVENT", "Unexpected producer " + text(envelope, "producer"));
        }
        if (envelope.path("eventVersion").asInt() != EVENT_VERSION) {
            throw reject("INVALID_EVENT", "Unsupported eventVersion");
        }
        if (!"Order".equals(text(envelope, "aggregateType"))) {
            throw reject("INVALID_EVENT", "Expected aggregateType Order");
        }
        UUID aggregateId = requiredUuid(envelope, "aggregateId");
        UUID correlationId = requiredUuid(envelope, "correlationId");
        OffsetDateTime occurredAt = requiredTimestamp(envelope, "occurredAt");
        JsonNode data = envelope.get("data");
        if (data == null || !data.isObject()) {
            throw reject("INVALID_EVENT", "data must be an object");
        }
        UUID orderId = requiredUuid(data, "orderId");
        if (!aggregateId.equals(orderId)) {
            throw reject("INVALID_EVENT", "aggregateId does not match data.orderId");
        }
        JsonNode sequence = data.get("sourceSequence");
        if (sequence == null || !sequence.isIntegralNumber() || !sequence.canConvertToLong() || sequence.asLong() < 1) {
            throw reject("INVALID_EVENT", "sourceSequence must be a whole number of at least 1");
        }
        JsonNode snapshot = data.get("snapshot");
        if (snapshot == null || !snapshot.isObject()) {
            throw reject("INVALID_EVENT", "snapshot must be an object");
        }
        JsonNode actor = envelope.get("actor");
        UUID actorId = actor != null && "USER".equals(text(actor, "type")) ? requiredUuid(actor, "userId") : null;
        return new Transition(orderId, correlationId, actorId, sequence.asLong(), requiredText(data, "action"),
                text(data, "fromState"), requiredText(data, "toState"), requiredUuid(data, "requesterId"),
                optionalUuid(data, "courierId"), optionalUuid(data, "previousCourierId"), text(data, "reasonCode"),
                requiredText(snapshot, "title"), requiredTimestamp(snapshot, "pickupDeadline"), occurredAt);
    }

    /**
     * DESIGN.md "From {@code order.lifecycle.events}". SUBMIT, EDIT, cancelling an OPEN errand and
     * reward changes notify nobody. A required recipient that is missing rejects the event, so it
     * is never sent to an arbitrary user.
     */
    private static Optional<Recipient> recipient(Transition t) {
        NotificationType type = switch (t.action()) {
            case "OPEN" -> "EXPIRED".equals(t.toState()) ? NotificationType.ORDER_EXPIRED : NotificationType.ORDER_OPENED;
            case "FAIL_RESERVATION" -> NotificationType.ORDER_RESERVATION_FAILED;
            case "ACCEPT" -> NotificationType.ORDER_ACCEPTED;
            case "WITHDRAW" -> "EXPIRED".equals(t.toState())
                    ? NotificationType.ORDER_EXPIRED : NotificationType.ORDER_COURIER_WITHDREW;
            // From PENDING_CREDIT the errand never reached the pool: Credit did not answer in time.
            case "EXPIRE" -> "PENDING_CREDIT".equals(t.fromState())
                    ? NotificationType.ORDER_RESERVATION_FAILED : NotificationType.ORDER_EXPIRED;
            case "CANCEL" -> "ACCEPTED".equals(t.fromState()) ? NotificationType.ORDER_CANCELLED : null;
            case "PICK_UP" -> NotificationType.ORDER_PICKED_UP;
            case "DELIVER" -> NotificationType.ORDER_DELIVERED;
            case "COMPLETE" -> NotificationType.ORDER_COMPLETED;
            default -> null;
        };
        if (type == null) {
            return Optional.empty();
        }
        UUID userId = switch (type) {
            case ORDER_CANCELLED -> required(t.previousCourierId(), "previousCourierId");
            case ORDER_COMPLETED -> required(t.courierId(), "courierId");
            default -> t.requesterId();
        };
        // The actor is never notified, whatever the table says.
        return userId.equals(t.actorId()) ? Optional.empty() : Optional.of(new Recipient(userId, type));
    }

    private CreditEventHandler.Outcome notify(Transition t, UUID eventId, Recipient recipient) {
        String businessKey = t.orderId() + ":" + t.sourceSequence();
        if (notificationRepository.findByRecipientIdAndTypeAndBusinessKey(recipient.userId(), recipient.type(),
                businessKey).isPresent()) {
            return CreditEventHandler.Outcome.DUPLICATE_OPERATION;
        }
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("title", t.title());
        if (recipient.type() == NotificationType.ORDER_RESERVATION_FAILED) {
            params.put("reason", t.reasonCode());
        }
        notificationRepository.save(new Notification(UUID.randomUUID(), recipient.userId(), recipient.type(),
                t.orderId(), jsonMapper.writeValueAsString(params), eventId, businessKey, t.occurredAt(),
                OffsetDateTime.now(clock)));
        return CreditEventHandler.Outcome.NOTIFIED;
    }

    private void warnOnGap(Transition t) {
        Long last = processedEventRepository.findMaxSourceSequence(t.orderId());
        if (last != null && t.sourceSequence() > last + 1) {
            log.warn("Gap in order lifecycle events orderId={} lastSourceSequence={} receivedSourceSequence={}; "
                    + "handling it without guessing the missing transitions", t.orderId(), last, t.sourceSequence());
        }
    }

    private static UUID required(UUID value, String field) {
        if (value == null) {
            throw reject("INVALID_EVENT", field + " is required for this transition");
        }
        return value;
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
        return uuid(requiredText(node, field), field);
    }

    private static UUID optionalUuid(JsonNode node, String field) {
        String value = text(node, field);
        return value == null ? null : uuid(value, field);
    }

    private static UUID uuid(String value, String field) {
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
