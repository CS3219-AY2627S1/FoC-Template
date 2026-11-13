/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-08
 * Mode: Code generation.
 * Scope: Generated the contract to handle the order service pub/sub events based on the provided requirements contract.
 * Author review: I reviewed for correctness and edited where needed.
 */

package sg.edu.nus.foc.credit.messaging;

import java.time.Instant;

public record OrderEventMessage(
        String eventId,
        String eventType,
        String orderId,
        String orderStatus,
        long creditAmount,
        Instant occurredAt,
        String courierId) {
}
