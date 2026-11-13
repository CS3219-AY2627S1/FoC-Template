package com.friendoncampus.notification.service;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.EnumSet;
import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.notification.domain.Notification;
import com.friendoncampus.notification.domain.NotificationType;
import com.friendoncampus.notification.repository.NotificationRepository;

/**
 * Reads one recipient's notifications and unread count. The recipient is always the verified JWT subject, passed in
 * by the controller, so no caller can read another user's rows.
 */
@Service
public class NotificationQueryService {

    /**
     * Newest fact first. {@code occurredAt} rather than {@code createdAt}, so events caught up after
     * downtime still appear in real-time order; the ID breaks ties so pages never overlap.
     */
    private static final Sort NEWEST_FIRST = Sort.by(Sort.Order.desc("occurredAt"), Sort.Order.desc("id"));

    private final NotificationRepository notificationRepository;
    private final Clock clock;

    private static final EnumSet<NotificationType> PUSH_TYPES = EnumSet.of(
            NotificationType.ORDER_OPENED,
            NotificationType.ORDER_RESERVATION_FAILED,
            NotificationType.ORDER_ACCEPTED,
            NotificationType.ORDER_COURIER_WITHDREW,
            NotificationType.ORDER_EXPIRED,
            NotificationType.ORDER_CANCELLED,
            NotificationType.ORDER_PICKED_UP,
            NotificationType.ORDER_DELIVERED,
            NotificationType.ORDER_COMPLETED,
            NotificationType.ORDER_STILL_OPEN,
            NotificationType.PICKUP_DUE_SOON,
            NotificationType.PICKUP_OVERDUE,
            NotificationType.CHAT_MESSAGE_RECEIVED);

    private static final int PUSH_BATCH_SIZE = 100;

    public NotificationQueryService(NotificationRepository notificationRepository, Clock clock) {
        this.notificationRepository = notificationRepository;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Page<Notification> listFor(UUID recipientId, NotificationPaging paging) {
        return notificationRepository.findPersistentByRecipientId(recipientId,
                NotificationType.CHAT_MESSAGE_RECEIVED,
                PageRequest.of(paging.page(), paging.size(), NEWEST_FIRST));
    }

    @Transactional(readOnly = true)
    public long countUnread(UUID recipientId) {
        return notificationRepository.countPersistentUnread(recipientId, NotificationType.CHAT_MESSAGE_RECEIVED);
    }

    /**
     * Returns only transient participant push types. With no cursor this bootstraps at server time
     * and intentionally returns no historical cards; later calls advance using the returned cursor.
     */
    @Transactional(readOnly = true)
    public PushBatch pushFor(UUID recipientId, OffsetDateTime after) {
        OffsetDateTime now = OffsetDateTime.now(clock);
        if (after == null) return new PushBatch(List.of(), now);
        List<Notification> items = notificationRepository.findPushNotifications(recipientId, PUSH_TYPES,
                after, now, PageRequest.of(0, PUSH_BATCH_SIZE));
        OffsetDateTime next = items.size() == PUSH_BATCH_SIZE
                ? items.get(items.size() - 1).getCreatedAt()
                : now;
        return new PushBatch(items, next);
    }

    public record PushBatch(List<Notification> items, OffsetDateTime cursor) {
        public PushBatch { items = List.copyOf(items); }
    }
}
