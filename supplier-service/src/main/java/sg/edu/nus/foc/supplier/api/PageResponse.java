package sg.edu.nus.foc.supplier.api;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Standard paginated list (AGENTS.md section 6).
 *
 * @param message only present for an empty result, which is not an error (F4.4)
 */
public record PageResponse<T>(
        List<T> items,
        int page,
        int size,
        long totalItems,
        int totalPages,
        @JsonInclude(JsonInclude.Include.NON_NULL) String message) {
}
