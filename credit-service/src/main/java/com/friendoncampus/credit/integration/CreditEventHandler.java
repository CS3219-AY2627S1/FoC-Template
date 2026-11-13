package com.friendoncampus.credit.integration;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.friendoncampus.credit.service.CreditAccountNotFoundException;
import com.friendoncampus.credit.service.CreditRequestRejectedException;
import com.friendoncampus.credit.service.CreditReservationNotFoundException;
import com.friendoncampus.credit.service.CreditReservationService;
import com.friendoncampus.credit.service.CreditSettlementService;
import com.friendoncampus.credit.service.IdempotencyConflictException;
import com.friendoncampus.credit.service.InitialCreditAllocationService;
import com.friendoncampus.credit.service.InsufficientCreditsException;
import com.friendoncampus.credit.service.InvalidReservationStateException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

@Service
public class CreditEventHandler {

    private static final Logger LOGGER = LoggerFactory.getLogger(CreditEventHandler.class);
    private static final int EVENT_VERSION = 1;
    private static final String USER_PRODUCER = "user-service";
    private static final String ORDER_PRODUCER = "order-service";
    private static final String USER_AGGREGATE = "User";
    private static final String ORDER_AGGREGATE = "Order";
    private static final String SYSTEM_ACTOR = "{\"type\":\"SYSTEM\"}";
    private static final String CREDIT_RESERVATION_TIMEOUT = "CREDIT_RESERVATION_TIMEOUT";

    private final CreditEventCoordinator coordinator;
    private final InitialCreditAllocationService allocations;
    private final CreditReservationService reservations;
    private final CreditSettlementService settlements;
    private final CreditOutboxService outbox;
    private final ObjectMapper objectMapper;

    public CreditEventHandler(
            CreditEventCoordinator coordinator,
            InitialCreditAllocationService allocations,
            CreditReservationService reservations,
            CreditSettlementService settlements,
            CreditOutboxService outbox,
            ObjectMapper objectMapper) {
        this.coordinator = coordinator;
        this.allocations = allocations;
        this.reservations = reservations;
        this.settlements = settlements;
        this.outbox = outbox;
        this.objectMapper = objectMapper;
    }

    public CreditEventCoordinator.ProcessingOutcome handle(CreditEventEnvelope envelope) {
        ParsedEvent event = parse(envelope);
        return coordinator.process(envelope, () -> dispatch(envelope, event));
    }

    private void dispatch(CreditEventEnvelope envelope, ParsedEvent event) {
        switch (event.type()) {
            case USER_ACTIVATED -> allocate(envelope, event);
            case ORDER_SUBMITTED -> reserve(envelope, event);
            case ORDER_REWARD_CHANGE_REQUESTED -> adjust(envelope, event);
            case ORDER_COMPLETED -> settle(envelope, event);
            case ORDER_CANCELLED -> cancel(envelope, event);
            case ORDER_EXPIRED -> release(envelope, event);
        }
    }

    private void allocate(CreditEventEnvelope envelope, ParsedEvent event) {
        InitialCreditAllocationService.AllocationResult result =
                allocations.allocate(event.operationId(), event.userId());
        Map<String, Object> data = data(event.operationId());
        data.put("userId", result.userId());
        data.put("allocatedAmount", result.allocatedAmount());
        data.put("availableBalance", result.availableBalance());
        enqueueOutcome(envelope, "CreditAccountAllocated", data);
    }

    private void reserve(CreditEventEnvelope envelope, ParsedEvent event) {
        try {
            CreditReservationService.ReservationResult result = reservations.reserve(
                    event.operationId(), event.orderId(), event.userId(), event.amount());
            Map<String, Object> data = orderData(event);
            data.put("reservationId", result.reservationId());
            data.put("amount", result.amount());
            data.put("availableBalance", result.availableBalance());
            data.put("reservedBalance", result.reservedBalance());
            enqueueOutcome(envelope, "CreditReserved", data);
        } catch (CreditRequestRejectedException rejection) {
            enqueueRejection(envelope, event, "CreditReservationRejected", rejection);
        }
    }

    private void adjust(CreditEventEnvelope envelope, ParsedEvent event) {
        try {
            CreditReservationService.ReservationResult result =
                    reservations.adjust(event.operationId(), event.orderId(), event.amount());
            Map<String, Object> data = orderData(event);
            data.put("reservationId", result.reservationId());
            data.put("amount", result.amount());
            data.put("availableBalance", result.availableBalance());
            data.put("reservedBalance", result.reservedBalance());
            enqueueOutcome(envelope, "CreditAdjusted", data);
        } catch (CreditRequestRejectedException rejection) {
            enqueueRejection(envelope, event, "CreditAdjustmentRejected", rejection);
        }
    }

