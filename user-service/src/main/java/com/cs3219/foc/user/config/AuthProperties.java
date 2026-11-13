package com.cs3219.foc.user.config;

import jakarta.validation.constraints.NotNull;
import java.time.Duration;
import org.hibernate.validator.constraints.time.DurationMin;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.core.io.Resource;
import org.springframework.validation.annotation.Validated;

@ConfigurationProperties(prefix = "auth")
@Validated
public record AuthProperties(
        @NotNull @DurationMin(minutes = 1) Duration accessTokenTtl,
        @NotNull @DurationMin(minutes = 1) Duration refreshTokenTtl,
        @NotNull Resource privateKeyLocation,
        @NotNull Resource publicKeyLocation,
        @NotNull String keyId,
        boolean refreshCookieSecure) {}
