/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-10-09 to 2026-10-15
 * Scope (AI-24): Generated code, configuration and tests for the specified user event, Kafka setup and outbox changes.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.supplier.event;

import com.campuscouriers.supplier.entity.Supplier;
import com.campuscouriers.supplier.entity.SupplierStatus;

import java.time.LocalTime;
import java.util.UUID;

// Full snapshot of a supplier after a change, so consumers can keep their own copy without calling back.
// Separate from the API's SupplierResponse: the field names are the contract with consumers.
public record SupplierEvent(
        UUID supplierId,
        String name,
        UUID categoryId,
        String categoryName,
        UUID buildingId,
        String buildingName,
        String floor,
        String description,
        LocalTime openingTime,
        LocalTime closingTime,
        String imageUrl,
        SupplierStatus status
) {

    // Event types in the outbox, which are also the Kafka topics
    public static final String CREATED = "supplier.created";
    public static final String UPDATED = "supplier.updated";

    public static SupplierEvent from(Supplier supplier) {
        return new SupplierEvent(
                supplier.getId(),
                supplier.getName(),
                supplier.getCategory().getId(),
                supplier.getCategory().getName(),
                supplier.getBuilding().getId(),
                supplier.getBuilding().getName(),
                supplier.getFloor(),
                supplier.getDescription(),
                supplier.getOpeningTime(),
                supplier.getClosingTime(),
                supplier.getImageUrl(),
                supplier.getStatus()
        );
    }

}
