package com.friendoncampus.user.messaging;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import org.apache.kafka.clients.producer.Producer;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.annotation.Transactional;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;

public class UserOutboxPublisher {
    public static final String TOPIC = "user.events";
    private static final Logger LOG = LoggerFactory.getLogger(UserOutboxPublisher.class);
    private final UserOutboxRepository outbox;
    private final Producer<String, String> producer;
    private final UserEventSettings settings;
    private final Clock clock;
    private final MeterRegistry meters;

    public UserOutboxPublisher(UserOutboxRepository outbox, Producer<String, String> producer,
            UserEventSettings settings, Clock clock, MeterRegistry meters) {
        this.outbox = outbox;
        this.producer = producer;
        this.settings = settings;
        this.clock = clock;
        this.meters = meters;
        Gauge.builder("user.events.outbox.pending", outbox, UserOutboxRepository::countByPublishedAtIsNull)
                .register(meters);
        Gauge.builder("user.events.outbox.oldest.age.seconds", outbox,
                repository -> repository.oldestPending().map(time ->
                        (double) Math.max(0, Duration.between(time.toInstant(), clock.instant()).toSeconds()))
                        .orElse(0.0)).register(meters);
    }

    /** Lock just one outbox row, not the user. Multiple application replicas skip locked rows. */
    @Transactional
    public boolean publishNext() {
        var pending = outbox.lockNextReady(now());
        if (pending.isEmpty()) return false;
        UserOutboxEvent event = pending.get();
        event.recordAttempt();
        String outcome;
        try {
            producer.send(new ProducerRecord<>(TOPIC, event.getUserId().toString(), event.getPayload()))
                    .get(settings.sendTimeoutMs(), TimeUnit.MILLISECONDS);
            event.acknowledge(now());
            meters.counter("user.events.published").increment();
            outcome = "ACKNOWLEDGED";
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            outcome = "INTERRUPTED";
            event.retryAt(now().plusNanos(settings.retryDelayMs() * 1_000_000), outcome);
            meters.counter("user.events.publish.failures").increment();
        } catch (Exception exception) {
            // Persist a bounded category, never exception messages, payloads or credentials.
            Throwable cause = exception instanceof ExecutionException ? exception.getCause() : exception;
            outcome = cause instanceof org.apache.kafka.common.errors.AuthenticationException ? "AUTHENTICATION"
                    : cause instanceof org.apache.kafka.common.errors.AuthorizationException ? "AUTHORIZATION"
                    : cause instanceof java.util.concurrent.TimeoutException
                    || cause instanceof org.apache.kafka.common.errors.TimeoutException ? "TIMEOUT" : "SEND_FAILED";
            event.retryAt(now().plusNanos(settings.retryDelayMs() * 1_000_000), outcome);
            meters.counter("user.events.publish.failures").increment();
        }
        outbox.save(event);
        LOG.info("User event producer=user-service eventId={} eventType=UserActivated operationId={} correlationId={} attempt={} outcome={}",
                event.getEventId(), event.getOperationId(), event.getCorrelationId(), event.getAttemptCount(), outcome);
        return true;
    }

    private OffsetDateTime now() { return OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC); }
}
