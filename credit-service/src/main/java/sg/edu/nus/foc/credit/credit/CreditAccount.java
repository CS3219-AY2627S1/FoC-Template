/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-09-25
 * Mode: Code generation.
 * Scope: Generated Java representations of the team-finalized domain, persistence, and data contracts.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.credit;

import java.time.Instant;

public record CreditAccount(
        String userId,
        long totalBalance,
        long reservedBalance,
        Instant createdAt,
        Instant updatedAt) {

    public long usableBalance() {
        return totalBalance - reservedBalance;
    }
}
