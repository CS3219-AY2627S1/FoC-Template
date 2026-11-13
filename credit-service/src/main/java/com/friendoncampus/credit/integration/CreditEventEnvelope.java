package com.friendoncampus.credit.integration;

import java.time.OffsetDateTime;
import java.util.UUID;

public record CreditEventEnvelope(
        UUID eventId,
        String eventType,
        int eventVersion,
        String aggregateType,
        UUID aggregateId,
        long aggregateVersion,
        OffsetDateTime occurredAt,
        String producer,
        UUID correlationId,
        UUID causationId,
        String actorJson,
        String payloadJson) {

    public CreditEventEnvelope {
        requireIdentifier(eventId, "Event ID");
        requireText(eventType, "Event type", 80);
        if (eventVersion <= 0) {
            throw new IllegalArgumentException("Event version must be positive");
        }
        requireText(aggregateType, "Aggregate type", 64);
        requireIdentifier(aggregateId, "Aggregate ID");
        if (aggregateVersion < 0) {
            throw new IllegalArgumentException("Aggregate version cannot be negative");
        }
        if (occurredAt == null) {
            throw new IllegalArgumentException("Occurred-at timestamp is required");
        }
        requireText(producer, "Producer", 64);
        requireIdentifier(correlationId, "Correlation ID");
        requireText(actorJson, "Event actor", Integer.MAX_VALUE);
        requireText(payloadJson, "Event payload", Integer.MAX_VALUE);
    }

    private static void requireIdentifier(UUID value, String label) {
        if (value == null) {
            throw new IllegalArgumentException(label + " is required");
        }
    }

    private static void requireText(String value, String label, int maximumLength) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(label + " is required");
        }
        if (value.length() > maximumLength) {
            throw new IllegalArgumentException(label + " exceeds its maximum length");
        }
    }
}
