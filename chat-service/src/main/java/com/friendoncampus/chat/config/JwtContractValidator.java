package com.friendoncampus.chat.config;

import java.util.Set;
import java.util.UUID;

import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtValidators;

public final class JwtContractValidator implements OAuth2TokenValidator<Jwt> {

    private static final Set<String> SUPPORTED_ROLES = Set.of("REQUESTER", "COURIER", "ADMIN");

    private final OAuth2TokenValidator<Jwt> delegate;

    public JwtContractValidator(JwtResourceServerProperties properties) {
        OAuth2TokenValidator<Jwt> audience = jwt -> jwt.getAudience() != null
                && jwt.getAudience().contains(properties.audience())
                ? OAuth2TokenValidatorResult.success()
                : failure("Invalid token audience");
        OAuth2TokenValidator<Jwt> role = jwt -> {
            String claim = jwt.getClaimAsString("role");
            return claim != null && SUPPORTED_ROLES.contains(claim)
                    ? OAuth2TokenValidatorResult.success()
                    : failure("Missing or unsupported role claim");
        };
        OAuth2TokenValidator<Jwt> subject = jwt -> isUuid(jwt.getSubject())
                ? OAuth2TokenValidatorResult.success()
                : failure("JWT 'sub' claim must be a user UUID");
        delegate = new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefaultWithIssuer(properties.issuer()), audience, role, subject);
    }

    @Override
    public OAuth2TokenValidatorResult validate(Jwt token) {
        return delegate.validate(token);
    }

    private static boolean isUuid(String value) {
        try {
            UUID.fromString(value);
            return true;
        } catch (IllegalArgumentException | NullPointerException exception) {
            return false;
        }
    }

    private static OAuth2TokenValidatorResult failure(String description) {
        return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", description, null));
    }
}
