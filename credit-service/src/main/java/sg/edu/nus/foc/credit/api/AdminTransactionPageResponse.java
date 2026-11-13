/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-14
 * Mode: Code generation and testing assistance.
 * Scope: Generated the paginated system-wide admin transaction response mapping.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.api;

import java.util.List;
import sg.edu.nus.foc.credit.credit.CreditTransactionPage;

public record AdminTransactionPageResponse(
        List<AdminTransactionResponse> items,
        int page,
        int size,
        long totalItems,
        int totalPages) {

    static AdminTransactionPageResponse from(CreditTransactionPage transactions) {
        return new AdminTransactionPageResponse(
                transactions.items().stream().map(AdminTransactionResponse::from).toList(),
                transactions.page(), transactions.size(), transactions.totalItems(),
                transactions.totalPages());
    }
}
