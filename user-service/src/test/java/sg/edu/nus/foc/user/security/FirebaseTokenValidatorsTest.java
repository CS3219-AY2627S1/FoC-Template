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
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

class FirebaseTokenValidatorsTest {

    private static final String PROJECT_ID = "demo-foc";

    @Test
    void constructsCorrectFirebaseIssuer() {
        assertThat(FirebaseTokenValidators.issuer(PROJECT_ID))
                .isEqualTo(
                        "https://securetoken.google.com/demo-foc");
    }

    @Test
    void acceptsValidFirebaseToken() {
        OAuth2TokenValidatorResult result =
                validate(token(
                        FirebaseTokenValidators.issuer(PROJECT_ID),
                        List.of(PROJECT_ID),
                        "firebase-user-123",
                        Instant.now().plusSeconds(3600),
                        Instant.now(),
                        null));

        assertThat(result.hasErrors()).isFalse();
    }

    @Test
    void rejectsIncorrectIssuer() {
        OAuth2TokenValidatorResult result =
                validate(token(
                        "https://securetoken.google.com/wrong-project",
                        List.of(PROJECT_ID),
                        "firebase-user-123",
                        Instant.now().plusSeconds(3600),
                        Instant.now(),
                        null));

        assertThat(result.hasErrors()).isTrue();
    }

    @Test
    void rejectsIncorrectAudience() {
        OAuth2TokenValidatorResult result =
                validate(token(
                        FirebaseTokenValidators.issuer(PROJECT_ID),
                        List.of("wrong-project"),
                        "firebase-user-123",
                        Instant.now().plusSeconds(3600),
                        Instant.now(),
                        null));

        assertThat(result.hasErrors()).isTrue();
    }

    @Test
    void rejectsEmptySubject() {
        OAuth2TokenValidatorResult result =
                validate(token(
                        FirebaseTokenValidators.issuer(PROJECT_ID),
                        List.of(PROJECT_ID),
                        " ",
                        Instant.now().plusSeconds(3600),
                        Instant.now(),
                        null));

        assertThat(result.hasErrors()).isTrue();
    }

    @Test
    void rejectsExpiredToken() {
        Instant now = Instant.now();

        Jwt jwt = token(
                FirebaseTokenValidators.issuer(PROJECT_ID),
                List.of(PROJECT_ID),
                "firebase-user-123",
                now.minusSeconds(3600),  // expiresAt: 1 hour ago
                now.minusSeconds(7200),  // issuedAt: 2 hours ago
                null                     // notBefore
        );

        System.out.println("Issued at: " + jwt.getIssuedAt());
        System.out.println("Expires at: " + jwt.getExpiresAt());
        System.out.println("Current time: " + Instant.now());

        OAuth2TokenValidatorResult result = validate(jwt);

        assertThat(result.hasErrors()).isTrue();
    }

    @Test
    void rejectsTokenThatIsNotYetValid() {
        OAuth2TokenValidatorResult result =
                validate(token(
                        FirebaseTokenValidators.issuer(PROJECT_ID),
                        List.of(PROJECT_ID),
                        "firebase-user-123",
                        Instant.now().plusSeconds(7200),
                        Instant.now(),
                        Instant.now().plusSeconds(3600)));

        assertThat(result.hasErrors()).isTrue();
    }

    @Test
    void acceptsAudienceAsSingleString() {
        assertThat(FirebaseTokenValidators.hasAudience(
                PROJECT_ID, PROJECT_ID)).isTrue();
    }

    @Test
    void acceptsAudienceAsCollection() {
        assertThat(FirebaseTokenValidators.hasAudience(
                List.of("another-project", PROJECT_ID),
                PROJECT_ID)).isTrue();
    }

    @Test
    void rejectsAudienceWithoutProjectId() {
        assertThat(FirebaseTokenValidators.hasAudience(
                List.of("another-project"),
                PROJECT_ID)).isFalse();
    }

    @Test
    void rejectsNullAudience() {
        assertThat(FirebaseTokenValidators.hasAudience(
                null, PROJECT_ID)).isFalse();
    }

    private OAuth2TokenValidatorResult validate(Jwt jwt) {
        return FirebaseTokenValidators.forProject(PROJECT_ID)
                .validate(jwt);
    }

    private Jwt token(
        String issuer,
        List<String> audience,
        String subject,
        Instant expiresAt,
        Instant issuedAt,
        Instant notBefore
    ) {

        Jwt.Builder builder = Jwt.withTokenValue("firebase-token")
                .header("alg", "RS256")
                .issuer(issuer)
                .audience(audience)
                .subject(subject)
                .issuedAt(issuedAt)
                .expiresAt(expiresAt);

        if (notBefore != null) {
            builder.notBefore(notBefore);
        }

        return builder.build();
    }
}