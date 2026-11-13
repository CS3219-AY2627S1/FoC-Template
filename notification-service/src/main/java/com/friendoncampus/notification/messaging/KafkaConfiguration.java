package com.friendoncampus.notification.messaging;

import org.apache.kafka.common.TopicPartition;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.ContainerProperties;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.util.backoff.ExponentialBackOff;

/**
 * Kafka adapters: the {@code credit.events} and {@code order.lifecycle.events} listeners. Topics and
 * ACLs are created by the shared Kafka initializer, not here. Turned off with
 * {@code NOTIFICATION_KAFKA_ENABLED=false}; nothing is then consumed.
 */
@Configuration
@ConditionalOnProperty(name = "app.kafka.enabled", havingValue = "true", matchIfMissing = true)
public class KafkaConfiguration {

    static final String CREDIT_EVENTS_DLT = "credit.events.DLT";
    static final String ORDER_LIFECYCLE_EVENTS_DLT = "order.lifecycle.events.DLT";
    static final String CHAT_EVENTS_DLT = "chat.events.DLT";

    @Bean
    CreditEventsListener creditEventsListener(CreditEventHandler handler) {
        return new CreditEventsListener(handler);
    }

    @Bean
    OrderLifecycleEventsListener orderLifecycleEventsListener(OrderLifecycleEventHandler handler) {
        return new OrderLifecycleEventsListener(handler);
    }

    @Bean
    ChatMessageEventsListener chatMessageEventsListener(ChatMessageEventHandler handler) {
        return new ChatMessageEventsListener(handler);
    }

    /**
     * Manual acknowledgement after the handler commits. Transient failures are retried three times
     * with backoff; contract violations are not retried. Either way the original record (key kept,
     * with headers naming the {@code notification-service} group and the exception) then goes to
     * {@code credit.events.DLT}, which has one partition and is shared with Order's consumer.
     */
    @Bean
    ConcurrentKafkaListenerContainerFactory<String, String> creditEventsContainerFactory(
            ConsumerFactory<String, String> consumerFactory, KafkaTemplate<String, String> kafkaTemplate) {
        return containerFactory(consumerFactory, kafkaTemplate, CREDIT_EVENTS_DLT);
    }

    /** The same rules for {@code order.lifecycle.events}, dead-lettering to its own one-partition DLT. */
    @Bean
    ConcurrentKafkaListenerContainerFactory<String, String> orderLifecycleEventsContainerFactory(
            ConsumerFactory<String, String> consumerFactory, KafkaTemplate<String, String> kafkaTemplate) {
        return containerFactory(consumerFactory, kafkaTemplate, ORDER_LIFECYCLE_EVENTS_DLT);
    }

    @Bean
    ConcurrentKafkaListenerContainerFactory<String, String> chatEventsContainerFactory(
            ConsumerFactory<String, String> consumerFactory, KafkaTemplate<String, String> kafkaTemplate) {
        return containerFactory(consumerFactory, kafkaTemplate, CHAT_EVENTS_DLT);
    }

    private static ConcurrentKafkaListenerContainerFactory<String, String> containerFactory(
            ConsumerFactory<String, String> consumerFactory, KafkaTemplate<String, String> kafkaTemplate,
            String deadLetterTopic) {
        ConcurrentKafkaListenerContainerFactory<String, String> factory = new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(consumerFactory);
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL_IMMEDIATE);
        DeadLetterPublishingRecoverer recoverer = new DeadLetterPublishingRecoverer(kafkaTemplate,
                (record, exception) -> new TopicPartition(deadLetterTopic, 0));
        ExponentialBackOff backOff = new ExponentialBackOff(500L, 2.0);
        backOff.setMaxAttempts(3);
        DefaultErrorHandler errorHandler = new DefaultErrorHandler(recoverer, backOff);
        errorHandler.addNotRetryableExceptions(EventRejectedException.class);
        factory.setCommonErrorHandler(errorHandler);
        return factory;
    }
}
