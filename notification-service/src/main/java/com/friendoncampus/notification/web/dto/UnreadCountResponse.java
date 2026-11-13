package com.friendoncampus.notification.web.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/** The caller's unread count for the bell badge; the shared contract's {@code UnreadCount} schema. */
@Schema(description = "Number of the signed-in user's unread notifications")
public record UnreadCountResponse(
        @Schema(description = "Unread notifications", example = "3", minimum = "0")
        long unreadCount) {
}
