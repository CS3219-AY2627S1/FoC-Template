/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-01
 * Scope: Generated supporting types for the CSV seed importer.
 */
package com.campuscouriers.supplier.importer;

import java.time.LocalTime;

public record SupplierSeedRow(
        long rowNumber,
        String name,
        String categoryName,
        String buildingName,
        String floor,
        String description,
        LocalTime openingTime,
        LocalTime closingTime,
        String imageUrl
) {
}
