package com.friendoncampus.order.service;

import java.util.Collections;
import java.util.EnumSet;
import java.util.Locale;
import java.util.Set;

import com.friendoncampus.order.domain.OrderState;

/**
 * Which of the caller's own orders a "my errands" list returns: {@code status=past} (the default,
 * finished orders) or {@code status=active} (still in progress), optionally narrowed to one
 * {@code state} that the chosen list contains. RESERVATION_FAILED is never listed: such an errand
 * was not posted.
 */
public record MyOrdersFilter(Status status, OrderState state) {

    public enum Status {
        REVIEW,
        ACTIVE,
        PAST
    }

    public static final Set<OrderState> REQUESTED_ACTIVE = Collections.unmodifiableSet(EnumSet.of(
            OrderState.PENDING_CREDIT, OrderState.OPEN, OrderState.ACCEPTED, OrderState.PICKED_UP,
            OrderState.DELIVERED));
    public static final Set<OrderState> REQUESTED_PAST = Collections.unmodifiableSet(EnumSet.of(
            OrderState.COMPLETED, OrderState.CANCELLED, OrderState.EXPIRED));
    public static final Set<OrderState> DELIVERED_ACTIVE = Collections.unmodifiableSet(EnumSet.of(
            OrderState.ACCEPTED, OrderState.PICKED_UP, OrderState.DELIVERED));
    public static final Set<OrderState> DELIVERED_PAST = Collections.unmodifiableSet(EnumSet.of(
            OrderState.COMPLETED));

    public static final MyOrdersFilter PAST = new MyOrdersFilter(Status.PAST, null);

    public static MyOrdersFilter from(String status, String state) {
        Status parsedStatus = Status.PAST;
        if (status != null) {
            try {
                parsedStatus = Status.valueOf(status.trim().toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException exception) {
                throw new InvalidOrderQueryException("status must be active, review or past");
            }
        }
        OrderState parsedState = null;
        if (state != null) {
            try {
                parsedState = OrderState.valueOf(state.trim().toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException exception) {
                throw new InvalidOrderQueryException("state is not an order state");
            }
        }
        return new MyOrdersFilter(parsedStatus, parsedState);
    }

    /** The states to list from {@code active}/{@code past}; a {@code state} outside them is rejected. */
    Set<OrderState> states(Set<OrderState> active, Set<OrderState> past) {
        Set<OrderState> listed = status == Status.REVIEW ? EnumSet.allOf(OrderState.class) : status == Status.ACTIVE ? active : past;
        if (state == null) {
            return listed;
        }
        if (!listed.contains(state)) {
            throw new InvalidOrderQueryException(
                    "state must be one of " + listed + " for status=" + status.name().toLowerCase(Locale.ROOT));
        }
        return EnumSet.of(state);
    }
}
