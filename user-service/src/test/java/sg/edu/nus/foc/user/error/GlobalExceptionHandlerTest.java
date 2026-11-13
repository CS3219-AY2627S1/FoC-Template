/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-05
 * Mode: Code generation.
 * Scope: Generated additional test code and provided testing assistance.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.user.error;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpInputMessage;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.FieldError;
import org.springframework.validation.ObjectError;
import org.springframework.validation.method.ParameterValidationResult;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import jakarta.validation.Path;
import sg.edu.nus.foc.user.security.RoleLookupException;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler =
            new GlobalExceptionHandler(Clock.fixed(Instant.parse("2026-09-25T00:00:00Z"), ZoneOffset.UTC));
    private final MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/suppliers");

    static class TestController {
        public void testMethod(String page) {}
    }

    @Test
    void userServiceOutageIs503() {
        var response = handler.roleLookup(new RoleLookupException("down", null), request);
        assertThat(response.getStatusCode().value()).isEqualTo(503);
        assertThat(response.getBody().error()).isEqualTo("SERVICE_UNAVAILABLE");
    }

    @Test
    void unexpectedErrorsAre500WithoutInternals() {
        var response = handler.unexpected(new IllegalStateException("secret detail"), request);
        assertThat(response.getStatusCode().value()).isEqualTo(500);
        assertThat(response.getBody().message()).doesNotContain("secret");
        assertThat(response.getBody().timestamp()).isEqualTo(Instant.parse("2026-09-25T00:00:00Z"));
    }

    @Test
    void authenticationErrorsAre401() {
        var response = handler.unauthenticated(new BadCredentialsException("x"), request);
        assertThat(response.getStatusCode().value()).isEqualTo(401);
    }

    @Test
    void forbiddenMessageDependsOnTheRequest() {
        assertThat(SecurityMessages.forbidden(new MockHttpServletRequest("DELETE", "/api/suppliers/1")))
                .isEqualTo("Only administrators can manage suppliers.");
        assertThat(SecurityMessages.forbidden(new MockHttpServletRequest("POST", "/api/suppliers/validate")))
                .isEqualTo("You do not have permission to view this resource.");
        assertThat(SecurityMessages.forbidden(new MockHttpServletRequest("POST", "/api/suppliers/lookup")))
                .isEqualTo("You do not have permission to view this resource.");
    }

    @Test
    void invalidBodyReturnsValidationErrors() throws Exception {
        var target = new Object();
        var bindingResult = new BeanPropertyBindingResult(target, "request");

        bindingResult.addError(new FieldError(
                "request",
                "username",
                null,
                false,
                null,
                null,
                "must not be blank"
        ));

        var exception = new MethodArgumentNotValidException(
                new MethodParameter(
                        TestController.class.getDeclaredMethod("testMethod", String.class),
                        0
                ),
                bindingResult
        );

        var response = handler.invalidBody(exception, request);

        assertThat(response.getStatusCode().value()).isEqualTo(400);
        assertThat(response.getBody().error()).isEqualTo("VALIDATION_ERROR");
        assertThat(response.getBody().message())
                .isEqualTo("Request validation failed.");
        assertThat(response.getBody().details())
                .contains(new ApiError.FieldProblem("username", "must not be blank"));
    }

    @Test
    void invalidParametersReturnsValidationErrors() throws Exception {
        var exception = mock(HandlerMethodValidationException.class);
        var result = mock(ParameterValidationResult.class);
        var error = new ObjectError("page", "must be greater than zero");

        when(exception.getParameterValidationResults())
                .thenReturn(List.of(result));

        when(result.getMethodParameter()).thenReturn(
                new MethodParameter(
                        TestController.class.getDeclaredMethod(
                                "testMethod",
                                String.class
                        ),
                        0
                )
        );

        when(result.getResolvableErrors()).thenReturn(List.of(error));

        var response = handler.invalidParameters(exception, request);

        assertThat(response.getStatusCode().value()).isEqualTo(400);
        assertThat(response.getBody().error()).isEqualTo("VALIDATION_ERROR");
        assertThat(response.getBody().details())
                .contains(new ApiError.FieldProblem(
                        "page",
                        "must be greater than zero"
                ));
    }

    @Test
    void constraintViolationReturnsValidationErrors() {
        var exception = mock(ConstraintViolationException.class);
        var violation = mock(ConstraintViolation.class);
        var path = mock(Path.class);

        when(exception.getConstraintViolations())
                .thenReturn(Set.of(violation));

        when(violation.getPropertyPath()).thenReturn(path);
        when(path.toString()).thenReturn("updateUser.username");
        when(violation.getMessage()).thenReturn("must not be blank");

        var response = handler.constraintViolation(exception, request);

        assertThat(response.getStatusCode().value()).isEqualTo(400);
        assertThat(response.getBody().error()).isEqualTo("VALIDATION_ERROR");
        assertThat(response.getBody().details())
                .contains(new ApiError.FieldProblem("username", "must not be blank"));
    }

    @Test
    void typeMismatchReturnsValidationError() throws Exception {
        var exception = new MethodArgumentTypeMismatchException(
                "abc",
                Integer.class,
                "page",
                new MethodParameter(
                        TestController.class.getDeclaredMethod("testMethod", String.class),
                        0
                ),
                null
        );

        var response = handler.typeMismatch(exception, request);

        assertThat(response.getStatusCode().value()).isEqualTo(400);
        assertThat(response.getBody().details())
                .contains(new ApiError.FieldProblem(
                        "page",
                        "has an invalid value 'abc'"
                ));
    }

    @Test
    void missingParameterReturnsValidationError() {
        var exception = new MissingServletRequestParameterException(
                "page",
                "int"
        );

        var response = handler.missingParameter(exception, request);

        assertThat(response.getStatusCode().value()).isEqualTo(400);
        assertThat(response.getBody().error()).isEqualTo("VALIDATION_ERROR");
        assertThat(response.getBody().details())
                .contains(new ApiError.FieldProblem("page", "is required"));
    }

    @Test
    void unreadableReturnsValidationError() {
        var exception = new HttpMessageNotReadableException(
                "Invalid JSON",
                (HttpInputMessage) null
        );

        var response = handler.unreadable(exception, request);

        assertThat(response.getStatusCode().value()).isEqualTo(400);
        assertThat(response.getBody().error()).isEqualTo("VALIDATION_ERROR");
        assertThat(response.getBody().message())
                .isEqualTo("Request body is missing or is not valid JSON.");
    }
}
