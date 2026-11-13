package com.cs3219.foc.credit.model.dto.event;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.time.OffsetDateTime;
import java.util.UUID;

public record UserCreatedEvent(
        @NotNull UUID eventId,
        int schemaVersion,
        @NotNull OffsetDateTime occurredAt,
        @NotNull @Valid Payload payload) {
    public static final String TYPE = "UserCreatedEvent";

    public record Payload(@NotNull UUID userId) {}
}
