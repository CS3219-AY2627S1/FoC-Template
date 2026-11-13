package com.cs3219.foc.user.model.dto.event;

import java.time.OffsetDateTime;
import java.util.UUID;

/** Version 1 integration contract; deliberately excludes profile data and credentials. */
public record UserCreatedEvent(UUID eventId, int schemaVersion, OffsetDateTime occurredAt, Payload payload) {
    public static final String TYPE = "UserCreatedEvent";

    public record Payload(UUID userId) {}
}
