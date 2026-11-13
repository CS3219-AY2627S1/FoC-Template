/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-09-25
 * Mode: Code generation.
 * Scope: Generated error types and mappings for the team-finalized API error contract.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.error;

import java.time.Instant;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_EMPTY)
public record ApiError(int status, String error, String message, String path, Instant timestamp,
                       List<FieldProblem> details) {

    public record FieldProblem(String field, String message) {
    }

    public static ApiError of(ErrorCode code, String message, String path, Instant timestamp) {
        return new ApiError(code.status().value(), code.name(), message, path, timestamp, List.of());
    }

    public ApiError withDetails(List<FieldProblem> problems) {
        return new ApiError(status, error, message, path, timestamp, List.copyOf(problems));
    }
}
