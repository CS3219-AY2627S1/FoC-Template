package com.friendoncampus.order.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

class JwtContractValidatorTest {

    private static final String ISSUER = "friend-on-campus-user-service";
    private static final String AUDIENCE = "friend-on-campus-api";
    private static final String SUBJECT = "722d6da3-93f0-4a7d-9820-ab05047a9253";

    private final JwtContractValidator validator = new JwtContractValidator(
            new JwtResourceServerProperties(
                    URI.create("http://localhost:8081/.well-known/jwks.json"),
                    ISSUER,
                    AUDIENCE));

    @Test
    void acceptsThePublishedUserServiceContractForEveryRole() {
        for (String role : List.of("REQUESTER", "COURIER", "ADMIN")) {
            assertThat(validator.validate(token(SUBJECT, ISSUER, List.of(AUDIENCE), role, validExpiry())).hasErrors())
                    .as(role)
                    .isFalse();
        }
    }

    @Test
    void rejectsAnInvalidIssuer() {
        assertThat(validator.validate(token(SUBJECT, "another-service", List.of(AUDIENCE), "REQUESTER", validExpiry()))
                .hasErrors()).isTrue();
    }

    @Test
    void rejectsAnInvalidAudience() {
        assertThat(validator.validate(token(SUBJECT, ISSUER, List.of("another-api"), "REQUESTER", validExpiry()))
                .hasErrors()).isTrue();
    }

    @Test
    void rejectsAMissingOrUnsupportedRole() {
        assertThat(validator.validate(token(SUBJECT, ISSUER, List.of(AUDIENCE), null, validExpiry())).hasErrors())
                .isTrue();
        assertThat(validator.validate(token(SUBJECT, ISSUER, List.of(AUDIENCE), "SUPER_ADMIN", validExpiry()))
                .hasErrors()).isTrue();
    }

    @Test
    void rejectsASubjectThatIsNotAUserUuid() {
        assertThat(validator.validate(token("not-a-uuid", ISSUER, List.of(AUDIENCE), "REQUESTER", validExpiry()))
                .hasErrors()).isTrue();
    }

    @Test
    void rejectsExpiredTokens() {
        assertThat(validator.validate(token(SUBJECT, ISSUER, List.of(AUDIENCE), "REQUESTER",
                Instant.now().minusSeconds(120))).hasErrors()).isTrue();
    }

    private static Instant validExpiry() {
        return Instant.now().plusSeconds(600);
    }

    private static Jwt token(String subject, String issuer, List<String> audience, String role, Instant expiresAt) {
        Jwt.Builder builder = Jwt.withTokenValue("token")
                .header("alg", "RS256")
                .subject(subject)
                .issuer(issuer)
                .audience(audience)
                .issuedAt(expiresAt.minusSeconds(900))
                .expiresAt(expiresAt);
        if (role != null) {
            builder.claim("role", role);
        }
        return builder.build();
    }
}
