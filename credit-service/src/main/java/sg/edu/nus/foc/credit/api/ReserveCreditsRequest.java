/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-09-25
 * Mode: Code generation.
 * Scope: Generated the initial HTTP API, validation, ownership enforcement, response mapping, or API types from the team-finalized interface contract.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record ReserveCreditsRequest(
        @NotBlank @Size(max = 128) String requesterId,
        @Positive long amount) {
}