    private void settle(CreditEventEnvelope envelope, ParsedEvent event) {
        CreditSettlementService.SettlementResult result =
                settlements.settle(event.operationId(), event.orderId(), event.courierId());
        Map<String, Object> data = orderData(event);
        data.put("requesterId", result.requesterId());
        data.put("courierId", result.courierId());
        data.put("transferredAmount", result.transferredAmount());
        data.put("requesterAvailableBalance", result.requesterAvailableBalance());
        data.put("courierAvailableBalance", result.courierAvailableBalance());
        enqueueOutcome(envelope, "CreditSettled", data);
    }

    private void cancel(CreditEventEnvelope envelope, ParsedEvent event) {
        if (event.compensationRequired()) {
            compensate(envelope, event);
            return;
        }
        release(envelope, event);
    }

    private void compensate(CreditEventEnvelope envelope, ParsedEvent event) {
        CreditSettlementService.SettlementResult result =
                settlements.compensate(event.operationId(), event.orderId(), event.courierId());
        Map<String, Object> data = orderData(event);
        data.put("requesterId", result.requesterId());
        data.put("courierId", result.courierId());
        data.put("transferredAmount", result.transferredAmount());
        data.put("releasedAmount", result.releasedAmount());
        data.put("requesterAvailableBalance", result.requesterAvailableBalance());
        data.put("courierAvailableBalance", result.courierAvailableBalance());
        enqueueOutcome(envelope, "CourierCompensated", data);
    }

    private void release(CreditEventEnvelope envelope, ParsedEvent event) {
        Optional<CreditReservationService.ReservationResult> released =
                event.type() == EventType.ORDER_EXPIRED && CREDIT_RESERVATION_TIMEOUT.equals(event.reason())
                        ? reservations.releaseForPendingCreditTimeout(event.operationId(), event.orderId())
                        : Optional.of(reservations.release(event.operationId(), event.orderId()));
        if (released.isEmpty()) {
            LOGGER.info(
                    "outcome=NO_RESERVATION_TO_RELEASE eventId={} operationId={} orderId={} correlationId={} reason={}",
                    envelope.eventId(), event.operationId(), event.orderId(), envelope.correlationId(), event.reason());
            return;
        }
        CreditReservationService.ReservationResult result = released.orElseThrow();
        if (event.type() == EventType.ORDER_EXPIRED && CREDIT_RESERVATION_TIMEOUT.equals(event.reason())) {
            LOGGER.info(
                    "outcome=RESERVATION_RELEASED eventId={} operationId={} orderId={} correlationId={} reason={}",
                    envelope.eventId(), event.operationId(), event.orderId(), envelope.correlationId(), event.reason());
        }
        Map<String, Object> data = orderData(event);
        data.put("releasedAmount", result.amount());
        data.put("availableBalance", result.availableBalance());
        data.put("reservedBalance", result.reservedBalance());
        enqueueOutcome(envelope, "CreditReleased", data);
    }

    private void enqueueRejection(
            CreditEventEnvelope envelope,
            ParsedEvent event,
            String eventType,
            CreditRequestRejectedException rejection) {
        Map<String, Object> data = orderData(event);
        data.put("reasonCode", reasonCode(rejection));
        enqueueOutcome(envelope, eventType, data);
    }

    private void enqueueOutcome(CreditEventEnvelope incoming, String eventType, Map<String, Object> data) {
        outbox.enqueue(new CreditEventEnvelope(
                UUID.randomUUID(),
                eventType,
                EVENT_VERSION,
                incoming.aggregateType(),
                incoming.aggregateId(),
                incoming.aggregateVersion(),
                OffsetDateTime.now(ZoneOffset.UTC),
                CreditOutboxService.CREDIT_PRODUCER,
                incoming.correlationId(),
                incoming.eventId(),
                SYSTEM_ACTOR,
                writeJson(data)));
    }

    private ParsedEvent parse(CreditEventEnvelope envelope) {
        if (envelope == null) {
            throw new IllegalArgumentException("Event envelope is required");
        }
        if (envelope.eventVersion() != EVENT_VERSION) {
            throw new IllegalArgumentException("Unsupported event version");
        }
        requireUtc(envelope.occurredAt(), "occurredAt");
        ObjectNode payload = readPayload(envelope.payloadJson());
        return switch (envelope.eventType()) {
            case "UserActivated" -> parseUserActivated(envelope, payload);
            case "OrderSubmitted" -> parseOrderSubmitted(envelope, payload);
            case "OrderRewardChangeRequested" -> parseOrderRewardChange(envelope, payload);
            case "OrderCompleted" -> parseOrderCompleted(envelope, payload);
            case "OrderCancelled" -> parseOrderCancelled(envelope, payload);
            case "OrderExpired" -> parseOrderExpired(envelope, payload);
            default -> throw new IllegalArgumentException("Unsupported credit event type: " + envelope.eventType());
        };
    }

