/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-09-25
 * Mode: Code generation.
 * Scope: Generated error types and mappings for the team-finalized API error contract.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.error;

import java.time.Clock;
import java.util.Comparator;
import java.util.List;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import sg.edu.nus.foc.credit.error.ApiError.FieldProblem;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    private final Clock clock;

    public GlobalExceptionHandler(Clock clock) {
        this.clock = clock;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> invalidBody(MethodArgumentNotValidException exception, HttpServletRequest request) {
        List<FieldProblem> problems = exception.getBindingResult().getFieldErrors().stream()
                .sorted(Comparator.comparing(FieldError::getField))
                .map(error -> new FieldProblem(error.getField(), error.getDefaultMessage()))
                .toList();
        return respond(ErrorCode.VALIDATION_ERROR, "Request validation failed.", request, problems);
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    ResponseEntity<ApiError> invalidParameters(HandlerMethodValidationException exception,
                                                HttpServletRequest request) {
        List<FieldProblem> problems = exception.getParameterValidationResults().stream()
                .flatMap(result -> result.getResolvableErrors().stream()
                        .map(error -> new FieldProblem(result.getMethodParameter().getParameterName(),
                                error.getDefaultMessage())))
                .toList();
        return respond(ErrorCode.VALIDATION_ERROR, "Request validation failed.", request, problems);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    ResponseEntity<ApiError> constraintViolation(ConstraintViolationException exception,
                                                  HttpServletRequest request) {
        List<FieldProblem> problems = exception.getConstraintViolations().stream()
                .map(violation -> new FieldProblem(violation.getPropertyPath().toString(), violation.getMessage()))
                .toList();
        return respond(ErrorCode.VALIDATION_ERROR, "Request validation failed.", request, problems);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ApiError> unreadable(HttpMessageNotReadableException exception, HttpServletRequest request) {
        return respond(ErrorCode.VALIDATION_ERROR, "Request body is missing or is not valid JSON.", request,
                List.of());
    }

    @ExceptionHandler(InvalidCreditAmountException.class)
    ResponseEntity<ApiError> invalidAmount(InvalidCreditAmountException exception, HttpServletRequest request) {
        return respond(ErrorCode.VALIDATION_ERROR, "Request validation failed.", request,
                List.of(new FieldProblem("amount", exception.getMessage())));
    }

    @ExceptionHandler(InvalidCreditIdException.class)
    ResponseEntity<ApiError> invalidIdentifier(InvalidCreditIdException exception, HttpServletRequest request) {
        return respond(ErrorCode.VALIDATION_ERROR, "Request validation failed.", request,
                List.of(new FieldProblem(exception.field(), exception.getMessage())));
    }

    @ExceptionHandler(InvalidOrderEventException.class)
    ResponseEntity<ApiError> invalidOrderEvent(InvalidOrderEventException exception, HttpServletRequest request) {
        return respond(ErrorCode.VALIDATION_ERROR, exception.getMessage(), request, List.of());
    }

    @ExceptionHandler(InvalidCompensationEventException.class)
    ResponseEntity<ApiError> invalidCompensationEvent(InvalidCompensationEventException exception,
                                                       HttpServletRequest request) {
        return respond(ErrorCode.VALIDATION_ERROR, exception.getMessage(), request, List.of());
    }

    @ExceptionHandler(InvalidUserEventException.class)
    ResponseEntity<ApiError> invalidUserEvent(InvalidUserEventException exception, HttpServletRequest request) {
        return respond(ErrorCode.VALIDATION_ERROR, exception.getMessage(), request, List.of());
    }

    @ExceptionHandler(InvalidCommandHeaderException.class)
    ResponseEntity<ApiError> invalidCommandHeader(InvalidCommandHeaderException exception,
                                                   HttpServletRequest request) {
        return respond(ErrorCode.VALIDATION_ERROR, "Request validation failed.", request,
                List.of(new FieldProblem(exception.field(), exception.getMessage())));
    }

    @ExceptionHandler(CreditCommandException.class)
    ResponseEntity<ApiError> commandFailure(CreditCommandException exception,
                                             HttpServletRequest request) {
        ResponseEntity<ApiError> response = respond(
                exception.errorCode(), exception.getMessage(), request, List.of());
        ResponseEntity.BodyBuilder builder = ResponseEntity.status(response.getStatusCode());
        if (exception.commandId() != null) {
            builder.header("Idempotency-Key", exception.commandId());
        }
        if (exception.outcome() != null) {
            builder.header("Command-Outcome", exception.outcome().name());
        }
        return builder.body(response.getBody());
    }

    @ExceptionHandler(AccountNotFoundException.class)
    ResponseEntity<ApiError> accountNotFound(AccountNotFoundException exception, HttpServletRequest request) {
        return respond(ErrorCode.ACCOUNT_NOT_FOUND, exception.getMessage(), request, List.of());
    }

    @ExceptionHandler(ReservationNotFoundException.class)
    ResponseEntity<ApiError> reservationNotFound(ReservationNotFoundException exception,
                                                  HttpServletRequest request) {
        return respond(ErrorCode.RESERVATION_NOT_FOUND, exception.getMessage(), request, List.of());
    }

    @ExceptionHandler(InsufficientCreditsException.class)
    ResponseEntity<ApiError> insufficient(InsufficientCreditsException exception, HttpServletRequest request) {
        return respond(ErrorCode.INSUFFICIENT_CREDITS, exception.getMessage(), request,
                List.of(new FieldProblem("amount", "exceeds usable balance")));
    }

    @ExceptionHandler(ReservationConflictException.class)
    ResponseEntity<ApiError> reservationConflict(ReservationConflictException exception,
                                                  HttpServletRequest request) {
        return respond(ErrorCode.RESERVATION_CONFLICT, exception.getMessage(), request, List.of());
    }

    @ExceptionHandler(ReservationStateConflictException.class)
    ResponseEntity<ApiError> reservationStateConflict(ReservationStateConflictException exception,
                                                       HttpServletRequest request) {
        return respond(ErrorCode.RESERVATION_CONFLICT, exception.getMessage(), request, List.of());
    }

    @ExceptionHandler(EventConflictException.class)
    ResponseEntity<ApiError> eventConflict(EventConflictException exception, HttpServletRequest request) {
        return respond(ErrorCode.EVENT_CONFLICT, exception.getMessage(), request, List.of());
    }

    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<ApiError> noRoute(NoResourceFoundException exception, HttpServletRequest request) {
        return respond(ErrorCode.NOT_FOUND, "No endpoint handles this path.", request, List.of());
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<ApiError> methodNotAllowed(HttpRequestMethodNotSupportedException exception,
                                               HttpServletRequest request) {
        return respond(ErrorCode.METHOD_NOT_ALLOWED, exception.getMessage(), request, List.of());
    }

    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<ApiError> forbidden(AccessDeniedException exception, HttpServletRequest request) {
        String message = exception instanceof ForbiddenException ? exception.getMessage() : SecurityMessages.FORBIDDEN;
        return respond(ErrorCode.FORBIDDEN, message, request, List.of());
    }

    @ExceptionHandler(AuthenticationException.class)
    ResponseEntity<ApiError> unauthenticated(AuthenticationException exception, HttpServletRequest request) {
        return respond(ErrorCode.UNAUTHENTICATED, SecurityMessages.UNAUTHENTICATED, request, List.of());
    }

    @ExceptionHandler(DataAccessException.class)
    ResponseEntity<ApiError> persistenceUnavailable(DataAccessException exception, HttpServletRequest request) {
        log.error("Credit persistence failed on {} {}", request.getMethod(), request.getRequestURI(), exception);
        return respond(ErrorCode.SERVICE_UNAVAILABLE,
                "Credit persistence is temporarily unavailable.", request, List.of());
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> unexpected(Exception exception, HttpServletRequest request) {
        log.error("Unhandled error on {} {}", request.getMethod(), request.getRequestURI(), exception);
        return respond(ErrorCode.INTERNAL_ERROR, "Something went wrong. Please try again.", request, List.of());
    }

    private ResponseEntity<ApiError> respond(ErrorCode code, String message, HttpServletRequest request,
                                             List<FieldProblem> details) {
        if (code.status().is4xxClientError()) {
            log.atWarn()
                    .addKeyValue("service", "credit-service")
                    .addKeyValue("method", request.getMethod())
                    .addKeyValue("path", request.getRequestURI())
                    .addKeyValue("status", code.status().value())
                    .addKeyValue("errorCode", code)
                    .addKeyValue("errorMessage", message)
                    .log("credit_request_rejected");
        }
        ApiError body = ApiError.of(code, message, request.getRequestURI(), clock.instant()).withDetails(details);
        return ResponseEntity.status(code.status()).body(body);
    }
}
