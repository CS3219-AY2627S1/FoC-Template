package com.friendoncampus.order.domain;

/**
 * Lifecycle states for an order. Values mirror the {@code chk_order_state}
 * database constraint. Order creation only ever produces {@link #PENDING_CREDIT};
 * later transitions are owned by future iterations and the event flow.
 */
public enum OrderState {
    PENDING_CREDIT,
    OPEN,
    ACCEPTED,
    PICKED_UP,
    DELIVERED,
    COMPLETED,
    CANCELLED,
    EXPIRED,
    RESERVATION_FAILED
}
