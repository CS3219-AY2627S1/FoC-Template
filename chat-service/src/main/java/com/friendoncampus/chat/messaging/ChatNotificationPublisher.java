package com.friendoncampus.chat.messaging;

import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Relays committed Chat notification outbox rows to Kafka. */
@Component
@ConditionalOnProperty(name = "app.kafka.enabled", havingValue = "true", matchIfMissing = true)
public class ChatNotificationPublisher {
    private static final Logger log = LoggerFactory.getLogger(ChatNotificationPublisher.class);
    private final ChatNotificationOutbox outbox;
    private final KafkaTemplate<String, String> kafka;

    public ChatNotificationPublisher(ChatNotificationOutbox outbox, KafkaTemplate<String, String> kafka) {
        this.outbox = outbox;
        this.kafka = kafka;
    }

    @Scheduled(fixedDelayString = "${app.kafka.notification-outbox.interval-ms:1000}")
    public void publish() {
        for (var delivery : outbox.claim(20)) {
            try {
                kafka.send(ChatNotificationOutbox.TOPIC, delivery.conversationId().toString(), delivery.payload())
                        .get(10, TimeUnit.SECONDS);
                outbox.confirmed(delivery);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                outbox.failed(delivery, exception);
                return;
            } catch (Exception exception) {
                outbox.failed(delivery, exception);
                log.warn("Could not publish ChatMessageSent eventId={} conversationId={}",
                        delivery.eventId(), delivery.conversationId(), exception);
            }
        }
    }
}
