/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), dates: 2026-09-26 to 2026-09-28
 * Scope: Generated initial Supplier Service implementation and tests.
 */

package com.campuscouriers.supplier.exception;
import java.util.UUID;

public class ReferenceNotFoundException extends RuntimeException {

    public ReferenceNotFoundException(String referenceType, UUID id) {
        super(referenceType + " with ID " + id + " was not found");
    }
}
