package com.friendoncampus.order.messaging;

import java.time.Clock;
import java.time.Duration;

import org.apache.kafka.common.TopicPartition;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.ContainerProperties;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.util.backoff.ExponentialBackOff;

import com.friendoncampus.order.domain.OrderTransitionException;
import com.friendoncampus.order.repository.OutboxEventRepository;
import com.friendoncampus.order.service.OrderNotFoundException;

/**
 * Kafka adapters for the event blueprint: the outbox relay to {@code order.events} and the
 * {@code credit.events} listener. Topics and ACLs are created by the shared Kafka initializer, not
 * here. Turned off with {@code ORDER_KAFKA_ENABLED=false}; outbox rows then wait unpublished.
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(name = "app.kafka.enabled", havingValue = "true", matchIfMissing = true)
public class KafkaConfiguration {

    public static final String CREDIT_EVENTS_TOPIC = "credit.events";
    static final String CREDIT_EVENTS_DLT = "credit.events.DLT";

    /**
     * The batch is small because its rows stay locked while they are sent (up to the send timeout
     * each); a larger backlog drains over several one-second runs.
     */
    @Bean
    OutboxRelay outboxRelay(OutboxEventRepository outboxEventRepository, KafkaTemplate<String, String> kafkaTemplate,
            Clock clock,
            @Value("${app.kafka.outbox.batch-size:20}") int batchSize,
            @Value("${app.kafka.outbox.send-timeout-ms:10000}") long sendTimeoutMs,
            @Value("${app.kafka.outbox.stuck-attempts:10}") int stuckAttempts) {
        return new OutboxRelay(outboxEventRepository, kafkaTemplate, clock, batchSize,
                Duration.ofMillis(sendTimeoutMs), stuckAttempts);
    }

    @Bean
    OutboxRelaySchedule outboxRelaySchedule(OutboxRelay relay) {
        return new OutboxRelaySchedule(relay);
    }

    @Bean
    CreditEventsListener creditEventsListener(CreditOutcomeHandler handler) {
        return new CreditEventsListener(handler);
    }

    /**
     * Manual acknowledgement after the handler commits. Transient failures (database or broker
     * trouble) are retried three times with backoff. Failures that would fail the same way every
     * time are not retried: contract violations, an outcome the order's state cannot take, and an
     * order that does not exist. Either way the original record (key and headers kept) then goes
     * to {@code credit.events.DLT}, which has one partition.
     */
    @Bean
    ConcurrentKafkaListenerContainerFactory<String, String> creditEventsContainerFactory(
            ConsumerFactory<String, String> consumerFactory, KafkaTemplate<String, String> kafkaTemplate) {
        ConcurrentKafkaListenerContainerFactory<String, String> factory = new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(consumerFactory);
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL_IMMEDIATE);
        DeadLetterPublishingRecoverer recoverer = new DeadLetterPublishingRecoverer(kafkaTemplate,
                (record, exception) -> new TopicPartition(CREDIT_EVENTS_DLT, 0));
        ExponentialBackOff backOff = new ExponentialBackOff(500L, 2.0);
        backOff.setMaxAttempts(3);
        DefaultErrorHandler errorHandler = new DefaultErrorHandler(recoverer, backOff);
        errorHandler.addNotRetryableExceptions(CreditOutcomeRejectedException.class,
                OrderTransitionException.class, OrderNotFoundException.class);
        factory.setCommonErrorHandler(errorHandler);
        return factory;
    }

    /** Runs the relay on a timer. */
    static class OutboxRelaySchedule {

        private final OutboxRelay relay;

        OutboxRelaySchedule(OutboxRelay relay) {
            this.relay = relay;
        }

        @Scheduled(fixedDelayString = "${app.kafka.outbox.interval-ms:1000}")
        void run() {
            relay.publishPending();
        }
    }
}
