package com.friendoncampus.order.messaging;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;

/**
 * Consumes {@code credit.events} as group {@code order-service} (blueprint "Every consumer"). The
 * record is acknowledged only after {@link CreditOutcomeHandler} has committed; a failure is retried
 * and then sent to {@code credit.events.DLT} by the container's error handler.
 */
public class CreditEventsListener {

    private static final Logger log = LoggerFactory.getLogger(CreditEventsListener.class);

    private final CreditOutcomeHandler handler;

    public CreditEventsListener(CreditOutcomeHandler handler) {
        this.handler = handler;
    }

    @KafkaListener(id = "order-credit-events", topics = KafkaConfiguration.CREDIT_EVENTS_TOPIC,
            groupId = "order-service", containerFactory = "creditEventsContainerFactory")
    public void onCreditEvent(ConsumerRecord<String, String> record, Acknowledgment acknowledgment) {
        CreditOutcomeHandler.Outcome outcome = handler.handle(record.value());
        acknowledgment.acknowledge();
        log.debug("credit.events partition={} offset={} key={} outcome={}",
                record.partition(), record.offset(), record.key(), outcome);
    }
}
