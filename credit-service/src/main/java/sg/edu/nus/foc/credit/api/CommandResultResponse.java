/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-11
 * Mode: Code generation.
 * Scope: Generated the command result response based on the agreed contract.
 * Author review: I reviewed for correctness and edited where needed.
 */

package sg.edu.nus.foc.credit.api;

import sg.edu.nus.foc.credit.credit.CreditCommandOperation;
import sg.edu.nus.foc.credit.credit.CreditCommandOutcome;
import sg.edu.nus.foc.credit.credit.CreditCommandResult;

public record CommandResultResponse(
        String commandId,
        CreditCommandOperation operation,
        String orderId,
        CreditCommandOutcome outcome,
        String code) {

    static CommandResultResponse from(CreditCommandResult result) {
        return new CommandResultResponse(result.commandId(), result.operation(), result.orderId(),
                result.outcome(), result.code());
    }
}
