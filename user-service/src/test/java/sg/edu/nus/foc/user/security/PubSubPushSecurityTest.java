/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-05
 * Mode: Code generation.
 * Scope: Generated the initial test code and provided testing assistance.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.user.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

import sg.edu.nus.foc.user.config.UserPushProperties;

class PubSubPushSecurityTest {

    private UserPushProperties properties;
    private PubSubPushTokenValidator validator;

    @BeforeEach
    void setUp() {
        properties = new UserPushProperties(
                "demo-foc",
                "https://user.example.com",
                "push@u.nus.edu",
                "penalty-addition",
                "penalty-deduction", "penalty-events");

        validator = new PubSubPushTokenValidator(properties);
    }

    @Test
    void acceptsValidGooglePushToken() {
        OAuth2TokenValidatorResult result =
                validator.validate(pushToken(Map.of()));

        assertThat(result.hasErrors()).isFalse();
    }

    @Test
    void acceptsBothSupportedGoogleIssuerFormats() {
        assertThat(validator.validate(pushToken(
                Map.of("iss", "accounts.google.com")))
                .hasErrors()).isFalse();

        assertThat(validator.validate(pushToken(
                Map.of("iss", "https://accounts.google.com")))
                .hasErrors()).isFalse();
    }

    @Test
    void rejectsIncorrectIssuer() {
        OAuth2TokenValidatorResult result =
                validator.validate(pushToken(
                        Map.of("iss", "https://attacker.example.com")));

        assertThat(result.hasErrors()).isTrue();
    }

    @Test
    void rejectsIncorrectAudience() {
        OAuth2TokenValidatorResult result =
                validator.validate(pushToken(
                        Map.of("aud", List.of("https://wrong.example.com"))));

        assertThat(result.hasErrors()).isTrue();
    }

    @Test
    void rejectsIncorrectServiceAccount() {
        OAuth2TokenValidatorResult result =
                validator.validate(pushToken(
                        Map.of("email", "attacker@u.nus.edu")));

        assertThat(result.hasErrors()).isTrue();
    }

    @Test
    void rejectsUnverifiedEmail() {
        OAuth2TokenValidatorResult result =
                validator.validate(pushToken(
                        Map.of("email_verified", false)));

        assertThat(result.hasErrors()).isTrue();
    }

    @Test
    void rejectsStringFalseEmailVerification() {
        OAuth2TokenValidatorResult result =
                validator.validate(pushToken(
                        Map.of("email_verified", "false")));

        assertThat(result.hasErrors()).isTrue();
    }

    @Test
    void acceptsStringTrueEmailVerification() {
        OAuth2TokenValidatorResult result =
                validator.validate(pushToken(
                        Map.of("email_verified", "true")));

        assertThat(result.hasErrors()).isFalse();
    }

    private Jwt pushToken(Map<String, Object> overrides) {
        Map<String, Object> claims = new HashMap<>(Map.of(
                "iss", "https://accounts.google.com",
                "aud", List.of(properties.audience()),
                "email", properties.serviceAccount(),
                "email_verified", true,
                "sub", "google-pubsub-push"));

        claims.putAll(overrides);

        Instant now = Instant.now();

        return Jwt.withTokenValue("push-token")
                .header("alg", "RS256")
                .claims(values -> values.putAll(claims))
                .issuedAt(now)
                .expiresAt(now.plusSeconds(3600))
                .build();
    }
}
