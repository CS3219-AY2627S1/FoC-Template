package com.friendoncampus.chat.dispute;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.listener.*;
import org.springframework.util.backoff.FixedBackOff;

@Configuration
public class DisputeKafkaConfiguration {
    @Bean
    ConcurrentKafkaListenerContainerFactory<String,String> disputeKafkaListenerContainerFactory(ConsumerFactory<String,String> consumers){
        var factory=new ConcurrentKafkaListenerContainerFactory<String,String>();
        factory.setConsumerFactory(consumers);
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL_IMMEDIATE);
        // Never advance past a database failure. Poison records are committed to local quarantine.
        factory.setCommonErrorHandler(new DefaultErrorHandler(new FixedBackOff(1000L,FixedBackOff.UNLIMITED_ATTEMPTS)));
        return factory;
    }
}
