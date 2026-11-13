package sg.edu.nus.foc.supplier.error;

import java.time.Clock;
import java.util.Comparator;
import java.util.List;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import sg.edu.nus.foc.supplier.error.ApiError.FieldProblem;
import sg.edu.nus.foc.supplier.security.RoleLookupException;
import sg.edu.nus.foc.supplier.supplier.DuplicateSupplierException;
import sg.edu.nus.foc.supplier.supplier.SupplierNotFoundException;

/** Maps every failure to the shared {@link ApiError} envelope so clients never see HTML or stack traces. */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    private final Clock clock;

    public GlobalExceptionHandler(Clock clock) {
        this.clock = clock;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> invalidBody(MethodArgumentNotValidException ex, HttpServletRequest request) {
        List<FieldProblem> problems = ex.getBindingResult().getFieldErrors().stream()
                .sorted(Comparator.comparing(FieldError::getField))
                .map(e -> new FieldProblem(e.getField(), e.getDefaultMessage()))
                .toList();
        return respond(ErrorCode.VALIDATION_ERROR, "Request validation failed.", request, problems);
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    ResponseEntity<ApiError> invalidParameters(HandlerMethodValidationException ex, HttpServletRequest request) {
        List<FieldProblem> problems = ex.getParameterValidationResults().stream()
                .flatMap(result -> result.getResolvableErrors().stream()
                        .map(error -> new FieldProblem(result.getMethodParameter().getParameterName(),
                                error.getDefaultMessage())))
                .toList();
        return respond(ErrorCode.VALIDATION_ERROR, "Request validation failed.", request, problems);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    ResponseEntity<ApiError> constraintViolation(ConstraintViolationException ex, HttpServletRequest request) {
        List<FieldProblem> problems = ex.getConstraintViolations().stream()
                .map(v -> {
                    String path = v.getPropertyPath().toString();
                    return new FieldProblem(path.substring(path.lastIndexOf('.') + 1), v.getMessage());
                })
                .sorted(Comparator.comparing(FieldProblem::field))
                .toList();
        return respond(ErrorCode.VALIDATION_ERROR, "Request validation failed.", request, problems);
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ResponseEntity<ApiError> typeMismatch(MethodArgumentTypeMismatchException ex, HttpServletRequest request) {
        return respond(ErrorCode.VALIDATION_ERROR, "Request validation failed.", request,
                List.of(new FieldProblem(ex.getName(), "has an invalid value '" + ex.getValue() + "'")));
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    ResponseEntity<ApiError> missingParameter(MissingServletRequestParameterException ex, HttpServletRequest request) {
        return respond(ErrorCode.VALIDATION_ERROR, "Request validation failed.", request,
                List.of(new FieldProblem(ex.getParameterName(), "is required")));
    }

    @ExceptionHandler(BadRequestException.class)
    ResponseEntity<ApiError> badRequest(BadRequestException ex, HttpServletRequest request) {
        return respond(ErrorCode.VALIDATION_ERROR, "Request validation failed.", request, ex.problems());
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ApiError> unreadable(HttpMessageNotReadableException ex, HttpServletRequest request) {
        return respond(ErrorCode.VALIDATION_ERROR, "Request body is missing or is not valid JSON.", request, List.of());
    }

    @ExceptionHandler(SupplierNotFoundException.class)
    ResponseEntity<ApiError> notFound(SupplierNotFoundException ex, HttpServletRequest request) {
        return respond(ErrorCode.NOT_FOUND, ex.getMessage(), request, List.of());
    }

    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<ApiError> noRoute(NoResourceFoundException ex, HttpServletRequest request) {
        return respond(ErrorCode.NOT_FOUND, "No endpoint handles this path.", request, List.of());
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<ApiError> methodNotAllowed(HttpRequestMethodNotSupportedException ex, HttpServletRequest request) {
        return respond(ErrorCode.METHOD_NOT_ALLOWED, ex.getMessage(), request, List.of());
    }

    @ExceptionHandler(DuplicateSupplierException.class)
    ResponseEntity<ApiError> duplicate(DuplicateSupplierException ex, HttpServletRequest request) {
        return respond(ErrorCode.CONFLICT, ex.getMessage(), request,
                List.of(new FieldProblem("name", "already used by supplier " + ex.existingSupplierId())));
    }

    /** Method-security denials (@PreAuthorize) surface here rather than in the security filter chain. */
    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<ApiError> forbidden(AccessDeniedException ex, HttpServletRequest request) {
        String message = ex instanceof ForbiddenException ? ex.getMessage() : SecurityMessages.forbidden(request);
        return respond(ErrorCode.FORBIDDEN, message, request, List.of());
    }

    @ExceptionHandler(AuthenticationException.class)
    ResponseEntity<ApiError> unauthenticated(AuthenticationException ex, HttpServletRequest request) {
        return respond(ErrorCode.UNAUTHENTICATED, SecurityMessages.UNAUTHENTICATED, request, List.of());
    }

    @ExceptionHandler(RoleLookupException.class)
    ResponseEntity<ApiError> roleLookup(RoleLookupException ex, HttpServletRequest request) {
        log.warn("User Service role lookup failed: {}", ex.getMessage());
        return respond(ErrorCode.SERVICE_UNAVAILABLE,
                "Could not verify your roles right now. Please try again shortly.", request, List.of());
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> unexpected(Exception ex, HttpServletRequest request) {
        log.error("Unhandled error on {} {}", request.getMethod(), request.getRequestURI(), ex);
        return respond(ErrorCode.INTERNAL_ERROR, "Something went wrong. Please try again.", request, List.of());
    }

    private ResponseEntity<ApiError> respond(ErrorCode code, String message, HttpServletRequest request,
                                             List<FieldProblem> problems) {
        ApiError body = ApiError.of(code, message, request.getRequestURI(), clock.instant()).withDetails(problems);
        return ResponseEntity.status(code.status()).body(body);
    }
}
