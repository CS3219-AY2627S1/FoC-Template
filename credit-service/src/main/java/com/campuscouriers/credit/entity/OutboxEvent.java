/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-11-06
 * Scope (AI-62): Generated the OutboxEvent entity for the credit service
 * Author review: Code changes were checked and validated
 */

package com.campuscouriers.credit.entity;

import jakarta.persistence.*;
import lombok.Getter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

// A domain event waiting to be relayed to Kafka. Rows are written in the same transaction as the change they describe;
// Debezium reads inserts from the WAL and its Outbox Event Router publishes each one to the topic named by `type`
// (e.g. credit.reserved, credit.released), keyed by `aggregateid` (the order ID).
// Column names are the router's defaults, so they must not change.
@Entity
@Table(name = "outbox")
@Getter
public class OutboxEvent {

    @Id
    private UUID id;

    @Column(name = "aggregatetype", nullable = false)
    private String aggregateType;

    @Column(name = "aggregateid", nullable = false)
    private String aggregateId;

    @Column(nullable = false)
    private String type;

    // Already-serialised JSON; published as the message value
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private String payload;

    @Column(nullable = false)
    private Instant createdAt;

    protected OutboxEvent() {} // required by JPA

    public OutboxEvent(String aggregateType, String aggregateId, String type, String payload, Instant createdAt) {
        this.id = UUID.randomUUID();
        this.aggregateType = aggregateType;
        this.aggregateId = aggregateId;
        this.type = type;
        this.payload = payload;
        this.createdAt = createdAt;
    }
}




