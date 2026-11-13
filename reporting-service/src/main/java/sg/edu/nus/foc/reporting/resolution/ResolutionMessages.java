/* AI Assistance Disclosure: OpenAI Codex, 2026-10-29. Order/Report saga contract implementation; human review pending. */
package sg.edu.nus.foc.reporting.resolution;

import jakarta.validation.constraints.*;

public final class ResolutionMessages {
    private ResolutionMessages() { }
    public record Command(@NotBlank @Size(max=128) String commandId,
            @NotBlank @Size(max=128) String reportId, @NotBlank @Size(max=36) String orderId,
            @NotBlank @Size(max=128) String requesterId, @Size(min=1,max=128) String courierId,
            @NotBlank @Size(max=128) String adminId, @Min(1) @Max(1) long generation,
            @NotBlank @Size(max=2000) String reply) { }
    public record Resolution(String commandId, String reportId, String orderId, String requesterId,
            String courierId, String adminId, long generation, String outcome, String code) { }
    public record Compensation(@NotBlank @Pattern(regexp="[0-9a-fA-F-]{36}") String eventId,
            @NotBlank @Size(max=128) String commandId, @NotBlank @Size(max=128) String reportId,
            @NotBlank @Size(max=36) String orderId, @NotBlank @Size(max=128) String requesterId,
            @Size(min=1,max=128) String courierId, @NotBlank @Size(max=128) String adminId,
            @Min(2) @Max(2) long generation) { }
    public record Result(String eventId, String compensationId, String commandId, String reportId,
            String orderId, String requesterId, String courierId, String adminId, long generation,
            String outcome, String code) { }
}
