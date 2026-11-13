package com.friendoncampus.order.web.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

import com.friendoncampus.order.domain.ActorRole;
import com.friendoncampus.order.domain.OrderAction;
import com.friendoncampus.order.domain.OrderState;
import com.friendoncampus.order.domain.OrderTransitionRecord;
import com.friendoncampus.order.domain.TerminalReason;

public record OrderTransitionResponse(
        OrderAction action,
        OrderState fromState,
        OrderState toState,
        ActorRole actorRole,
        UUID actorId,
        UUID courierId,
        TerminalReason reason,
        long orderVersion,
        OffsetDateTime occurredAt) {

    public static OrderTransitionResponse from(OrderTransitionRecord record) {
        return new OrderTransitionResponse(
                record.getAction(),
                record.getFromState(),
                record.getToState(),
                record.getActorRole(),
                record.getActorId(),
                record.getCourierId(),
                record.getReason(),
                record.getOrderVersion(),
                record.getOccurredAt());
    }
}
