package com.friendoncampus.order.domain;

/** A lifecycle action was rejected; the order is left unchanged. */
public class OrderTransitionException extends RuntimeException {

    private final OrderErrorCode code;
    private final OrderState currentState;

    public OrderTransitionException(OrderErrorCode code, OrderState currentState, String message) {
        super(message);
        this.code = code;
        this.currentState = currentState;
    }

    public OrderErrorCode getCode() {
        return code;
    }

    public OrderState getCurrentState() {
        return currentState;
    }
}
