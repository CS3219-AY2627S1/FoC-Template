/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-11-06
 * Scope (AI-62): Generated the CreditEventPublisher class for the credit service, methods to publish credit change events through the transactional outbox.
 * Author review: Code changes were checked and validated
 */

package com.campuscouriers.credit.event;

import com.campuscouriers.credit.entity.OutboxEvent;
import com.campuscouriers.credit.repository.OutboxEventRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;

// Publishes credit events through the transactional outbox: the event is stored in the caller's transaction,
// so it is relayed to Kafka (by Debezium) if and only if the change it describes commits.
// Keyed by order id so all events for one errand stay ordered on one partition.
@Component
public class CreditEventPublisher {

    static final String AGGREGATE_TYPE = "credit";

    private final OutboxEventRepository outboxEventRepository;
    private final JsonMapper jsonMapper;
    private final Clock clock;

    public CreditEventPublisher(OutboxEventRepository outboxEventRepository, JsonMapper jsonMapper, Clock clock) {
        this.outboxEventRepository = outboxEventRepository;
        this.jsonMapper = jsonMapper;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void publishCreditChanged(String type, CreditChangedEvent event) {
        append(event.orderId().toString(), type, event);
    }

    private void append(String aggregateId, String type, Object event) {
        outboxEventRepository.save(new OutboxEvent(
                AGGREGATE_TYPE, aggregateId, type, jsonMapper.writeValueAsString(event), clock.instant()));
    }

}