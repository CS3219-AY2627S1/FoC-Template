package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.springframework.test.util.ReflectionTestUtils;
import org.mapstruct.factory.Mappers;
import org.springframework.context.ApplicationEventPublisher;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderCheckpoint;
import sg.edu.nus.foc.order.domain.OrderCourierAttempt;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.domain.repository.CommandReceiptRepository;
import sg.edu.nus.foc.order.domain.repository.OrderCheckpointRepository;
import sg.edu.nus.foc.order.domain.repository.OrderEventOutboxRepository;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;
import sg.edu.nus.foc.order.messagingpublisher.dto.PenaltyScoreAdditionEvent;
import sg.edu.nus.foc.order.messagingpublisher.dto.OpenOrderRefundTaskEvent;
import sg.edu.nus.foc.order.messagingpublisher.dto.OrderTaskEvent;
import sg.edu.nus.foc.order.messagingpublisher.mapper.OrderTaskEventMapper;

class OrderAbortTransitionTest {
    private static final String AUTH = "Bearer courier-token";
    private final OrderRepository orders = mock(OrderRepository.class);
    private final OrderCheckpointRepository checkpoints = mock(OrderCheckpointRepository.class);
    private final CommandReceiptRepository receipts = mock(CommandReceiptRepository.class);
    private final UserServicePort users = mock(UserServicePort.class);
    private final CreditServicePort credits = mock(CreditServicePort.class);
    private final OrderEventOutboxRepository outbox = mock(OrderEventOutboxRepository.class);
    private final OrderTransitionService service = new OrderTransitionService(orders, checkpoints, receipts,
            users, credits, outbox, mock(ApplicationEventPublisher.class),
            new OrderTaskEventFactory(Mappers.getMapper(OrderTaskEventMapper.class), TestPenaltySequences.store()), mock(OrderAuditLogger.class), org.mockito.Mockito.mock(sg.edu.nus.foc.order.application.PenaltyOutcomeRecorder.class));

    @Test
    void unexpiredAbortPublishesUserPenaltyButNotCreditRefund() {
        Order order = accepted(false);

        service.cancelAccepted("abort", order.getId(), "courier", 0, AUTH);

        assertEquals(OrderStatus.OPEN, order.getStatus());
        verify(credits).holdForReopen(order.getId(), AUTH);
        verify(outbox).enqueue(any(PenaltyScoreAdditionEvent.class));
        verify(outbox, never()).enqueue(any(OpenOrderRefundTaskEvent.class));
        verify(outbox, org.mockito.Mockito.times(1)).enqueue(any(sg.edu.nus.foc.order.messagingpublisher.dto.OrderTaskEvent.class));
        ArgumentCaptor<OrderCourierAttempt> history = ArgumentCaptor.forClass(OrderCourierAttempt.class);
        verify(orders).saveAbortedAttempt(history.capture());
        assertEquals("courier", history.getValue().getCourierId());
        assertEquals(order.getId(), history.getValue().getOrderId());
    }

    @Test
    void expiredAbortResetsCreditThenQueuesPenaltyAndOldIdRefund() {
        Order order = accepted(true);

        service.cancelAccepted("abort", order.getId(), "courier", 0, AUTH);

        assertEquals(OrderStatus.EXPIRED, order.getStatus());
        verify(credits).holdForReopen(order.getId(), AUTH);
        verify(outbox).enqueue(any(PenaltyScoreAdditionEvent.class));
        verify(outbox).enqueue(any(OpenOrderRefundTaskEvent.class));
        verify(outbox, org.mockito.Mockito.times(2)).enqueue(any(sg.edu.nus.foc.order.messagingpublisher.dto.OrderTaskEvent.class));
        InOrder sequence = inOrder(credits, orders, outbox);
        sequence.verify(credits).holdForReopen(order.getId(), AUTH);
        sequence.verify(orders).saveAbortedAttempt(any(OrderCourierAttempt.class));
        sequence.verify(orders).save(order);
        sequence.verify(outbox).enqueue(any(PenaltyScoreAdditionEvent.class));
        ArgumentCaptor<OpenOrderRefundTaskEvent> refund = ArgumentCaptor.forClass(OpenOrderRefundTaskEvent.class);
        sequence.verify(outbox).enqueue(refund.capture());
        assertEquals(order.getId(), refund.getValue().getOrderId());
    }

    @Test
    void requesterHoldRejectsCourierAbortBeforeCreditResetOrEvents() {
        Order order = accepted(false);
        order.placeCompletionHold("requester");
        assertEquals("ORDER_ON_HOLD", assertThrows(OrderProblem.class,
                () -> service.cancelAccepted("held-abort", order.getId(), "courier", 0, AUTH)).getCode());
        verify(credits, never()).holdForReopen(any(), any());
        verify(outbox, never()).enqueue(any(OrderTaskEvent.class));
        verify(orders, never()).save(any(Order.class));
    }

    @Test
    void failedResetOnExpiredAbortLeavesAcceptedAndQueuesNothing() {
        Order order = accepted(true);
        doThrow(new IllegalStateException("Credit unavailable")).when(credits).holdForReopen(order.getId(), AUTH);

        assertThrows(IllegalStateException.class,
                () -> service.cancelAccepted("abort", order.getId(), "courier", 0, AUTH));

        assertEquals(OrderStatus.ACCEPTED, order.getStatus());
        assertEquals("courier", order.getCourierId());
        verify(orders, never()).save(any(Order.class));
        verify(orders, never()).saveAbortedAttempt(any(OrderCourierAttempt.class));
        verify(checkpoints, never()).save(any(OrderCheckpoint.class));
        verify(outbox, never()).enqueue(any(OrderTaskEvent.class));
    }

    @Test
    void deadlinePassingDuringCreditResetProducesExpiredInsteadOfOpen() {
        Order order = accepted(false);
        doAnswer(invocation -> {
            ReflectionTestUtils.setField(order, "expiresAt", Instant.now().minusSeconds(1));
            return null;
        }).when(credits).holdForReopen(order.getId(), AUTH);

        service.cancelAccepted("abort", order.getId(), "courier", 0, AUTH);

        assertEquals(OrderStatus.EXPIRED, order.getStatus());
        verify(outbox).enqueue(any(OpenOrderRefundTaskEvent.class));
    }

    @Test
    void startedOrderRejectsAbortBeforeCallingCreditOrWritingHistory() {
        Order order = accepted(false);
        order.start("courier", 0);
        assertThrows(OrderProblem.class, () -> service.cancelAccepted("abort", order.getId(), "courier", 0, AUTH));
        verify(credits, never()).holdForReopen(any(), any());
        verify(orders, never()).saveAbortedAttempt(any(OrderCourierAttempt.class));
    }

    @Test
    void staleVersionRejectsAbortBeforeCredit() {
        Order order = accepted(false);
        assertThrows(OrderProblem.class, () -> service.cancelAccepted("abort", order.getId(), "courier", 9, AUTH));
        verify(credits, never()).holdForReopen(any(), any());
    }

    private Order accepted(boolean expired) {
        Instant createdAt = Instant.now().minusSeconds(7200);
        Instant expiresAt = expired ? Instant.now().minusSeconds(60) : Instant.now().plusSeconds(3600);
        Order order = Order.open("requester", "item", "pickup", "delivery", 3, 30, createdAt, expiresAt);
        order.accept("courier", 0, createdAt.plusSeconds(1));
        when(users.verifyCourier("courier", AUTH)).thenReturn("courier");
        when(orders.getForUpdate(order.getId())).thenReturn(Optional.of(order));
        when(orders.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));
        return order;
    }
}
