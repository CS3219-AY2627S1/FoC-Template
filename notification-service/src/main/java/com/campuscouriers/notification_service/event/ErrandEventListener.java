/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-6.1-sol), 2026-11-08
 * Scope (AI-08): Removed trailing full stops from alert text and updated examples and tests.
 * Tool and date: OpenAI Codex (gpt-6.1-sol), 2026-11-07
 * Scope (AI-22): Implemented and tested the requested requester delivery alert.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 */

package com.campuscouriers.notification_service.event;

import com.campuscouriers.notification_service.notification.NotificationService;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
public class ErrandEventListener {
    private final ErrandEventParser parser;
    private final NotificationService notifications;

    public ErrandEventListener(ErrandEventParser parser, NotificationService notifications) {
        this.parser = parser;
        this.notifications = notifications;
    }

    @KafkaListener(topics = {"errand.accepted", "errand.delivered", "errand.completed", "errand.failed"})
    public void onEvent(ConsumerRecord<String, String> record) {
        ErrandEvent event = parser.parse(record);
        // Save commits before this listener returns; RECORD mode then commits the offset.
        switch (record.topic()) {
            case "errand.accepted" -> notifications.save(event.eventId(), event.requesterId(),
                "ERRAND_ACCEPTED", event.errandId(), "Someone has accepted your errand");
            case "errand.delivered" -> notifications.save(event.eventId(), event.requesterId(),
                "ERRAND_DELIVERED", event.errandId(), "Your courier marked your errand as delivered");
            case "errand.completed" -> notifications.save(event.eventId(), event.courierId(),
                "ERRAND_COMPLETED", event.errandId(),
                "The requester confirmed your errand is complete");
            case "errand.failed" -> notifications.save(event.eventId(), event.courierId(),
                "ERRAND_FAILED", event.errandId(), "The requester reported a failure with your errand");
            default -> throw new InvalidNotificationEventException("Unsupported event topic");
        }
    }

    @KafkaListener(topics = "errand.expired")
    public void onExpiry(ConsumerRecord<String, String> record) {
        var eventId = parser.eventId(record);
        EventPayload payload = EventPayload.read(record.value());
        String message = switch (payload.text("resultingStatus")) {
            case "EXPIRED" -> "Your errand expired before anyone accepted it";
            case "FAILED" -> "Your errand expired before the courier marked it delivered";
            default -> throw new InvalidNotificationEventException("Invalid expiry resultingStatus");
        };
        notifications.save(eventId, payload.uuid("requesterId"), "ERRAND_EXPIRED",
            payload.uuid("errandId"), message);
    }
}
