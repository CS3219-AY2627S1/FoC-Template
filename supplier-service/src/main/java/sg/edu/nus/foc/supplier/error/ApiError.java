package sg.edu.nus.foc.supplier.error;

import java.time.Instant;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;

/** The error envelope shared by all FoC services (AGENTS.md section 6). */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public record ApiError(
        int status,
        String error,
        String message,
        String path,
        Instant timestamp,
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
