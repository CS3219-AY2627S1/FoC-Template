package com.cs3219.foc.credit.exception;

import com.cs3219.foc.credit.model.dto.ErrorResponse;
import com.cs3219.foc.credit.model.dto.ErrorResponseWithFieldErrors;
import java.util.Map;
import java.util.TreeMap;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.Errors;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ValidationFailedException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ErrorResponseWithFieldErrors handleValidationFailed(ValidationFailedException exception) {
        var fieldErrors = extractFieldErrors(exception.getValidationErrors());

        return new ErrorResponseWithFieldErrors("VALIDATION_FAILED", exception.getMessage(), fieldErrors);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ErrorResponseWithFieldErrors handleRequestValidation(MethodArgumentNotValidException exception) {
        var fieldErrors = extractFieldErrors(exception.getBindingResult());

        return new ErrorResponseWithFieldErrors("VALIDATION_FAILED", "Validation failed", fieldErrors);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ErrorResponseWithFieldErrors handleUnreadableRequest(HttpMessageNotReadableException exception) {
        return new ErrorResponseWithFieldErrors(
                "INVALID_REQUEST", "Request body is missing or contains invalid fields", Map.of());
    }

    @ExceptionHandler(ReservationConflictException.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    public ErrorResponse handleReservationConflict(ReservationConflictException exception) {
        return new ErrorResponse("RESERVATION_CONFLICT", exception.getMessage());
    }

    @ExceptionHandler(CreditAccountPendingException.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    public ErrorResponse handlePendingAccount(CreditAccountPendingException exception) {
        return new ErrorResponse("CREDIT_ACCOUNT_PENDING", exception.getMessage());
    }

    private static Map<String, String> extractFieldErrors(Errors errors) {
        var fieldErrors = new TreeMap<String, String>();
        errors.getFieldErrors().forEach(error -> fieldErrors.putIfAbsent(error.getField(), error.getDefaultMessage()));
        return fieldErrors;
    }
}
