package com.friendoncampus.notification.web.dto;

import java.time.OffsetDateTime;
import java.util.List;

import com.friendoncampus.notification.service.NotificationQueryService.PushBatch;

import io.swagger.v3.oas.annotations.media.Schema;

/** A cursor-based batch for temporary in-app push cards. */
@Schema(description = "New participant push notifications since the previous poll")
public record PushNotificationBatchResponse(
        List<NotificationResponse> items,
        @Schema(description = "Opaque server-time cursor to pass as after on the next request")
        OffsetDateTime cursor) {

    public PushNotificationBatchResponse {
        items = List.copyOf(items);
    }

    public static PushNotificationBatchResponse from(PushBatch batch) {
        return new PushNotificationBatchResponse(
                batch.items().stream().map(NotificationResponse::from).toList(),
                batch.cursor());
    }
}
