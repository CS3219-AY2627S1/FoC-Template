/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-10
 * Mode: Code generation.
 * Scope: Generated the credit transaction page response object. 
 * Author review: I reviewed for correctness and edited where needed.
 */

package sg.edu.nus.foc.credit.api;

import java.util.List;
import sg.edu.nus.foc.credit.credit.CreditTransactionPage;

public record TransactionPageResponse(
        List<TransactionResponse> items,
        int page,
        int size,
        long totalItems,
        int totalPages) {

    static TransactionPageResponse from(CreditTransactionPage transactions) {
        return new TransactionPageResponse(
                transactions.items().stream().map(TransactionResponse::from).toList(),
                transactions.page(), transactions.size(), transactions.totalItems(),
                transactions.totalPages());
    }
}
