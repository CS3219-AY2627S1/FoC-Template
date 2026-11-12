/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-10-09 to 2026-10-15
 * Scope (AI-24): Generated code, configuration and tests for the specified user event, Kafka setup and outbox changes.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.supplier.event;

import com.campuscouriers.supplier.entity.OutboxEvent;
import com.campuscouriers.supplier.entity.Supplier;
import com.campuscouriers.supplier.repository.OutboxEventRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;

// Publishes supplier changes through the transactional outbox: the event is stored in the caller's transaction,
// so it is relayed to Kafka (by Debezium) if and only if the change it describes commits.
// Keyed by supplier id so each supplier's events stay ordered on one partition.
@Component
public class SupplierEventPublisher {

    static final String AGGREGATE_TYPE = "supplier";

    private final OutboxEventRepository outboxEventRepository;
    private final JsonMapper jsonMapper;

    public SupplierEventPublisher(OutboxEventRepository outboxEventRepository, JsonMapper jsonMapper) {
        this.outboxEventRepository = outboxEventRepository;
        this.jsonMapper = jsonMapper;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void publishSupplierCreated(Supplier supplier) {
        append(SupplierEvent.CREATED, SupplierEvent.from(supplier));
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void publishSupplierUpdated(Supplier supplier) {
        append(SupplierEvent.UPDATED, SupplierEvent.from(supplier));
    }

    private void append(String type, SupplierEvent event) {
        outboxEventRepository.save(new OutboxEvent(
                AGGREGATE_TYPE, event.supplierId().toString(), type, jsonMapper.writeValueAsString(event), Instant.now()));
    }

}
