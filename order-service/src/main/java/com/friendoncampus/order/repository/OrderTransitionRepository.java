package com.friendoncampus.order.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.friendoncampus.order.domain.OrderTransitionRecord;

public interface OrderTransitionRepository extends JpaRepository<OrderTransitionRecord, UUID> {

    List<OrderTransitionRecord> findByOrderIdOrderByOccurredAtAscOrderVersionAsc(UUID orderId);

    Optional<OrderTransitionRecord> findFirstByOrderIdOrderByOrderVersionDesc(UUID orderId);
}
