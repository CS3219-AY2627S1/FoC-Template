/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Test generation and verification.
 * Scope: Generated automated verification for the team-specified Reporting Service contracts.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.error;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import jakarta.validation.ConstraintViolationException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.mock.http.MockHttpInputMessage;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import static org.junit.jupiter.api.Assertions.*;

class GlobalExceptionHandlerTest {
    private final GlobalExceptionHandler handler = new GlobalExceptionHandler(Clock.fixed(Instant.parse("2026-10-13T00:00:00Z"), ZoneOffset.UTC));
    private final MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/reports");

    @Test void mapsValidationAndUploadFailuresToStandard400Envelope() {
        var bad = handler.bad(new BadRequestException("Choose an order", "orderId"), request);
        assertEquals(HttpStatus.BAD_REQUEST, bad.getStatusCode()); assertEquals("VALIDATION_ERROR", bad.getBody().error()); assertEquals("orderId", bad.getBody().details().getFirst().field());
        var plain = handler.bad(new BadRequestException("Bad"), request); assertTrue(plain.getBody().details().isEmpty());
        var malformed = handler.validation(new HttpMessageNotReadableException("bad", new MockHttpInputMessage(new byte[0])), request);
        assertEquals(400, malformed.getBody().status());
        var violations = handler.validation(new ConstraintViolationException(Set.of()), request); assertEquals(400, violations.getBody().status());
        var large = handler.tooLarge(new MaxUploadSizeExceededException(1), request); assertTrue(large.getBody().message().contains("5 MiB"));
    }

    @Test void mapsMissingResourcesAndDependenciesWithoutLeakingInternals() {
        var missing = handler.notFound(new NotFoundException("Report not found."), request);
        assertEquals(404, missing.getBody().status()); assertEquals("/api/reports", missing.getBody().path());
        assertEquals("CONFLICT", handler.conflict(new ConflictException("closed"), request).getBody().error());
        assertEquals("FORBIDDEN", handler.forbidden(new ForbiddenException("participant only"), request).getBody().error());
        var unavailable = handler.unavailable(new DependencyUnavailableException("Storage unavailable", new RuntimeException("secret")), request);
        assertEquals(503, unavailable.getBody().status()); assertFalse(unavailable.getBody().message().contains("secret"));
        assertEquals(403, handler.forbidden(new AccessDeniedException("no"), request).getBody().status());
        assertEquals(405, handler.method(new HttpRequestMethodNotSupportedException("DELETE"), request).getBody().status());
        assertEquals(404, handler.route(new NoResourceFoundException(
                org.springframework.http.HttpMethod.GET, "/missing", "classpath:/static/"), request).getBody().status());
        assertEquals("INTERNAL_ERROR", handler.unexpected(new RuntimeException("secret"), request).getBody().error());
        ApiError error = ApiError.of(400, "VALIDATION_ERROR", "bad", "/x", Instant.EPOCH).withDetails(List.of(new ApiError.FieldProblem("f", "m")));
        assertEquals("f", error.details().getFirst().field());
    }
}
