/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-14
 * Mode: Code generation and testing assistance.
 * Scope: Generated the system-wide admin transaction response with owning user identity.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.api;

import java.time.Instant;
import sg.edu.nus.foc.credit.credit.CreditDirection;
import sg.edu.nus.foc.credit.credit.CreditTransaction;
import sg.edu.nus.foc.credit.credit.CreditTransactionType;

public record AdminTransactionResponse(
        String transactionId,
        String userId,
        CreditTransactionType type,
        long amount,
        CreditDirection direction,
        Instant occurredAt,
        String orderId) {

    static AdminTransactionResponse from(CreditTransaction transaction) {
        return new AdminTransactionResponse(
                transaction.transactionId(), transaction.userId(), transaction.type(),
                transaction.amount(), transaction.direction(), transaction.occurredAt(),
                transaction.orderId());
    }
}
