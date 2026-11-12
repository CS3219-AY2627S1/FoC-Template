/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-08
 * Scope: Implementation and test assistance for typed notification responses.
 */
package com.campuscouriers.notification_service.notification;

import java.time.Instant;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonInclude;

public record NotificationResponse(UUID id, String type, String message, NotificationData data,
                                   Instant createdAt, Instant readAt) {
    static NotificationResponse from(Notification notification) {
        return new NotificationResponse(notification.getId(), notification.getType(),
            notification.getMessage(),
            new NotificationData(notification.getErrandId(), notification.getConversationId(),
                notification.getMessageId()),
            notification.getCreatedAt(), notification.getReadAt());
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record NotificationData(UUID errandId, UUID conversationId, UUID messageId) {}
}
