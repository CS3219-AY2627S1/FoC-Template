package com.cs3219.foc.user.config;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.net.URI;
import java.time.Duration;
import org.hibernate.validator.constraints.time.DurationMin;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties(prefix = "account-mail")
public record AccountMailProperties(
        @NotBlank String from,
        @NotNull URI frontendUrl,
        @NotNull @DurationMin(seconds = 1) Duration tokenTtl,
        @NotNull @DurationMin(seconds = 1) Duration resendInterval) {}
