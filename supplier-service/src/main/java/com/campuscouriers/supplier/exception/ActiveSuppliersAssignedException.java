/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Scope: Implementation and test assistance for category and building administration.
 */
package com.campuscouriers.supplier.exception;

public class ActiveSuppliersAssignedException extends RuntimeException {

    public ActiveSuppliersAssignedException(String resourceType) {
        super(resourceType + " cannot be deactivated while active suppliers are assigned to it");
    }
}
