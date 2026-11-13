package com.friendoncampus.credit.domain;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

@Entity
@Table(name = "credit_event_stream_versions")
@IdClass(CreditEventStreamVersionId.class)
public class CreditEventStreamVersion {
    @Id
    @Column(name = "aggregate_type", nullable = false, length = 64)
    private String aggregateType;

    @Id
    @Column(name = "aggregate_id", nullable = false)
    private UUID aggregateId;

    @Column(name = "latest_version", nullable = false)
    private long latestVersion;

    @Column(name = "latest_event_id")
    private UUID latestEventId;

    @Column(name = "latest_event_type", length = 80)
    private String latestEventType;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected CreditEventStreamVersion() {
    }

    public void advance(long version, UUID eventId, String eventType) {
        latestVersion = version;
        latestEventId = eventId;
        latestEventType = eventType;
        updatedAt = OffsetDateTime.now(ZoneOffset.UTC);
    }

    public long getLatestVersion() { return latestVersion; }
    public UUID getLatestEventId() { return latestEventId; }
    public String getLatestEventType() { return latestEventType; }
}
