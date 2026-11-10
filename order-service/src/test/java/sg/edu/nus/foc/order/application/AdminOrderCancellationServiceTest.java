package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mapstruct.factory.Mappers;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.util.ReflectionTestUtils;

import sg.edu.nus.foc.common.penalty.PenaltySystemPolicy;
import sg.edu.nus.foc.order.domain.CommandReceipt;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.domain.repository.CommandReceiptRepository;
import sg.edu.nus.foc.order.domain.repository.OrderCheckpointRepository;
import sg.edu.nus.foc.order.domain.repository.OrderEventOutboxRepository;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;
import sg.edu.nus.foc.order.messagingpublisher.dto.OpenOrderRefundTaskEvent;
import sg.edu.nus.foc.order.messagingpublisher.dto.OrderTaskEvent;
import sg.edu.nus.foc.order.messagingpublisher.dto.PenaltyScoreAdditionEvent;
import sg.edu.nus.foc.order.messagingpublisher.mapper.OrderTaskEventMapper;

class AdminOrderCancellationServiceTest {

    private final OrderRepository orders = mock(OrderRepository.class);
    private final OrderCheckpointRepository checkpoints = mock(OrderCheckpointRepository.class);
    private final CommandReceiptRepository receipts = mock(CommandReceiptRepository.class);
    private final OrderEventOutboxRepository outbox = mock(OrderEventOutboxRepository.class);
    private final ApplicationEventPublisher signals = mock(ApplicationEventPublisher.class);
    private AdminOrderCancellationService service;
    private Order order;

