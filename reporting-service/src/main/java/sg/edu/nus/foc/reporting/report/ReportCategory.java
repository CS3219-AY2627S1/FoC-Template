/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Implementation.
 * Scope: Generated Reporting Service code for the team-specified reporting, association, storage, security, and administration contracts.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.report;

public enum ReportCategory {
    ORDER, ERRAND, COURIER, CREDITS, GENERAL;
    public boolean requiresOrder() { return this == ORDER || this == ERRAND || this == COURIER; }
}
