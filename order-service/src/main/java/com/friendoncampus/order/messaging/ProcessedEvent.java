package com.friendoncampus.order.messaging;

import java.time.OffsetDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Inbox receipt for one consumed {@code credit.events} event ({@code processed_events}). */
@Entity
@Table(name = "processed_events")
public class ProcessedEvent {

    @Id
    @Column(name = "event_id")
    private UUID eventId;

    @Column(name = "event_type", nullable = false, length = 64)
    private String eventType;

    @Column(name = "aggregate_id", nullable = false)
    private UUID aggregateId;

    @Column(name = "operation_id")
    private UUID operationId;

    @Column(nullable = false, length = 64)
    private String fingerprint;

    @Column(nullable = false, length = 32)
    private String outcome;

    @Column(name = "processed_at", nullable = false)
    private OffsetDateTime processedAt;

    protected ProcessedEvent() {
    }

    public ProcessedEvent(UUID eventId, String eventType, UUID aggregateId, UUID operationId, String fingerprint,
            String outcome, OffsetDateTime processedAt) {
        this.eventId = eventId;
        this.eventType = eventType;
        this.aggregateId = aggregateId;
        this.operationId = operationId;
        this.fingerprint = fingerprint;
        this.outcome = outcome;
        this.processedAt = processedAt;
    }

    public UUID getEventId() {
        return eventId;
    }

    public String getFingerprint() {
        return fingerprint;
    }

    public String getOutcome() {
        return outcome;
    }
}
