package com.cs3219.foc.credit.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("events.publication")
public record EventPublicationProperties(
        @DefaultValue("30s") Duration retryDelay) {}
