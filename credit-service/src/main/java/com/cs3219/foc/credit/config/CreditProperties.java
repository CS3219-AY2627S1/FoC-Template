package com.cs3219.foc.credit.config;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("credits")
public record CreditProperties(@NotNull @Min(0) Long initialAllocation) {}
