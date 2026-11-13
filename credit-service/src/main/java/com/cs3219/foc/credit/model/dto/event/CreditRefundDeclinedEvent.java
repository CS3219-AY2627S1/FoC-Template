package com.cs3219.foc.credit.model.dto.event;

import java.time.OffsetDateTime;
import java.util.UUID;

public record CreditRefundDeclinedEvent(UUID eventId, int schemaVersion, OffsetDateTime occurredAt, Payload payload) {
    public static final String TYPE = "CreditRefundDeclinedEvent";

    public record Payload(UUID operationId, UUID errandId, UUID requesterId, long amount, String reason) {}
}
