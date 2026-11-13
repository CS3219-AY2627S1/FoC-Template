package com.friendoncampus.supplier.web.error;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import com.friendoncampus.supplier.service.InvalidSupplierQueryException;
import com.friendoncampus.supplier.service.InvalidSupplierImageException;
import com.friendoncampus.supplier.service.SupplierImageNotFoundException;
import com.friendoncampus.supplier.service.SupplierNotFoundException;
import com.friendoncampus.supplier.service.SupplierUpdateConflictException;
import com.friendoncampus.supplier.service.SupplierVersionLookup;
import com.friendoncampus.supplier.storage.SupplierImageStorageException;

@RestControllerAdvice
public class ApiExceptionHandler {

    private final SupplierVersionLookup supplierVersionLookup;

    public ApiExceptionHandler(SupplierVersionLookup supplierVersionLookup) {
        this.supplierVersionLookup = supplierVersionLookup;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleInvalidSupplierRequest(MethodArgumentNotValidException exception) {
        Map<String, List<String>> errors = new LinkedHashMap<>();
        for (FieldError fieldError : exception.getBindingResult().getFieldErrors()) {
            errors.computeIfAbsent(fieldError.getField(), ignored -> new ArrayList<>())
                    .add(fieldError.getDefaultMessage());
        }

        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_REQUEST,
                "One or more supplier fields are invalid");
        problem.setTitle("Invalid supplier request");
        problem.setProperty("errors", errors);
        return problem;
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ProblemDetail handleUnreadableRequest(HttpMessageNotReadableException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_REQUEST,
                "Request body is missing, malformed, or contains an unsupported value");
        problem.setTitle("Invalid supplier request");
        return problem;
    }

    @ExceptionHandler(SupplierUpdateConflictException.class)
    public ProblemDetail handleSupplierUpdateConflict(
            SupplierUpdateConflictException exception) {
        Long currentVersion = exception.getCurrentVersion();
        if (currentVersion == null) {
            currentVersion = supplierVersionLookup.findCurrentVersion(exception.getSupplierId())
                    .stream()
                    .boxed()
                    .findFirst()
                    .orElse(null);
        }

        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.CONFLICT,
                exception.getMessage());
        problem.setTitle("Supplier update conflict");
        problem.setProperty("supplierId", exception.getSupplierId());
        problem.setProperty("requestedVersion", exception.getRequestedVersion());
        problem.setProperty("currentVersion", currentVersion);
        return problem;
    }

    @ExceptionHandler(InvalidSupplierQueryException.class)
    public ProblemDetail handleInvalidSupplierQuery(InvalidSupplierQueryException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_REQUEST,
                exception.getMessage());
        problem.setTitle("Invalid supplier query");
        return problem;
    }

    @ExceptionHandler({InvalidSupplierImageException.class, MaxUploadSizeExceededException.class})
    public ProblemDetail handleInvalidSupplierImage(Exception exception) {
        String detail = exception instanceof MaxUploadSizeExceededException
                ? "Image must be 5 MB or smaller"
                : exception.getMessage();
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, detail);
        problem.setTitle("Invalid supplier image");
        return problem;
    }

    @ExceptionHandler(SupplierImageNotFoundException.class)
    public ProblemDetail handleSupplierImageNotFound(SupplierImageNotFoundException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.NOT_FOUND,
                exception.getMessage());
        problem.setTitle("Supplier image not found");
        problem.setProperty("supplierId", exception.getSupplierId());
        return problem;
    }

    @ExceptionHandler(SupplierImageStorageException.class)
    public ProblemDetail handleSupplierImageStorage(SupplierImageStorageException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.SERVICE_UNAVAILABLE,
                "The supplier image is temporarily unavailable");
        problem.setTitle("Supplier image unavailable");
        return problem;
    }

    @ExceptionHandler(SupplierNotFoundException.class)
    public ProblemDetail handleSupplierNotFound(SupplierNotFoundException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.NOT_FOUND,
                exception.getMessage());
        problem.setTitle("Supplier not found");
        problem.setProperty("supplierId", exception.getSupplierId());
        return problem;
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ProblemDetail handleTypeMismatch(MethodArgumentTypeMismatchException exception) {
        if (exception.getRequiredType() != UUID.class) {
            throw exception;
        }

        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_REQUEST,
                "Supplier ID '" + exception.getValue() + "' is not a valid UUID");
        problem.setTitle("Invalid supplier ID");
        return problem;
    }
}
