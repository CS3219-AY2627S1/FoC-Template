package com.friendoncampus.credit.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.friendoncampus.credit.domain.CreditOutboxEvent;

import jakarta.persistence.LockModeType;

public interface CreditOutboxEventRepository extends JpaRepository<CreditOutboxEvent, UUID> {

    @Modifying
    @Query(value = """
            INSERT INTO credit_outbox_events (
                event_id, event_type, event_version, aggregate_type, aggregate_id,
                aggregate_version, occurred_at, producer, correlation_id, causation_id,
                actor_json, payload_json, payload_hash, created_at, updated_at
            ) VALUES (
                :eventId, :eventType, :eventVersion, :aggregateType, :aggregateId,
                :aggregateVersion, :occurredAt, :producer, :correlationId, :causationId,
                :actorJson, :payloadJson, :payloadHash, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) ON CONFLICT (event_id) DO NOTHING
            """, nativeQuery = true)
    int insertPendingIfAbsent(
            @Param("eventId") UUID eventId,
            @Param("eventType") String eventType,
            @Param("eventVersion") int eventVersion,
            @Param("aggregateType") String aggregateType,
            @Param("aggregateId") UUID aggregateId,
            @Param("aggregateVersion") long aggregateVersion,
            @Param("occurredAt") java.time.OffsetDateTime occurredAt,
            @Param("producer") String producer,
            @Param("correlationId") UUID correlationId,
            @Param("causationId") UUID causationId,
            @Param("actorJson") String actorJson,
            @Param("payloadJson") String payloadJson,
            @Param("payloadHash") String payloadHash);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select event from CreditOutboxEvent event where event.eventId = :eventId")
    Optional<CreditOutboxEvent> findByEventIdForUpdate(@Param("eventId") UUID eventId);

    @Query("""
            select event from CreditOutboxEvent event
            where event.publishedAt is null
            order by event.createdAt, event.eventId
            """)
    List<CreditOutboxEvent> findPending(Pageable pageable);
}
