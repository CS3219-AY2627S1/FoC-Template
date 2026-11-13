package com.friendoncampus.notification.messaging;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;

/**
 * Consumes {@code credit.events} as group {@code notification-service} (blueprint "Every consumer").
 * The record is acknowledged only after {@link CreditEventHandler} has committed; a failure is
 * retried and then sent to {@code credit.events.DLT} by the container's error handler.
 */
public class CreditEventsListener {

    private static final Logger log = LoggerFactory.getLogger(CreditEventsListener.class);

    private final CreditEventHandler handler;

    public CreditEventsListener(CreditEventHandler handler) {
        this.handler = handler;
    }

    @KafkaListener(id = "notification-credit-events", topics = CreditEventHandler.TOPIC,
            groupId = "notification-service", containerFactory = "creditEventsContainerFactory")
    public void onCreditEvent(ConsumerRecord<String, String> record, Acknowledgment acknowledgment) {
        CreditEventHandler.Outcome outcome = handler.handle(record.value());
        acknowledgment.acknowledge();
        log.debug("credit.events partition={} offset={} key={} outcome={}",
                record.partition(), record.offset(), record.key(), outcome);
    }
}
