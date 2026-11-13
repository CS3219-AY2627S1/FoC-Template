package com.friendoncampus.notification.service;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.notification.domain.Notification;
import com.friendoncampus.notification.repository.NotificationRepository;

/**
 * Marks one of the recipient's notifications read. The recipient is always the verified JWT
 * subject, passed in by the controller, so nobody can mark another user's notification.
 */
@Service
public class NotificationReadStateService {

    private final NotificationRepository notificationRepository;
    private final Clock clock;

    public NotificationReadStateService(NotificationRepository notificationRepository, Clock clock) {
        this.notificationRepository = notificationRepository;
        this.clock = clock;
    }

    /**
     * Sets {@code readAt} the first time and returns the notification. Repeating it changes nothing,
     * and two concurrent calls both return the first {@code readAt}: the update only applies while
     * {@code read_at} is still null, and the row is then read back from the database.
     */
    @Transactional
    public Notification markRead(UUID recipientId, UUID notificationId) {
        notificationRepository.markReadIfUnread(notificationId, recipientId, OffsetDateTime.now(clock));
        return notificationRepository.findByIdAndRecipientId(notificationId, recipientId)
                .orElseThrow(() -> new NotificationNotFoundException(notificationId));
    }
}
