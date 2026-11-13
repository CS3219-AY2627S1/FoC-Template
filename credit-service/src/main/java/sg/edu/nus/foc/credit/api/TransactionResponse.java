/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-10
 * Mode: Code generation.
 * Scope: Generated the credit transaction response object. 
 * Author review: I reviewed for correctness and edited where needed.
 */

package sg.edu.nus.foc.credit.api;

import java.time.Instant;
import sg.edu.nus.foc.credit.credit.CreditDirection;
import sg.edu.nus.foc.credit.credit.CreditTransaction;
import sg.edu.nus.foc.credit.credit.CreditTransactionType;

public record TransactionResponse(
        String transactionId,
        CreditTransactionType type,
        long amount,
        CreditDirection direction,
        Instant occurredAt,
        String orderId) {

    static TransactionResponse from(CreditTransaction transaction) {
        return new TransactionResponse(
                transaction.transactionId(), transaction.type(), transaction.amount(),
                transaction.direction(), transaction.occurredAt(), transaction.orderId());
    }
}
