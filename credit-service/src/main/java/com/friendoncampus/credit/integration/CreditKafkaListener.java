package com.friendoncampus.credit.integration;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "app.kafka.enabled", havingValue = "true")
public class CreditKafkaListener {
    private static final Logger LOGGER = LoggerFactory.getLogger(CreditKafkaListener.class);

    private final CreditEventJsonCodec codec;
    private final CreditEventHandler handler;

    public CreditKafkaListener(CreditEventJsonCodec codec, CreditEventHandler handler) {
        this.codec = codec;
        this.handler = handler;
    }

    @KafkaListener(
            topics = {"${app.kafka.user-events-topic}", "${app.kafka.order-events-topic}"},
            groupId = "${app.kafka.consumer-group}")
    public void consume(ConsumerRecord<String, String> record, Acknowledgment acknowledgment) {
        CreditEventEnvelope envelope = codec.deserialize(record.value());
        if (record.key() == null || !envelope.aggregateId().toString().equals(record.key())) {
            throw new IllegalArgumentException("Kafka key must match the event aggregateId");
        }
        CreditEventCoordinator.ProcessingOutcome outcome = handler.handle(envelope);
        acknowledgment.acknowledge();
        LOGGER.info(
                "Acknowledged credit input topic={} partition={} offset={} eventId={} eventType={} outcome={}",
                record.topic(), record.partition(), record.offset(), envelope.eventId(), envelope.eventType(), outcome);
    }
}
