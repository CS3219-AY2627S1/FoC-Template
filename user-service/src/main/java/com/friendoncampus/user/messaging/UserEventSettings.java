package com.friendoncampus.user.messaging;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

@Validated
@ConfigurationProperties("app.events")
public record UserEventSettings(boolean enabled, String bootstrapServers, String securityProtocol,
        String saslMechanism, String username, String password,
        @Min(100) @Max(30000) long sendTimeoutMs,
        @Min(100) @Max(3600000) long retryDelayMs,
        @Min(1) @Max(100) int batchSize) {
    // Never allow configuration-object logging to reveal the Kafka password.
    @Override public String toString() { return "UserEventSettings[credentials=REDACTED]"; }
}
