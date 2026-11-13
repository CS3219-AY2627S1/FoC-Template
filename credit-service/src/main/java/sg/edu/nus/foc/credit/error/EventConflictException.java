/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-09-25
 * Mode: Code generation.
 * Scope: Generated error types and mappings for the team-finalized API error contract.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.error;

public class EventConflictException extends RuntimeException {
    public EventConflictException(String eventId) {
        super("Event " + eventId + " was already processed with different data.");
    }
}
