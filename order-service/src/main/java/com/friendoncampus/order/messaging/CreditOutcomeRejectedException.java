package com.friendoncampus.order.messaging;

/**
 * A {@code credit.events} event broke the blueprint contract (bad envelope, unknown operation,
 * eventId reused with different content). Nothing is stored, so it can be inspected and replayed
 * from the DLT; retrying it unchanged would fail again.
 */
public class CreditOutcomeRejectedException extends RuntimeException {

    private final String reasonCode;

    public CreditOutcomeRejectedException(String reasonCode, String message) {
        super(message);
        this.reasonCode = reasonCode;
    }

    public String getReasonCode() {
        return reasonCode;
    }
}
