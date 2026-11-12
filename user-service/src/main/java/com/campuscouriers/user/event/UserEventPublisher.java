/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-10-09 to 2026-10-15
 * Scope (AI-24): Generated code, configuration and tests for the specified user event, Kafka setup and outbox changes.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.event;

import com.campuscouriers.user.repository.OutboxEventRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;

// Publishes user lifecycle events through the transactional outbox: the event is stored in the caller's transaction,
// so it is relayed to Kafka (by Debezium) if and only if the change it describes commits.
// Keyed by user id so each user's events stay ordered on one partition.
@Component
public class UserEventPublisher {

    static final String AGGREGATE_TYPE = "user";

    private final OutboxEventRepository outboxEventRepository;
    private final JsonMapper jsonMapper;
    private final Clock clock;

    public UserEventPublisher(OutboxEventRepository outboxEventRepository, JsonMapper jsonMapper, Clock clock) {
        this.outboxEventRepository = outboxEventRepository;
        this.jsonMapper = jsonMapper;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void publishUserRegistered(UserRegisteredEvent event) {
        append(event.userId().toString(), UserRegisteredEvent.TYPE, event);
    }

    private void append(String aggregateId, String type, Object event) {
        outboxEventRepository.save(new OutboxEvent(
                AGGREGATE_TYPE, aggregateId, type, jsonMapper.writeValueAsString(event), clock.instant()));
    }

}
