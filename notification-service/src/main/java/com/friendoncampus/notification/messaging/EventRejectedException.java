package com.friendoncampus.notification.messaging;

/**
 * A consumed event broke the blueprint contract (bad envelope, missing field, eventId reused with
 * different content). Nothing is stored, so it can be inspected and replayed from the DLT; retrying
 * it unchanged would fail again.
 */
public class EventRejectedException extends RuntimeException {

    private final String reasonCode;

    public EventRejectedException(String reasonCode, String message) {
        super(message);
        this.reasonCode = reasonCode;
    }

    public String getReasonCode() {
        return reasonCode;
    }
}
