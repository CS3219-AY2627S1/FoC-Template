package com.friendoncampus.credit.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.friendoncampus.credit.domain.CreditInboxEvent;

import jakarta.persistence.LockModeType;

public interface CreditInboxEventRepository extends JpaRepository<CreditInboxEvent, UUID> {

    @Modifying
    @Query(value = """
            INSERT INTO credit_inbox_events (
                event_id, event_type, event_version, aggregate_type, aggregate_id,
                aggregate_version, occurred_at, producer, correlation_id, causation_id,
                actor_json, payload_hash, status, received_at, updated_at
            ) VALUES (
                :eventId, :eventType, :eventVersion, :aggregateType, :aggregateId,
                :aggregateVersion, :occurredAt, :producer, :correlationId, :causationId,
                :actorJson, :payloadHash, 'RECEIVED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) ON CONFLICT (event_id) DO NOTHING
            """, nativeQuery = true)
    int insertReceivedIfAbsent(
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
            @Param("payloadHash") String payloadHash);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select event from CreditInboxEvent event where event.eventId = :eventId")
    Optional<CreditInboxEvent> findByEventIdForUpdate(@Param("eventId") UUID eventId);
}
