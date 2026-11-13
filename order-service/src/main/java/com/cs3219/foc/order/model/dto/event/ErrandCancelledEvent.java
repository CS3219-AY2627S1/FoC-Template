package com.cs3219.foc.order.model.dto.event;

import java.time.OffsetDateTime;
import java.util.UUID;

public record ErrandCancelledEvent(UUID eventId, int schemaVersion, OffsetDateTime occurredAt, Payload payload) {
    public static final String TYPE = "ErrandCancelledEvent";

    public record Payload(UUID errandId, UUID requesterId, long amount) {}
}
