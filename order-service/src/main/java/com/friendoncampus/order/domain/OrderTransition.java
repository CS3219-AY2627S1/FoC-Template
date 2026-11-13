package com.friendoncampus.order.domain;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * The outcome of one successful transition, returned by the {@link Order} domain methods so the
 * service can record history and the matching outbox event in the same transaction.
 *
 * @param courierId courier assigned at, or cleared by, this transition (null when none)
 */
public record OrderTransition(
        OrderAction action,
        OrderState fromState,
        OrderState toState,
        UUID actorId,
        ActorRole actorRole,
        UUID courierId,
        TerminalReason reason,
        CreditEffect creditEffect,
        String eventType,
        OffsetDateTime occurredAt) {
}
