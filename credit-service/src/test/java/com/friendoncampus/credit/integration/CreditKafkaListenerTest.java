package com.friendoncampus.credit.integration;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.util.UUID;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.support.Acknowledgment;

@ExtendWith(MockitoExtension.class)
class CreditKafkaListenerTest {
    @Mock CreditEventJsonCodec codec;
    @Mock CreditEventHandler handler;
    @Mock Acknowledgment acknowledgment;

    private CreditKafkaListener listener;

    @BeforeEach
    void setUp() {
        listener = new CreditKafkaListener(codec, handler);
    }

    @Test
    void acknowledgesOnlyAfterTheDomainHandlerCompletes() {
        UUID userId = UUID.randomUUID();
        CreditEventEnvelope envelope = envelope(userId);
        ConsumerRecord<String, String> record = new ConsumerRecord<>("user.events", 0, 12, userId.toString(), "{}");
        when(codec.deserialize("{}")).thenReturn(envelope);
        when(handler.handle(envelope)).thenReturn(CreditEventCoordinator.ProcessingOutcome.PROCESSED);

        listener.consume(record, acknowledgment);

        verify(handler).handle(envelope);
        verify(acknowledgment).acknowledge();
    }

    @Test
    void rejectsAMismatchedKafkaKeyWithoutAcknowledging() {
        CreditEventEnvelope envelope = envelope(UUID.randomUUID());
        ConsumerRecord<String, String> record = new ConsumerRecord<>("user.events", 0, 12, UUID.randomUUID().toString(), "{}");
        when(codec.deserialize("{}")).thenReturn(envelope);

        assertThatThrownBy(() -> listener.consume(record, acknowledgment))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("aggregateId");
        verify(handler, never()).handle(envelope);
        verify(acknowledgment, never()).acknowledge();
    }

    private static CreditEventEnvelope envelope(UUID aggregateId) {
        return new CreditEventEnvelope(
                UUID.randomUUID(), "UserActivated", 1, "User", aggregateId, 1,
                OffsetDateTime.parse("2026-10-18T10:15:30Z"), "user-service", UUID.randomUUID(), null,
                "{\"type\":\"SYSTEM\"}", "{\"operationId\":\"" + UUID.randomUUID() + "\"}");
    }
}
