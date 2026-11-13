package com.friendoncampus.order.messaging;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.concurrent.atomic.AtomicReference;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.friendoncampus.order.repository.OutboxEventRepository;
import com.friendoncampus.order.repository.OutboxEventRepository.OutboxBacklog;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;

/**
 * Gauges for the unpublished outbox backlog (blueprint "Observability"): how many events wait, how
 * old the oldest one is and the most attempts any of them has had. Registered whether or not Kafka
 * is enabled, since rows also wait when it is off. One query serves all three gauges and is reused
 * for a few seconds, so a scrape does not hit the database three times.
 */
@Component
public class OutboxMetrics {

    private static final Logger log = LoggerFactory.getLogger(OutboxMetrics.class);
    private static final Duration REFRESH = Duration.ofSeconds(5);

    private final OutboxEventRepository outboxEventRepository;
    private final Clock clock;
    private final AtomicReference<Snapshot> latest = new AtomicReference<>();

    public OutboxMetrics(OutboxEventRepository outboxEventRepository, Clock clock, MeterRegistry registry) {
        this.outboxEventRepository = outboxEventRepository;
        this.clock = clock;
        Gauge.builder("order.outbox.pending", this, metrics -> metrics.backlog().pending())
                .description("Outbox events not yet acknowledged by Kafka")
                .baseUnit("events")
                .register(registry);
        Gauge.builder("order.outbox.oldest.age", this, metrics -> metrics.backlog().oldestAgeSeconds())
                .description("Age of the oldest unpublished outbox event; 0 when none waits")
                .baseUnit("seconds")
                .register(registry);
        Gauge.builder("order.outbox.max.attempts", this, metrics -> metrics.backlog().maxAttempts())
                .description("Most failed publish attempts of any unpublished outbox event")
                .register(registry);
    }

    /** The backlog, read at most once per refresh interval; NaN values if the database cannot answer. */
    Backlog backlog() {
        Instant now = clock.instant();
        Snapshot snapshot = latest.get();
        if (snapshot != null && snapshot.readAt().plus(REFRESH).isAfter(now)) {
            return snapshot.backlog();
        }
        Backlog backlog;
        try {
            OutboxBacklog row = outboxEventRepository.backlog(OffsetDateTime.now(clock));
            backlog = new Backlog(row.getPending(), row.getOldestAgeSeconds(), row.getMaxAttempts());
        } catch (RuntimeException exception) {
            log.warn("Could not read the outbox backlog for metrics", exception);
            backlog = new Backlog(Double.NaN, Double.NaN, Double.NaN);
        }
        latest.set(new Snapshot(now, backlog));
        return backlog;
    }

    record Backlog(double pending, double oldestAgeSeconds, double maxAttempts) {
    }

    private record Snapshot(Instant readAt, Backlog backlog) {
    }
}
