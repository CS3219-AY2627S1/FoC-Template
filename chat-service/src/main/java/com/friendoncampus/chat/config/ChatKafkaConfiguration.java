package com.friendoncampus.chat.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.annotation.EnableKafka;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.listener.ContainerProperties;

/** Enables the order-lifecycle listener when Kafka integration is active. */
@Configuration
@EnableKafka
@ConditionalOnProperty(name = "app.kafka.enabled", havingValue = "true", matchIfMissing = true)
public class ChatKafkaConfiguration {
    @Bean
    ConcurrentKafkaListenerContainerFactory<String, String> kafkaListenerContainerFactory(
            ConsumerFactory<String, String> consumerFactory) {
        ConcurrentKafkaListenerContainerFactory<String, String> factory =
                new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(consumerFactory);
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL_IMMEDIATE);
        // Invalid/conflicting raw facts are durable in Chat quarantine. Do not skip their offsets.
        factory.setCommonErrorHandler(new org.springframework.kafka.listener.DefaultErrorHandler((record,error)->{
            throw new IllegalStateException("Evidence processing unavailable; quarantined record/offset retained",error);
        },new org.springframework.util.backoff.FixedBackOff(1000L,2L)));
        return factory;
    }
}
