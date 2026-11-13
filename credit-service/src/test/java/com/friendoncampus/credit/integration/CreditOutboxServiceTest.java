package com.friendoncampus.credit.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
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

import com.friendoncampus.credit.domain.CreditOutboxEvent;
import com.friendoncampus.credit.repository.CreditOutboxEventRepository;

import tools.jackson.databind.json.JsonMapper;

@ExtendWith(MockitoExtension.class)
class CreditOutboxServiceTest {

    @Mock CreditOutboxEventRepository outbox;

    private CreditOutboxService service;

    @BeforeEach
    void setUp() {
        service = new CreditOutboxService(
                outbox,
                new EventPayloadCodec(JsonMapper.builder().build()));
    }

    @Test
    void storesCanonicalJsonForLaterPublishing() {
        CreditEventEnvelope source = event("{ \"reservationId\" : \"abc\" }");
        CreditEventEnvelope event = withOccurredAt(
                source,
                OffsetDateTime.parse("2026-10-15T14:00:00.123456789Z"));
        OffsetDateTime storedTimestamp = event.occurredAt().truncatedTo(ChronoUnit.MICROS);
        CreditEventEnvelope canonical = new CreditEventEnvelope(
                event.eventId(), event.eventType(), event.eventVersion(), event.aggregateType(),
                event.aggregateId(), event.aggregateVersion(), storedTimestamp, event.producer(),
                event.correlationId(), event.causationId(), event.actorJson(),
                "{\"reservationId\":\"abc\"}");
        CreditOutboxEvent stored = CreditOutboxEvent.pending(
                canonical,
                EventFingerprint.sha256(canonical.payloadJson()));
        when(outbox.findByEventIdForUpdate(event.eventId())).thenReturn(Optional.of(stored));

        CreditOutboxEvent result = service.enqueue(event);

        assertThat(result.getPayloadJson()).isEqualTo("{\"reservationId\":\"abc\"}");
        assertThat(result.getPublishedAt()).isNull();
        verify(outbox).insertPendingIfAbsent(
                event.eventId(), event.eventType(), event.eventVersion(), event.aggregateType(),
                event.aggregateId(), event.aggregateVersion(), storedTimestamp, event.producer(),
                event.correlationId(), event.causationId(), event.actorJson(),
                canonical.payloadJson(), EventFingerprint.sha256(canonical.payloadJson()));
    }

    @Test
    void rejectsAnEventFromAnotherProducer() {
        CreditEventEnvelope event = new CreditEventEnvelope(
                UUID.randomUUID(), "CreditReserved", 1, "Order", UUID.randomUUID(), 1,
                OffsetDateTime.parse("2026-10-15T14:00:00Z"),
                "order-service", UUID.randomUUID(), null,
                "{\"type\":\"SYSTEM\"}", "{}");

        assertThatThrownBy(() -> service.enqueue(event))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("credit-service producer");
    }

    @Test
    void marksPublishingFailuresForRetry() {
        CreditEventEnvelope envelope = event("{}");
        CreditOutboxEvent event = CreditOutboxEvent.pending(envelope, EventFingerprint.sha256("{}"));
        when(outbox.findByEventIdForUpdate(envelope.eventId())).thenReturn(Optional.of(event));

        service.recordPublishFailure(envelope.eventId(), new IllegalStateException("broker unavailable"));

        assertThat(event.getPublishAttempts()).isEqualTo(1);
        assertThat(event.getLastError()).isEqualTo("broker unavailable");
        assertThat(event.getPublishedAt()).isNull();
        verify(outbox).save(event);
    }

    private static CreditEventEnvelope event(String payload) {
        return new CreditEventEnvelope(
                UUID.randomUUID(), "CreditReserved", 1, "Order", UUID.randomUUID(), 1,
                OffsetDateTime.parse("2026-10-15T14:00:00Z"),
                CreditOutboxService.CREDIT_PRODUCER, UUID.randomUUID(), UUID.randomUUID(),
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
