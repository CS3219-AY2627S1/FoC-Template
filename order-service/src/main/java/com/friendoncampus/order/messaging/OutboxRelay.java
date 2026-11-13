package com.friendoncampus.order.messaging;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.order.repository.OutboxEventRepository;

/**
 * Publishes {@code outbox_events} rows to Kafka (blueprint "Every producer"): each row is sent with
 * its stored {@code eventId}, payload and order UUID key; {@code published_at} is set only after
 * Kafka acknowledges, and a failed send stays pending with its attempt count increased.
 *
 * <p>Within one run, once an order's event fails, that order's later events on the same topic
 * wait, so one order's events are never published out of order on a topic. Topics are blocked
 * separately: a failing {@code order.lifecycle.events} row never holds back the credit requests on
 * {@code order.events}. Across instances the same holds because
 * {@link OutboxEventRepository#claimUnpublished} hands each order-and-topic stream to one instance
 * at a time.
 */
public class OutboxRelay {

    private static final Logger log = LoggerFactory.getLogger(OutboxRelay.class);

    private final OutboxEventRepository outboxEventRepository;
    private final KafkaTemplate<String, String> kafkaTemplate;
    private final Clock clock;
    private final int batchSize;
    private final Duration sendTimeout;
    private final int stuckAttempts;

    public OutboxRelay(OutboxEventRepository outboxEventRepository, KafkaTemplate<String, String> kafkaTemplate,
            Clock clock, int batchSize, Duration sendTimeout) {
        this(outboxEventRepository, kafkaTemplate, clock, batchSize, sendTimeout, Integer.MAX_VALUE);
    }

    /**
     * @param stuckAttempts failed attempts after which an event is reported as stuck, once, at
     *     ERROR, so a row that can never be sent (it still blocks its order's stream) is noticed
     */
    public OutboxRelay(OutboxEventRepository outboxEventRepository, KafkaTemplate<String, String> kafkaTemplate,
            Clock clock, int batchSize, Duration sendTimeout, int stuckAttempts) {
        this.outboxEventRepository = outboxEventRepository;
        this.kafkaTemplate = kafkaTemplate;
        this.clock = clock;
        this.batchSize = batchSize;
        this.sendTimeout = sendTimeout;
        this.stuckAttempts = stuckAttempts;
    }

    /** Sends one batch; returns how many events Kafka acknowledged. */
    @Transactional
    public int publishPending() {
        List<OutboxEvent> batch = outboxEventRepository.claimUnpublished(batchSize);
        Set<BlockedStream> blockedStreams = new HashSet<>();
        int published = 0;
        for (OutboxEvent event : batch) {
            if (blockedStreams.contains(BlockedStream.of(event))) {
                continue;
            }
            try {
                kafkaTemplate.send(event.getTopic(), event.getAggregateId().toString(), event.getPayload())
                        .get(sendTimeout.toMillis(), TimeUnit.MILLISECONDS);
                event.markPublished(OffsetDateTime.now(clock));
                published++;
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                failed(event, blockedStreams, exception);
                break;
            } catch (Exception exception) {
                failed(event, blockedStreams, exception);
            }
        }
        if (published > 0) {
            log.info("Published {} order event(s) to Kafka", published);
        }
        return published;
    }

    private void failed(OutboxEvent event, Set<BlockedStream> blockedStreams, Exception exception) {
        event.recordFailedAttempt();
        blockedStreams.add(BlockedStream.of(event));
        log.warn("Could not publish eventId={} eventType={} operationId={} orderId={} attempts={}",
                event.getId(), event.getEventType(), event.getOperationId(), event.getAggregateId(),
                event.getAttempts(), exception);
        if (event.getAttempts() == stuckAttempts) {
            log.error("Outbox event is stuck and holds back its order's later events on {}: eventId={} eventType={}"
                    + " operationId={} orderId={} attempts={}; it keeps being retried, check the broker and"
                    + " its ACLs", event.getTopic(), event.getId(), event.getEventType(), event.getOperationId(),
                    event.getAggregateId(), event.getAttempts());
        }
    }

    /** One order's events on one topic: the unit that keeps its order. */
    private record BlockedStream(String topic, UUID orderId) {
        static BlockedStream of(OutboxEvent event) {
            return new BlockedStream(event.getTopic(), event.getAggregateId());
        }
    }
}
