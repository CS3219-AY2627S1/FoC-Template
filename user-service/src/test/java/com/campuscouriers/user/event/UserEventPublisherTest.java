/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-10-09 to 2026-10-15
 * Scope (AI-24): Generated code, configuration and tests for the specified user event, Kafka setup and outbox changes.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.event;

import com.campuscouriers.user.entity.AccountType;
import com.campuscouriers.user.repository.OutboxEventRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

import static com.campuscouriers.user.TestConstants.VALID_EMAIL;
import static com.campuscouriers.user.TestConstants.VALID_NAME;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class UserEventPublisherTest {

    private static final Instant NOW = Instant.parse("2026-01-01T00:00:05Z");

    @Mock private OutboxEventRepository outboxEventRepository;
    @Captor private ArgumentCaptor<OutboxEvent> outboxCaptor;

    private final JsonMapper jsonMapper = JsonMapper.builder().build();
    private UserEventPublisher publisher;

    private final UserRegisteredEvent event = new UserRegisteredEvent(
            UUID.randomUUID(), AccountType.Student, VALID_NAME, VALID_EMAIL, Instant.parse("2026-01-01T00:00:00Z"));

    @BeforeEach
    void setUp() {
        publisher = new UserEventPublisher(outboxEventRepository, jsonMapper, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void publishUserRegistered_storesOutboxEventRoutedToTopicAndKeyedByUserId() {
        publisher.publishUserRegistered(event);

        verify(outboxEventRepository).save(outboxCaptor.capture());
        OutboxEvent stored = outboxCaptor.getValue();
        assertThat(stored.getId()).isNotNull();
        assertThat(stored.getAggregateType()).isEqualTo("user");
        assertThat(stored.getAggregateId()).isEqualTo(event.userId().toString());
        assertThat(stored.getType()).isEqualTo("user.registered");
        assertThat(stored.getCreatedAt()).isEqualTo(NOW);
    }

    @Test
    void publishUserRegistered_storesPlainJsonPayloadWithContractFieldNames() {
        publisher.publishUserRegistered(event);

        verify(outboxEventRepository).save(outboxCaptor.capture());
        JsonNode payload = jsonMapper.readTree(outboxCaptor.getValue().getPayload());
        assertThat(payload.propertyNames()).containsExactlyInAnyOrder("userId", "type", "name", "email", "registeredAt");
        assertThat(payload.get("userId").asString()).isEqualTo(event.userId().toString());
        assertThat(payload.get("type").asString()).isEqualTo("Student");
        assertThat(payload.get("name").asString()).isEqualTo(VALID_NAME);
        assertThat(payload.get("email").asString()).isEqualTo(VALID_EMAIL);
        assertThat(payload.get("registeredAt").asString()).isEqualTo("2026-01-01T00:00:00Z");
    }

}
