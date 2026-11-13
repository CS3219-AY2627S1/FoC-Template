package com.friendoncampus.credit.config;

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
        OAuth2TokenValidator<Jwt> audienceValidator = jwt -> jwt.getAudience().contains(properties.audience())
                ? OAuth2TokenValidatorResult.success()
                : failure("Invalid token audience");
        OAuth2TokenValidator<Jwt> roleValidator = jwt -> {
            String role = jwt.getClaimAsString("role");
            return role != null && SUPPORTED_ROLES.contains(role)
                    ? OAuth2TokenValidatorResult.success()
                    : failure("Missing or unsupported role claim");
        };
        OAuth2TokenValidator<Jwt> subjectValidator = jwt -> {
            try {
                UUID.fromString(jwt.getSubject());
                return OAuth2TokenValidatorResult.success();
            } catch (IllegalArgumentException | NullPointerException exception) {
                return failure("Token subject must be a User UUID");
            }
        };

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

    private static OAuth2TokenValidatorResult failure(String description) {
        return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", description, null));
    }
}
