/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-05
 * Mode: Code generation.
 * Scope: Generated the initial test code and provided testing assistance.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.user.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.web.cors.CorsConfiguration;

import sg.edu.nus.foc.user.config.UserPushProperties;

class SecurityComponentsTest {

    private static final String PROJECT_ID = "demo-foc";

    private final SecurityConfig config = new SecurityConfig();

    @Test
    void selectsConfiguredFirebaseJwtDecoder() {
        JwtDecoder emulator =
                config.jwtDecoder(PROJECT_ID, "localhost:9099");

        JwtDecoder production =
                config.jwtDecoder(PROJECT_ID, "");

        assertThat(emulator).isInstanceOf(EmulatorJwtDecoder.class);
        assertThat(production).isInstanceOf(NimbusJwtDecoder.class);
    }

    @Test
    void selectsPubSubPushJwtDecoder() {
        UserPushProperties properties = pushProperties();

        JwtDecoder decoder = config.pubSubPushJwtDecoder(properties);

        assertThat(decoder).isInstanceOf(NimbusJwtDecoder.class);
    }

    @Test
    void jwtAuthenticationConverterDoesNotTrustTokenRoles() {
        Jwt jwt = Jwt.withTokenValue("test-token")
                .header("alg", "RS256")
                .subject("firebase-user-123")
                .claim("roles", List.of("admin", "courier"))
                .build();

        AbstractAuthenticationToken authentication =
                config.jwtAuthenticationConverter().convert(jwt);

        assertThat(authentication).isNotNull();
        assertThat(authentication.getAuthorities()).extracting(GrantedAuthority::getAuthority)
                .doesNotContain(
                        "ROLE_ADMIN",
                        "ROLE_COURIER",
                        "ROLE_REQUESTER"
                );
    }

    @Test
    void configuresCorsForUserService() {
        CorsConfiguration cors = config.corsConfigurationSource(
                List.of(
                        "http://localhost:3000",
                        "https://example.com"))
                .getCorsConfiguration(
                        new MockHttpServletRequest("GET", "/api/users"));

        assertThat(cors).isNotNull();

        assertThat(cors.getAllowedOrigins())
                .containsExactly(
                        "http://localhost:3000",
                        "https://example.com");

        assertThat(cors.getAllowedMethods())
                .containsExactly(
                        "GET", "POST", "PATCH",
                        "PUT", "DELETE", "OPTIONS");

        assertThat(cors.getAllowedHeaders())
                .containsExactly(
                        "Authorization",
                        "Content-Type",
                        "X-Request-Id");

        assertThat(cors.getMaxAge()).isEqualTo(3600L);
    }

    @Test
    void enablesUnsignedPushOnlyForLocalEmulator() {
        assertThat(config.emulatorPushEnabled(
                "emulator",
                "pubsub-emulator:8085",
                "local")).isTrue();

        assertThat(config.emulatorPushEnabled(
                "google",
                "",
                "local")).isFalse();
    }

    @Test
    void rejectsUnsignedPushOutsideLocalEmulator() {
        assertThatThrownBy(() ->
                config.emulatorPushEnabled(
                        "emulator",
                        "pubsub-emulator:8085",
                        "production"))
                .isInstanceOf(IllegalStateException.class);

        assertThatThrownBy(() ->
                config.emulatorPushEnabled(
                        "emulator",
                        "",
                        "local"))
                .isInstanceOf(IllegalStateException.class);

        assertThatThrownBy(() ->
                config.emulatorPushEnabled(
                        "google",
                        "pubsub-emulator:8085",
                        "local"))
                .isInstanceOf(IllegalStateException.class);

        assertThatThrownBy(() ->
                config.emulatorPushEnabled(
                        "invalid",
                        "pubsub-emulator:8085",
                        "local"))
                .isInstanceOf(IllegalStateException.class);
    }

    private UserPushProperties pushProperties() {
        return new UserPushProperties(
                "demo-foc",
                "https://user.example.com",
                "push@u.nus.edu",
                "penalty-addition",
                "penalty-deduction", "penalty-events");
    }
}
