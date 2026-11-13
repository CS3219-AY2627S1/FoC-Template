package com.friendoncampus.order.config;

import java.util.Set;
import java.util.UUID;

import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtValidators;

/**
 * Enforces the published User Service token contract: issuer and expiry, audience, a single
 * supported {@code role}, and a {@code sub} that is a user UUID so the controller can trust
 * {@code jwt.getSubject()} as the caller's identity.
 */
public final class JwtContractValidator implements OAuth2TokenValidator<Jwt> {

    private static final Set<String> SUPPORTED_ROLES = Set.of("REQUESTER", "COURIER", "ADMIN");

    private final OAuth2TokenValidator<Jwt> delegate;

    public JwtContractValidator(JwtResourceServerProperties properties) {
        OAuth2TokenValidator<Jwt> audienceValidator = jwt -> jwt.getAudience() != null
                && jwt.getAudience().contains(properties.audience())
                ? OAuth2TokenValidatorResult.success()
                : failure("Invalid token audience");
        OAuth2TokenValidator<Jwt> roleValidator = jwt -> {
            String role = jwt.getClaimAsString("role");
            return role != null && SUPPORTED_ROLES.contains(role)
                    ? OAuth2TokenValidatorResult.success()
                    : failure("Missing or unsupported role claim");
        };
        OAuth2TokenValidator<Jwt> subjectValidator = jwt -> isUuid(jwt.getSubject())
                ? OAuth2TokenValidatorResult.success()
                : failure("JWT 'sub' claim must be a user UUID");

        delegate = new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefaultWithIssuer(properties.issuer()),
                audienceValidator,
                roleValidator,
                subjectValidator);
    }

    @Override
    public OAuth2TokenValidatorResult validate(Jwt token) {
        return delegate.validate(token);
    }

    private static boolean isUuid(String value) {
        if (value == null) {
            return false;
        }
        try {
            UUID.fromString(value);
            return true;
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private static OAuth2TokenValidatorResult failure(String description) {
        return OAuth2TokenValidatorResult.failure(
                new OAuth2Error("invalid_token", description, null));
    }
}
