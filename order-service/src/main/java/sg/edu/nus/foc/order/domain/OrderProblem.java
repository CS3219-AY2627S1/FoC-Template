package sg.edu.nus.foc.order.domain;

import java.util.List;
import lombok.Getter;
import lombok.Value;

@Getter
public class OrderProblem extends RuntimeException {
    @Value
    public static class Detail {
        String field;
        String message;
    }

    private final String code;
    private final List<Detail> details;

    public OrderProblem(String code, String message) {
        this(code, message, List.of());
    }

    public OrderProblem(String code, String message, List<Detail> details) {
        super(message);
        this.code = code;
        this.details = List.copyOf(details);
    }

    public static OrderProblem conflict(String message) {
        return new OrderProblem("CONFLICT", message);
    }

    public static OrderProblem forbidden(String message) {
        return new OrderProblem("FORBIDDEN", message);
    }

    public static OrderProblem notFound(String message) {
        return new OrderProblem("NOT_FOUND", message);
    }
}
