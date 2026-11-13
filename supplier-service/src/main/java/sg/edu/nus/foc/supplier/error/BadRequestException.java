package sg.edu.nus.foc.supplier.error;

import java.util.List;

/** A request that is well-formed JSON but semantically invalid (e.g. conflicting query parameters). */
public class BadRequestException extends RuntimeException {

    private final List<ApiError.FieldProblem> problems;

    public BadRequestException(String field, String message) {
        super(message);
        this.problems = List.of(new ApiError.FieldProblem(field, message));
    }

    public List<ApiError.FieldProblem> problems() {
        return problems;
    }
}
