package com.friendoncampus.notification.web;

import java.time.OffsetDateTime;
import java.util.UUID;

import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.friendoncampus.notification.service.NotificationPaging;
import com.friendoncampus.notification.service.NotificationQueryService;
import com.friendoncampus.notification.service.NotificationReadStateService;
import com.friendoncampus.notification.web.dto.NotificationPageResponse;
import com.friendoncampus.notification.web.dto.NotificationResponse;
import com.friendoncampus.notification.web.dto.PushNotificationBatchResponse;
import com.friendoncampus.notification.web.dto.UnreadCountResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * The caller's own notifications. The recipient is always the verified JWT subject; there is no
 * {@code userId} parameter, so nobody can read or mark another user's notifications.
 */
@RestController
@RequestMapping("/api/notifications/me")
@Tag(name = "Notifications", description = "What happened on the signed-in user's errands and credits")
@SecurityRequirement(name = "bearer-jwt")
public class NotificationController {

    private final NotificationQueryService queryService;
    private final NotificationReadStateService readStateService;

    public NotificationController(NotificationQueryService queryService,
            NotificationReadStateService readStateService) {
        this.queryService = queryService;
        this.readStateService = readStateService;
    }

    @Operation(
            operationId = "notification_get__api_notifications_me",
            summary = "List my notifications",
            description = "The caller's notifications, newest first by when the fact happened. Any "
                    + "signed-in session role may call it; notifications belong to the account, not the role.")
    @ApiResponses({
            @ApiResponse(
                    responseCode = "200",
                    description = "Page of the caller's notifications",
                    content = @Content(schema = @Schema(implementation = NotificationPageResponse.class))),
            @ApiResponse(
                    responseCode = "400",
                    description = "INVALID_QUERY: malformed or out-of-range paging value",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE)),
            @ApiResponse(
                    responseCode = "401",
                    description = "Missing or invalid bearer token",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE))
    })
    @GetMapping
    public NotificationPageResponse listMine(
            @AuthenticationPrincipal Jwt jwt,
            @Parameter(description = "Zero-based page number", schema = @Schema(type = "integer", minimum = "0",
                    defaultValue = "0"))
            @RequestParam(required = false) String page,
            @Parameter(description = "Page size", schema = @Schema(type = "integer", minimum = "1",
                    maximum = "100", defaultValue = "20"))
            @RequestParam(required = false) String size) {
        NotificationPaging paging = NotificationPaging.from(page, size);
        return NotificationPageResponse.from(queryService.listFor(UUID.fromString(jwt.getSubject()), paging));
    }

    @Operation(
            operationId = "notification_patch__api_notifications_me_id_read",
            summary = "Mark one of my notifications read",
            description = "Sets readAt the first time; repeating it returns the notification unchanged. "
                    + "A missing notification and another user's notification are both 404.")
    @ApiResponses({
            @ApiResponse(
                    responseCode = "200",
                    description = "The notification, with readAt set",
                    content = @Content(schema = @Schema(implementation = NotificationResponse.class))),
            @ApiResponse(
                    responseCode = "400",
                    description = "INVALID_ID: the ID is not a UUID",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE)),
            @ApiResponse(
                    responseCode = "401",
                    description = "Missing or invalid bearer token",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE)),
            @ApiResponse(
                    responseCode = "404",
                    description = "NOTIFICATION_NOT_FOUND: no such notification for the caller",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE))
    })
    @PatchMapping("/{id}/read")
    public NotificationResponse markRead(
            @AuthenticationPrincipal Jwt jwt,
            @Parameter(description = "Notification ID") @PathVariable UUID id) {
        return NotificationResponse.from(readStateService.markRead(UUID.fromString(jwt.getSubject()), id));
    }

    @Operation(
            operationId = "notification_get__api_notifications_me_unread_count",
            summary = "Count my unread notifications",
            description = "The caller's notifications with no readAt, for the bell badge.")
    @ApiResponses({
            @ApiResponse(
                    responseCode = "200",
                    description = "The caller's unread count",
                    content = @Content(schema = @Schema(implementation = UnreadCountResponse.class))),
            @ApiResponse(
                    responseCode = "401",
                    description = "Missing or invalid bearer token",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE))
    })
    @GetMapping("/unread-count")
    public UnreadCountResponse unreadCount(@AuthenticationPrincipal Jwt jwt) {
        return new UnreadCountResponse(queryService.countUnread(UUID.fromString(jwt.getSubject())));
    }

    @Operation(
            operationId = "notification_get__api_notifications_me_push",
            summary = "Poll my new in-app push notifications",
            description = "Bootstraps a server cursor when after is omitted. Subsequent calls return new errand "
                    + "lifecycle and chat-message cards only. Chat cards are transient and never enter the bell list.")
    @GetMapping("/push")
    public PushNotificationBatchResponse push(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) OffsetDateTime after) {
        return PushNotificationBatchResponse.from(
                queryService.pushFor(UUID.fromString(jwt.getSubject()), after));
    }
}
