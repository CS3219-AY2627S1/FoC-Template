package com.friendoncampus.admin;

import java.time.Duration;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.apache.kafka.clients.producer.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.core.ProducerFactory;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name={"app.kafka.enabled","app.case-events.enabled"},havingValue="true")
public class KafkaCaseEventSender implements CaseEventSender {
    private final Map<String,Object> properties;
    @Autowired public KafkaCaseEventSender(ProducerFactory<String,String> factory,
            @Value("${app.case-events.transaction-id:admin-case-events-v1}") String transactionId) {
        this(factory.getConfigurationProperties(),transactionId);
    }
    KafkaCaseEventSender(Map<String,Object> configuration,String transactionId) {
        if(transactionId==null||!transactionId.matches("admin-case-events-[A-Za-z0-9._-]{1,100}"))
            throw new IllegalArgumentException("Use a stable, database-specific admin-case-events- transaction identity");
        properties=new HashMap<>(configuration);
        properties.put(ProducerConfig.TRANSACTIONAL_ID_CONFIG,transactionId);
        properties.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG,true);
        properties.put(ProducerConfig.ACKS_CONFIG,"all");
        properties.put(ProducerConfig.MAX_BLOCK_MS_CONFIG,5000);
        properties.put(ProducerConfig.REQUEST_TIMEOUT_MS_CONFIG,5000);
        properties.put(ProducerConfig.DELIVERY_TIMEOUT_MS_CONFIG,10000);
        properties.put(ProducerConfig.TRANSACTION_TIMEOUT_CONFIG,15000);
    }
    @Override public void send(UUID caseId,String payload,Runnable verifyDatabaseLease) {
        // Fresh epoch on every attempt fences an old producer after loss of its DB connection.
        // Never share this transactional producer with administrative command publishing.
        Producer<String,String> producer=new KafkaProducer<>(properties);
        try {
            producer.initTransactions();
            // A suspended worker may obtain a NEW epoch after losing its database lock.
            // Recheck on the original transaction connection after fencing, before any send.
            verifyDatabaseLease.run();
            producer.beginTransaction();
            producer.send(new ProducerRecord<>("admin.events",caseId.toString(),payload)).get(10,TimeUnit.SECONDS);
            producer.commitTransaction();
        } catch(InterruptedException e) {
            Thread.currentThread().interrupt();throw new IllegalStateException("CASE_EVENT_UNCONFIRMED");
        } catch(Exception e) {
            // Do not assume abort or failure after an uncertain commit; the next epoch recovers.
            throw new IllegalStateException("CASE_EVENT_UNCONFIRMED");
        } finally { producer.close(Duration.ofSeconds(1)); }
    }
}
