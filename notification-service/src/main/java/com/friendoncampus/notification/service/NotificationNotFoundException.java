package com.friendoncampus.notification.service;

import java.util.UUID;

/**
 * No notification with this ID belongs to the caller. A missing ID and another user's notification
 * are deliberately the same, so nobody can probe which IDs exist.
 */
public class NotificationNotFoundException extends RuntimeException {

    public NotificationNotFoundException(UUID notificationId) {
        super("Notification " + notificationId + " was not found");
    }
}
