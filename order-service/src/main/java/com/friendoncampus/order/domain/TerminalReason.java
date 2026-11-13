package com.friendoncampus.order.domain;

/** Why an order reached a terminal state; stored in {@code orders.terminal_reason}. */
public enum TerminalReason {
    REQUESTER_CANCELLED_OPEN,
    REQUESTER_CANCELLED_ACCEPTED,
    /** CANCELLED from ACCEPTED at or after the pickup deadline: the courier was late, so no compensation. */
    REQUESTER_CANCELLED_COURIER_LATE,
    PICKUP_DEADLINE_PASSED,
    COURIER_WITHDREW_AFTER_DEADLINE,
    /** RESERVATION_FAILED: Credit's {@code INSUFFICIENT_CREDITS}. */
    INSUFFICIENT_CREDITS,
    /** RESERVATION_FAILED: Credit's {@code CREDIT_ACCOUNT_NOT_FOUND}. */
    CREDIT_ACCOUNT_NOT_FOUND,
    /** RESERVATION_FAILED for any other or missing Credit reason code. */
    CREDIT_RESERVATION_REJECTED,
    /** EXPIRED from PENDING_CREDIT: Credit did not answer the reservation before the credit timeout. */
    CREDIT_RESERVATION_TIMEOUT,
    /** Finished by an administrator after a dispute; credits have an explicit disposition. */
    DISPUTE_RESOLVED;

    /** Maps a {@code CreditReservationRejected} reason code to the terminal reason the client shows. */
    public static TerminalReason forReservationRejection(String reasonCode) {
        if ("INSUFFICIENT_CREDITS".equals(reasonCode)) return INSUFFICIENT_CREDITS;
        if ("CREDIT_ACCOUNT_NOT_FOUND".equals(reasonCode)) return CREDIT_ACCOUNT_NOT_FOUND;
        return CREDIT_RESERVATION_REJECTED;
    }
}
