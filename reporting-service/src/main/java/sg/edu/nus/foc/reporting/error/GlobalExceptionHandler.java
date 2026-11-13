/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Implementation.
 * Scope: Generated Reporting Service code for the team-specified reporting, association, storage, security, and administration contracts.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.error;

import java.time.Clock;
import java.util.List;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);
    private final Clock clock;
    public GlobalExceptionHandler(Clock clock) { this.clock = clock; }

    @ExceptionHandler(BadRequestException.class)
    ResponseEntity<ApiError> bad(BadRequestException ex, HttpServletRequest request) {
        ApiError error = body(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", ex.getMessage(), request);
        if (ex.field() != null) error = error.withDetails(List.of(new ApiError.FieldProblem(ex.field(), ex.getMessage())));
        return ResponseEntity.badRequest().body(error);
    }
    @ExceptionHandler({MethodArgumentNotValidException.class, ConstraintViolationException.class,
            HttpMessageNotReadableException.class, MissingServletRequestPartException.class,
            org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class})
    ResponseEntity<ApiError> validation(Exception ex, HttpServletRequest request) {
        List<ApiError.FieldProblem> details = ex instanceof MethodArgumentNotValidException invalid
                ? invalid.getBindingResult().getFieldErrors().stream().map(error -> new ApiError.FieldProblem(error.getField(), error.getDefaultMessage())).toList()
                : List.of();
        return ResponseEntity.badRequest().body(body(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "The request is invalid.", request).withDetails(details));
    }
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<ApiError> tooLarge(MaxUploadSizeExceededException ex, HttpServletRequest request) {
        return ResponseEntity.badRequest().body(body(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Each photo must be 5 MiB or smaller.", request));
    }
    @ExceptionHandler(NotFoundException.class)
    ResponseEntity<ApiError> notFound(NotFoundException ex, HttpServletRequest request) {
        return ResponseEntity.status(404).body(body(HttpStatus.NOT_FOUND, "NOT_FOUND", ex.getMessage(), request));
    }
    @ExceptionHandler(ConflictException.class)
    ResponseEntity<ApiError> conflict(ConflictException ex, HttpServletRequest request) {
        return ResponseEntity.status(409).body(body(HttpStatus.CONFLICT, "CONFLICT", ex.getMessage(), request));
    }
    @ExceptionHandler(ForbiddenException.class)
    ResponseEntity<ApiError> forbidden(ForbiddenException ex, HttpServletRequest request) {
        return ResponseEntity.status(403).body(body(HttpStatus.FORBIDDEN, "FORBIDDEN", ex.getMessage(), request));
    }
    @ExceptionHandler(DependencyUnavailableException.class)
    ResponseEntity<ApiError> unavailable(DependencyUnavailableException ex, HttpServletRequest request) {
        return ResponseEntity.status(503).body(body(HttpStatus.SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", ex.getMessage(), request));
    }
    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<ApiError> forbidden(AccessDeniedException ex, HttpServletRequest request) {
        return ResponseEntity.status(403).body(body(HttpStatus.FORBIDDEN, "FORBIDDEN", "You do not have permission to access this resource.", request));
    }
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<ApiError> method(HttpRequestMethodNotSupportedException ex, HttpServletRequest request) {
        return ResponseEntity.status(405).body(body(HttpStatus.METHOD_NOT_ALLOWED, "METHOD_NOT_ALLOWED", "This HTTP method is not supported.", request));
    }
    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<ApiError> route(NoResourceFoundException ex, HttpServletRequest request) {
        return ResponseEntity.status(404).body(body(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found.", request));
    }
    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> unexpected(Exception ex, HttpServletRequest request) {
        log.error("Unhandled Reporting Service request failure", ex);
        return ResponseEntity.status(500).body(body(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "An unexpected error occurred.", request));
    }
    private ApiError body(HttpStatus status, String code, String message, HttpServletRequest request) {
        return ApiError.of(status.value(), code, message, request.getRequestURI(), clock.instant());
    }
}
