/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-09-25
 * Mode: Code generation.
 * Scope: Generated error types and mappings for the team-finalized API error contract.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.error;

public class InsufficientCreditsException extends RuntimeException {

    private final long usableBalance;
    private final long requestedAmount;

    public InsufficientCreditsException(long usableBalance, long requestedAmount) {
        super("The requester has " + usableBalance + " usable credits but the order requires "
                + requestedAmount + ".");
        this.usableBalance = usableBalance;
        this.requestedAmount = requestedAmount;
    }

    public long usableBalance() {
        return usableBalance;
    }

    public long requestedAmount() {
        return requestedAmount;
    }
}
