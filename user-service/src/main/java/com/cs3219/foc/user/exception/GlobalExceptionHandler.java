package com.cs3219.foc.user.exception;

import com.cs3219.foc.user.model.dto.ErrorResponse;
import com.cs3219.foc.user.model.dto.ErrorResponseWithFieldErrors;
import java.util.Map;
import java.util.TreeMap;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.Errors;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(EmailRateLimitException.class)
    ResponseEntity<ErrorResponse> handleEmailRateLimit(EmailRateLimitException exception) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(new ErrorResponse(exception.getMessage()));
    }

    @ExceptionHandler(InvalidEmailTokenException.class)
    ResponseEntity<ErrorResponse> handleInvalidEmailToken(InvalidEmailTokenException exception) {
        return ResponseEntity.badRequest().body(new ErrorResponse(exception.getMessage()));
    }

    @ExceptionHandler(InvalidPasswordResetTokenException.class)
    ResponseEntity<ErrorResponse> handleInvalidPasswordResetToken(InvalidPasswordResetTokenException exception) {
        return ResponseEntity.status(HttpStatus.GONE).body(new ErrorResponse(exception.getMessage()));
    }

    @ExceptionHandler(StorageException.class)
    ResponseEntity<ErrorResponse> handleStorage(StorageException exception) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(new ErrorResponse("Object storage operation failed"));
    }

    @ExceptionHandler(EmailVerificationException.class)
    ResponseEntity<ErrorResponse> handleEmailVerification(EmailVerificationException exception) {
        return ResponseEntity.status(exception.getStatus()).body(new ErrorResponse(exception.getMessage()));
    }

    @ExceptionHandler(InvalidPasswordException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    ErrorResponseWithFieldErrors handleInvalidPassword(InvalidPasswordException exception) {
        return new ErrorResponseWithFieldErrors(
                "VALIDATION_FAILED", "Validation failed", Map.of(exception.getField(), exception.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    ErrorResponseWithFieldErrors handleRequestValidation(MethodArgumentNotValidException exception) {
        var fieldErrors = extractFieldErrors(exception.getBindingResult());

        return new ErrorResponseWithFieldErrors("VALIDATION_FAILED", "Validation failed", fieldErrors);
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    ResponseEntity<ErrorResponseWithFieldErrors> handleParameterValidation(HandlerMethodValidationException exception) {
        var fieldErrors = new TreeMap<String, String>();
        exception.getValueResults().forEach(result -> {
            var field = result.getMethodParameter().getParameterName();
            if (field != null) {
                result.getResolvableErrors()
                        .forEach(error -> fieldErrors.putIfAbsent(field, error.getDefaultMessage()));
            }
        });
        exception.getBeanResults().forEach(errors -> fieldErrors.putAll(extractFieldErrors(errors)));

        return ResponseEntity.status(exception.getStatusCode())
                .body(new ErrorResponseWithFieldErrors("VALIDATION_FAILED", "Validation failed", fieldErrors));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    ErrorResponseWithFieldErrors handleUnreadableRequest(HttpMessageNotReadableException exception) {
        return new ErrorResponseWithFieldErrors(
                "INVALID_REQUEST", "Request body is missing or contains invalid fields", Map.of());
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    ErrorResponseWithFieldErrors handleTypeMismatch(MethodArgumentTypeMismatchException exception) {
        return new ErrorResponseWithFieldErrors(
                "INVALID_REQUEST", "Invalid request fields", Map.of(exception.getName(), "Invalid value"));
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    ErrorResponseWithFieldErrors handleMissingParameter(MissingServletRequestParameterException exception) {
        return new ErrorResponseWithFieldErrors(
                "INVALID_REQUEST", "Invalid request fields", Map.of(exception.getParameterName(), "must be provided"));
    }

    @ExceptionHandler(AvatarException.class)
    ResponseEntity<ErrorResponse> handleAvatar(AvatarException ex) {
        return ResponseEntity.status(ex.getStatus()).body(new ErrorResponse(ex.getMessage()));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<ErrorResponse> handleUploadSize(MaxUploadSizeExceededException ex) {
        return ResponseEntity.status(HttpStatus.CONTENT_TOO_LARGE)
                .body(new ErrorResponse("Upload exceeds the allowed size"));
    }

    @ExceptionHandler(MissingServletRequestPartException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    ErrorResponseWithFieldErrors handleMissingFile(MissingServletRequestPartException exception) {
        return new ErrorResponseWithFieldErrors(
                "INVALID_REQUEST",
                "Image file is required",
                Map.of(exception.getRequestPartName(), "must be provided"));
    }

    @ExceptionHandler(UserNotFoundException.class)
    ResponseEntity<ErrorResponse> handleUserNotFound(UserNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse(ex.getMessage()));
    }

    @ExceptionHandler(EntityAlreadyExistsException.class)
    ResponseEntity<ErrorResponse> handleEntityAlreadyExists(EntityAlreadyExistsException ex) {
        return ResponseEntity.badRequest().body(new ErrorResponse(ex.getMessage()));
    }

    @ExceptionHandler(UnsupportedEmailDomainException.class)
    ResponseEntity<ErrorResponse> handleUnsupportedEmailDomain(UnsupportedEmailDomainException ex) {
        return ResponseEntity.badRequest().body(new ErrorResponse(ex.getMessage()));
    }

    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<ErrorResponse> handleResponseStatusException(ResponseStatusException ex) {
        return ResponseEntity.status(ex.getStatusCode()).body(new ErrorResponse(ex.getReason()));
    }

    @ExceptionHandler(InvalidRefreshTokenException.class)
    ResponseEntity<ErrorResponse> handleInvalidRefreshToken(InvalidRefreshTokenException ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new ErrorResponse(ex.getMessage()));
    }

    private static Map<String, String> extractFieldErrors(Errors errors) {
        var fieldErrors = new TreeMap<String, String>();
        errors.getFieldErrors().forEach(error -> fieldErrors.putIfAbsent(error.getField(), error.getDefaultMessage()));
        return fieldErrors;
    }
}
