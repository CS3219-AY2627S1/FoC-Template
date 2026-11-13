package com.friendoncampus.credit.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.friendoncampus.credit.domain.ReservationStatus;
import com.friendoncampus.credit.service.CreditReservationService;
import com.friendoncampus.credit.service.CreditSettlementService;
import com.friendoncampus.credit.service.InitialCreditAllocationService;
import com.friendoncampus.credit.service.InsufficientCreditsException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@ExtendWith(MockitoExtension.class)
class CreditEventHandlerTest {

    private static final OffsetDateTime OCCURRED_AT = OffsetDateTime.parse("2026-10-15T14:00:00Z");

    @Mock CreditEventCoordinator coordinator;
    @Mock InitialCreditAllocationService allocations;
    @Mock CreditReservationService reservations;
    @Mock CreditSettlementService settlements;
    @Mock CreditOutboxService outbox;

    private JsonMapper objectMapper;
    private CreditEventHandler handler;

    @BeforeEach
    void setUp() {
        objectMapper = JsonMapper.builder().build();
        handler = new CreditEventHandler(coordinator, allocations, reservations, settlements, outbox, objectMapper);
    }

    @Test
    void routesUserActivationAndBuildsAllocationOutcome() throws Exception {
        processHandlersImmediately();
        UUID userId = UUID.randomUUID();
        UUID operationId = UUID.randomUUID();
        CreditEventEnvelope incoming = userEvent(operationId, userId);
        when(allocations.allocate(operationId, userId)).thenReturn(
                new InitialCreditAllocationService.AllocationResult(userId, 10, 10, 0, true));

        assertThat(handler.handle(incoming)).isEqualTo(CreditEventCoordinator.ProcessingOutcome.PROCESSED);

        CreditEventEnvelope outcome = captureSingleOutcome();
        assertCommonOutcome(outcome, incoming, "CreditAccountAllocated");
        JsonNode data = objectMapper.readTree(outcome.payloadJson());
        assertThat(data.get("operationId").stringValue()).isEqualTo(operationId.toString());
        assertThat(data.get("userId").stringValue()).isEqualTo(userId.toString());
        assertThat(data.get("allocatedAmount").asInt()).isEqualTo(10);
        assertThat(data.get("availableBalance").asInt()).isEqualTo(10);
    }

    @Test
    void routesEveryOrderCommandAndBuildsTheMatchingOutcome() {
        processHandlersImmediately();
        UUID requesterId = UUID.randomUUID();
        UUID courierId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        UUID reservationId = UUID.randomUUID();

        when(reservations.reserve(any(), any(), any(), any(Integer.class))).thenAnswer(invocation ->
                new CreditReservationService.ReservationResult(
                        invocation.getArgument(1), reservationId, invocation.getArgument(2),
                        invocation.getArgument(3), ReservationStatus.ACTIVE, 7, 3, true));
        when(reservations.adjust(any(), any(), any(Integer.class))).thenAnswer(invocation ->
                new CreditReservationService.ReservationResult(
                        invocation.getArgument(1), reservationId, requesterId,
                        invocation.getArgument(2), ReservationStatus.ACTIVE, 6, 4, true));
        when(reservations.release(any(), any())).thenReturn(
                new CreditReservationService.ReservationResult(
                        orderId, reservationId, requesterId, 4, ReservationStatus.RELEASED, 10, 0, true));
        when(settlements.settle(any(), any(), any())).thenReturn(settlement(
                orderId, requesterId, courierId, 4, 4, 0, ReservationStatus.SETTLED));
        when(settlements.compensate(any(), any(), any())).thenReturn(settlement(
                orderId, requesterId, courierId, 4, 1, 3, ReservationStatus.COMPENSATED));

        handler.handle(orderEvent("OrderSubmitted", orderId, """
                {"operationId":"%s","orderId":"%s","requesterId":"%s","creditReward":3}
                """.formatted(UUID.randomUUID(), orderId, requesterId)));
        handler.handle(orderEvent("OrderRewardChangeRequested", orderId, """
                {"operationId":"%s","orderId":"%s","newCreditReward":4}
                """.formatted(UUID.randomUUID(), orderId)));
        handler.handle(orderEvent("OrderCompleted", orderId, """
                {"operationId":"%s","orderId":"%s","courierId":"%s","completedAt":"2026-10-15T14:05:00Z"}
                """.formatted(UUID.randomUUID(), orderId, courierId)));
        handler.handle(orderEvent("OrderCancelled", orderId, """
                {"operationId":"%s","orderId":"%s","courierId":"%s","compensationRequired":true,
                 "reason":"requester cancellation","cancelledAt":"2026-10-15T14:06:00Z"}
                """.formatted(UUID.randomUUID(), orderId, courierId)));
        handler.handle(orderEvent("OrderCancelled", orderId, """
                {"operationId":"%s","orderId":"%s","courierId":null,"compensationRequired":false,
                 "reason":"cancelled before acceptance","cancelledAt":"2026-10-15T14:07:00Z"}
                """.formatted(UUID.randomUUID(), orderId)));
        handler.handle(orderEvent("OrderExpired", orderId, """
                {"operationId":"%s","orderId":"%s","reason":"expired","expiredAt":"2026-10-15T14:08:00Z"}
                """.formatted(UUID.randomUUID(), orderId)));

        ArgumentCaptor<CreditEventEnvelope> outcomes = ArgumentCaptor.forClass(CreditEventEnvelope.class);
        verify(outbox, org.mockito.Mockito.times(6)).enqueue(outcomes.capture());
        assertThat(outcomes.getAllValues()).extracting(CreditEventEnvelope::eventType)
                .containsExactly(
                        "CreditReserved",
                        "CreditAdjusted",
                        "CreditSettled",
                        "CourierCompensated",
                        "CreditReleased",
                        "CreditReleased");
    }

