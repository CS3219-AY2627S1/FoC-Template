package sg.edu.nus.foc.supplier.error;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.BadCredentialsException;
import sg.edu.nus.foc.supplier.security.RoleLookupException;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler =
            new GlobalExceptionHandler(Clock.fixed(Instant.parse("2026-09-25T00:00:00Z"), ZoneOffset.UTC));
    private final MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/suppliers");

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
}
