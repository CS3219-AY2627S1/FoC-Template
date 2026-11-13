/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-09-25
 * Mode: Code generation.
 * Scope: Generated error types and mappings for the team-finalized API error contract.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.error;

public class InvalidCreditAmountException extends RuntimeException {
    public InvalidCreditAmountException(long amount) {
        super("Credit amount must be a positive whole number; received " + amount + ".");
    }
}
