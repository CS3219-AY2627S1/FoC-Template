package com.friendoncampus.credit.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import com.friendoncampus.credit.domain.CreditOutboxEvent;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class CreditEventJsonCodecTest {
    private JsonMapper objectMapper;
    private CreditEventJsonCodec codec;

    @BeforeEach
    void setUp() {
        objectMapper = JsonMapper.builder().findAndAddModules().build();
        codec = new CreditEventJsonCodec(objectMapper);
    }

    @Test
    void readsTheSharedEnvelopeAndKeepsActorAndDataObjects() {
        UUID eventId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        UUID operationId = UUID.randomUUID();
        String json = """
                {"eventId":"%s","eventType":"UserActivated","eventVersion":1,
                 "aggregateType":"User","aggregateId":"%s","aggregateVersion":1,
                 "occurredAt":"2026-10-18T10:15:30Z","producer":"user-service",
                 "correlationId":"%s","causationId":null,"actor":{"type":"SYSTEM"},
                 "data":{"operationId":"%s","userId":"%s","activatedAt":"2026-10-18T10:15:30Z"}}
                """.formatted(eventId, userId, eventId, operationId, userId);

        CreditEventEnvelope envelope = codec.deserialize(json);

        assertThat(envelope.eventId()).isEqualTo(eventId);
        assertThat(envelope.aggregateId()).isEqualTo(userId);
        assertThat(envelope.actorJson()).isEqualTo("{\"type\":\"SYSTEM\"}");
        assertThat(envelope.payloadJson()).contains(operationId.toString(), userId.toString());
    }

    @Test
    void serializesAStoredCreditOutcomeBackToTheSharedEnvelope() throws Exception {
        CreditOutboxEvent event = Mockito.mock(CreditOutboxEvent.class);
        UUID eventId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        UUID correlationId = UUID.randomUUID();
        UUID causationId = UUID.randomUUID();
        when(event.getEventId()).thenReturn(eventId);
        when(event.getEventType()).thenReturn("CreditReserved");
        when(event.getEventVersion()).thenReturn(1);
        when(event.getAggregateType()).thenReturn("Order");
        when(event.getAggregateId()).thenReturn(orderId);
        when(event.getAggregateVersion()).thenReturn(2L);
        when(event.getOccurredAt()).thenReturn(OffsetDateTime.parse("2026-10-18T10:15:30Z"));
        when(event.getProducer()).thenReturn("credit-service");
        when(event.getCorrelationId()).thenReturn(correlationId);
        when(event.getCausationId()).thenReturn(causationId);
        when(event.getActorJson()).thenReturn("{\"type\":\"SYSTEM\"}");
        when(event.getPayloadJson()).thenReturn("{\"operationId\":\"" + UUID.randomUUID() + "\"}");

        JsonNode json = objectMapper.readTree(codec.serialize(event));

        assertThat(json.get("eventId").stringValue()).isEqualTo(eventId.toString());
        assertThat(json.get("aggregateId").stringValue()).isEqualTo(orderId.toString());
        assertThat(json.get("actor").isObject()).isTrue();
        assertThat(json.get("data").isObject()).isTrue();
    }

    @Test
    void rejectsNonObjectActorAndDataFields() {
        String invalid = """
                {"eventId":"%s","eventType":"UserActivated","eventVersion":1,
                 "aggregateType":"User","aggregateId":"%s","aggregateVersion":1,
                 "occurredAt":"2026-10-18T10:15:30Z","producer":"user-service",
                 "correlationId":"%s","causationId":null,"actor":"SYSTEM","data":{}}
                """.formatted(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());

        assertThatThrownBy(() -> codec.deserialize(invalid))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("actor");
    }
}
