package com.friendoncampus.order.service;

import com.friendoncampus.order.domain.OrderErrorCode;

/** An {@code Idempotency-Key} is malformed, or was already used with a different create request. */
public class IdempotencyKeyException extends RuntimeException {

    private final OrderErrorCode code;

    public IdempotencyKeyException(OrderErrorCode code, String message) {
        super(message);
        this.code = code;
    }

    public OrderErrorCode getCode() {
        return code;
    }
}
