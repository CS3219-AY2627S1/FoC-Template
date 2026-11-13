package sg.edu.nus.foc.supplier.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import sg.edu.nus.foc.supplier.config.SupplierProperties;
import sg.edu.nus.foc.supplier.config.SupplierProperties.AuthSettings;
import sg.edu.nus.foc.supplier.config.SupplierProperties.Mode;
import sg.edu.nus.foc.supplier.config.SupplierProperties.UserServiceSettings;
import tools.jackson.databind.json.JsonMapper;

class SecurityComponentsTest {

    private final SecurityConfig config = new SecurityConfig();

    private static SupplierProperties props(AuthSettings auth, UserServiceSettings userService) {
        return new SupplierProperties(null, auth, userService, null, null, null);
    }

    @Test
    void usesTheEmulatorDecoderOnlyWhenTheEmulatorIsConfigured() {
        assertThat(config.jwtDecoder(props(new AuthSettings("p", "localhost:9099"), null)))
                .isInstanceOf(EmulatorJwtDecoder.class);
        assertThat(config.jwtDecoder(props(new AuthSettings("p", ""), null))).isInstanceOf(NimbusJwtDecoder.class);
    }

    @Test
    void choosesTheRoleProviderFromTheMode() {
        Clock clock = Clock.systemUTC();
        assertThat(config.roleProvider(props(null, new UserServiceSettings(Mode.MOCK, null, List.of("a@b.c"), null,
                null)), clock))
                .isInstanceOf(MockUserServiceRoleProvider.class);
        assertThat(config.roleProvider(props(null, new UserServiceSettings(Mode.HTTP, "http://user-service:8080", null,
                Duration.ofSeconds(1), null)), clock))
                .isInstanceOf(CachingRoleProvider.class);
        assertThat(config.roleProvider(props(null, new UserServiceSettings(Mode.HTTP, "http://user-service:8080", null,
                null, Duration.ZERO)), clock))
                .isInstanceOf(HttpUserServiceRoleProvider.class);
        assertThatThrownBy(() -> config.roleProvider(props(null, new UserServiceSettings(Mode.HTTP, " ", null, null,
                null)), clock))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("USER_SERVICE_URL");
    }

    @Test
    void tokensGrantNoRolesOrScopesBecauseRolesAreResolvedPerEndpoint() {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "none").subject("u1").claim("scope", "admin").build();
        // Spring Security still records how the caller authenticated (FACTOR_BEARER); nothing else.
        assertThat(config.jwtAuthenticationConverter().convert(jwt).getAuthorities())
                .extracting(GrantedAuthority::getAuthority)
                .noneMatch(authority -> authority.startsWith("ROLE_") || authority.startsWith("SCOPE_"));
    }

    @Test
    void accessDeniedFromTheFilterChainIsWrittenAsJson() throws Exception {
        JsonSecurityHandlers handlers = new JsonSecurityHandlers(JsonMapper.builder().build(),
                Clock.fixed(Instant.parse("2026-09-25T00:00:00Z"), ZoneOffset.UTC));
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/suppliers");
        MockHttpServletResponse response = new MockHttpServletResponse();

        handlers.handle(request, response, new AccessDeniedException("no"));

        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(response.getContentType()).startsWith("application/json");
        assertThat(response.getContentAsString())
                .contains("\"error\":\"FORBIDDEN\"")
                .contains("You do not have permission to view this resource.");
    }
}
