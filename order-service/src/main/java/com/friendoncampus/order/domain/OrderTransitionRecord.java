package com.friendoncampus.order.domain;

import java.time.OffsetDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** One row of an order's transition history ({@code order_transitions}); immutable once stored. */
@Entity
@Table(name = "order_transitions")
public class OrderTransitionRecord {

    @Id
    private UUID id;

    @Column(name = "order_id", nullable = false)
    private UUID orderId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private OrderAction action;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_state", length = 32)
    private OrderState fromState;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_state", nullable = false, length = 32)
    private OrderState toState;

    @Column(name = "actor_id")
    private UUID actorId;

    @Enumerated(EnumType.STRING)
    @Column(name = "actor_role", nullable = false, length = 16)
    private ActorRole actorRole;

    @Column(name = "courier_id")
    private UUID courierId;

    @Enumerated(EnumType.STRING)
    @Column(length = 64)
    private TerminalReason reason;

    @Column(name = "order_version", nullable = false)
    private long orderVersion;

    @Column(name = "occurred_at", nullable = false)
    private OffsetDateTime occurredAt;

    protected OrderTransitionRecord() {
    }

    public static OrderTransitionRecord of(UUID orderId, long orderVersion, OrderTransition transition) {
        OrderTransitionRecord record = new OrderTransitionRecord();
        record.id = UUID.randomUUID();
        record.orderId = orderId;
        record.action = transition.action();
        record.fromState = transition.fromState();
        record.toState = transition.toState();
        record.actorId = transition.actorId();
        record.actorRole = transition.actorRole();
        record.courierId = transition.courierId();
        record.reason = transition.reason();
        record.orderVersion = orderVersion;
        record.occurredAt = transition.occurredAt();
        return record;
    }

    public UUID getId() {
        return id;
    }

    public UUID getOrderId() {
        return orderId;
    }

    public OrderAction getAction() {
        return action;
    }

    public OrderState getFromState() {
        return fromState;
    }

    public OrderState getToState() {
        return toState;
    }

    public UUID getActorId() {
        return actorId;
    }

    public ActorRole getActorRole() {
        return actorRole;
    }

    public UUID getCourierId() {
        return courierId;
    }

    public TerminalReason getReason() {
        return reason;
    }

    public long getOrderVersion() {
        return orderVersion;
    }

    public OffsetDateTime getOccurredAt() {
        return occurredAt;
    }
}
