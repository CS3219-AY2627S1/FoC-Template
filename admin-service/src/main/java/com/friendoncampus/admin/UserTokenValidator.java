package com.friendoncampus.admin;

import java.util.Set;
import java.util.UUID;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.jwt.*;

public final class UserTokenValidator implements OAuth2TokenValidator<Jwt> {
    private final OAuth2TokenValidator<Jwt> defaults;
    private final String audience;
    public UserTokenValidator(String issuer, String audience) {
        defaults = JwtValidators.createDefaultWithIssuer(issuer); this.audience = audience;
    }
    public OAuth2TokenValidatorResult validate(Jwt jwt) {
        try {
            UUID id = UUID.fromString(jwt.getSubject());
            if (!id.toString().equalsIgnoreCase(jwt.getSubject()) || jwt.getExpiresAt() == null || jwt.getIssuedAt() == null
                    || !jwt.getExpiresAt().isAfter(jwt.getIssuedAt()) || jwt.getIssuedAt().isAfter(java.time.Instant.now().plusSeconds(5))
                    || jwt.getHeaders().get("kid") == null || !jwt.getAudience().contains(audience)
                    || !Set.of("REQUESTER", "COURIER", "ADMIN").contains(jwt.getClaimAsString("role"))) throw new IllegalArgumentException();
            return defaults.validate(jwt);
        } catch (Exception ex) {
            return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "Invalid User token claims", null));
        }
    }
}
