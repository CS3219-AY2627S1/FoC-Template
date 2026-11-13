package com.friendoncampus.order.domain;

/** Outcome of the order's latest credit operation, as reported by Credit Service. */
public enum CreditStatus {
    RESERVED,
    RELEASED,
    SETTLED,
    COMPENSATED
}