    @Test
    void convertsAnExpectedBusinessRejectionIntoAContractOutcome() throws Exception {
        processHandlersImmediately();
        UUID orderId = UUID.randomUUID();
        UUID operationId = UUID.randomUUID();
        UUID requesterId = UUID.randomUUID();
        CreditEventEnvelope incoming = orderEvent("OrderSubmitted", orderId, """
                {"operationId":"%s","orderId":"%s","requesterId":"%s","creditReward":11}
                """.formatted(operationId, orderId, requesterId));
        when(reservations.reserve(operationId, orderId, requesterId, 11))
                .thenThrow(new InsufficientCreditsException());

        handler.handle(incoming);

        CreditEventEnvelope outcome = captureSingleOutcome();
        assertCommonOutcome(outcome, incoming, "CreditReservationRejected");
        JsonNode data = objectMapper.readTree(outcome.payloadJson());
        assertThat(data.get("reasonCode").stringValue()).isEqualTo("INSUFFICIENT_CREDITS");
        assertThat(data.has("message")).isFalse();
    }

    @Test
    void timeoutWithoutReservationIsProcessedWithoutPublishingARelease() {
        processHandlersImmediately();
        UUID orderId = UUID.randomUUID();
        UUID operationId = UUID.randomUUID();
        CreditEventEnvelope incoming = orderEvent("OrderExpired", orderId, """
                {"operationId":"%s","orderId":"%s","reason":"CREDIT_RESERVATION_TIMEOUT",
                 "expiredAt":"2026-10-15T14:08:00Z"}
                """.formatted(operationId, orderId));
        when(reservations.releaseForPendingCreditTimeout(operationId, orderId)).thenReturn(Optional.empty());

        assertThat(handler.handle(incoming)).isEqualTo(CreditEventCoordinator.ProcessingOutcome.PROCESSED);

        verify(reservations).releaseForPendingCreditTimeout(operationId, orderId);
        verify(reservations, never()).release(any(), any());
        verify(outbox, never()).enqueue(any());
    }

    @Test
    void rejectsInvalidContractDataBeforeRegisteringAnInboxReceipt() {
        UUID orderId = UUID.randomUUID();
        CreditEventEnvelope incoming = orderEvent("OrderCancelled", orderId, """
                {"operationId":"%s","orderId":"%s","courierId":null,"compensationRequired":true,
                 "reason":"cancelled","cancelledAt":"2026-10-15T14:06:00Z"}
                """.formatted(UUID.randomUUID(), orderId));

        assertThatThrownBy(() -> handler.handle(incoming))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("courierId is required");
        verify(coordinator, never()).process(any(), any());
        verify(outbox, never()).enqueue(any());
    }

    @Test
    void rejectsWrongProducerAggregateOrUnsupportedVersion() {
        UUID userId = UUID.randomUUID();
        UUID operationId = UUID.randomUUID();
        CreditEventEnvelope valid = userEvent(operationId, userId);
        List<CreditEventEnvelope> invalid = List.of(
                copy(valid, 1, "order-service", "User", userId),
                copy(valid, 1, "user-service", "Order", userId),
                copy(valid, 2, "user-service", "User", userId),
                copy(valid, 1, "user-service", "User", UUID.randomUUID()));

        for (CreditEventEnvelope envelope : invalid) {
            assertThatThrownBy(() -> handler.handle(envelope)).isInstanceOf(IllegalArgumentException.class);
        }
        verify(coordinator, never()).process(any(), any());
    }