    private ParsedEvent parseUserActivated(CreditEventEnvelope envelope, ObjectNode payload) {
        requireEnvelope(envelope, USER_PRODUCER, USER_AGGREGATE);
        UUID operationId = requiredUuid(payload, "operationId");
        UUID userId = requiredUuid(payload, "userId");
        requireAggregateId(envelope, userId);
        requiredTimestamp(payload, "activatedAt");
        return new ParsedEvent(EventType.USER_ACTIVATED, operationId, userId, null, null, 0, null, false);
    }

    private ParsedEvent parseOrderSubmitted(CreditEventEnvelope envelope, ObjectNode payload) {
        requireEnvelope(envelope, ORDER_PRODUCER, ORDER_AGGREGATE);
        UUID operationId = requiredUuid(payload, "operationId");
        UUID orderId = requiredUuid(payload, "orderId");
        requireAggregateId(envelope, orderId);
        UUID requesterId = requiredUuid(payload, "requesterId");
        int amount = requiredPositiveInteger(payload, "creditReward");
        return new ParsedEvent(EventType.ORDER_SUBMITTED, operationId, requesterId, orderId, null, amount, null, false);
    }

    private ParsedEvent parseOrderRewardChange(CreditEventEnvelope envelope, ObjectNode payload) {
        requireEnvelope(envelope, ORDER_PRODUCER, ORDER_AGGREGATE);
        UUID operationId = requiredUuid(payload, "operationId");
        UUID orderId = requiredUuid(payload, "orderId");
        requireAggregateId(envelope, orderId);
        int amount = requiredPositiveInteger(payload, "newCreditReward");
        return new ParsedEvent(
                EventType.ORDER_REWARD_CHANGE_REQUESTED, operationId, null, orderId, null, amount, null, false);
    }

    private ParsedEvent parseOrderCompleted(CreditEventEnvelope envelope, ObjectNode payload) {
        requireEnvelope(envelope, ORDER_PRODUCER, ORDER_AGGREGATE);
        UUID operationId = requiredUuid(payload, "operationId");
        UUID orderId = requiredUuid(payload, "orderId");
        requireAggregateId(envelope, orderId);
        UUID courierId = requiredUuid(payload, "courierId");
        requiredTimestamp(payload, "completedAt");
        return new ParsedEvent(EventType.ORDER_COMPLETED, operationId, null, orderId, courierId, 0, null, false);
    }

    private ParsedEvent parseOrderCancelled(CreditEventEnvelope envelope, ObjectNode payload) {
        requireEnvelope(envelope, ORDER_PRODUCER, ORDER_AGGREGATE);
        UUID operationId = requiredUuid(payload, "operationId");
        UUID orderId = requiredUuid(payload, "orderId");
        requireAggregateId(envelope, orderId);
        boolean compensationRequired = requiredBoolean(payload, "compensationRequired");
        UUID courierId = optionalUuid(payload, "courierId");
        if (compensationRequired && courierId == null) {
            throw new IllegalArgumentException("courierId is required when compensation is required");
        }
        if (!compensationRequired && courierId != null) {
            throw new IllegalArgumentException("courierId must be null when compensation is not required");
        }
        String reason = requiredText(payload, "reason");
        requiredTimestamp(payload, "cancelledAt");
        return new ParsedEvent(
                EventType.ORDER_CANCELLED,
                operationId,
                null,
                orderId,
                courierId,
                0,
                reason,
                compensationRequired);
    }

    private ParsedEvent parseOrderExpired(CreditEventEnvelope envelope, ObjectNode payload) {
        requireEnvelope(envelope, ORDER_PRODUCER, ORDER_AGGREGATE);
        UUID operationId = requiredUuid(payload, "operationId");
        UUID orderId = requiredUuid(payload, "orderId");
        requireAggregateId(envelope, orderId);
        String reason = requiredText(payload, "reason");
        requiredTimestamp(payload, "expiredAt");
        return new ParsedEvent(EventType.ORDER_EXPIRED, operationId, null, orderId, null, 0, reason, false);
    }