    @BeforeEach
    void setUp() {
        service = new AdminOrderCancellationService(orders, checkpoints, receipts, outbox, signals,
                new OrderTaskEventFactory(Mappers.getMapper(OrderTaskEventMapper.class), TestPenaltySequences.store()), mock(OrderAuditLogger.class), org.mockito.Mockito.mock(sg.edu.nus.foc.order.application.PenaltyOutcomeRecorder.class));
        Instant created = Instant.parse("2026-10-16T00:00:00Z");
        order = Order.open("requester", "item", "pickup", "delivery", 5, 30, created, created.plusSeconds(3600));
        when(orders.getForLifecycleUpdate(order.getId())).thenReturn(Optional.of(order));
        when(orders.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(receipts.findExisting(anyString(), anyString())).thenReturn(Optional.empty());
    }

    @ParameterizedTest
    @EnumSource(value = OrderStatus.class, names = {"OPEN", "ACCEPTED", "IN_PROGRESS", "PICKED_UP", "DELIVERED"})
    void cancelsActiveOrdersIncludingHeldOnesAndPreservesCreditAssignment(OrderStatus status) {
        ReflectionTestUtils.setField(order, "status", status);
        String courier = status == OrderStatus.OPEN ? null : "courier";
        ReflectionTestUtils.setField(order, "courierId", courier);
        order.placeCompletionHold("requester");

        Order result = service.cancel(order.getId(), "requester", courier, null, "admin");

        assertEquals(OrderStatus.CANCELLED, result.getStatus());
        assertEquals(courier, result.getCourierId());
        assertTrue(result.isCompletionHold());
        ArgumentCaptor<OrderTaskEvent> events = ArgumentCaptor.forClass(OrderTaskEvent.class);
        verify(outbox).enqueue(events.capture());
        OpenOrderRefundTaskEvent refund = (OpenOrderRefundTaskEvent) events.getValue();
        assertEquals(OrderStatus.CANCELLED, refund.getOrderStatus());
        assertEquals(courier, refund.getCourierId());
        assertEquals(5, refund.getCreditAmount());
    }

    @Test
    void explicitNoPenaltyOverridesStoredPenalty() {
        order.accept("courier", 0, order.getCreatedAt().plusSeconds(1));
        order.applyPenalty("courier", 0, PenaltySystemPolicy.DELIBERATE_ITEM_RETENTION_OR_THEFT,
                "admin", "Initial investigation", order.getCreatedAt());
        service.cancel(order.getId(), "requester", "courier", List.of(), "admin", "Courier cleared");
        assertEquals(0, order.getAdminPenaltyAmount());
        assertEquals(PenaltySystemPolicy.DELIBERATE_ITEM_RETENTION_OR_THEFT, order.getAppliedPenalty());
        verify(outbox).enqueue(any(OpenOrderRefundTaskEvent.class));
        verify(outbox, never()).enqueue(any(PenaltyScoreAdditionEvent.class));
    }

    @Test
    void selectedPenaltyRetainsHigherStoredPenalty() {
        order.accept("courier", 0, order.getCreatedAt().plusSeconds(1));
        order.applyPenalty("courier", 0, PenaltySystemPolicy.DELIBERATE_ITEM_RETENTION_OR_THEFT,
                "admin", "Initial investigation", order.getCreatedAt());
        service.cancel(order.getId(), "requester", "courier", List.of(PenaltySystemPolicy.WRONG_LOCATION_DELIVERY), "admin");
        assertEquals(10, order.getAdminPenaltyAmount());
    }

    @Test
    void addsOnlyTheHighestPenaltyAndBindsReplayToCanonicalInput() {
        order.accept("courier", 0, order.getCreatedAt().plusSeconds(1));
        List<PenaltySystemPolicy> reasons = List.of(PenaltySystemPolicy.OVERDUE_DELIVERY,
                PenaltySystemPolicy.WRONG_LOCATION_DELIVERY, PenaltySystemPolicy.DELIBERATE_ITEM_RETENTION_OR_THEFT);
        service.cancel(order.getId(), "requester", "courier", reasons, "admin");
        ArgumentCaptor<OrderTaskEvent> events = ArgumentCaptor.forClass(OrderTaskEvent.class);
        verify(outbox, org.mockito.Mockito.times(2)).enqueue(events.capture());
        PenaltyScoreAdditionEvent penalty = (PenaltyScoreAdditionEvent) events.getAllValues().get(1);
        assertEquals(10, penalty.getPenaltyAmount());
        assertEquals("courier", penalty.getCourierId());
        assertEquals(PenaltySystemPolicy.DELIBERATE_ITEM_RETENTION_OR_THEFT, penalty.getAppliedReason());
        ArgumentCaptor<CommandReceipt> saved = ArgumentCaptor.forClass(CommandReceipt.class);
        verify(receipts).save(saved.capture());
        when(receipts.findExisting(anyString(), anyString())).thenReturn(Optional.of(saved.getValue()));
        service.cancel(order.getId(), "requester", "courier", List.of(reasons.get(2), reasons.get(0), reasons.get(1)), "admin");
        verify(outbox, org.mockito.Mockito.times(2)).enqueue(any(OrderTaskEvent.class));
        assertThrows(OrderProblem.class, () -> service.cancel(order.getId(), "requester", "courier", List.of(), "admin"));
    }

    @Test
    void retiredCaseIsRejectedBeforeAnyFundingIntent() {
        assertThrows(OrderProblem.class, () -> service.cancel(order.getId(), "requester", null,
                List.of(PenaltySystemPolicy.COURIER_BAD_ATTITUDE), "admin"));
        verify(outbox, never()).enqueue(any());
        assertEquals(OrderStatus.OPEN, order.getStatus());
    }

    @Test
    void cancellationCanSelectTheThreePointUnresponsiveCase() {
        order.accept("courier", 0, order.getCreatedAt().plusSeconds(1));
        service.cancel(order.getId(), "requester", "courier", List.of(PenaltySystemPolicy.COURIER_UNRESPONSIVE), "admin");
        ArgumentCaptor<OrderTaskEvent> captured = ArgumentCaptor.forClass(OrderTaskEvent.class);
        verify(outbox, org.mockito.Mockito.times(2)).enqueue(captured.capture());
        PenaltyScoreAdditionEvent addition = (PenaltyScoreAdditionEvent) captured.getAllValues().stream()
                .filter(PenaltyScoreAdditionEvent.class::isInstance).findFirst().orElseThrow();
        assertEquals(PenaltySystemPolicy.COURIER_UNRESPONSIVE, addition.getAppliedReason());
        assertEquals(3, addition.getPenaltyAmount());
    }

    @Test
    void usesAStableTieBreak() {
        order.accept("courier", 0, order.getCreatedAt().plusSeconds(1));
        service.cancel(order.getId(), "requester", "courier", List.of(
                PenaltySystemPolicy.ITEM_MISHANDLING_OR_DAMAGE, PenaltySystemPolicy.WRONG_LOCATION_DELIVERY), "admin");
        ArgumentCaptor<OrderTaskEvent> events = ArgumentCaptor.forClass(OrderTaskEvent.class);
        verify(outbox, org.mockito.Mockito.times(2)).enqueue(events.capture());
        assertEquals(PenaltySystemPolicy.WRONG_LOCATION_DELIVERY,
                ((PenaltyScoreAdditionEvent) events.getAllValues().get(1)).getAppliedReason());
    }

    @ParameterizedTest
    @EnumSource(value = OrderStatus.class, names = {"COMPLETED", "CANCELLED", "EXPIRED", "ABORTED"})
    void rejectsTerminalOrdersWithoutIntents(OrderStatus status) {
        ReflectionTestUtils.setField(order, "status", status);
        assertThrows(OrderProblem.class, () -> service.cancel(order.getId(), "requester", null, List.of(), "admin"));
        verify(outbox, never()).enqueue(any());
    }

    @Test
    void rejectsWrongParticipantsNoCourierRewardAndNullElements() {
        assertThrows(OrderProblem.class, () -> service.cancel(order.getId(), "other", null, null, "admin"));
        assertThrows(OrderProblem.class, () -> service.cancel(order.getId(), "requester", "other", null, "admin"));
        assertThrows(OrderProblem.class, () -> service.cancel(order.getId(), "requester", null,
                List.of(PenaltySystemPolicy.WRONG_LOCATION_DELIVERY), "admin"));
        assertThrows(OrderProblem.class, () -> service.cancel(order.getId(), "requester", null,
                List.of(PenaltySystemPolicy.SUCCESSFUL_DELIVERY), "admin"));
        assertThrows(OrderProblem.class, () -> service.cancel(order.getId(), "requester", null,
                Arrays.asList((PenaltySystemPolicy) null), "admin"));
        assertEquals(OrderStatus.OPEN, order.getStatus());
        verify(outbox, never()).enqueue(any());
    }

    @Test
    void missingOrderAndWriteFailureNeverSignalPublication() {
        when(orders.getForLifecycleUpdate(order.getId())).thenReturn(Optional.empty());
        assertThrows(OrderProblem.class, () -> service.cancel(order.getId(), "requester", null, null, "admin"));
        when(orders.getForLifecycleUpdate(order.getId())).thenReturn(Optional.of(order));
        doThrow(new IllegalStateException("DB failure")).when(outbox).enqueue(any());
        assertThrows(IllegalStateException.class, () -> service.cancel(order.getId(), "requester", null, List.of(), "admin"));
        verify(signals, never()).publishEvent(any(Object.class));
        assertFalse(order.getStatus() == OrderStatus.OPEN);
        // In-memory mocks do not roll back; PostgreSQL integration verifies transaction rollback.
    }
}
