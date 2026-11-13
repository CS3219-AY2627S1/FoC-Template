package com.friendoncampus.user.messaging;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserOutboxRepository extends JpaRepository<UserOutboxEvent, UUID> {
    @Query(value = "SELECT * FROM user_event_outbox WHERE published_at IS NULL "
            + "AND next_attempt_at <= :now ORDER BY occurred_at, event_id "
            + "LIMIT 1 FOR UPDATE SKIP LOCKED", nativeQuery = true)
    Optional<UserOutboxEvent> lockNextReady(@Param("now") OffsetDateTime now);

    long countByPublishedAtIsNull();

    @Query("select min(e.occurredAt) from UserOutboxEvent e where e.publishedAt is null")
    Optional<OffsetDateTime> oldestPending();
}
