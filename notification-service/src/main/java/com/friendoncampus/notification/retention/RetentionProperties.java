package com.friendoncampus.notification.retention;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * The approved retention policy (DESIGN.md "Decisions"). Startup fails on an invalid value, in
 * particular an inbox period under 30 days: DLT records are kept 30 days, so pruning inbox rows
 * sooner would let a replayed event notify twice.
 */
@Validated
@ConfigurationProperties("app.retention")
public record RetentionProperties(
        @DefaultValue("true") boolean enabled,
        @NotNull @DefaultValue("30d") Duration readNotifications,
        @NotNull @DefaultValue("90d") Duration allNotifications,
        @NotNull @DefaultValue("30d") Duration inbox,
        @Min(1) @Max(10_000) @DefaultValue("500") int batchSize) {

    /** The DLT replay horizon; inbox rows must outlive it. */
    public static final Duration MIN_INBOX = Duration.ofDays(30);

    @AssertTrue(message = "app.retention.inbox must be at least 30 days, the DLT replay window")
    public boolean isInboxKeptForTheReplayWindow() {
        return inbox == null || inbox.compareTo(MIN_INBOX) >= 0;
    }

    @AssertTrue(message = "app.retention.read-notifications and all-notifications must be positive")
    public boolean isNotificationPeriodPositive() {
        return readNotifications == null || allNotifications == null
                || (readNotifications.compareTo(Duration.ZERO) > 0 && allNotifications.compareTo(Duration.ZERO) > 0);
    }
}
