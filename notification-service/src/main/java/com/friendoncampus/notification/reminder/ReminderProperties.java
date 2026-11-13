package com.friendoncampus.notification.reminder;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * The reminder sender (DESIGN.md "Reminders"). {@code maxLateness}: a reminder the sender reaches
 * later than this after its time is dropped as {@code MISSED} instead of sent, so an outage does
 * not deliver stale nudges. Settled reminders are pruned after {@code retention}.
 */
@Validated
@ConfigurationProperties("app.reminders")
public record ReminderProperties(
        @DefaultValue("true") boolean enabled,
        @NotNull @DefaultValue("30m") Duration maxLateness,
        @NotNull @DefaultValue("30d") Duration retention,
        @Min(1) @Max(1_000) @DefaultValue("100") int batchSize) {

    @AssertTrue(message = "app.reminders.max-lateness and retention must be positive")
    public boolean isPositive() {
        return maxLateness == null || retention == null
                || (maxLateness.compareTo(Duration.ZERO) > 0 && retention.compareTo(Duration.ZERO) > 0);
    }
}
