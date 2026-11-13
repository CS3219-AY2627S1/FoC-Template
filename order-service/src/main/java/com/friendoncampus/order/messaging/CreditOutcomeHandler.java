package com.friendoncampus.order.messaging;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.order.domain.CreditStatus;
import com.friendoncampus.order.domain.Order;
import com.friendoncampus.order.domain.TerminalReason;
import com.friendoncampus.order.repository.OrderRepository;
import com.friendoncampus.order.repository.OutboxEventRepository;
import com.friendoncampus.order.repository.ProcessedEventRepository;
import com.friendoncampus.order.service.OrderService;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Applies {@code credit.events} outcomes to orders, following the event communication blueprint:
 * validate the envelope, deduplicate by {@code eventId} (inbox), match the outcome to the Order
 * command that requested it by {@code operationId}, then apply only the Order behaviour the
 * blueprint lists for that outcome, all in one transaction. The Kafka listener acknowledges the
 * record only after this commits.
 */
@Component
public class CreditOutcomeHandler {

    private static final Logger log = LoggerFactory.getLogger(CreditOutcomeHandler.class);
    private static final String CREDIT_PRODUCER = "credit-service";
    private static final Set<String> ORDER_OUTCOMES = Set.of(
            "CreditReserved", "CreditReservationRejected", "CreditAdjusted", "CreditAdjustmentRejected",
            "CreditReleased", "CreditSettled", "CourierCompensated");

    /** What happened to one received event; stored in the inbox. */
    public enum Outcome {
        APPLIED,
        DUPLICATE,
        IGNORED
    }

    private final ProcessedEventRepository processedEventRepository;
    private final OutboxEventRepository outboxEventRepository;
    private final OrderRepository orderRepository;
    private final OrderService orderService;
    private final Clock clock;
    private final JsonMapper jsonMapper = JsonMapper.builder().build();

    public CreditOutcomeHandler(
            ProcessedEventRepository processedEventRepository,
            OutboxEventRepository outboxEventRepository,
            OrderRepository orderRepository,
            OrderService orderService,
            Clock clock) {
        this.processedEventRepository = processedEventRepository;
        this.outboxEventRepository = outboxEventRepository;
        this.orderRepository = orderRepository;
        this.orderService = orderService;
        this.clock = clock;
    }

    @Transactional
    public Outcome handle(String json) {
        JsonNode envelope = parse(json);
        UUID eventId = requiredUuid(envelope, "eventId");
        String eventType = requiredText(envelope, "eventType");
        String fingerprint = fingerprint(json);

        Optional<ProcessedEvent> previous = processedEventRepository.findById(eventId);
        if (previous.isPresent()) {
            if (!previous.get().getFingerprint().equals(fingerprint)) {
                throw reject("EVENT_ID_CONFLICT", "eventId " + eventId + " was reused with different content");
            }
            log.info("Ignored duplicate credit event eventId={} eventType={}", eventId, eventType);
            return Outcome.DUPLICATE;
        }

        if (!ORDER_OUTCOMES.contains(eventType)) {
            // CreditAccountAllocated and any future Credit events carry no Order behaviour.
            return remember(eventId, eventType, requiredUuid(envelope, "aggregateId"), null, fingerprint,
                    Outcome.IGNORED);
        }
        validateEnvelope(envelope);
        JsonNode data = envelope.get("data");
        UUID operationId = requiredUuid(data, "operationId");
        UUID orderId = requiredUuid(data, "orderId");
        if (!orderId.equals(requiredUuid(envelope, "aggregateId"))) {
            throw reject("INVALID_EVENT", "aggregateId does not match data.orderId");
        }
        OutboxEvent command = outboxEventRepository.findByOperationId(operationId)
                .filter(event -> event.getAggregateId().equals(orderId))
                .orElseThrow(() -> reject("UNKNOWN_OPERATION",
                        "No Order command with operationId " + operationId + " for order " + orderId));

        Outcome outcome = apply(eventType, orderId, data, command, eventId);
        log.info("{} credit event eventId={} eventType={} operationId={} correlationId={}",
                outcome == Outcome.APPLIED ? "Applied" : "Ignored", eventId, eventType, operationId,
                text(envelope, "correlationId"));
        return remember(eventId, eventType, orderId, operationId, fingerprint, outcome);
    }

    /** {@code eventId} becomes the causationId of any lifecycle event this outcome causes. */
    private Outcome apply(String eventType, UUID orderId, JsonNode data, OutboxEvent command, UUID eventId) {
        switch (eventType) {
            case "CreditReserved" -> {
                requireCommand(command, "OrderSubmitted", eventType);
                if (timedOutWaitingForCredit(orderId)) {
                    return lateReservationOutcome(eventType, orderId, eventId);
                }
                orderService.confirmReservation(orderId, requiredUuid(data, "reservationId"), eventId);
            }
            case "CreditReservationRejected" -> {
                requireCommand(command, "OrderSubmitted", eventType);
                if (timedOutWaitingForCredit(orderId)) {
                    return lateReservationOutcome(eventType, orderId, eventId);
                }
                orderService.rejectReservation(orderId,
                        TerminalReason.forReservationRejection(text(data, "reasonCode")), eventId);
            }
            case "CreditAdjusted", "CreditAdjustmentRejected" -> {
                requireCommand(command, "OrderRewardChangeRequested", eventType);
                return applyRewardOutcome(eventType, orderId, command, eventId);
            }
            case "CreditReleased" -> {
                requireCommand(command, Set.of("OrderCancelled", "OrderExpired"), eventType);
                recordCreditStatus(orderId, CreditStatus.RELEASED);
            }
            case "CreditSettled" -> {
                requireCommand(command, "OrderCompleted", eventType);
                recordCreditStatus(orderId, CreditStatus.SETTLED);
            }
            case "CourierCompensated" -> {
                requireCommand(command, "OrderCancelled", eventType);
                recordCreditStatus(orderId, CreditStatus.COMPENSATED);
            }
            default -> throw new IllegalStateException("Unhandled credit outcome " + eventType);
        }
        return Outcome.APPLIED;
    }

