/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-08
 * Scope: Implementation and test assistance for typed notification persistence.
 */
package com.campuscouriers.notification_service.notification;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NotificationRepository extends JpaRepository<Notification, UUID> {
    List<Notification> findByRecipientIdOrderByCreatedAtDescIdDesc(UUID recipientId, Pageable page);

    // Pair the latest completion and receipt for each errand, as the bell does.
    @Query(value = """
        WITH latest_pair_members AS (
            SELECT DISTINCT ON (errand_id, type) errand_id, read_at
            FROM notifications
            WHERE recipient_id = :recipientId AND type IN ('ERRAND_COMPLETED', 'CREDIT_RECEIVED')
            ORDER BY errand_id, type, created_at DESC, id DESC
        ),
        fully_unread_pairs AS (
            SELECT errand_id
            FROM latest_pair_members
            WHERE read_at IS NULL
            GROUP BY errand_id
            HAVING COUNT(*) = 2
        )
        SELECT COUNT(*) - (SELECT COUNT(*) FROM fully_unread_pairs)
        FROM notifications
        WHERE recipient_id = :recipientId AND read_at IS NULL
        """, nativeQuery = true)
    long countUnreadCards(@Param("recipientId") UUID recipientId);

    boolean existsByIdAndRecipientId(UUID id, UUID recipientId);

    @Modifying
    @Query("""
        update Notification n set n.readAt = :readAt
        where n.id = :id and n.recipientId = :recipientId and n.readAt is null
        """)
    int markRead(@Param("id") UUID id, @Param("recipientId") UUID recipientId,
                 @Param("readAt") Instant readAt);

    @Modifying
    @Query("""
        update Notification n set n.readAt = :readAt
        where n.recipientId = :recipientId and n.readAt is null
        """)
    int markAllRead(@Param("recipientId") UUID recipientId, @Param("readAt") Instant readAt);

    // A conflicting event is a no-op, including concurrent deliveries. Other SQL errors propagate.
    @Modifying
    @Query(value = """
        INSERT INTO notifications
            (id, recipient_id, source_event_id, type, errand_id, conversation_id, message_id,
             message, created_at)
        VALUES (:id, :recipientId, :eventId, :type, :errandId, :conversationId, :messageId,
                :message, :createdAt)
        ON CONFLICT (source_event_id, recipient_id, type) DO NOTHING
        """, nativeQuery = true)
    int insertIfAbsent(@Param("id") UUID id,
                       @Param("recipientId") UUID recipientId,
                       @Param("eventId") UUID eventId,
                       @Param("type") String type,
                       @Param("errandId") UUID errandId,
                       @Param("conversationId") UUID conversationId,
                       @Param("messageId") UUID messageId,
                       @Param("message") String message,
                       @Param("createdAt") Instant createdAt);
}
