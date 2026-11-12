/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Scope: Implementation and test assistance for category and building administration.
 */
package com.campuscouriers.supplier.exception;

import java.util.List;

public class InactiveReferencesException extends RuntimeException {

    private final List<String> inactiveReferences;

    public InactiveReferencesException(List<String> inactiveReferences) {
        super("The following selected references are not active: "
                + String.join(", ", inactiveReferences));
        this.inactiveReferences = List.copyOf(inactiveReferences);
    }

    public List<String> getInactiveReferences() {
        return inactiveReferences;
    }
}
