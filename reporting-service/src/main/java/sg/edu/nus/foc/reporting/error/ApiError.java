/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Implementation.
 * Scope: Generated Reporting Service code for the team-specified reporting, association, storage, security, and administration contracts.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.error;

import java.time.Instant;
import java.util.List;
import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_EMPTY)
public record ApiError(int status, String error, String message, String path, Instant timestamp, List<FieldProblem> details) {
    public record FieldProblem(String field, String message) { }
    public static ApiError of(int status, String error, String message, String path, Instant timestamp) {
        return new ApiError(status, error, message, path, timestamp, List.of());
    }
    public ApiError withDetails(List<FieldProblem> value) { return new ApiError(status, error, message, path, timestamp, List.copyOf(value)); }
}
