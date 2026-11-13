package com.friendoncampus.credit.domain;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "credit_inbox_events")
public class CreditInboxEvent {

    @Id
    @Column(name = "event_id", nullable = false)
    private UUID eventId;

    @Column(name = "event_type", nullable = false, length = 80)
    private String eventType;

    @Column(name = "event_version", nullable = false)
    private int eventVersion;

    @Column(name = "aggregate_type", nullable = false, length = 64)
    private String aggregateType;

    @Column(name = "aggregate_id", nullable = false)
    private UUID aggregateId;

    @Column(name = "aggregate_version", nullable = false)
    private long aggregateVersion;

    @Column(name = "occurred_at", nullable = false)
    private OffsetDateTime occurredAt;

    @Column(nullable = false, length = 64)
    private String producer;

    @Column(name = "correlation_id", nullable = false)
    private UUID correlationId;

    @Column(name = "causation_id")
    private UUID causationId;

    @Column(name = "actor_json", nullable = false, columnDefinition = "TEXT")
    private String actorJson;

    @Column(name = "payload_hash", nullable = false, length = 64)
    private String payloadHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private InboxEventStatus status;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "last_error", length = 1000)
    private String lastError;

    @Column(name = "received_at", nullable = false)
    private OffsetDateTime receivedAt;

    @Column(name = "processed_at")
    private OffsetDateTime processedAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected CreditInboxEvent() {
    }

    public void markProcessed() {
        if (status == InboxEventStatus.PROCESSED) {
            return;
        }
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        status = InboxEventStatus.PROCESSED;
        attemptCount++;
        lastError = null;
        processedAt = now;
        updatedAt = now;
    }

    public void markFailed(String error) {
        if (status == InboxEventStatus.PROCESSED) {
            return;
        }
        status = InboxEventStatus.FAILED;
        attemptCount++;
        lastError = abbreviate(error);
        processedAt = null;
        updatedAt = OffsetDateTime.now(ZoneOffset.UTC);
    }

    private static String abbreviate(String value) {
        String message = value == null || value.isBlank() ? "Unspecified event-processing failure" : value;
        return message.length() <= 1000 ? message : message.substring(0, 1000);
    }

    public UUID getEventId() { return eventId; }
    public String getEventType() { return eventType; }
    public int getEventVersion() { return eventVersion; }
    public String getAggregateType() { return aggregateType; }
    public UUID getAggregateId() { return aggregateId; }
    public long getAggregateVersion() { return aggregateVersion; }
    public OffsetDateTime getOccurredAt() { return occurredAt; }
    public String getProducer() { return producer; }
    public UUID getCorrelationId() { return correlationId; }
    public UUID getCausationId() { return causationId; }
    public String getActorJson() { return actorJson; }
    public String getPayloadHash() { return payloadHash; }
    public InboxEventStatus getStatus() { return status; }
    public int getAttemptCount() { return attemptCount; }
    public String getLastError() { return lastError; }
    public OffsetDateTime getReceivedAt() { return receivedAt; }
    public OffsetDateTime getProcessedAt() { return processedAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
