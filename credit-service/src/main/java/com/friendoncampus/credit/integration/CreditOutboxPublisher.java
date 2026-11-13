package com.friendoncampus.credit.integration;

import java.time.Duration;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.friendoncampus.credit.domain.CreditOutboxEvent;

@Component
@ConditionalOnProperty(name = "app.kafka.enabled", havingValue = "true")
public class CreditOutboxPublisher {
    private static final Logger LOGGER = LoggerFactory.getLogger(CreditOutboxPublisher.class);

    private final CreditOutboxService outbox;
    private final CreditEventJsonCodec codec;
    private final KafkaTemplate<String, String> kafka;
    private final String topic;
    private final int batchSize;

    public CreditOutboxPublisher(
            CreditOutboxService outbox,
            CreditEventJsonCodec codec,
            KafkaTemplate<String, String> kafka,
            @Value("${app.kafka.credit-events-topic}") String topic,
            @Value("${app.kafka.outbox-batch-size}") int batchSize) {
        this.outbox = outbox;
        this.codec = codec;
        this.kafka = kafka;
        this.topic = topic;
        this.batchSize = batchSize;
    }

    @Scheduled(fixedDelayString = "${app.kafka.outbox-delay}")
    public void publishPending() {
        for (CreditOutboxEvent event : outbox.pending(batchSize)) {
            publish(event);
        }
    }

    private void publish(CreditOutboxEvent event) {
        try {
            String payload = codec.serialize(event);
            kafka.send(topic, event.getAggregateId().toString(), payload)
                    .get(Duration.ofSeconds(10).toMillis(), TimeUnit.MILLISECONDS);
            outbox.markPublished(event.getEventId());
            LOGGER.info("Published credit outcome eventId={} eventType={} aggregateId={}",
                    event.getEventId(), event.getEventType(), event.getAggregateId());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            outbox.recordPublishFailure(event.getEventId(), exception);
        } catch (Exception exception) {
            outbox.recordPublishFailure(event.getEventId(), exception);
            LOGGER.warn("Credit outcome publish failed eventId={} eventType={} aggregateId={}",
                    event.getEventId(), event.getEventType(), event.getAggregateId(), exception);
        }
    }
}
