/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-08
 * Mode: Code generation.
 * Scope: Defined the financial effects represented by Credit Service ledger entries as enums.
 * Author review: I reviewed that it matches the effect I supplied.
 */
package sg.edu.nus.foc.credit.credit;

public enum LedgerEffectType {
    INITIAL_ALLOCATION,
    RESERVATION,
    REFUND,
    PAYMENT_SENT,
    PAYMENT_RECEIVED
}
