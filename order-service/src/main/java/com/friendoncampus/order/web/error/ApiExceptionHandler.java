package com.friendoncampus.order.web.error;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import com.friendoncampus.order.domain.OrderErrorCode;
import com.friendoncampus.order.domain.OrderTransitionException;
import com.friendoncampus.order.domain.OrderVersionConflictException;
import com.friendoncampus.order.service.IdempotencyKeyException;
import com.friendoncampus.order.service.InvalidOrderQueryException;
import com.friendoncampus.order.service.OrderNotFoundException;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleInvalidOrderRequest(MethodArgumentNotValidException exception) {
        Map<String, List<String>> errors = new LinkedHashMap<>();
        for (FieldError fieldError : exception.getBindingResult().getFieldErrors()) {
            errors.computeIfAbsent(fieldError.getField(), ignored -> new ArrayList<>())
                    .add(fieldError.getDefaultMessage());
        }

        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_REQUEST,
                "One or more order fields are invalid");
        problem.setTitle("Invalid order request");
        problem.setProperty("errors", errors);
        return problem;
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ProblemDetail handleUnreadableRequest(HttpMessageNotReadableException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_REQUEST,
                "Request body is missing, malformed, or contains an unsupported value");
        problem.setTitle("Invalid order request");
        return problem;
    }

    @ExceptionHandler(MissingRequestHeaderException.class)
    public ProblemDetail handleMissingHeader(MissingRequestHeaderException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_REQUEST,
                "Required header '" + exception.getHeaderName() + "' is missing");
        problem.setTitle("Missing request header");
        return problem;
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ProblemDetail handleTypeMismatch(MethodArgumentTypeMismatchException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_REQUEST,
                "'" + exception.getValue() + "' is not a valid value for '" + exception.getName() + "'");
        problem.setTitle("Invalid request value");
        return problem;
    }

    @ExceptionHandler(OrderNotFoundException.class)
    public ProblemDetail handleOrderNotFound(OrderNotFoundException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.NOT_FOUND,
                exception.getMessage());
        problem.setTitle("Order not found");
        problem.setProperty("code", OrderErrorCode.ORDER_NOT_FOUND.name());
        problem.setProperty("orderId", exception.getOrderId());
        return problem;
    }

    @ExceptionHandler(InvalidOrderQueryException.class)
    public ProblemDetail handleInvalidQuery(InvalidOrderQueryException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                OrderErrorCode.INVALID_QUERY.status(),
                exception.getMessage());
        problem.setTitle("Invalid order query");
        problem.setProperty("code", OrderErrorCode.INVALID_QUERY.name());
        return problem;
    }

    @ExceptionHandler(IdempotencyKeyException.class)
    public ProblemDetail handleIdempotencyKey(IdempotencyKeyException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                exception.getCode().status(),
                exception.getMessage());
        problem.setTitle("Idempotency-Key rejected");
        problem.setProperty("code", exception.getCode().name());
        return problem;
    }

    @ExceptionHandler(OrderTransitionException.class)
    public ProblemDetail handleRejectedTransition(OrderTransitionException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                exception.getCode().status(),
                exception.getMessage());
        problem.setTitle("Order action rejected");
        problem.setProperty("code", exception.getCode().name());
        problem.setProperty("currentState", exception.getCurrentState());
        if (exception instanceof OrderVersionConflictException conflict) {
            problem.setProperty("currentVersion", conflict.getCurrentVersion());
        }
        return problem;
    }
}
