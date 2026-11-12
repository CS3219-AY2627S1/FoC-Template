/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), dates: 2026-09-26 to 2026-09-28
 * Scope: Generated initial Supplier Service implementation and tests.
 */

package com.campuscouriers.supplier.dto;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalTime;
import java.util.UUID;

public record UpdateSupplierRequest(
        @NotBlank(message = "Supplier name is required")
        @Size(max = 60, message = "Supplier name must not exceed 60 characters")
        String name,

        @NotNull(message = "Category ID is required")
        UUID categoryId,

        @NotNull(message = "Building ID is required")
        UUID buildingId,

        @Size(max = 20, message = "Floor must not exceed 20 characters")
        String floor,

        @Size(max = 500, message = "Description must not exceed 500 characters")
        String description,

        LocalTime openingTime,
        LocalTime closingTime,

        @Size(max = 500, message = "Image URL must not exceed 500 characters")
        String imageUrl
) {

    @AssertTrue(message = "Opening and closing times must either both be provided or both be omitted")
    public boolean isTimePairComplete() {
        return (openingTime == null) == (closingTime == null);
    }
}
