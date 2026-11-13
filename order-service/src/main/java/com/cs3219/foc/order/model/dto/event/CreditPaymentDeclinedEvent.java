package com.cs3219.foc.order.model.dto.event;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.time.OffsetDateTime;
import java.util.UUID;

public record CreditPaymentDeclinedEvent(
        @NotNull UUID eventId,
        int schemaVersion,
        @NotNull OffsetDateTime occurredAt,
        @NotNull @Valid Payload payload) {
    public static final String TYPE = "CreditPaymentDeclinedEvent";

    public record Payload(
            @NotNull UUID operationId,
            @NotNull UUID errandId,
            @NotNull UUID requesterId,
            @Positive long amount,
            UUID courierId,
            @NotBlank String reason) {}
}