    @Test
    void rejectsNonUtcEnvelopeAndPayloadTimestamps() {
        UUID userId = UUID.randomUUID();
        UUID operationId = UUID.randomUUID();
        CreditEventEnvelope valid = userEvent(operationId, userId);
        CreditEventEnvelope nonUtcEnvelope = new CreditEventEnvelope(
                valid.eventId(), valid.eventType(), valid.eventVersion(), valid.aggregateType(), valid.aggregateId(),
                valid.aggregateVersion(), OffsetDateTime.parse("2026-10-15T22:00:00+08:00"), valid.producer(),
                valid.correlationId(), valid.causationId(), valid.actorJson(), valid.payloadJson());
        CreditEventEnvelope nonUtcPayload = new CreditEventEnvelope(
                UUID.randomUUID(), valid.eventType(), valid.eventVersion(), valid.aggregateType(), valid.aggregateId(),
                valid.aggregateVersion(), valid.occurredAt(), valid.producer(), valid.correlationId(),
                valid.causationId(), valid.actorJson(), """
                {"operationId":"%s","userId":"%s","activatedAt":"2026-10-15T21:55:00+08:00"}
                """.formatted(operationId, userId));

        assertThatThrownBy(() -> handler.handle(nonUtcEnvelope))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("occurredAt");
        assertThatThrownBy(() -> handler.handle(nonUtcPayload))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("activatedAt");
        verify(coordinator, never()).process(any(), any());
    }

    private CreditEventEnvelope captureSingleOutcome() {
        ArgumentCaptor<CreditEventEnvelope> outcome = ArgumentCaptor.forClass(CreditEventEnvelope.class);
        verify(outbox).enqueue(outcome.capture());
        return outcome.getValue();
    }

    private void processHandlersImmediately() {
        when(coordinator.process(any(), any())).thenAnswer(invocation -> {
            invocation.getArgument(1, Runnable.class).run();
            return CreditEventCoordinator.ProcessingOutcome.PROCESSED;
        });
    }

    private static void assertCommonOutcome(
            CreditEventEnvelope outcome,
            CreditEventEnvelope incoming,
            String eventType) {
        assertThat(outcome.eventId()).isNotEqualTo(incoming.eventId());
        assertThat(outcome.eventType()).isEqualTo(eventType);
        assertThat(outcome.eventVersion()).isEqualTo(1);
        assertThat(outcome.aggregateType()).isEqualTo(incoming.aggregateType());
        assertThat(outcome.aggregateId()).isEqualTo(incoming.aggregateId());
        assertThat(outcome.aggregateVersion()).isEqualTo(incoming.aggregateVersion());
        assertThat(outcome.producer()).isEqualTo("credit-service");
        assertThat(outcome.correlationId()).isEqualTo(incoming.correlationId());
        assertThat(outcome.causationId()).isEqualTo(incoming.eventId());
        assertThat(outcome.actorJson()).isEqualTo("{\"type\":\"SYSTEM\"}");
    }

    private static CreditSettlementService.SettlementResult settlement(
            UUID orderId,
            UUID requesterId,
            UUID courierId,
            int reserved,
            int transferred,
            int released,
            ReservationStatus status) {
        return new CreditSettlementService.SettlementResult(
                orderId, requesterId, courierId, reserved, transferred, released, status,
                released, 0, transferred, 0, true);
    }

    private static CreditEventEnvelope userEvent(UUID operationId, UUID userId) {
        return new CreditEventEnvelope(
                UUID.randomUUID(),
                "UserActivated",
                1,
                "User",
                userId,
                1,
                OCCURRED_AT,
                "user-service",
                UUID.randomUUID(),
                null,
                "{\"type\":\"SYSTEM\"}",
                """
                {"operationId":"%s","userId":"%s","activatedAt":"2026-10-15T13:55:00Z"}
                """.formatted(operationId, userId));
    }

    private static CreditEventEnvelope orderEvent(String eventType, UUID orderId, String payload) {
        return new CreditEventEnvelope(
                UUID.randomUUID(),
                eventType,
                1,
                "Order",
                orderId,
                2,
                OCCURRED_AT,
                "order-service",
                UUID.randomUUID(),
                null,
                "{\"type\":\"USER\"}",
                payload);
    }

    private static CreditEventEnvelope copy(
            CreditEventEnvelope source,
            int version,
            String producer,
            String aggregateType,
            UUID aggregateId) {
        return new CreditEventEnvelope(
                source.eventId(), source.eventType(), version, aggregateType, aggregateId,
                source.aggregateVersion(), source.occurredAt(), producer, source.correlationId(),
                source.causationId(), source.actorJson(), source.payloadJson());
    }
}
