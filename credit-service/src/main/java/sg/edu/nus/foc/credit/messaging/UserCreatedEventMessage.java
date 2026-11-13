/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-26
 * Mode: Code generation.
 * Scope: Generated the user created event message record based on the provided requirements contract.
 * Author review: I reviewed for correctness and edited where needed.
 */

package sg.edu.nus.foc.credit.messaging;

import java.time.Instant;
import java.util.UUID;

public record UserCreatedEventMessage(
        UUID eventId,
        String userId,
        String email,
        Instant occurredAt,
        int schemaVersion) {
}
