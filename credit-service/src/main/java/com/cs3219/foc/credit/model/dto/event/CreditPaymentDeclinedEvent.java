package com.cs3219.foc.credit.model.dto.event;

import java.time.OffsetDateTime;
import java.util.UUID;

public record CreditPaymentDeclinedEvent(UUID eventId, int schemaVersion, OffsetDateTime occurredAt, Payload payload) {
    public static final String TYPE = "CreditPaymentDeclinedEvent";

    public record Payload(
            UUID operationId, UUID errandId, UUID requesterId, long amount, UUID courierId, String reason) {}
}
