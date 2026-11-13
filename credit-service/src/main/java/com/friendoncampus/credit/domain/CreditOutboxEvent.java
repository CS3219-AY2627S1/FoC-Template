package com.friendoncampus.credit.domain;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import com.friendoncampus.credit.integration.CreditEventEnvelope;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

@Entity
@Table(name = "credit_outbox_events")
public class CreditOutboxEvent {

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

    @Column(name = "payload_json", nullable = false, columnDefinition = "TEXT")
    private String payloadJson;

    @Column(name = "payload_hash", nullable = false, length = 64)
    private String payloadHash;

    @Column(name = "publish_attempts", nullable = false)
    private int publishAttempts;

    @Column(name = "last_error", length = 1000)
    private String lastError;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "published_at")
    private OffsetDateTime publishedAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected CreditOutboxEvent() {
    }

    public static CreditOutboxEvent pending(CreditEventEnvelope envelope, String payloadHash) {
        CreditOutboxEvent event = new CreditOutboxEvent();
        event.eventId = envelope.eventId();
        event.eventType = envelope.eventType();
        event.eventVersion = envelope.eventVersion();
        event.aggregateType = envelope.aggregateType();
        event.aggregateId = envelope.aggregateId();
        event.aggregateVersion = envelope.aggregateVersion();
        event.occurredAt = envelope.occurredAt();
        event.producer = envelope.producer();
        event.correlationId = envelope.correlationId();
        event.causationId = envelope.causationId();
        event.actorJson = envelope.actorJson();
        event.payloadJson = envelope.payloadJson();
        event.payloadHash = payloadHash;
        return event;
    }

    @PrePersist
    void prepareForCreate() {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        createdAt = now;
        updatedAt = now;
    }

    public void markPublished() {
        if (publishedAt != null) {
            return;
        }
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        publishAttempts++;
        lastError = null;
        publishedAt = now;
        updatedAt = now;
    }

    public void markPublishFailed(String error) {
        if (publishedAt != null) {
            return;
        }
        publishAttempts++;
        lastError = abbreviate(error);
        updatedAt = OffsetDateTime.now(ZoneOffset.UTC);
    }

    private static String abbreviate(String value) {
        String message = value == null || value.isBlank() ? "Unspecified event-publishing failure" : value;
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
    public String getPayloadJson() { return payloadJson; }
    public String getPayloadHash() { return payloadHash; }
    public int getPublishAttempts() { return publishAttempts; }
    public String getLastError() { return lastError; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getPublishedAt() { return publishedAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
