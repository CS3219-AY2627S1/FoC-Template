/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-01
 * Scope: Generated supporting types for the CSV seed importer.
 */
package com.campuscouriers.supplier.importer;

public class SupplierSeedImportException extends RuntimeException {

    private final long rowNumber;

    public SupplierSeedImportException(long rowNumber, String reason) {
        super("CSV row " + rowNumber + ": " + reason);
        this.rowNumber = rowNumber;
    }

    public SupplierSeedImportException(String reason, Throwable cause) {
        super(reason, cause);
        this.rowNumber = 0;
    }

    public long getRowNumber() {
        return rowNumber;
    }
}
