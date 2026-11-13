package com.friendoncampus.order.domain;

import org.springframework.http.HttpStatus;

/** Stable error codes returned in the {@code code} property of problem responses. */
public enum OrderErrorCode {
    ORDER_NOT_FOUND(HttpStatus.NOT_FOUND),
    INVALID_STATE_TRANSITION(HttpStatus.CONFLICT),
    CANCELLATION_NOT_ALLOWED(HttpStatus.CONFLICT),
    ORDER_EXPIRED(HttpStatus.CONFLICT),
    ORDER_ALREADY_ACCEPTED(HttpStatus.CONFLICT),
    NOT_ORDER_REQUESTER(HttpStatus.FORBIDDEN),
    NOT_ASSIGNED_COURIER(HttpStatus.FORBIDDEN),
    SELF_ACCEPTANCE_FORBIDDEN(HttpStatus.FORBIDDEN),
    REWARD_ADJUSTMENT_PENDING(HttpStatus.CONFLICT),
    VERSION_CONFLICT(HttpStatus.CONFLICT),
    INVALID_PICKUP_DEADLINE(HttpStatus.BAD_REQUEST),
    INVALID_QUERY(HttpStatus.BAD_REQUEST),
    INVALID_IDEMPOTENCY_KEY(HttpStatus.BAD_REQUEST),
    IDEMPOTENCY_KEY_REUSED(HttpStatus.CONFLICT);

    private final HttpStatus status;

    OrderErrorCode(HttpStatus status) {
        this.status = status;
    }

    public HttpStatus status() {
        return status;
    }
}
