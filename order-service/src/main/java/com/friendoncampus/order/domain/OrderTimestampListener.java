package com.friendoncampus.order.domain;

import java.time.Clock;
import java.time.OffsetDateTime;

import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;

/**
 * Stamps {@code created_at} and {@code updated_at} from the service {@link Clock} (the bean every
 * lifecycle timestamp and deadline already uses) rather than the JVM clock, so the credit timeout
 * and the database's {@code updated_at >= created_at} check never see two different clocks. Hibernate
 * gets this listener from Spring, which injects the clock.
 */
public class OrderTimestampListener {

    private final Clock clock;

    public OrderTimestampListener(Clock clock) {
        this.clock = clock;
    }

    @PrePersist
    void beforeInsert(Order order) {
        if (!order.isCreatedAtStamped()) {
            order.stampCreatedAt(now());
        }
    }

    @PreUpdate
    void beforeUpdate(Order order) {
        order.stampUpdatedAt(now());
    }

    private OffsetDateTime now() {
        return Order.toStoredPrecision(OffsetDateTime.now(clock));
    }
}
