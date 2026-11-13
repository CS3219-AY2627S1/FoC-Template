package com.cs3219.foc.user.config;

import jakarta.validation.constraints.NotNull;
import java.time.Duration;
import org.hibernate.validator.constraints.time.DurationMin;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("storage.avatars")
public record AvatarStorageProperties(
        @NotNull @DurationMin(seconds = 1) Duration readUrlTtl) {}
