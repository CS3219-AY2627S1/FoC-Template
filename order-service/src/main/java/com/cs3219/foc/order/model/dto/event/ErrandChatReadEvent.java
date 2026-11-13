package com.cs3219.foc.order.model.dto.event;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

// Someone read an errand's chat up to {@code lastReadAt}, pushed to both people so the sender will see "Seen"
public record ErrandChatReadEvent(UUID eventId, int schemaVersion, OffsetDateTime occurredAt, Payload payload) {
    public static final String TYPE = "ErrandChatReadEvent";

    public record Payload(UUID errandId, UUID readerId, List<UUID> recipientIds, OffsetDateTime lastReadAt) {}
}
