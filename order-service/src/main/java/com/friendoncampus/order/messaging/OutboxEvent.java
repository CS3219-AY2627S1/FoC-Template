package com.friendoncampus.order.messaging;

import java.time.OffsetDateTime;
import java.util.UUID;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * An event waiting to be published ({@code outbox_events}). It is written in the same transaction
 * as the order change, so a stored change always has its event; the Kafka relay that publishes
 * these rows is a later iteration.
 */
@Entity
@Table(name = "outbox_events")
public class OutboxEvent {

    @Id
    private UUID id;

    @Column(name = "aggregate_id", nullable = false)
    private UUID aggregateId;

    @Column(name = "aggregate_version", nullable = false)
    private long aggregateVersion;

    @Column(name = "event_type", nullable = false, length = 64)
    private String eventType;

    @Column(nullable = false, length = 128)
    private String topic;

    @Column(name = "operation_id")
    private UUID operationId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private String payload;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "published_at")
    private OffsetDateTime publishedAt;

    @Column(nullable = false)
    private int attempts;

    protected OutboxEvent() {
    }

    public OutboxEvent(UUID id, UUID aggregateId, long aggregateVersion, String eventType, String topic,
            UUID operationId, String payload, OffsetDateTime createdAt) {
        this.id = id;
        this.aggregateId = aggregateId;
        this.aggregateVersion = aggregateVersion;
        this.eventType = eventType;
        this.topic = topic;
        this.operationId = operationId;
        this.payload = payload;
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getAggregateId() {
        return aggregateId;
    }

    public long getAggregateVersion() {
        return aggregateVersion;
    }

    public String getEventType() {
        return eventType;
    }

    public String getTopic() {
        return topic;
    }

    public UUID getOperationId() {
        return operationId;
    }

    public String getPayload() {
        return payload;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getPublishedAt() {
        return publishedAt;
    }

    public int getAttempts() {
        return attempts;
    }

    /** Kafka acknowledged the send; the row will not be sent again. */
    public void markPublished(OffsetDateTime publishedAt) {
        this.publishedAt = publishedAt;
    }

    /** The send failed; the row stays unpublished and is retried on a later run. */
    public void recordFailedAttempt() {
        attempts++;
    }
}
