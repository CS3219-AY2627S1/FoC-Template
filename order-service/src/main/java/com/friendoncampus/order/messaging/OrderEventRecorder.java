package com.friendoncampus.order.messaging;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.friendoncampus.order.domain.ActorRole;
import com.friendoncampus.order.domain.CreditEffect;
import com.friendoncampus.order.domain.Order;
import com.friendoncampus.order.domain.OrderTransition;
import com.friendoncampus.order.domain.OrderTransitionRecord;
import com.friendoncampus.order.repository.OrderRepository;
import com.friendoncampus.order.repository.OrderTransitionRepository;
import com.friendoncampus.order.repository.OutboxEventRepository;

import tools.jackson.databind.json.JsonMapper;

/**
 * Records every transition in the order's history, and writes an {@code order.events} outbox row
 * for the credit-changing ones, using the envelope and payloads of the shared event communication
 * blueprint ({@code docs/integration/event-communication-blueprint.md}, version 1). Only the five blueprint Order events are published:
 * {@code OrderSubmitted}, {@code OrderRewardChangeRequested}, {@code OrderCancelled},
 * {@code OrderExpired} and {@code OrderCompleted}.
 *
 * <p>When lifecycle events are enabled, every transition also writes one {@code OrderTransitioned}
 * row for {@code order.lifecycle.events}, in the shared N2H contract shape
 * ({@code docs/contracts/n2h-events.schema.json}). Its {@code sourceSequence} is taken in this same
 * transaction, so a rolled-back request takes no number.
 *
 * <p>Callers must already be inside the transaction that changed the order, and must have flushed
 * it so {@link Order#getVersion()} is the post-change version.
 */
@Component
public class OrderEventRecorder {

    public static final String ORDER_EVENTS_TOPIC = "order.events";
    public static final String ORDER_LIFECYCLE_EVENTS_TOPIC = "order.lifecycle.events";
    static final String ORDER_TRANSITIONED = "OrderTransitioned";
    static final int EVENT_VERSION = 1;
    static final String PRODUCER = "order-service";

    private final OrderRepository orderRepository;
    private final OrderTransitionRepository transitionRepository;
    private final OutboxEventRepository outboxEventRepository;
    private final boolean lifecycleEventsEnabled;
    private final JsonMapper jsonMapper = JsonMapper.builder().build();

    public OrderEventRecorder(
            OrderRepository orderRepository,
            OrderTransitionRepository transitionRepository,
            OutboxEventRepository outboxEventRepository,
            @Value("${app.kafka.lifecycle-events.enabled:false}") boolean lifecycleEventsEnabled) {
        this.orderRepository = orderRepository;
        this.transitionRepository = transitionRepository;
        this.outboxEventRepository = outboxEventRepository;
        this.lifecycleEventsEnabled = lifecycleEventsEnabled;
    }

    public void record(Order order, OrderTransition transition) {
        record(order, transition, null);
    }

    /**
     * @param causationId the Credit event that caused this transition, or null for user and
     *     scheduler actions
     */
    public void record(Order order, OrderTransition transition, UUID causationId) {
        long version = order.getVersion();
        transitionRepository.save(OrderTransitionRecord.of(order.getId(), version, transition));
        if (transition.creditEffect() != CreditEffect.NONE) {
            recordCreditEvent(order, transition, version);
        }
        if (lifecycleEventsEnabled) {
            recordLifecycleEvent(order, transition, version, causationId);
        }
    }

    private void recordCreditEvent(Order order, OrderTransition transition, long version) {

        UUID eventId = UUID.randomUUID();
        // Generated once and stored with the event; a publish retry reuses this exact payload.
        UUID operationId = UUID.randomUUID();
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("eventId", eventId);
        envelope.put("eventType", transition.eventType());
        envelope.put("eventVersion", EVENT_VERSION);
        envelope.put("aggregateType", "Order");
        envelope.put("aggregateId", order.getId());
        envelope.put("aggregateVersion", version);
        envelope.put("occurredAt", utc(transition.occurredAt()));
        envelope.put("producer", PRODUCER);
        envelope.put("correlationId", order.getCorrelationId());
        // OrderSubmitted initiates the workflow; later Order events are triggered by a user action
        // or the expiry job rather than by another event, so none has a causing event.
        envelope.put("causationId", null);
        envelope.put("actor", actor(transition));
        envelope.put("data", data(order, transition, operationId));

        outboxEventRepository.save(new OutboxEvent(eventId, order.getId(), version, transition.eventType(),
                ORDER_EVENTS_TOPIC, operationId, jsonMapper.writeValueAsString(envelope),
                transition.occurredAt()));
    }

