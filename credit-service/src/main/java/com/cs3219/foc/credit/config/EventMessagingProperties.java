package com.cs3219.foc.credit.config;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("events.messaging")
public record EventMessagingProperties(
        @NotBlank String topicArn, @NotBlank String queueName) {}
