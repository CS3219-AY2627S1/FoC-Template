package com.friendoncampus.notification.messaging;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;

/**
 * Consumes {@code order.lifecycle.events} as group {@code notification-service}. The record is
 * acknowledged only after {@link OrderLifecycleEventHandler} has committed; a failure is retried and
 * then sent to {@code order.lifecycle.events.DLT} by the container's error handler.
 */
public class OrderLifecycleEventsListener {

    private static final Logger log = LoggerFactory.getLogger(OrderLifecycleEventsListener.class);

    private final OrderLifecycleEventHandler handler;

    public OrderLifecycleEventsListener(OrderLifecycleEventHandler handler) {
        this.handler = handler;
    }

    @KafkaListener(id = "notification-order-lifecycle-events", topics = OrderLifecycleEventHandler.TOPIC,
            groupId = "notification-service", containerFactory = "orderLifecycleEventsContainerFactory")
    public void onOrderLifecycleEvent(ConsumerRecord<String, String> record, Acknowledgment acknowledgment) {
        CreditEventHandler.Outcome outcome = handler.handle(record.value());
        acknowledgment.acknowledge();
        log.debug("order.lifecycle.events partition={} offset={} key={} outcome={}",
                record.partition(), record.offset(), record.key(), outcome);
    }
}
