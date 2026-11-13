package com.friendoncampus.order.repository;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.friendoncampus.order.messaging.ProcessedEvent;

public interface ProcessedEventRepository extends JpaRepository<ProcessedEvent, UUID> {
}
