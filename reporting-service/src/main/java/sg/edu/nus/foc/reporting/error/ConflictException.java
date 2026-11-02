/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-27
 * Mode: Implementation.
 * Scope: Generated the Reporting Service conflict exception used for state and deadline conflicts.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.error;

public class ConflictException extends RuntimeException {
    public ConflictException(String message) { super(message); }
}
