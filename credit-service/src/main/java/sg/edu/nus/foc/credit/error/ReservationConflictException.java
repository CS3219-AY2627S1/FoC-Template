/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-09-25
 * Mode: Code generation.
 * Scope: Generated error types and mappings for the team-finalized API error contract.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.error;

public class ReservationConflictException extends RuntimeException {
    public ReservationConflictException(String orderId) {
        super("Order " + orderId + " already has a reservation with different data.");
    }
}
