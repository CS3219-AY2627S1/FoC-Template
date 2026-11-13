package com.friendoncampus.order.messaging;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.order.repository.OutboxEventRepository;
import com.friendoncampus.order.repository.OutboxEventRepository.UnansweredCommand;
import com.friendoncampus.order.repository.OutboxEventRepository.UnansweredTotals;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;

/**
 * Finds Order commands to Credit that never got an outcome (blueprint "Observability" and
 * reconciliation): an {@code order.events} row whose {@code operationId} has no Credit event in the
 * inbox {@code after} it was published (or written, if it is still unpublished). It only reports:
 * Credit owns every ledger effect and recovery replays the original record, so Order never re-sends
 * or invents a new operation.
 *
 * <p>Each command is warned about once per process, with every ID needed to trace it. A
 * credit-timeout {@code OrderExpired} is reported separately and only at INFO: Credit answers it only
 * when it held a reservation (blueprint "pending-credit timeout").
 */
@Component
public class CreditReconciliation {

    private static final Logger log = LoggerFactory.getLogger(CreditReconciliation.class);
    private static final int BATCH_SIZE = 100;
    /** Bounds the remembered IDs; once full it is cleared, so at worst a command is warned about again. */
    private static final int MAX_REMEMBERED = 10_000;

    private final OutboxEventRepository outboxEventRepository;
    private final Clock clock;
    private final Duration after;
    private final Set<UUID> reported = Collections.newSetFromMap(new LinkedHashMap<>());
    private final AtomicReference<UnansweredSnapshot> latest = new AtomicReference<>(UnansweredSnapshot.NONE);

    public CreditReconciliation(OutboxEventRepository outboxEventRepository, Clock clock, MeterRegistry registry,
            @Value("${app.orders.credit-reconciliation.after:PT10M}") Duration after) {
        if (after.isNegative() || after.isZero()) {
            throw new IllegalArgumentException("app.orders.credit-reconciliation.after must be positive");
        }
        this.outboxEventRepository = outboxEventRepository;
        this.clock = clock;
        this.after = after;
        Gauge.builder("order.credit.unanswered", latest, snapshot -> snapshot.get().unanswered())
                .description("Order commands to Credit with no outcome after the reconciliation threshold")
                .baseUnit("commands")
                .register(registry);
        Gauge.builder("order.credit.unanswered.oldest.age", latest, snapshot -> snapshot.get().oldestAgeSeconds())
                .description("Seconds since the oldest unanswered command was published; 0 when none")
                .baseUnit("seconds")
                .register(registry);
        Gauge.builder("order.credit.timeout.unanswered", latest, snapshot -> snapshot.get().timeoutsWithoutAnswer())
                .description("Credit-timeout expiries with no Credit outcome; expected when Credit held no reservation")
                .baseUnit("commands")
                .register(registry);
    }

    /** One check: refreshes the gauges and warns about newly found unanswered commands. */
    @Transactional(readOnly = true)
    public Result check() {
        OffsetDateTime now = OffsetDateTime.now(clock);
        OffsetDateTime cutoff = now.minus(after);
        UnansweredTotals totals = outboxEventRepository.unansweredTotals(cutoff, now);
        latest.set(new UnansweredSnapshot(totals.getUnanswered(), totals.getOldestAgeSeconds(),
                totals.getTimeoutsWithoutAnswer()));
        List<UnansweredCommand> commands = outboxEventRepository.findUnansweredCommands(cutoff, BATCH_SIZE);
        int newlyReported = 0;
        for (UnansweredCommand command : commands) {
            if (remember(command.getEventId())) {
                report(command, now);
                newlyReported++;
            }
        }
        if (totals.getUnanswered() > 0) {
            log.warn("Credit reconciliation: {} command(s) without a Credit outcome after {}; oldest {}s",
                    totals.getUnanswered(), after, Math.round(totals.getOldestAgeSeconds()));
        }
        return new Result(totals.getUnanswered(), totals.getTimeoutsWithoutAnswer(), newlyReported);
    }

    private void report(UnansweredCommand command, OffsetDateTime now) {
        Instant since = command.getPublishedAt() != null ? command.getPublishedAt() : command.getCreatedAt();
        long ageSeconds = Duration.between(since, now.toInstant()).toSeconds();
        String published = command.getPublishedAt() != null ? "published" : "unpublished";
        if (command.getMayGoUnanswered()) {
            log.info("outcome=TIMEOUT_UNANSWERED eventId={} eventType={} operationId={} orderId={} correlationId={}"
                    + " ageSeconds={} {}; expected if Credit held no reservation", command.getEventId(),
                    command.getEventType(), command.getOperationId(), command.getOrderId(),
                    command.getCorrelationId(), ageSeconds, published);
            return;
        }
        log.warn("outcome=CREDIT_OUTCOME_MISSING eventId={} eventType={} operationId={} orderId={} correlationId={}"
                + " ageSeconds={} {}; check credit.events.DLT, Credit's inbox and order.events.DLT for this"
                + " operationId and replay the original record (never re-send from Order)", command.getEventId(),
                command.getEventType(), command.getOperationId(), command.getOrderId(),
                command.getCorrelationId(), ageSeconds, published);
    }

    private synchronized boolean remember(UUID eventId) {
        if (reported.size() >= MAX_REMEMBERED) {
            reported.clear();
        }
        return reported.add(eventId);
    }

    /** What one check found. */
    public record Result(long unanswered, long timeoutsWithoutAnswer, int newlyReported) {
    }

    private record UnansweredSnapshot(double unanswered, double oldestAgeSeconds, double timeoutsWithoutAnswer) {
        static final UnansweredSnapshot NONE = new UnansweredSnapshot(0, 0, 0);
    }

    /** For tests: the threshold in use. */
    Duration after() {
        return after;
    }

    /** For tests: values by gauge name. */
    Map<String, Double> gaugeValues() {
        UnansweredSnapshot snapshot = latest.get();
        return Map.of("order.credit.unanswered", snapshot.unanswered(),
                "order.credit.unanswered.oldest.age", snapshot.oldestAgeSeconds(),
                "order.credit.timeout.unanswered", snapshot.timeoutsWithoutAnswer());
    }
}
