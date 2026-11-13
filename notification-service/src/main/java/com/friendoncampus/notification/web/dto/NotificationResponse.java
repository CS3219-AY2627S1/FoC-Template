package com.friendoncampus.notification.web.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.friendoncampus.notification.domain.Notification;
import com.friendoncampus.notification.domain.NotificationMessages;
import com.friendoncampus.notification.domain.NotificationType;

import io.swagger.v3.oas.annotations.media.Schema;

/** One notification as the recipient sees it; the shared contract's {@code Notification} schema. */
@Schema(description = "A notification for the signed-in user")
@JsonInclude(JsonInclude.Include.ALWAYS)
public record NotificationResponse(
        @Schema(description = "Notification ID", format = "uuid")
        UUID id,
        @Schema(description = "What happened; picks the icon", example = "CREDITS_RECEIVED")
        NotificationType type,
        @Schema(description = "Errand to link to, or null for account-level notifications", format = "uuid",
                nullable = true)
        UUID orderId,
        @Schema(description = "Text to show the recipient",
                example = "You received 3 credits for completing an errand.")
        String message,
        @Schema(description = "When the fact happened (UTC)")
        OffsetDateTime occurredAt,
        @Schema(description = "When the user marked it read, or null if unread", nullable = true)
        OffsetDateTime readAt) {

    public static NotificationResponse from(Notification notification) {
        return new NotificationResponse(
                notification.getId(),
                notification.getType(),
                notification.getOrderId(),
                NotificationMessages.messageFor(notification),
                notification.getOccurredAt(),
                notification.getReadAt());
    }
}