    private void recordLifecycleEvent(Order order, OrderTransition transition, long version, UUID causationId) {
        long sourceSequence = orderRepository.nextLifecycleSequence(order.getId());
        UUID eventId = UUID.randomUUID();
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("eventId", eventId);
        envelope.put("eventType", ORDER_TRANSITIONED);
        envelope.put("eventVersion", EVENT_VERSION);
        envelope.put("aggregateType", "Order");
        envelope.put("aggregateId", order.getId());
        envelope.put("aggregateVersion", version);
        envelope.put("occurredAt", utc(transition.occurredAt()));
        envelope.put("producer", PRODUCER);
        envelope.put("correlationId", order.getCorrelationId());
        envelope.put("causationId", causationId);
        envelope.put("actor", actor(transition));
        envelope.put("data", lifecycleData(order, transition, sourceSequence));

        // No operationId: a lifecycle fact requests no credit effect.
        outboxEventRepository.save(new OutboxEvent(eventId, order.getId(), version, ORDER_TRANSITIONED,
                ORDER_LIFECYCLE_EVENTS_TOPIC, null, jsonMapper.writeValueAsString(envelope),
                transition.occurredAt()));
    }

    private static Map<String, Object> lifecycleData(Order order, OrderTransition transition, long sourceSequence) {
        // WITHDRAW and cancel-after-accept clear the assignment; the cleared courier is still named so
        // consumers can tell them. Otherwise the order's courier after the change is current.
        boolean clearsCourier = transition.courierId() != null && order.getCourierId() == null;
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("orderId", order.getId());
        data.put("requesterId", order.getRequesterId());
        data.put("previousCourierId", clearsCourier ? transition.courierId() : null);
        data.put("courierId", order.getCourierId());
        data.put("fromState", transition.fromState() == null ? null : transition.fromState().name());
        data.put("toState", transition.toState().name());
        data.put("action", transition.action().name());
        data.put("sourceSequence", sourceSequence);
        // Only approved codes, never free text: the terminal reason when the transition has one.
        data.put("reasonCode", transition.reason() == null ? null : transition.reason().name());
        data.put("snapshot", snapshot(order, transition));
        return data;
    }

    /** The order as it is right after the change, so consumers never need to call Order. */
    private static Map<String, Object> snapshot(Order order, OrderTransition transition) {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("orderId", order.getId());
        snapshot.put("requesterId", order.getRequesterId());
        snapshot.put("courierId", order.getCourierId());
        snapshot.put("status", transition.toState().name());
        snapshot.put("reviewCaseId",order.getReviewCaseId());snapshot.put("reviewResolved",order.isResolvedAfterReview());
        snapshot.put("title", order.getTitle());
        snapshot.put("description", order.getDescription());
        snapshot.put("creditReward", order.getCreditReward());
        snapshot.put("pickupDeadline", utc(order.getPickupDeadline()));
        snapshot.put("pickupLocationId", order.getPickupLocationId());
        snapshot.put("dropoffLocationId", order.getDropoffLocationId());
        snapshot.put("pickupLocationName", blankToNull(order.getPickupLocationName()));
        snapshot.put("dropoffLocationName", blankToNull(order.getDropoffLocationName()));
        return snapshot;
    }

    /** The contract requires a non-empty name or null; older orders may have no stored name. */
    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private static Map<String, Object> actor(OrderTransition transition) {
        Map<String, Object> actor = new LinkedHashMap<>();
        if (transition.actorRole() == ActorRole.SYSTEM) {
            actor.put("type", "SYSTEM");
            return actor;
        }
        actor.put("type", "USER");
        actor.put("userId", transition.actorId());
        actor.put("role", transition.actorRole().name());
        return actor;
    }

    private static Map<String, Object> data(Order order, OrderTransition transition, UUID operationId) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("operationId", operationId);
        data.put("orderId", order.getId());
        switch (transition.eventType()) {
            case "OrderSubmitted" -> {
                data.put("requesterId", order.getRequesterId());
                data.put("creditReward", order.getCreditReward());
            }
            case "OrderRewardChangeRequested" -> data.put("newCreditReward", order.getPendingCreditReward());
            case "OrderCancelled" -> {
                boolean compensationRequired = transition.creditEffect() == CreditEffect.COMPENSATE;
                data.put("courierId", compensationRequired ? transition.courierId() : null);
                data.put("compensationRequired", compensationRequired);
                data.put("reason", transition.reason().name());
                data.put("cancelledAt", utc(transition.occurredAt()));
            }
            case "OrderExpired" -> {
                data.put("reason", transition.reason().name());
                data.put("expiredAt", utc(transition.occurredAt()));
            }
            case "OrderCompleted" -> {
                data.put("courierId", transition.courierId());
                data.put("completedAt", utc(transition.occurredAt()));
            }
            default -> throw new IllegalStateException(
                    "No blueprint payload for credit-changing event " + transition.eventType());
        }
        return data;
    }

    /** UTC ISO-8601 with a {@code Z} offset, at the microsecond precision PostgreSQL stores. */
    static String utc(OffsetDateTime timestamp) {
        return timestamp.withOffsetSameInstant(ZoneOffset.UTC).truncatedTo(ChronoUnit.MICROS).toString();
    }
}
