/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-27
 * Mode: Implementation.
 * Scope: Generated the Reporting Service forbidden exception used for participant authorization failures.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.error;

public class ForbiddenException extends RuntimeException {
    public ForbiddenException(String message) { super(message); }
}
