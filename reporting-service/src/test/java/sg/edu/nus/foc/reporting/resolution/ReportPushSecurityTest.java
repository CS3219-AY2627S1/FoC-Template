/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Mode: Implementation.
 * Scope: Generated durable report-creation compensation tests.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.resolution;

import static org.junit.jupiter.api.Assertions.*;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

class ReportPushSecurityTest {
    private static final String AUDIENCE = "https://reporting.example";
    private static final String RESULT_ACCOUNT = "result@example.iam.gserviceaccount.com";
    private static final String SCHEDULER_ACCOUNT = "scheduler@example.iam.gserviceaccount.com";

    @Test
    void endpointValidatorAcceptsOnlyItsExactIdentity() {
        var result = ReportPushSecurity.validator(AUDIENCE, RESULT_ACCOUNT);
        assertFalse(result.validate(token(RESULT_ACCOUNT, AUDIENCE)).hasErrors());
        assertTrue(result.validate(token(SCHEDULER_ACCOUNT, AUDIENCE)).hasErrors());
    }

    @Test
    void endpointValidatorRejectsWrongAudienceIssuerAndUnverifiedEmail() {
        var validator = ReportPushSecurity.validator(AUDIENCE, RESULT_ACCOUNT);
        assertTrue(validator.validate(token(RESULT_ACCOUNT, "https://other.example")).hasErrors());
        assertTrue(validator.validate(token(RESULT_ACCOUNT, AUDIENCE, "https://issuer.example", true)).hasErrors());
        assertTrue(validator.validate(token(RESULT_ACCOUNT, AUDIENCE, "https://accounts.google.com", false)).hasErrors());
    }

    private static Jwt token(String email, String audience) {
        return token(email, audience, "https://accounts.google.com", true);
    }

    private static Jwt token(String email, String audience, String issuer, boolean verified) {
        Instant now = Instant.now();
        return Jwt.withTokenValue("token").header("alg", "RS256")
                .issuedAt(now.minusSeconds(1)).expiresAt(now.plusSeconds(300))
                .issuer(issuer).audience(List.of(audience))
                .claim("email", email).claim("email_verified", verified).build();
    }
}
