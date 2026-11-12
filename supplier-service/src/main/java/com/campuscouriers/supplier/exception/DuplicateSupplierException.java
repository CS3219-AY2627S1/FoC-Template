/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), dates: 2026-09-26 to 2026-09-28
 * Scope: Generated initial Supplier Service implementation and tests.
 */

package com.campuscouriers.supplier.exception;
public class DuplicateSupplierException extends RuntimeException {

    public DuplicateSupplierException(String name) {
        super("A supplier named '" + name + "' already exists at this building");
    }
}
