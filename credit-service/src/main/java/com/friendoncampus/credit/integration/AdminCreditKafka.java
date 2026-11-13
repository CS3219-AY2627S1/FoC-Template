package com.friendoncampus.credit.integration;

import java.util.*;
import java.util.concurrent.TimeUnit;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.slf4j.*;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.kafka.annotation.*;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.*;
import org.springframework.kafka.listener.*;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.scheduling.annotation.*;
import org.springframework.util.backoff.FixedBackOff;

@Configuration
@EnableKafka
@EnableScheduling
@ConditionalOnProperty(name="app.admin-commands.enabled",havingValue="true")
public class AdminCreditKafka {
    private static final Logger log=LoggerFactory.getLogger(AdminCreditKafka.class);
    @Bean("adminCreditFactory")
    ConcurrentKafkaListenerContainerFactory<String,String> factory(ConsumerFactory<String,String> existing) {
        Map<String,Object> properties=new HashMap<>(existing.getConfigurationProperties());
        properties.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG,StringDeserializer.class);
        properties.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG,StringDeserializer.class);
        properties.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG,false);
        properties.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG,"earliest");
        properties.put(ConsumerConfig.ALLOW_AUTO_CREATE_TOPICS_CONFIG,false);
        properties.put(ConsumerConfig.ISOLATION_LEVEL_CONFIG,"read_committed");
        var factory=new ConcurrentKafkaListenerContainerFactory<String,String>();
        factory.setConsumerFactory(new DefaultKafkaConsumerFactory<>(properties));
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL_IMMEDIATE);
        factory.setCommonErrorHandler(new DefaultErrorHandler((record,error)->{
            throw new IllegalStateException("Correction processing unavailable; offset retained",error);
        },new FixedBackOff(1000L,2L)));
        return factory;
    }
    @Bean
    Transport adminCreditTransport(AdminCreditCorrectionService service,AdminCreditOutbox outbox,KafkaTemplate<String,String> kafka){return new Transport(service,outbox,kafka);}
    public static class Transport {
        private final AdminCreditCorrectionService service;
        private final AdminCreditOutbox outbox;
        private final KafkaTemplate<String,String> kafka;
        Transport(AdminCreditCorrectionService service,AdminCreditOutbox outbox,KafkaTemplate<String,String> kafka){this.service=service;this.outbox=outbox;this.kafka=kafka;}
        @KafkaListener(topics="admin.credit.commands",groupId="credit-service-admin",containerFactory="adminCreditFactory")
        public void receive(org.apache.kafka.clients.consumer.ConsumerRecord<String,String> record,Acknowledgment ack)throws Exception {
            if(!service.receive(record.key(),record.value())) {
                String metadata="{\"failureCode\":\"INVALID_OR_CONFLICTING_COMMAND\",\"sourceTopic\":\"admin.credit.commands\",\"partition\":"+record.partition()+",\"offset\":"+record.offset()+",\"contentHash\":\""+AdminCreditCorrectionService.hash(String.valueOf(record.value()))+"\"}";
                kafka.send("admin.credit.commands.DLT",record.key(),metadata).get(10,TimeUnit.SECONDS);
            }
            ack.acknowledge();
        }
        @Scheduled(fixedDelayString="${app.admin-commands.outbox-delay:2000}")
        public void publish() {
            for(var delivery:outbox.claim()) {
                try {
                    kafka.send("credit.admin.events",delivery.target().toString(),delivery.payload()).get(10,TimeUnit.SECONDS);
                    outbox.confirmed(delivery);
                    log.info("Credit correction outcome broker-confirmed operationId={} eventId={}",delivery.operation(),delivery.event());
                }catch(InterruptedException ex){Thread.currentThread().interrupt();outbox.failed(delivery);return;}
                catch(Exception ex){outbox.failed(delivery);log.warn("Credit correction outcome unconfirmed operationId={} eventId={}",delivery.operation(),delivery.event());}
            }
        }
    }
}
