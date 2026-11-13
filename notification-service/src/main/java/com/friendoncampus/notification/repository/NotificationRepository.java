package com.friendoncampus.notification.repository;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import com.friendoncampus.notification.domain.Notification;
import com.friendoncampus.notification.domain.NotificationType;

public interface NotificationRepository extends JpaRepository<Notification, UUID> {

    /** The recipient's notifications; callers pass the sort (newest {@code occurredAt} first). */
    @Query("select n from Notification n where n.recipientId = :recipientId and n.type <> :excludedType")
    Page<Notification> findPersistentByRecipientId(UUID recipientId, NotificationType excludedType,
            Pageable pageable);

    /** The notification already created for this recipient, type and source business operation. */
    Optional<Notification> findByRecipientIdAndTypeAndBusinessKey(UUID recipientId, NotificationType type,
            String businessKey);

    /** The notification, only if it belongs to the recipient. */
    Optional<Notification> findByIdAndRecipientId(UUID id, UUID recipientId);

    /** The recipient's unread count; served by the partial index {@code ix_notifications_recipient_unread}. */
    @Query("select count(n) from Notification n where n.recipientId = :recipientId "
            + "and n.readAt is null and n.type <> :excludedType")
    long countPersistentUnread(UUID recipientId, NotificationType excludedType);

    /** Raw count used by persistence-level reminder tests; the public bell uses the filtered query above. */
    long countByRecipientIdAndReadAtIsNull(UUID recipientId);

    /** Newly ingested participant push items, ordered for deterministic on-screen delivery. */
    @Query("select n from Notification n where n.recipientId = :recipientId and n.type in :types "
            + "and n.createdAt > :after and n.createdAt <= :until order by n.createdAt asc, n.id asc")
    List<Notification> findPushNotifications(UUID recipientId, Collection<NotificationType> types,
            OffsetDateTime after, OffsetDateTime until, Pageable pageable);

    /**
     * Sets {@code read_at} only on the recipient's own, still unread notification, so the first read
     * time is kept. Clears the persistence context so the row is then read back as stored.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update Notification n set n.readAt = :readAt "
            + "where n.id = :id and n.recipientId = :recipientId and n.readAt is null")
    int markReadIfUnread(UUID id, UUID recipientId, OffsetDateTime readAt);
}
