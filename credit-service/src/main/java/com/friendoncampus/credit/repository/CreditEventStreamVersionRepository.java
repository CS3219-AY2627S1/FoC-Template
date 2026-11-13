package com.friendoncampus.credit.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.friendoncampus.credit.domain.CreditEventStreamVersion;
import com.friendoncampus.credit.domain.CreditEventStreamVersionId;

import jakarta.persistence.LockModeType;

public interface CreditEventStreamVersionRepository
        extends JpaRepository<CreditEventStreamVersion, CreditEventStreamVersionId> {
    @Modifying
    @Query(value = """
            INSERT INTO credit_event_stream_versions (aggregate_type, aggregate_id)
            VALUES (:aggregateType, :aggregateId)
            ON CONFLICT (aggregate_type, aggregate_id) DO NOTHING
            """, nativeQuery = true)
    int insertIfAbsent(
            @Param("aggregateType") String aggregateType,
            @Param("aggregateId") UUID aggregateId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select stream from CreditEventStreamVersion stream
            where stream.aggregateType = :aggregateType and stream.aggregateId = :aggregateId
            """)
    Optional<CreditEventStreamVersion> findForUpdate(
            @Param("aggregateType") String aggregateType,
            @Param("aggregateId") UUID aggregateId);
}
