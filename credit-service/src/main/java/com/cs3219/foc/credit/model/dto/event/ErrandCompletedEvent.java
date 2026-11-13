package com.cs3219.foc.credit.model.dto.event;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.time.OffsetDateTime;
import java.util.UUID;

public record ErrandCompletedEvent(
        @NotNull UUID eventId,
        int schemaVersion,
        @NotNull OffsetDateTime occurredAt,
        @NotNull @Valid Payload payload) {
    public static final String TYPE = "ErrandCompletedEvent";

    public record Payload(
            @NotNull UUID errandId,
            @NotNull UUID requesterId,
            @Positive long amount,
            @NotNull UUID courierId) {}
}
