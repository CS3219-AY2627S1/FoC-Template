/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Mode: Implementation.
 * Scope: Generated durable report-creation compensation implementation.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.creation;

import jakarta.validation.constraints.*;

public final class CreationCompensationMessages {
    private CreationCompensationMessages() { }

    public record Request(@NotBlank @Pattern(regexp="[0-9a-f-]{36}") String eventId,
                          @NotBlank @Pattern(regexp="[0-9a-f-]{36}") String submissionId,
                          @NotBlank @Size(max=128) String reportId,
                          @NotBlank @Size(max=36) String orderId,
                          @NotBlank @Size(max=128) String reporterId,
                          @Min(2) @Max(2) long generation) { }

    public record Result(String eventId, String compensationId, String submissionId,
                         String reportId, String orderId, String reporterId,
                         long generation, String outcome) { }
}
