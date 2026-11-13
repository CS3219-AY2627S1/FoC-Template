package com.cs3219.foc.order.config;

import jakarta.validation.constraints.*;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("orders")
public record OrderProperties(
        @DefaultValue("100") @Min(1) @Max(500) int expiryBatchSize) {}
