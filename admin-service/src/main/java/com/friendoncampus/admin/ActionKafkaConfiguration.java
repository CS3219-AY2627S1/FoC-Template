package com.friendoncampus.admin;

import org.apache.kafka.common.TopicPartition;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.*;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.util.backoff.FixedBackOff;

@Configuration
@EnableScheduling
@ConditionalOnProperty(name="app.kafka.enabled",havingValue="true")
public class ActionKafkaConfiguration {
    @Bean DefaultErrorHandler actionKafkaErrorHandler(KafkaTemplate<String,String> kafka){
        var recoverer=new DeadLetterPublishingRecoverer(kafka,(record,failure)->new TopicPartition(record.topic()+".DLT",0));
        recoverer.setFailIfSendResultIsError(true);
        var handler=new DefaultErrorHandler(recoverer,new FixedBackOff(1000L,2L));handler.setCommitRecovered(true);return handler;
    }
}
