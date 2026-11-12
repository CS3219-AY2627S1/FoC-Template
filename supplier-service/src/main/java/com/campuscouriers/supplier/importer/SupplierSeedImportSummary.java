/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-01
 * Scope: Generated supporting types for the CSV seed importer.
 */
package com.campuscouriers.supplier.importer;

public record SupplierSeedImportSummary(
        int totalRows,
        int createdSuppliers,
        int skippedSuppliers,
        int createdCategories,
        int createdBuildings
) {
}
