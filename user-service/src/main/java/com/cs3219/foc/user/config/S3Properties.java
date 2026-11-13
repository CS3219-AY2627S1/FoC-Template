package com.cs3219.foc.user.config;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("storage.s3")
public record S3Properties(@NotBlank String bucket) {}
