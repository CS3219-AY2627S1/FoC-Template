/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-27
 * Mode: Code generation and implementation assistance.
 * Scope: Generated the Credit compensation workflow implementation from the approved cross-service contract.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.credit.messaging;

import io.micrometer.core.instrument.MeterRegistry;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import sg.edu.nus.foc.credit.config.CreditCompensationProperties;
import sg.edu.nus.foc.credit.persistence.CreditCompensationOutboxStore;
import tools.jackson.databind.json.JsonMapper;

@Service
public class CreditCompensationOutboxDispatcher {

    private static final Logger log = LoggerFactory.getLogger(CreditCompensationOutboxDispatcher.class);
    private static final Duration CLAIM_LEASE = Duration.ofMinutes(2);
    private static final Duration MAX_RETRY = Duration.ofMinutes(5);

    private final CreditCompensationOutboxStore outbox;
    private final CreditCompensationResultPublisher publisher;
    private final CreditCompensationProperties properties;
    private final JsonMapper mapper;
    private final MeterRegistry metrics;

    public CreditCompensationOutboxDispatcher(CreditCompensationOutboxStore outbox,
                                              CreditCompensationResultPublisher publisher,
                                              CreditCompensationProperties properties,
                                              JsonMapper mapper,
                                              MeterRegistry metrics) {
        this.outbox = outbox;
        this.publisher = publisher;
        this.properties = properties;
        this.mapper = mapper;
        this.metrics = metrics;
        metrics.gauge("credit.compensation.outbox.oldest.age.seconds", this,
                dispatcher -> dispatcher.oldestAgeSeconds());
        metrics.gauge("credit.compensation.outbox.failed", this,
                dispatcher -> dispatcher.failedCount());
    }

    @EventListener
    public void afterCommit(CompensationResultDispatchRequested request) {
        dispatch(request.eventId());
    }

    public void dispatch(String eventId) {
        if (properties.messagingMode() == CreditCompensationProperties.Mode.DISABLED) {
            return;
        }
        try {
            Instant now = Instant.now();
            outbox.claim(eventId, now, now.plus(CLAIM_LEASE)).ifPresent(this::publishClaimed);
        } catch (RuntimeException exception) {
            log.error("Compensation result {} dispatch failed before publication.", eventId, exception);
        }
    }

    @Scheduled(cron = "${CREDIT_RESULT_OUTBOX_RECOVERY_CRON:0 * * * * *}")
    public void dispatchDue() {
        if (properties.messagingMode() == CreditCompensationProperties.Mode.DISABLED) {
            return;
        }
        Instant now = Instant.now();
        for (String eventId : outbox.dueIds(now, properties.outboxBatchSize())) {
            dispatch(eventId);
        }
    }

    private void publishClaimed(CreditCompensationOutboxStore.Entry entry) {
        long started = System.nanoTime();
        try {
            CreditCompensationResult result = mapper.readValue(entry.payload(), CreditCompensationResult.class);
            publisher.publish(entry.eventType(), entry.eventVersion(), result);
            outbox.markPublished(entry.eventId(), Instant.now());
            metrics.timer("credit.compensation.result.publish", "outcome", "success")
                    .record(Duration.ofNanos(System.nanoTime() - started));
        } catch (RuntimeException exception) {
            Instant retryAt = Instant.now().plus(retryDelay(entry.attemptCount()));
            outbox.scheduleRetry(entry.eventId(), retryAt, exception.getMessage());
            metrics.counter("credit.compensation.result.publish.failures").increment();
            if (entry.attemptCount() >= 10) {
                log.error("Compensation result {} exhausted ten attempts and is retained FAILED.",
                        entry.eventId(), exception);
            } else {
                log.warn("Compensation result {} publication failed; retry at {}.",
                        entry.eventId(), retryAt, exception);
            }
        }
    }

    static Duration retryDelay(int attempt) {
        int exponent = Math.min(Math.max(attempt, 1), 30);
        return Duration.ofSeconds(Math.min(1L << exponent, MAX_RETRY.toSeconds()));
    }

    private double oldestAgeSeconds() {
        return outbox.oldestUnfinishedCreatedAt()
                .map(created -> Math.max(0, Duration.between(created, Instant.now()).toSeconds()))
                .orElse(0L).doubleValue();
    }

    private double failedCount() {
        return outbox.failedCount();
    }
}