    /**
     * T5a/T5b. Only an answer to the order's latest reward change can touch the pending reward; an
     * answer to an older request, or one arriving after the order left OPEN (for example it was
     * cancelled meanwhile), is recorded in the inbox as IGNORED and changes nothing.
     */
    private Outcome applyRewardOutcome(String eventType, UUID orderId, OutboxEvent command, UUID eventId) {
        if (!isLatestRewardChange(command)) {
            return Outcome.IGNORED;
        }
        int newCreditReward = jsonMapper.readTree(command.getPayload()).get("data").get("newCreditReward").asInt();
        boolean changed = eventType.equals("CreditAdjusted")
                ? orderService.applyRewardChange(orderId, newCreditReward, eventId)
                : orderService.rejectRewardChange(orderId, newCreditReward, eventId);
        return changed ? Outcome.APPLIED : Outcome.IGNORED;
    }

    private boolean isLatestRewardChange(OutboxEvent command) {
        return outboxEventRepository.findByAggregateIdOrderByAggregateVersionAsc(command.getAggregateId()).stream()
                .filter(event -> event.getEventType().equals("OrderRewardChangeRequested"))
                .reduce((first, second) -> second)
                .map(latest -> latest.getId().equals(command.getId()))
                .orElse(false);
    }

    /**
     * Blueprint "pending-credit timeout": the order stopped waiting before Credit answered. The row
     * lock taken here is held until this handler's transaction commits, so a timeout committing
     * concurrently is either seen here or waits until the normal transition below has run.
     */
    private boolean timedOutWaitingForCredit(UUID orderId) {
        return orderRepository.findByIdForUpdate(orderId)
                .map(Order::timedOutWaitingForCredit)
                .orElse(false);
    }

    /**
     * A valid reservation answer that arrived after the credit timeout: recorded as IGNORED, never
     * reopening the order or entering the DLT. Credit releases a hold it made because the timeout's
     * {@code OrderExpired} follows {@code OrderSubmitted} on the same partition.
     */
    private Outcome lateReservationOutcome(String eventType, UUID orderId, UUID eventId) {
        log.info("outcome=LATE_OUTCOME_IGNORED eventId={} eventType={} orderId={} reason=CREDIT_RESERVATION_TIMEOUT",
                eventId, eventType, orderId);
        return Outcome.IGNORED;
    }

    /** Credit status only; the blueprint says these outcomes never change the lifecycle state. */
    private void recordCreditStatus(UUID orderId, CreditStatus status) {
        Order order = orderRepository.findByIdForUpdate(orderId)
                .orElseThrow(() -> reject("UNKNOWN_OPERATION", "Order " + orderId + " does not exist"));
        order.recordCreditStatus(status);
    }

    private static void requireCommand(OutboxEvent command, String expected, String outcome) {
        requireCommand(command, Set.of(expected), outcome);
    }

    /** As {@link #requireCommand(OutboxEvent, String, String)}, for an outcome that may answer several command types. */
    private static void requireCommand(OutboxEvent command, Set<String> expected, String outcome) {
        if (!expected.contains(command.getEventType())) {
            throw reject("OPERATION_ID_CONFLICT",
                    outcome + " answers operation " + command.getOperationId() + ", which was "
                            + command.getEventType() + ", not " + String.join(" or ", expected.stream().sorted().toList()));
        }
    }

    private Outcome remember(UUID eventId, String eventType, UUID aggregateId, UUID operationId,
            String fingerprint, Outcome outcome) {
        processedEventRepository.save(new ProcessedEvent(eventId, eventType, aggregateId, operationId, fingerprint,
                outcome.name(), OffsetDateTime.now(clock)));
        return outcome;
    }

    private static void validateEnvelope(JsonNode envelope) {
        if (envelope.path("eventVersion").asInt() != OrderEventRecorder.EVENT_VERSION) {
            throw reject("INVALID_EVENT", "Unsupported eventVersion");
        }
        if (!CREDIT_PRODUCER.equals(text(envelope, "producer"))) {
            throw reject("INVALID_EVENT", "Unexpected producer " + text(envelope, "producer"));
        }
        if (!"Order".equals(text(envelope, "aggregateType"))) {
            throw reject("INVALID_EVENT", "Order outcomes must use aggregateType Order");
        }
        requiredUuid(envelope, "correlationId");
        if (!envelope.has("data") || !envelope.get("data").isObject()) {
            throw reject("INVALID_EVENT", "data must be an object");
        }
    }

    private JsonNode parse(String json) {
        try {
            JsonNode node = jsonMapper.readTree(json);
            if (node == null || !node.isObject()) {
                throw reject("INVALID_EVENT", "Event must be a JSON object");
            }
            return node;
        } catch (RuntimeException exception) {
            if (exception instanceof CreditOutcomeRejectedException rejected) {
                throw rejected;
            }
            throw reject("INVALID_EVENT", "Event is not valid JSON");
        }
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

    private static String fingerprint(String json) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(json.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static CreditOutcomeRejectedException reject(String reasonCode, String message) {
        return new CreditOutcomeRejectedException(reasonCode, message);
    }
}
