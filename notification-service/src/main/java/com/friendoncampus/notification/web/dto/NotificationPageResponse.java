package com.friendoncampus.notification.web.dto;

import java.util.List;

import org.springframework.data.domain.Page;

import com.friendoncampus.notification.domain.Notification;

import io.swagger.v3.oas.annotations.media.Schema;

/** A page of notifications; the shared contract's {@code NotificationPage} schema. */
@Schema(description = "Page of notifications and pagination metadata")
public record NotificationPageResponse(
        @Schema(description = "Notifications in the requested page, newest first")
        List<NotificationResponse> content,
        @Schema(description = "Zero-based page number", example = "0", minimum = "0")
        int page,
        @Schema(description = "Requested page size", example = "20", minimum = "1", maximum = "100")
        int size,
        @Schema(description = "Number of the caller's notifications", example = "21", minimum = "0")
        long totalElements,
        @Schema(description = "Number of available pages", example = "2", minimum = "0")
        int totalPages) {

    public NotificationPageResponse {
        content = List.copyOf(content);
    }

    public static NotificationPageResponse from(Page<Notification> notifications) {
        return new NotificationPageResponse(
                notifications.getContent().stream().map(NotificationResponse::from).toList(),
                notifications.getNumber(),
                notifications.getSize(),
                notifications.getTotalElements(),
                notifications.getTotalPages());
    }
}
