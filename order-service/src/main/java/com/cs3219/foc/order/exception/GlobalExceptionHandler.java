package com.cs3219.foc.order.exception;

import com.cs3219.foc.order.model.dto.ErrorResponse;
import com.cs3219.foc.order.model.dto.ErrorResponseWithFieldErrors;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import java.util.TreeMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.Errors;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClientException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ErrandAiException.class)
    ResponseEntity<ErrorResponse> ai(ErrandAiException e) {
        return ResponseEntity.status(e.getStatus()).body(new ErrorResponse(e.getCode(), e.getMessage()));
    }

    @ExceptionHandler(OrderCreationAttemptException.class)
    ResponseEntity<ErrorResponse> creationAttempt(OrderCreationAttemptException e) {
        log.error("Order creation attempt failed errandId={}", e.getErrandId(), e.getCause());
        boolean upstream = e.getCause() instanceof RestClientException;
        return ResponseEntity.status(upstream ? HttpStatus.BAD_GATEWAY : HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ErrorResponse(
                        upstream ? "ORDER_CREATION_UNCONFIRMED" : "ORDER_CREATION_ERROR",
                        upstream ? "Creation result is not confirmed" : "Unable to finalize order creation",
                        e.getErrandId()));
    }

    @ExceptionHandler(CreditAccountPendingException.class)
    ResponseEntity<ErrorResponse> accountPending(CreditAccountPendingException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(new ErrorResponse("CREDIT_ACCOUNT_PENDING", e.getMessage()));
    }

    @ExceptionHandler(DeliveryPhotoException.class)
    ResponseEntity<ErrorResponse> deliveryPhoto(DeliveryPhotoException e) {
        if (e.getStatus().is5xxServerError()) log.error("Delivery photo failed", e);
        return ResponseEntity.status(e.getStatus()).body(new ErrorResponse("DELIVERY_PHOTO_INVALID", e.getMessage()));
    }

    /** One handler for every upload (Spring allows only one): AI voice recordings, delivery photos, chat files. */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<ErrorResponse> uploadTooLarge(HttpServletRequest request) {
        if (request.getRequestURI().endsWith("/orders/ai/transcriptions")) {
            return ResponseEntity.status(HttpStatus.CONTENT_TOO_LARGE)
                    .body(new ErrorResponse("AI_AUDIO_TOO_LARGE", "Recording exceeds the audio size limit."));
        }
        return ResponseEntity.status(HttpStatus.CONTENT_TOO_LARGE)
                .body(new ErrorResponse(
                        "DELIVERY_PHOTO_INVALID", "The file is too large: photos up to 5 MB, videos up to 20 MB"));
    }

    @ExceptionHandler(MissingServletRequestPartException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    ErrorResponseWithFieldErrors missingPart(MissingServletRequestPartException e) {
        return new ErrorResponseWithFieldErrors(
                "VALIDATION_FAILED", "Add at least one delivery photo", Map.of(e.getRequestPartName(), "Required"));
    }

    @ExceptionHandler(OrderNotFoundException.class)
    ResponseEntity<ErrorResponse> notFound(OrderNotFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse("ORDER_NOT_FOUND", e.getMessage()));
    }

    @ExceptionHandler(OrderConflictException.class)
    ResponseEntity<ErrorResponse> conflict(OrderConflictException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(new ErrorResponse("ORDER_CONFLICT", e.getMessage()));
    }

    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<ErrorResponse> forbidden(AccessDeniedException e) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(new ErrorResponse("FORBIDDEN", "Access denied"));
    }

    @ExceptionHandler(AuthenticationException.class)
    ResponseEntity<ErrorResponse> unauthenticated(AuthenticationException e) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(new ErrorResponse("UNAUTHENTICATED", "Authentication required"));
    }

    @ExceptionHandler(ValidationFailedException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    ErrorResponseWithFieldErrors handleValidationFailed(ValidationFailedException exception) {
        var fieldErrors = extractFieldErrors(exception.getValidationErrors());

        return new ErrorResponseWithFieldErrors("VALIDATION_FAILED", exception.getMessage(), fieldErrors);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    ErrorResponseWithFieldErrors handleRequestValidation(MethodArgumentNotValidException exception) {
        var fieldErrors = extractFieldErrors(exception.getBindingResult());

        return new ErrorResponseWithFieldErrors("VALIDATION_FAILED", "Validation failed", fieldErrors);
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

    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<ErrorResponse> status(ResponseStatusException e) {
        return ResponseEntity.status(e.getStatusCode()).body(new ErrorResponse("ORDER_REQUEST_FAILED", e.getReason()));
    }

    @ExceptionHandler(RestClientException.class)
    ResponseEntity<ErrorResponse> upstream(RestClientException e) {
        log.error("Order upstream request failed", e);
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                .body(new ErrorResponse("UPSTREAM_ERROR", "Unable to complete the service request"));
    }

    private static Map<String, String> extractFieldErrors(Errors errors) {
        var fieldErrors = new TreeMap<String, String>();
        errors.getFieldErrors().forEach(error -> fieldErrors.putIfAbsent(error.getField(), error.getDefaultMessage()));
        return fieldErrors;
    }
}
