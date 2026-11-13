package com.cs3219.foc.supplier.model.dto.event;

import java.time.OffsetDateTime;
import java.util.UUID;

public record SupplierChangedEvent(UUID eventId, OffsetDateTime occurredAt, Payload payload) {
    public static SupplierChangedEvent of(UUID supplierId, SupplierChange change, OffsetDateTime occurredAt) {
        return new SupplierChangedEvent(UUID.randomUUID(), occurredAt, new Payload(supplierId, change));
    }

    public record Payload(UUID supplierId, SupplierChange change) {}
}
