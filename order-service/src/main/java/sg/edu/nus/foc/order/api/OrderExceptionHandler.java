package sg.edu.nus.foc.order.api;

import java.time.Instant;
import java.util.List;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import sg.edu.nus.foc.order.api.dto.response.ErrorDetailResponse;
import sg.edu.nus.foc.order.api.dto.response.ErrorResponse;
import sg.edu.nus.foc.order.domain.OrderProblem;

@RestControllerAdvice
public class OrderExceptionHandler {

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ErrorResponse> forbidden(
            AccessDeniedException exception,
            HttpServletRequest request) {
        return response(403, "FORBIDDEN", "The required role is missing.", request, List.of());
    }

    @ExceptionHandler(OrderProblem.class)
    public ResponseEntity<ErrorResponse> orderProblem(
            OrderProblem problem,
            HttpServletRequest request) {
        int status = switch (problem.getCode()) {
            case "NOT_FOUND" -> 404;
            case "UNAUTHENTICATED" -> 401;
            case "FORBIDDEN" -> 403;
            case "VALIDATION_ERROR" -> 400;
            case "SERVICE_UNAVAILABLE", "DEPENDENCY_UNAVAILABLE" -> 503;
            default -> 409;
        };

        List<ErrorDetailResponse> details = problem.getDetails().stream()
                .map(detail -> new ErrorDetailResponse(detail.getField(), detail.getMessage()))
                .toList();
        return response(status, problem.getCode(), problem.getMessage(), request, details);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> invalid(
            IllegalArgumentException exception,
            HttpServletRequest request) {
        return response(
                400,
                "VALIDATION_ERROR",
                exception.getMessage(),
                request,
                List.of());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> invalidRequest(
            MethodArgumentNotValidException exception,
            HttpServletRequest request) {
        List<ErrorDetailResponse> details = exception.getBindingResult()
                .getFieldErrors()
                .stream()
                .map(error -> new ErrorDetailResponse(
                        error.getField(),
                        error.getDefaultMessage() == null
                                ? "Invalid value"
                                : error.getDefaultMessage()))
                .toList();
        return response(
                400,
                "VALIDATION_ERROR",
                "Request validation failed.",
                request,
                details);
    }

    @ExceptionHandler({
            HttpMessageNotReadableException.class,
            MethodArgumentTypeMismatchException.class
    })
    public ResponseEntity<ErrorResponse> malformedRequest(
            Exception exception,
            HttpServletRequest request) {
        return response(
                400,
                "VALIDATION_ERROR",
                "Request format is invalid.",
                request,
                List.of());
    }

    private ResponseEntity<ErrorResponse> response(
            int status,
            String error,
            String message,
            HttpServletRequest request,
            List<ErrorDetailResponse> details) {
        ErrorResponse body = new ErrorResponse(
                status,
                error,
                message,
                request.getRequestURI(),
                Instant.now(),
                details);
        return ResponseEntity.status(status).body(body);
    }
}
