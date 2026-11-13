package com.friendoncampus.credit.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.friendoncampus.credit.domain.CreditInboxEvent;
import com.friendoncampus.credit.domain.InboxEventStatus;
import com.friendoncampus.credit.repository.CreditInboxEventRepository;

import tools.jackson.databind.json.JsonMapper;

@ExtendWith(MockitoExtension.class)
class CreditInboxReceiptServiceTest {

    @Mock CreditInboxEventRepository inbox;

    private CreditInboxReceiptService service;

    @BeforeEach
    void setUp() {
        service = new CreditInboxReceiptService(
                inbox,
                new EventPayloadCodec(JsonMapper.builder().build()));
    }

    @Test
    void recognizesTheSameEventDeliveredAgain() {
        CreditEventEnvelope source = event("{\"amount\":3}");
        CreditEventEnvelope envelope = withOccurredAt(
                source,
                OffsetDateTime.parse("2026-10-15T14:00:00.123456789Z"));
        OffsetDateTime storedTimestamp = envelope.occurredAt().truncatedTo(ChronoUnit.MICROS);
        CreditInboxEvent stored = stored(
                envelope,
                storedTimestamp,
                EventFingerprint.sha256("{\"amount\":3}"));
        when(stored.getStatus()).thenReturn(InboxEventStatus.PROCESSED);
        when(inbox.insertReceivedIfAbsent(
                envelope.eventId(), envelope.eventType(), envelope.eventVersion(),
                envelope.aggregateType(), envelope.aggregateId(), envelope.aggregateVersion(),
                storedTimestamp,
                envelope.producer(), envelope.correlationId(), envelope.causationId(),
                "{\"type\":\"SYSTEM\"}",
                EventFingerprint.sha256("{\"amount\":3}")))
                .thenReturn(0);
        when(inbox.findByEventIdForUpdate(envelope.eventId())).thenReturn(Optional.of(stored));

        CreditInboxReceiptService.Receipt receipt = service.register(envelope);

        assertThat(receipt.duplicateDelivery()).isTrue();
        assertThat(receipt.status()).isEqualTo(InboxEventStatus.PROCESSED);
    }

    @Test
    void rejectsAnEventIdReusedWithDifferentContent() {
        CreditEventEnvelope envelope = event("{\"amount\":4}");
        CreditInboxEvent stored = stored(
                envelope,
                envelope.occurredAt(),
                EventFingerprint.sha256("{\"amount\":3}"));
        when(inbox.insertReceivedIfAbsent(
                envelope.eventId(), envelope.eventType(), envelope.eventVersion(),
                envelope.aggregateType(), envelope.aggregateId(), envelope.aggregateVersion(),
                envelope.occurredAt(),
                envelope.producer(), envelope.correlationId(), envelope.causationId(),
                "{\"type\":\"SYSTEM\"}",
                EventFingerprint.sha256("{\"amount\":4}")))
                .thenReturn(0);
        when(inbox.findByEventIdForUpdate(envelope.eventId())).thenReturn(Optional.of(stored));

        assertThatThrownBy(() -> service.register(envelope))
                .isInstanceOf(EventReplayConflictException.class);
    }

    @Test
    void rejectsMalformedJsonBeforeRecordingIt() {
        CreditEventEnvelope envelope = event("not-json");

        assertThatThrownBy(() -> service.register(envelope))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Event payload must be valid JSON");
    }

    private static CreditInboxEvent stored(
            CreditEventEnvelope envelope,
            OffsetDateTime occurredAt,
            String payloadHash) {
        CreditInboxEvent stored = mock(CreditInboxEvent.class);
        when(stored.getEventType()).thenReturn(envelope.eventType());
        when(stored.getEventVersion()).thenReturn(envelope.eventVersion());
        when(stored.getAggregateType()).thenReturn(envelope.aggregateType());
        when(stored.getAggregateId()).thenReturn(envelope.aggregateId());
        when(stored.getAggregateVersion()).thenReturn(envelope.aggregateVersion());
        when(stored.getOccurredAt()).thenReturn(occurredAt);
        when(stored.getProducer()).thenReturn(envelope.producer());
        when(stored.getCorrelationId()).thenReturn(envelope.correlationId());
        when(stored.getCausationId()).thenReturn(envelope.causationId());
        when(stored.getActorJson()).thenReturn("{\"type\":\"SYSTEM\"}");
        when(stored.getPayloadHash()).thenReturn(payloadHash);
        return stored;
    }

    private static CreditEventEnvelope event(String payload) {
        return new CreditEventEnvelope(
                UUID.randomUUID(), "OrderSubmitted", 1, "Order", UUID.randomUUID(), 0,
                OffsetDateTime.parse("2026-10-15T14:00:00Z"),
                "order-service", UUID.randomUUID(), null,
                "{\"type\":\"SYSTEM\"}", payload);
    }

    private static CreditEventEnvelope withOccurredAt(
            CreditEventEnvelope source,
            OffsetDateTime occurredAt) {
        return new CreditEventEnvelope(
                source.eventId(), source.eventType(), source.eventVersion(), source.aggregateType(),
                source.aggregateId(), source.aggregateVersion(), occurredAt, source.producer(),
                source.correlationId(), source.causationId(), source.actorJson(), source.payloadJson());
    }
}
