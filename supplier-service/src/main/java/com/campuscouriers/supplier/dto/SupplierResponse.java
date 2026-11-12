/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), dates: 2026-09-26 to 2026-09-28
 * Scope: Generated initial Supplier Service implementation and tests.
 */

package com.campuscouriers.supplier.dto;
import com.campuscouriers.supplier.entity.Supplier;
import com.campuscouriers.supplier.entity.SupplierStatus;

import java.time.LocalTime;
import java.util.UUID;

public record SupplierResponse(
        UUID id,
        String name,
        ReferenceSummary category,
        ReferenceSummary building,
        String floor,
        String description,
        LocalTime openingTime,
        LocalTime closingTime,
        String imageUrl,
        SupplierStatus status
) {

    public static SupplierResponse from(Supplier supplier) {
        return new SupplierResponse(
                supplier.getId(),
                supplier.getName(),
                new ReferenceSummary(supplier.getCategory().getId(), supplier.getCategory().getName()),
                new ReferenceSummary(supplier.getBuilding().getId(), supplier.getBuilding().getName()),
                supplier.getFloor(),
                supplier.getDescription(),
                supplier.getOpeningTime(),
                supplier.getClosingTime(),
                supplier.getImageUrl(),
                supplier.getStatus()
        );
    }

    public record ReferenceSummary(UUID id, String name) {
    }
}
