/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-6.1-sol), 2026-11-08
 * Scope (AI-08): Removed trailing full stops from alert text and updated examples and tests.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 */

package com.campuscouriers.notification_service.event;

import com.campuscouriers.notification_service.notification.NotificationService;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
public class CreditEventListener {
    private final NotificationService notifications;

    public CreditEventListener(NotificationService notifications) {
        this.notifications = notifications;
    }

    @KafkaListener(topics = {"credit.received", "credit.released"})
    public void onEvent(ConsumerRecord<String, String> record) {
        String expectedChange = switch (record.topic()) {
            case "credit.received" -> "RECEIVED";
            case "credit.released" -> "RELEASED";
            default -> throw new InvalidNotificationEventException("Unsupported credit event topic");
        };
        EventPayload payload = EventPayload.read(record.value());
        if (!expectedChange.equals(payload.text("changeType"))) {
            throw new InvalidNotificationEventException("Credit change type does not match the topic");
        }

        long amount = payload.positiveLong("amount");
        String credits = amount + (amount == 1 ? " credit" : " credits");
        String message = expectedChange.equals("RECEIVED")
            ? "You received " + credits + " for your errand"
            : credits + " from your errand reservation returned to your available balance";
        // The payload ID belongs to the credit record. A new outbox row can have a different header ID.
        notifications.save(payload.uuid("eventId"), payload.uuid("userId"),
            "CREDIT_" + expectedChange, payload.uuid("orderId"), message);
    }
}
