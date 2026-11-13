package com.friendoncampus.chat.config;

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
            new JwtResourceServerProperties(URI.create("http://localhost/jwks"), ISSUER, AUDIENCE));

    @Test
    void acceptsEverySupportedSessionRole() {
        for (String role : List.of("REQUESTER", "COURIER", "ADMIN")) {
            assertThat(validator.validate(token(SUBJECT, ISSUER, AUDIENCE, role, future())).hasErrors())
                    .as(role).isFalse();
        }
    }

    @Test
    void rejectsInvalidIdentityClaims() {
        assertThat(validator.validate(token(SUBJECT, "wrong", AUDIENCE, "REQUESTER", future())).hasErrors())
                .isTrue();
        assertThat(validator.validate(token(SUBJECT, ISSUER, "wrong", "REQUESTER", future())).hasErrors())
                .isTrue();
        assertThat(validator.validate(token(SUBJECT, ISSUER, AUDIENCE, "USER", future())).hasErrors())
                .isTrue();
        assertThat(validator.validate(token(SUBJECT, ISSUER, AUDIENCE, null, future())).hasErrors())
                .isTrue();
        assertThat(validator.validate(token("not-a-uuid", ISSUER, AUDIENCE, "REQUESTER", future())).hasErrors())
                .isTrue();
        assertThat(validator.validate(token(SUBJECT, ISSUER, AUDIENCE, "REQUESTER",
                Instant.now().minusSeconds(120))).hasErrors()).isTrue();
    }

    private static Instant future() {
        return Instant.now().plusSeconds(600);
    }

    private static Jwt token(String subject, String issuer, String audience, String role, Instant expiresAt) {
        Jwt.Builder builder = Jwt.withTokenValue("token")
                .header("alg", "RS256")
                .subject(subject)
                .issuer(issuer)
                .audience(List.of(audience))
                .issuedAt(expiresAt.minusSeconds(300))
                .expiresAt(expiresAt);
        if (role != null) {
            builder.claim("role", role);
        }
        return builder.build();
    }
}
