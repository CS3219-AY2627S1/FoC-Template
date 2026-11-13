/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Mode: Implementation.
 * Scope: Generated durable report-creation compensation tests.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.order.security;

import static org.junit.jupiter.api.Assertions.*;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import sg.edu.nus.foc.order.config.ReportCreationSettings;

class ReportCreationPushTokenValidatorTest {
    private static final String AUDIENCE = "https://order.example";
    private static final String ACCOUNT = "report-push@example.iam.gserviceaccount.com";
    private final ReportCreationPushTokenValidator validator = new ReportCreationPushTokenValidator(
            new ReportCreationSettings(true, "project", "results", "requests", "google",
                    AUDIENCE, ACCOUNT, "", Duration.ofSeconds(10)));

    @Test
    void acceptsOnlyTheConfiguredVerifiedGoogleIdentity() {
        assertFalse(validator.validate(token(ACCOUNT, AUDIENCE, "https://accounts.google.com", true)).hasErrors());
        assertTrue(validator.validate(token("other@example.iam.gserviceaccount.com", AUDIENCE,
                "https://accounts.google.com", true)).hasErrors());
    }

    @Test
    void rejectsWrongAudienceIssuerAndUnverifiedEmail() {
        assertTrue(validator.validate(token(ACCOUNT, "https://other.example",
                "https://accounts.google.com", true)).hasErrors());
        assertTrue(validator.validate(token(ACCOUNT, AUDIENCE, "https://issuer.example", true)).hasErrors());
        assertTrue(validator.validate(token(ACCOUNT, AUDIENCE, "https://accounts.google.com", false)).hasErrors());
    }

    private static Jwt token(String email, String audience, String issuer, boolean verified) {
        Instant now = Instant.now();
        return Jwt.withTokenValue("token").header("alg", "RS256")
                .issuedAt(now.minusSeconds(1)).expiresAt(now.plusSeconds(300))
                .issuer(issuer).audience(List.of(audience))
                .claim("email", email).claim("email_verified", verified).build();
    }
}
