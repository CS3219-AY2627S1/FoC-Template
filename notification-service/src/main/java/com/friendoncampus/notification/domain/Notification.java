package com.friendoncampus.notification.domain;

import java.time.OffsetDateTime;
import java.util.UUID;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * One notification for one recipient ({@code notifications}). It holds only what is needed to say
 * "what happened to me, on which errand, and have I seen it"; the message text is built from
 * {@link #getType()} and {@link #getParams()} when it is read.
 */
@Entity
@Table(name = "notifications")
public class Notification {

    @Id
    private UUID id;

    @Column(name = "recipient_id", nullable = false)
    private UUID recipientId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 48)
    private NotificationType type;

    @Column(name = "order_id")
    private UUID orderId;

    /** Template values as a JSON object, for example {@code {"amount":3}}. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private String params;

    @Column(name = "source_event_id", nullable = false)
    private UUID sourceEventId;

    /** The source business operation, so a republished event cannot notify twice. */
    @Column(name = "business_key", nullable = false, length = 128)
    private String businessKey;

    @Column(name = "occurred_at", nullable = false)
    private OffsetDateTime occurredAt;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "read_at")
    private OffsetDateTime readAt;

    protected Notification() {
    }

    public Notification(UUID id, UUID recipientId, NotificationType type, UUID orderId, String params,
            UUID sourceEventId, String businessKey, OffsetDateTime occurredAt, OffsetDateTime createdAt) {
        this.id = id;
        this.recipientId = recipientId;
        this.type = type;
        this.orderId = orderId;
        this.params = params;
        this.sourceEventId = sourceEventId;
        this.businessKey = businessKey;
        this.occurredAt = occurredAt;
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getRecipientId() {
        return recipientId;
    }

    public NotificationType getType() {
        return type;
    }

    public UUID getOrderId() {
        return orderId;
    }

    public String getParams() {
        return params;
    }

    public UUID getSourceEventId() {
        return sourceEventId;
    }

    public String getBusinessKey() {
        return businessKey;
    }

    public OffsetDateTime getOccurredAt() {
        return occurredAt;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getReadAt() {
        return readAt;
    }
}
