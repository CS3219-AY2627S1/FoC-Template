/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-27
 * Mode: Code generation and implementation assistance.
 * Scope: Generated the Credit compensation workflow implementation from the approved cross-service contract.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.credit.messaging;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record CreditCompensationRequest(
        String eventId,
        String commandId,
        String operation,
        String orderId,
        String actorId,
        long generation,
        Long amount) {
}
