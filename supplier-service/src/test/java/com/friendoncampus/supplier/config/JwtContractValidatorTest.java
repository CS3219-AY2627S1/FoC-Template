package com.friendoncampus.supplier.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

class JwtContractValidatorTest {

    private static final String ISSUER = "friend-on-campus-user-service";
    private static final String AUDIENCE = "friend-on-campus-api";

    private final JwtContractValidator validator = new JwtContractValidator(
            new JwtResourceServerProperties(
                    URI.create("http://localhost:8081/.well-known/jwks.json"),
                    ISSUER,
                    AUDIENCE));

    @Test
    void acceptsThePublishedUserServiceContract() {
        assertThat(validator.validate(token(ISSUER, List.of(AUDIENCE), "ADMIN", validTimes())).hasErrors())
                .isFalse();
        assertThat(validator.validate(token(ISSUER, List.of(AUDIENCE), "REQUESTER", validTimes())).hasErrors())
                .isFalse();
        assertThat(validator.validate(token(ISSUER, List.of(AUDIENCE), "COURIER", validTimes())).hasErrors())
                .isFalse();
    }

    @Test
    void rejectsAnInvalidIssuer() {
        assertThat(validator.validate(token("another-service", List.of(AUDIENCE), "ADMIN", validTimes())).hasErrors())
                .isTrue();
    }

    @Test
    void rejectsAnInvalidAudience() {
        assertThat(validator.validate(token(ISSUER, List.of("another-api"), "ADMIN", validTimes())).hasErrors())
                .isTrue();
    }

    @Test
    void rejectsExpiredTokens() {
        Instant now = Instant.now();
        TokenTimes expired = new TokenTimes(now.minusSeconds(300), now.minusSeconds(120), now.minusSeconds(300));

        assertThat(validator.validate(token(ISSUER, List.of(AUDIENCE), "ADMIN", expired)).hasErrors())
                .isTrue();
    }

    @Test
    void rejectsTokensThatAreNotValidYet() {
        Instant now = Instant.now();
        TokenTimes future = new TokenTimes(now, now.plusSeconds(600), now.plusSeconds(300));

        assertThat(validator.validate(token(ISSUER, List.of(AUDIENCE), "ADMIN", future)).hasErrors())
                .isTrue();
    }

    @Test
    void rejectsMissingAndUnsupportedRoles() {
        assertThat(validator.validate(token(ISSUER, List.of(AUDIENCE), null, validTimes())).hasErrors())
                .isTrue();
        assertThat(validator.validate(token(ISSUER, List.of(AUDIENCE), "SUPER_ADMIN", validTimes())).hasErrors())
                .isTrue();
    }

    private static Jwt token(String issuer, List<String> audience, String role, TokenTimes times) {
        Jwt.Builder builder = Jwt.withTokenValue("test-token")
                .header("alg", "RS256")
                .issuer(issuer)
                .subject("722d6da3-93f0-4a7d-9820-ab05047a9253")
                .audience(audience)
                .issuedAt(times.issuedAt())
                .notBefore(times.notBefore())
                .expiresAt(times.expiresAt());
        if (role != null) {
            builder.claim("role", role);
        }
        return builder.build();
    }

    private static TokenTimes validTimes() {
        Instant now = Instant.now();
        return new TokenTimes(now.minusSeconds(30), now.plusSeconds(600), now.minusSeconds(30));
    }

    private record TokenTimes(Instant issuedAt, Instant expiresAt, Instant notBefore) {
    }
}
