/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-10
 * Mode: Code generation.
 * Scope: Generated the credit transaction page object. 
 * Author review: I reviewed for correctness and edited where needed.
 */

package sg.edu.nus.foc.credit.credit;

import java.util.List;

public record CreditTransactionPage(
        List<CreditTransaction> items,
        int page,
        int size,
        long totalItems,
        int totalPages) {
}
