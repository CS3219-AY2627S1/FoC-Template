package com.friendoncampus.user.messaging;

import java.time.OffsetDateTime;
import java.util.UUID;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "user_event_outbox")
public class UserOutboxEvent {
    @Id @Column(name = "event_id") private UUID eventId;
    @Column(name = "user_id", nullable = false) private UUID userId;
    @Column(name = "event_type", nullable = false, length = 40) private String eventType;
    @Column(name = "operation_id", nullable = false) private UUID operationId;
    @Column(name = "correlation_id", nullable = false) private UUID correlationId;
    @Column(name = "occurred_at", nullable = false) private OffsetDateTime occurredAt;
    @Column(nullable = false, columnDefinition = "text") private String payload;
    @Column(name = "published_at") private OffsetDateTime publishedAt;
    @Column(name = "attempt_count", nullable = false) private int attemptCount;
    @Column(name = "next_attempt_at", nullable = false) private OffsetDateTime nextAttemptAt;
    @Column(name = "last_failure", length = 40) private String lastFailure;

    protected UserOutboxEvent() { }

    static UserOutboxEvent activation(UUID eventId, UUID userId, UUID operationId, UUID correlationId,
            OffsetDateTime occurredAt, String payload) {
        UserOutboxEvent event = new UserOutboxEvent();
        event.eventId = eventId;
        event.userId = userId;
        event.eventType = "UserActivated";
        event.operationId = operationId;
        event.correlationId = correlationId;
        event.occurredAt = occurredAt;
        event.payload = payload;
        event.nextAttemptAt = occurredAt;
        return event;
    }

    void recordAttempt() { attemptCount++; }
    void acknowledge(OffsetDateTime now) { publishedAt = now; lastFailure = null; }
    void retryAt(OffsetDateTime when, String reason) { nextAttemptAt = when; lastFailure = reason; }

    public UUID getEventId() { return eventId; }
    public UUID getUserId() { return userId; }
    public UUID getOperationId() { return operationId; }
    public UUID getCorrelationId() { return correlationId; }
    public OffsetDateTime getOccurredAt() { return occurredAt; }
    public String getPayload() { return payload; }
    public OffsetDateTime getPublishedAt() { return publishedAt; }
    public int getAttemptCount() { return attemptCount; }
    public OffsetDateTime getNextAttemptAt() { return nextAttemptAt; }
    public String getLastFailure() { return lastFailure; }
}
