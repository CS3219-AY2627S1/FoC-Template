package com.cs3219.foc.supplier.exception;

import com.cs3219.foc.supplier.model.dto.ErrorResponse;
import com.cs3219.foc.supplier.model.dto.ErrorResponseWithFieldErrors;
import java.util.Arrays;
import java.util.Map;
import java.util.TreeMap;
import org.springframework.core.ResolvableType;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.Errors;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(StorageException.class)
    ResponseEntity<ErrorResponse> handleStorage(StorageException exception) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(new ErrorResponse("Object storage operation failed"));
    }

    @ExceptionHandler(SupplierImageException.class)
    ResponseEntity<ErrorResponse> handleSupplierImage(SupplierImageException ex) {
        return ResponseEntity.status(ex.getStatus()).body(new ErrorResponse(ex.getMessage()));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<ErrorResponse> handleUploadTooLarge(MaxUploadSizeExceededException ex) {
        return ResponseEntity.status(HttpStatus.CONTENT_TOO_LARGE)
                .body(new ErrorResponse("Image must not exceed 5 MB"));
    }

    @ExceptionHandler(SupplierNotFoundException.class)
    ResponseEntity<ErrorResponse> handleSupplierNotFound(SupplierNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse(ex.getMessage()));
    }

    /** when it is a bad query || path parameters. eg. an unknown category or id. */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    ErrorResponseWithFieldErrors handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        var message = "Invalid value for " + ex.getName() + ": " + ex.getValue();
        // for the list parameters like ?category=A&category=B, look at element type
        var parameterType = ResolvableType.forMethodParameter(ex.getParameter());
        var type = parameterType.asCollection() == ResolvableType.NONE
                ? parameterType.resolve()
                : parameterType.asCollection().resolveGeneric(0);
        if (type != null && type.isEnum()) {
            message += " (expected one of " + Arrays.toString(type.getEnumConstants()) + ")";
        }
        return new ErrorResponseWithFieldErrors("INVALID_REQUEST", message, Map.of(ex.getName(), message));
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

    @ExceptionHandler(MissingServletRequestPartException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    ErrorResponseWithFieldErrors handleMissingFile(MissingServletRequestPartException exception) {
        return new ErrorResponseWithFieldErrors(
                "INVALID_REQUEST",
                "Image file is required",
                Map.of(exception.getRequestPartName(), "must be provided"));
    }

    private static Map<String, String> extractFieldErrors(Errors errors) {
        var fieldErrors = new TreeMap<String, String>();
        errors.getFieldErrors().forEach(error -> fieldErrors.putIfAbsent(error.getField(), error.getDefaultMessage()));
        return fieldErrors;
    }
}
