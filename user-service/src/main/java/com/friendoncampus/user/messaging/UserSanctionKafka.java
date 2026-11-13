package com.friendoncampus.user.messaging;

import java.util.*;
import java.util.concurrent.TimeUnit;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.slf4j.*;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
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
@EnableConfigurationProperties(UserEventSettings.class)
@ConditionalOnProperty(name="app.sanctions.enabled",havingValue="true")
public class UserSanctionKafka {
    private static final Logger log=LoggerFactory.getLogger(UserSanctionKafka.class);
    @Bean(name="sanctionProducerFactory",destroyMethod="destroy")
    DefaultKafkaProducerFactory<String,String> sanctionProducerFactory(UserEventSettings settings) {
        Map<String,Object> p=new HashMap<>(UserEventConfiguration.producerProperties(settings));
        p.put("client.id","user-service-sanctions");
        return new DefaultKafkaProducerFactory<>(p);
    }
    @Bean("sanctionTemplate")
    KafkaTemplate<String,String> sanctionTemplate(@Qualifier("sanctionProducerFactory") DefaultKafkaProducerFactory<String,String> factory) {
        return new KafkaTemplate<>(factory);
    }
    @Bean("sanctionFactory")
    ConcurrentKafkaListenerContainerFactory<String,String> sanctionFactory(UserEventSettings settings) {
        Map<String,Object> p=new HashMap<>(UserEventConfiguration.producerProperties(settings));
        p.keySet().removeIf(k->!k.equals("bootstrap.servers") && !k.equals("security.protocol") && !k.startsWith("sasl."));
        p.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG,StringDeserializer.class);
        p.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG,StringDeserializer.class);
        p.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG,false); p.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG,"earliest");
        p.put(ConsumerConfig.ALLOW_AUTO_CREATE_TOPICS_CONFIG,false); p.put(ConsumerConfig.ISOLATION_LEVEL_CONFIG,"read_committed");
        var factory=new ConcurrentKafkaListenerContainerFactory<String,String>();
        factory.setConsumerFactory(new DefaultKafkaConsumerFactory<>(p));
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL_IMMEDIATE);
        // Storage/transport failure must retain the offset. Invalid input is durably quarantined
        // by the service and explicitly signalled to a metadata-only DLT below.
        factory.setCommonErrorHandler(new DefaultErrorHandler((record,error)->{
            throw new IllegalStateException("Sanction processing unavailable; offset retained",error);
        },new FixedBackOff(1000L,2L)));
        return factory;
    }
    @Bean
    io.micrometer.core.instrument.binder.MeterBinder sanctionMetrics(org.springframework.jdbc.core.JdbcTemplate db) {
        return registry -> {
            for (var metric:Map.of(
                    "user.sanctions.outbox.pending","SELECT count(*) FROM user_sanction_outbox WHERE published_at IS NULL",
                    "user.sanctions.commands.quarantined","SELECT count(*) FROM user_sanction_quarantine",
                    "user.sanctions.operations.recorded","SELECT count(*) FROM user_sanction_operations").entrySet()) {
                io.micrometer.core.instrument.Gauge.builder(metric.getKey(),db,d->{
                    try {return d.queryForObject(metric.getValue(),Number.class).doubleValue();}
                    catch(Exception ex){return Double.NaN;}
                }).register(registry);
            }
        };
    }
    @Bean
    SanctionTransport sanctionTransport(UserSanctionService service,UserSanctionOutbox outbox,
            @Qualifier("sanctionTemplate") KafkaTemplate<String,String> kafka) { return new SanctionTransport(service,outbox,kafka); }

    public static class SanctionTransport {
        private final UserSanctionService service; private final UserSanctionOutbox outbox; private final KafkaTemplate<String,String> kafka;
        public SanctionTransport(UserSanctionService service,UserSanctionOutbox outbox,KafkaTemplate<String,String> kafka) {this.service=service;this.outbox=outbox;this.kafka=kafka;}
        @KafkaListener(topics="admin.user.commands",groupId="user-service-admin",containerFactory="sanctionFactory")
        public void receive(ConsumerRecord<String,String> r,Acknowledgment ack) throws Exception {
            if(!service.receive(r.key(),r.value())) {
                String metadata="{\"failureCode\":\"INVALID_OR_CONFLICTING_COMMAND\",\"sourceTopic\":\"admin.user.commands\",\"partition\":"+r.partition()+",\"offset\":"+r.offset()+",\"contentHash\":\""+UserSanctionService.hash(String.valueOf(r.value()))+"\"}";
                kafka.send("admin.user.commands.DLT",r.key(),metadata).get(10,TimeUnit.SECONDS);
            }
            ack.acknowledge();
        }
        @Scheduled(fixedDelayString="${app.sanctions.outbox-delay:2000}")
        public void publish() {
            for(var d:outbox.claim()) {
                try { kafka.send("user.admin.events",d.target().toString(),d.payload()).get(10,TimeUnit.SECONDS);outbox.confirmed(d);log.info("User sanction outcome broker-confirmed operationId={} eventId={}",d.operation(),d.event()); }
                catch(InterruptedException ex) {Thread.currentThread().interrupt();outbox.failed(d);return;}
                catch(Exception ex) {outbox.failed(d);log.warn("User sanction outcome unconfirmed operationId={} eventId={}",d.operation(),d.event());}
            }
        }
    }
}
