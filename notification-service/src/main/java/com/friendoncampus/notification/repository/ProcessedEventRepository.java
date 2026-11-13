package com.friendoncampus.notification.repository;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.friendoncampus.notification.messaging.ProcessedEvent;

public interface ProcessedEventRepository extends JpaRepository<ProcessedEvent, UUID> {

    /** The highest {@code sourceSequence} received so far for one order, or null if none. */
    @Query("select max(e.sourceSequence) from ProcessedEvent e where e.aggregateId = :orderId")
    Long findMaxSourceSequence(@Param("orderId") UUID orderId);
}
