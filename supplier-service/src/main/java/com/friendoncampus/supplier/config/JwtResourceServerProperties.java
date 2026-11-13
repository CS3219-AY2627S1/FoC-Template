package com.friendoncampus.supplier.config;

import java.net.URI;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

@Validated
@ConfigurationProperties("app.security.jwt")
public record JwtResourceServerProperties(
        @NotNull URI jwkSetUri,
        @NotBlank String issuer,
        @NotBlank String audience) {
}
