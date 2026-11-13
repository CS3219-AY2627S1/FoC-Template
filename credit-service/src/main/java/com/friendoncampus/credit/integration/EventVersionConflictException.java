package com.friendoncampus.credit.integration;

import com.friendoncampus.credit.domain.CreditEventStreamVersion;

public class EventVersionConflictException extends RuntimeException {
    public EventVersionConflictException(CreditEventEnvelope envelope, CreditEventStreamVersion stream) {
        super("Conflicting Order event version " + envelope.aggregateVersion() + " for aggregate "
                + envelope.aggregateId() + "; latest event was " + stream.getLatestEventType()
                + " (" + stream.getLatestEventId() + ")");
    }
}
