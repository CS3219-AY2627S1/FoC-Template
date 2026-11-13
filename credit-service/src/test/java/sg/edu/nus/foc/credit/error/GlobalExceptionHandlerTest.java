/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-09-25
 * Mode: Test generation and testing assistance.
 * Scope: Generated initial tests for the team-finalized API error mappings.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.error;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.BadCredentialsException;

@ExtendWith(OutputCaptureExtension.class)
class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler(
            Clock.fixed(Instant.parse("2026-09-25T00:00:00Z"), ZoneOffset.UTC));
    private final MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/credits");

    @Test
    void mapsDomainNotFoundAndConflictErrors() {
        assertThat(handler.accountNotFound(new AccountNotFoundException("u"), request).getBody().error())
                .isEqualTo("ACCOUNT_NOT_FOUND");
        assertThat(handler.reservationNotFound(new ReservationNotFoundException("o"), request).getBody().error())
                .isEqualTo("RESERVATION_NOT_FOUND");
        assertThat(handler.insufficient(new InsufficientCreditsException(2, 3), request).getBody().error())
                .isEqualTo("INSUFFICIENT_CREDITS");
        assertThat(handler.reservationConflict(new ReservationConflictException("o"), request).getBody().error())
                .isEqualTo("RESERVATION_CONFLICT");
        assertThat(handler.reservationStateConflict(
                new ReservationStateConflictException("o", "is inactive."), request).getBody().error())
                .isEqualTo("RESERVATION_CONFLICT");
        assertThat(handler.eventConflict(new EventConflictException("e"), request).getBody().error())
                .isEqualTo("EVENT_CONFLICT");
    }

    @Test
    void mapsValidationAuthenticationAndAuthorizationErrors(CapturedOutput output) {
        assertThat(handler.invalidAmount(new InvalidCreditAmountException(0), request).getBody().details())
                .extracting(ApiError.FieldProblem::field).containsExactly("amount");
        assertThat(handler.invalidIdentifier(new InvalidCreditIdException("orderId"), request).getBody().details())
                .extracting(ApiError.FieldProblem::field).containsExactly("orderId");
        assertThat(handler.invalidOrderEvent(new InvalidOrderEventException("bad event"), request)
                .getStatusCode().value()).isEqualTo(400);
        assertThat(handler.unauthenticated(new BadCredentialsException("bad"), request).getStatusCode().value())
                .isEqualTo(401);
        assertThat(handler.forbidden(new ForbiddenException("specific"), request).getBody().message())
                .isEqualTo("specific");
        assertThat(handler.forbidden(new org.springframework.security.access.AccessDeniedException("generic"), request)
                .getBody().message()).isEqualTo(SecurityMessages.FORBIDDEN);
        assertThat(output).contains("credit_request_rejected");
    }

    @Test
    void hidesUnexpectedInternals() {
        ApiError body = handler.unexpected(new IllegalStateException("secret"), request).getBody();
        assertThat(body.status()).isEqualTo(500);
        assertThat(body.message()).doesNotContain("secret");
        assertThat(body.timestamp()).isEqualTo(Instant.parse("2026-09-25T00:00:00Z"));
    }

    @Test
    void mapsDatabaseFailuresToServiceUnavailableForPubSubRetry() {
        ApiError body = handler.persistenceUnavailable(
                new DataAccessResourceFailureException("offline"), request).getBody();

        assertThat(body.status()).isEqualTo(503);
        assertThat(body.error()).isEqualTo("SERVICE_UNAVAILABLE");
    }
}