    private ObjectNode readPayload(String payloadJson) {
        try {
            JsonNode payload = objectMapper.readTree(payloadJson);
            if (!(payload instanceof ObjectNode object)) {
                throw new IllegalArgumentException("Event data must be a JSON object");
            }
            return object;
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException("Event data must be valid JSON", exception);
        }
    }

    private String writeJson(Map<String, Object> data) {
        try {
            return objectMapper.writeValueAsString(data);
        } catch (RuntimeException exception) {
            throw new IllegalStateException("Credit outcome could not be serialized", exception);
        }
    }

    private static void requireEnvelope(CreditEventEnvelope envelope, String producer, String aggregateType) {
        if (!producer.equals(envelope.producer())) {
            throw new IllegalArgumentException("Unexpected producer for " + envelope.eventType());
        }
        if (!aggregateType.equals(envelope.aggregateType())) {
            throw new IllegalArgumentException("Unexpected aggregate type for " + envelope.eventType());
        }
    }

    private static void requireAggregateId(CreditEventEnvelope envelope, UUID payloadId) {
        if (!envelope.aggregateId().equals(payloadId)) {
            throw new IllegalArgumentException("Event aggregate ID does not match its data");
        }
    }

    private static UUID requiredUuid(ObjectNode payload, String field) {
        JsonNode value = payload.get(field);
        if (value == null || !value.isString() || value.stringValue().isBlank()) {
            throw new IllegalArgumentException(field + " must be a UUID string");
        }
        try {
            return UUID.fromString(value.stringValue());
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException(field + " must be a UUID string", exception);
        }
    }

    private static UUID optionalUuid(ObjectNode payload, String field) {
        JsonNode value = payload.get(field);
        if (value == null || value.isNull()) {
            return null;
        }
        return requiredUuid(payload, field);
    }

    private static int requiredPositiveInteger(ObjectNode payload, String field) {
        JsonNode value = payload.get(field);
        if (value == null || !value.isIntegralNumber() || !value.canConvertToInt() || value.intValue() <= 0) {
            throw new IllegalArgumentException(field + " must be a positive integer");
        }
        return value.intValue();
    }

    private static boolean requiredBoolean(ObjectNode payload, String field) {
        JsonNode value = payload.get(field);
        if (value == null || !value.isBoolean()) {
            throw new IllegalArgumentException(field + " must be a boolean");
        }
        return value.booleanValue();
    }

    private static String requiredText(ObjectNode payload, String field) {
        JsonNode value = payload.get(field);
        if (value == null || !value.isString() || value.stringValue().isBlank()) {
            throw new IllegalArgumentException(field + " must be non-blank text");
        }
        return value.stringValue();
    }

    private static OffsetDateTime requiredTimestamp(ObjectNode payload, String field) {
        String value = requiredText(payload, field);
        try {
            return requireUtc(OffsetDateTime.parse(value), field);
        } catch (DateTimeParseException exception) {
            throw new IllegalArgumentException(field + " must be an ISO-8601 timestamp", exception);
        }
    }

    private static OffsetDateTime requireUtc(OffsetDateTime value, String field) {
        if (!ZoneOffset.UTC.equals(value.getOffset())) {
            throw new IllegalArgumentException(field + " must use the UTC offset Z");
        }
        return value;
    }

    private static Map<String, Object> data(UUID operationId) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("operationId", operationId);
        return data;
    }

    private static Map<String, Object> orderData(ParsedEvent event) {
        Map<String, Object> data = data(event.operationId());
        data.put("orderId", event.orderId());
        return data;
    }

    private static String reasonCode(CreditRequestRejectedException rejection) {
        if (rejection instanceof InsufficientCreditsException) {
            return "INSUFFICIENT_CREDITS";
        }
        if (rejection instanceof CreditAccountNotFoundException) {
            return "CREDIT_ACCOUNT_NOT_FOUND";
        }
        if (rejection instanceof CreditReservationNotFoundException) {
            return "RESERVATION_NOT_FOUND";
        }
        if (rejection instanceof InvalidReservationStateException) {
            return "INVALID_RESERVATION_STATE";
        }
        if (rejection instanceof IdempotencyConflictException) {
            return "REQUEST_CONFLICT";
        }
        return "REQUEST_CONFLICT";
    }

    private enum EventType {
        USER_ACTIVATED,
        ORDER_SUBMITTED,
        ORDER_REWARD_CHANGE_REQUESTED,
        ORDER_COMPLETED,
        ORDER_CANCELLED,
        ORDER_EXPIRED
    }

    private record ParsedEvent(
            EventType type,
            UUID operationId,
            UUID userId,
            UUID orderId,
            UUID courierId,
            int amount,
            String reason,
            boolean compensationRequired) {
    }
}
