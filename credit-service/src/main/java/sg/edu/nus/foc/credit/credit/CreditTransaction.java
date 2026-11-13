/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-10
 * Mode: Code generation.
 * Scope: Generated the credit transaction object. 
 * Author review: I reviewed for correctness and edited where needed.
 */

package sg.edu.nus.foc.credit.credit;

import java.time.Instant;

public record CreditTransaction(
        String transactionId,
        String userId,
        CreditTransactionType type,
        long amount,
        CreditDirection direction,
        Instant occurredAt,
        String orderId) {
}
