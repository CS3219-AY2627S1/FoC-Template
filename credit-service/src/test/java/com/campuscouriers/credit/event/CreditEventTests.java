/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-11-10
 * Scope (AI-62): Generated unit tests for credit event publishing and user registration event handling, including validation of outbox event creation and wallet creation.
 * Author review: Code changes were checked and validated
 */

package com.campuscouriers.credit.event;

import com.campuscouriers.credit.entity.CreditRecordsType;
import com.campuscouriers.credit.entity.OutboxEvent;
import com.campuscouriers.credit.repository.OutboxEventRepository;
import com.campuscouriers.credit.service.WalletService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class CreditEventTests {

    @ParameterizedTest
    @CsvSource({
            "RESERVED, credit.reserved",
            "RELEASED, credit.released",
            "TRANSFERRED, credit.transferred",
            "RECEIVED, credit.received",
    })
    void eachRecordTypeHasItsOwnTopic(String changeType, String topic) {
        assertThat(CreditChangedEvent.topicFor(changeType)).isEqualTo(topic);
    }

    @Test
    void everyRecordTypeIsMappedToATopic() {
        for (CreditRecordsType type : CreditRecordsType.values()) {
            assertThat(CreditChangedEvent.topicFor(type.name())).startsWith("credit.");
        }
    }

    @Test
    void unknownChangeTypeIsRejected() {
        assertThatThrownBy(() -> CreditChangedEvent.topicFor("REFUNDED"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void publisherWritesOutboxRowKeyedByOrderId() {
        OutboxEventRepository outbox = mock(OutboxEventRepository.class);
        JsonMapper jsonMapper = JsonMapper.builder().build();
        Instant now = Instant.parse("2026-11-10T08:00:00Z");
        CreditEventPublisher publisher = new CreditEventPublisher(
                outbox, jsonMapper, Clock.fixed(now, ZoneOffset.UTC));
        UUID orderId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        CreditChangedEvent event = new CreditChangedEvent(
                UUID.randomUUID(), "RESERVED", orderId, userId, null, -10, 10, 20, now);

        publisher.publishCreditChanged(CreditChangedEvent.RESERVED, event);

        ArgumentCaptor<OutboxEvent> captor = ArgumentCaptor.forClass(OutboxEvent.class);
        verify(outbox).save(captor.capture());
        OutboxEvent row = captor.getValue();
        assertThat(row.getId()).isNotNull();
        assertThat(row.getAggregateType()).isEqualTo("credit");
        assertThat(row.getAggregateId()).isEqualTo(orderId.toString());
        assertThat(row.getType()).isEqualTo("credit.reserved");
        assertThat(row.getCreatedAt()).isEqualTo(now);

        JsonNode payload = jsonMapper.readTree(row.getPayload());
        assertThat(payload.get("changeType").asString()).isEqualTo("RESERVED");
        assertThat(payload.get("orderId").asString()).isEqualTo(orderId.toString());
        assertThat(payload.get("userId").asString()).isEqualTo(userId.toString());
        assertThat(payload.get("amount").asLong()).isEqualTo(-10);
        assertThat(payload.get("reserveAmount").asLong()).isEqualTo(10);
        assertThat(payload.get("availableBalanceAfter").asLong()).isEqualTo(20);
    }

    @Test
    void userRegisteredEventCreatesWallet() {
        WalletService walletService = mock(WalletService.class);
        UserRegisteredListener listener = new UserRegisteredListener(walletService);
        UUID userId = UUID.randomUUID();

        listener.onUserRegistered(new UserRegisteredEvent(userId, UserRegisteredEvent.TYPE));

        verify(walletService).createWallet(userId);
    }
}
