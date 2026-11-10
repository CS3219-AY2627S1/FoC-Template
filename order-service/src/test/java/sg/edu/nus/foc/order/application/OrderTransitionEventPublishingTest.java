package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mapstruct.factory.Mappers;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.springframework.context.ApplicationEventPublisher;
import sg.edu.nus.foc.order.domain.CommandReceipt;
import sg.edu.nus.foc.common.penalty.PenaltySystemPolicy;
import sg.edu.nus.foc.order.messagingpublisher.dto.PenaltyScoreAdditionEvent;
import sg.edu.nus.foc.order.messagingpublisher.dto.PenaltyScoreDeductionEvent;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderCheckpoint;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.domain.repository.CommandReceiptRepository;
import sg.edu.nus.foc.order.domain.repository.OrderCheckpointRepository;
import sg.edu.nus.foc.order.domain.repository.OrderEventOutboxRepository;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;
import sg.edu.nus.foc.order.messagingpublisher.dto.OrderCompletionTaskEvent;
import sg.edu.nus.foc.order.messagingpublisher.dto.OrderTaskEvent;
import sg.edu.nus.foc.order.messagingpublisher.dto.OpenOrderRefundTaskEvent;
import sg.edu.nus.foc.order.messagingpublisher.mapper.OrderTaskEventMapper;

class OrderTransitionEventPublishingTest {
    private static final Instant START = Instant.parse("2026-10-01T10:00:00Z");
    private static final String AUTHORIZATION = "Bearer token";

    @Test
    void commitsCompletionIntentWithResultingOrderAndKeepsCheckpointHistoryInternal() {
        Order order = deliveredOrder();
        List<OrderCheckpoint> history = new ArrayList<>(deliveryHistory(order));
        TestDependencies dependencies = dependencies(order, "COMPLETE", "complete-1", history);

        Order result = service(dependencies).complete("complete-1", order.getId(), "requester-1", 0, AUTHORIZATION);

        assertEquals(OrderStatus.COMPLETED, result.getStatus());
        InOrder sequence = inOrder(dependencies.checkpoints, dependencies.orders, dependencies.receipts,
                dependencies.outbox, dependencies.applicationEvents);
        sequence.verify(dependencies.checkpoints).save(any(OrderCheckpoint.class));
        sequence.verify(dependencies.orders).save(order);
        sequence.verify(dependencies.receipts).save(any(CommandReceipt.class));
        ArgumentCaptor<OrderCompletionTaskEvent> event = ArgumentCaptor.forClass(OrderCompletionTaskEvent.class);
        sequence.verify(dependencies.outbox).enqueue(event.capture());
        sequence.verify(dependencies.applicationEvents)
                .publishEvent(new OrderOutboxDispatchRequested(event.getValue().getEventId()));
        verify(dependencies.eventFactory).completion(
                eq("complete-1"), eq(order), eq("requester-1"), any(Instant.class),
                eq(false), eq(START.plusSeconds(16 * 60L)));
        assertEquals(OrderStatus.COMPLETED, event.getValue().getOrderStatus());
        assertEquals(1, event.getValue().getOrderVersion());
        assertEquals("courier-1", event.getValue().getCourierId());
        assertTrue(history.stream().anyMatch(checkpoint -> checkpoint.getStatus() == OrderStatus.DELIVERED));
        ArgumentCaptor<PenaltyScoreDeductionEvent> penalty = ArgumentCaptor.forClass(PenaltyScoreDeductionEvent.class);
        verify(dependencies.outbox).enqueue(penalty.capture());
        assertEquals(1, penalty.getValue().getPenaltyAmount());
        assertEquals("courier-1", penalty.getValue().getCourierId());
        assertEquals(event.getValue().getOccurredAt(), penalty.getValue().getOccurredAt());
    }

    @Test
    void completionOutboxFailureStopsBeforeRequestingPostCommitDispatch() {
        Order order = deliveredOrder();
        TestDependencies dependencies = dependencies(order, "COMPLETE", "complete-outbox-fail", deliveryHistory(order));
        doThrow(new IllegalStateException("database unavailable"))
                .when(dependencies.outbox).enqueue(any(OrderTaskEvent.class));

        assertThrows(IllegalStateException.class,
                () -> service(dependencies).complete(
                        "complete-outbox-fail", order.getId(), "requester-1", 0, AUTHORIZATION));

        verify(dependencies.applicationEvents, never()).publishEvent(any(Object.class));
    }

    @Test
    void overdueCompletionUsesTheSameCompactEventType() {
        Order order = deliveredOrderAt(START, START.plusSeconds(960));
        List<OrderCheckpoint> history = List.of(
                checkpoint(order, OrderStatus.ACCEPTED, START),
                checkpoint(order, OrderStatus.DELIVERED, START.plusSeconds(16 * 60L)));
        TestDependencies dependencies = dependencies(order, "COMPLETE", "complete-overdue", history);

        service(dependencies).complete("complete-overdue", order.getId(), "requester-1", 0, AUTHORIZATION);

        ArgumentCaptor<OrderCompletionTaskEvent> event = ArgumentCaptor.forClass(OrderCompletionTaskEvent.class);
        verify(dependencies.outbox).enqueue(event.capture());
        verify(dependencies.eventFactory).completion(
                eq("complete-overdue"), eq(order), eq("requester-1"), any(Instant.class),
                eq(true), eq(START.plusSeconds(15 * 60L)));
        assertEquals("OrderCompletionTaskEvent", event.getValue().getEventType());
        ArgumentCaptor<PenaltyScoreAdditionEvent> penalty = ArgumentCaptor.forClass(PenaltyScoreAdditionEvent.class);
        verify(dependencies.outbox).enqueue(penalty.capture());
        assertEquals(1, penalty.getValue().getPenaltyAmount());
        assertEquals(PenaltySystemPolicy.OVERDUE_DELIVERY, penalty.getValue().getAppliedReason());
    }

    @Test
    void autoCompletionUsesTheNormalCompletionOutboxWithLifecycleActor() {
        Order order = deliveredOrder();
        Instant deliveredAt = START.plusSeconds(10 * 60L);
        Instant autoCompletedAt = deliveredAt.plusSeconds(48 * 60L * 60L);
        String commandId = "AUTO_COMPLETE:" + order.getId();
        List<OrderCheckpoint> history = deliveryHistory(order);
        TestDependencies dependencies = dependencies(order, "AUTO_COMPLETE", commandId, history);

        OrderTransitionService transitions = service(dependencies);
        boolean completed = transitions.autoComplete(order.getId(), autoCompletedAt);
        boolean retried = transitions.autoComplete(order.getId(), autoCompletedAt.plusSeconds(60));

        assertTrue(completed);
        assertFalse(retried);
        assertEquals(OrderStatus.COMPLETED, order.getStatus());
        ArgumentCaptor<OrderCheckpoint> checkpoint = ArgumentCaptor.forClass(OrderCheckpoint.class);
        verify(dependencies.checkpoints).save(checkpoint.capture());
        assertEquals(OrderStatus.COMPLETED, checkpoint.getValue().getStatus());
        assertEquals("lifecycle", checkpoint.getValue().getActorId());
        ArgumentCaptor<CommandReceipt> receipt = ArgumentCaptor.forClass(CommandReceipt.class);
        verify(dependencies.receipts).save(receipt.capture());
        assertEquals("AUTO_COMPLETE", receipt.getValue().getOperation());
        assertEquals(commandId, receipt.getValue().getCommandId());
        ArgumentCaptor<OrderCompletionTaskEvent> event = ArgumentCaptor.forClass(OrderCompletionTaskEvent.class);
        verify(dependencies.outbox).enqueue(event.capture());
        assertEquals("courier-1", event.getValue().getCourierId());
        assertEquals(autoCompletedAt, event.getValue().getOccurredAt());
        assertEquals("OrderCompletionTaskEvent", event.getValue().getEventType());
        assertEquals(OrderStatus.COMPLETED, event.getValue().getOrderStatus());
        ArgumentCaptor<PenaltyScoreDeductionEvent> penalty = ArgumentCaptor.forClass(PenaltyScoreDeductionEvent.class);
        verify(dependencies.outbox).enqueue(penalty.capture());
        assertEquals("courier-1", penalty.getValue().getCourierId());
        assertEquals(1, penalty.getValue().getPenaltyAmount());
        verify(dependencies.applicationEvents, times(2)).publishEvent(any(OrderOutboxDispatchRequested.class));
        verify(dependencies.users, never()).verifyRequester(any(), any());
    }

    @Test
    void autoCompletionRechecksTheFortyEightHourBoundaryBeforeWriting() {
        Order order = deliveredOrder();
        Instant deliveredAt = START.plusSeconds(10 * 60L);
        TestDependencies dependencies = dependencies(
                order,
                "AUTO_COMPLETE",
                "AUTO_COMPLETE:" + order.getId(),
                deliveryHistory(order));

        boolean completed = service(dependencies).autoComplete(
                order.getId(), deliveredAt.plusSeconds(48 * 60L * 60L).minusNanos(1));

        assertFalse(completed);
        assertEquals(OrderStatus.DELIVERED, order.getStatus());
        verify(dependencies.checkpoints, never()).save(any(OrderCheckpoint.class));
        verify(dependencies.orders, never()).save(any(Order.class));
        verify(dependencies.outbox, never()).enqueue(any(OrderTaskEvent.class));
    }

    @Test
    void holdPlacedAfterCandidateSelectionPreventsCompletionIntentAndReceipt() {
        Order order = deliveredOrder();
        order.placeCompletionHold("requester-1");
        TestDependencies dependencies = dependencies(order, "AUTO_COMPLETE",
                "AUTO_COMPLETE:" + order.getId(), deliveryHistory(order));

        assertFalse(service(dependencies).autoComplete(order.getId(), START.plusSeconds(49 * 3600)));
        assertThrows(sg.edu.nus.foc.order.domain.OrderProblem.class,
                () -> service(dependencies).complete("held-complete", order.getId(), "requester-1", 0, AUTHORIZATION));
        assertEquals(OrderStatus.DELIVERED, order.getStatus());
        verify(dependencies.checkpoints, never()).save(any(OrderCheckpoint.class));
        verify(dependencies.receipts, never()).save(any(CommandReceipt.class));
        verify(dependencies.outbox, never()).enqueue(any(OrderTaskEvent.class));
        verify(dependencies.applicationEvents, never()).publishEvent(any(Object.class));
    }

    @Test
    void openCancellationCommitsCompactResultingEventToOutbox() {
        Order order = Order.open("requester-1", "item", "pickup", "delivery", 3, 15, START, START.plusSeconds(3600));
        TestDependencies dependencies = dependencies(order, "CANCEL", "cancel-1", List.of());

        Order result = service(dependencies).cancel("cancel-1", order.getId(), "requester-1", 0, AUTHORIZATION);

        assertEquals(OrderStatus.CANCELLED, result.getStatus());
        ArgumentCaptor<OpenOrderRefundTaskEvent> event = ArgumentCaptor.forClass(OpenOrderRefundTaskEvent.class);
        verify(dependencies.outbox).enqueue(event.capture());
        assertEquals(OrderStatus.CANCELLED, event.getValue().getOrderStatus());
        assertEquals("OpenOrderRefundTaskEvent", event.getValue().getEventType());
        verify(dependencies.applicationEvents).publishEvent(any(OrderOutboxDispatchRequested.class));
    }

    @Test
    void unexpiredAcceptedCancellationHoldsCreditBeforeReopeningAndPublishesOnlyUserPenalty() {
        Instant now = Instant.now();
        Order order = Order.open("requester-1", "item", "pickup", "delivery", 3, 15,
                now.minusSeconds(60), now.plusSeconds(3600));
        order.accept("courier-1", 0, now.minusSeconds(30));
        TestDependencies dependencies = dependencies(
                order,
                "CANCEL_ACCEPTED",
                "cancel-accepted-1",
                List.of(checkpoint(order, OrderStatus.ACCEPTED, now.minusSeconds(30))));

        Order result = service(dependencies).cancelAccepted(
                "cancel-accepted-1", order.getId(), "courier-1", 0, AUTHORIZATION);

        assertEquals(OrderStatus.OPEN, result.getStatus());
        assertEquals(null, result.getCourierId());
        InOrder sequence = inOrder(dependencies.credits, dependencies.checkpoints, dependencies.orders, dependencies.receipts);
        sequence.verify(dependencies.credits).holdForReopen(
                order.getId(), AUTHORIZATION);
        sequence.verify(dependencies.checkpoints, times(2)).save(any(OrderCheckpoint.class));
        sequence.verify(dependencies.orders).save(order);
        sequence.verify(dependencies.receipts).save(any(CommandReceipt.class));
        ArgumentCaptor<PenaltyScoreAdditionEvent> penalty = ArgumentCaptor.forClass(PenaltyScoreAdditionEvent.class);
        verify(dependencies.outbox).enqueue(penalty.capture());
        assertEquals("courier-1", penalty.getValue().getCourierId());
        assertEquals(2, penalty.getValue().getPenaltyAmount());
        verify(dependencies.outbox, never()).enqueue(any(OpenOrderRefundTaskEvent.class));
        verify(dependencies.applicationEvents).publishEvent(any(OrderOutboxDispatchRequested.class));
    }

    @Test
    void expiredAcceptedCancellationResetsCreditAndPublishesPenaltyAndRefund() {
        Order order = Order.open("requester-1", "item", "pickup", "delivery", 3, 15,
                START, START.plusSeconds(3600));
        order.accept("courier-1", 0, START.plusSeconds(1));
        TestDependencies dependencies = dependencies(
                order,
                "CANCEL_ACCEPTED",
                "cancel-accepted-expired",
                List.of(checkpoint(order, OrderStatus.ACCEPTED, START.plusSeconds(1))));

        Order result = service(dependencies).cancelAccepted(
                "cancel-accepted-expired", order.getId(), "courier-1", 0, AUTHORIZATION);

        assertEquals(OrderStatus.EXPIRED, result.getStatus());
        verify(dependencies.credits).holdForReopen(order.getId(), AUTHORIZATION);
        ArgumentCaptor<PenaltyScoreAdditionEvent> event =
                ArgumentCaptor.forClass(PenaltyScoreAdditionEvent.class);
        verify(dependencies.outbox).enqueue(event.capture());
        assertEquals("courier-1", event.getValue().getCourierId());
        assertEquals(2, event.getValue().getPenaltyAmount());
        assertEquals(PenaltySystemPolicy.ACCEPTED_TASK_CANCELLATION, event.getValue().getAppliedReason());
        verify(dependencies.outbox).enqueue(any(OpenOrderRefundTaskEvent.class));
    }

    @Test
    void creditHoldFailureLeavesAcceptedOrderUnchangedAndDoesNotWriteCancellation() {
        Instant now = Instant.now();
        Order order = Order.open("requester-1", "item", "pickup", "delivery", 3, 15,
                now.minusSeconds(60), now.plusSeconds(3600));
        order.accept("courier-1", 0, now.minusSeconds(30));
        TestDependencies dependencies = dependencies(order, "CANCEL_ACCEPTED", "cancel-credit-fail", List.of());
        doThrow(new IllegalStateException("Credit unavailable"))
                .when(dependencies.credits).holdForReopen(any(), any());

        assertThrows(IllegalStateException.class,
                () -> service(dependencies).cancelAccepted(
                        "cancel-credit-fail", order.getId(), "courier-1", 0, AUTHORIZATION));

        assertEquals(OrderStatus.ACCEPTED, order.getStatus());
        assertEquals("courier-1", order.getCourierId());
        verify(dependencies.checkpoints, never()).save(any(OrderCheckpoint.class));
        verify(dependencies.orders, never()).save(any(Order.class));
        verify(dependencies.receipts, never()).save(any(CommandReceipt.class));
        verify(dependencies.outbox, never()).enqueue(any(OrderTaskEvent.class));
        verify(dependencies.applicationEvents, never()).publishEvent(any(Object.class));
    }

    @Test
    void requesterCannotCancelAcceptedOrderAsCourier() {
        Order order = Order.open("requester-1", "item", "pickup", "delivery", 3, 15, START, START.plusSeconds(3600));
        order.accept("courier-1", 0, START.plusSeconds(1));
        TestDependencies dependencies = dependencies(
                order, "CANCEL_ACCEPTED", "cancel-accepted-requester", List.of());
        when(dependencies.users.verifyCourier("requester-1", AUTHORIZATION)).thenReturn("requester-1");

        OrderProblem problem = assertThrows(OrderProblem.class,
                () -> service(dependencies).cancelAccepted(
                        "cancel-accepted-requester", order.getId(),  "requester-1", 0, AUTHORIZATION));

        assertEquals("FORBIDDEN", problem.getCode());
        verify(dependencies.credits, never()).holdForReopen(
                any(), any());
        verify(dependencies.outbox, never()).enqueue(any(OrderTaskEvent.class));
        verify(dependencies.applicationEvents, never()).publishEvent(any(Object.class));
    }

    @Test
    void completionUsesPersistedCurrentAttemptTimingRegardlessOfHistoricalCheckpoints() {
        Order order = deliveredOrder();
        List<OrderCheckpoint> history = List.of(
                checkpoint(order, OrderStatus.ACCEPTED, START.minusSeconds(3600)),
                checkpoint(order, OrderStatus.ABORTED, START.minusSeconds(3500)),
                checkpoint(order, OrderStatus.ACCEPTED, START.plusSeconds(60)),
                checkpoint(order, OrderStatus.DELIVERED, START.plusSeconds(600)));
        TestDependencies dependencies = dependencies(order, "COMPLETE", "latest-complete", history);

        service(dependencies).complete("latest-complete", order.getId(), "requester-1", 0, AUTHORIZATION);

        ArgumentCaptor<OrderCompletionTaskEvent> event = ArgumentCaptor.forClass(OrderCompletionTaskEvent.class);
        verify(dependencies.outbox).enqueue(event.capture());
        assertEquals(OrderStatus.COMPLETED, event.getValue().getOrderStatus());
        verify(dependencies.eventFactory).completion(
                eq("latest-complete"), eq(order), eq("requester-1"), any(Instant.class),
                eq(false), eq(START.plusSeconds(960)));
    }

    @Test
    void autoCompletionDoesNotUseAnOlderDeliveredCheckpoint() {
        Order order = deliveredOrderAt(START.plusSeconds(3600), START.plusSeconds(4200));
        Instant oldDelivery = START.plusSeconds(600);
        Instant newDelivery = oldDelivery.plusSeconds(3600);
        TestDependencies dependencies = dependencies(order, "AUTO_COMPLETE", "AUTO_COMPLETE:" + order.getId(),
                List.of(checkpoint(order, OrderStatus.ACCEPTED, START),
                        checkpoint(order, OrderStatus.DELIVERED, oldDelivery),
                        checkpoint(order, OrderStatus.DELIVERED, newDelivery)));
        assertFalse(service(dependencies).autoComplete(order.getId(), oldDelivery.plusSeconds(48 * 3600L)));
        verify(dependencies.outbox, never()).enqueue(any(OrderTaskEvent.class));
    }

    @Test
    void exactDeliveryDeadlineDeductsOneFromCourierNotCompletingRequester() {
        Order order = deliveredOrderAt(START, START.plusSeconds(900));
        TestDependencies dependencies = dependencies(order, "COMPLETE", "boundary-complete",
                List.of(checkpoint(order, OrderStatus.ACCEPTED, START),
                        checkpoint(order, OrderStatus.DELIVERED, START.plusSeconds(15 * 60L))));

        service(dependencies).complete("boundary-complete", order.getId(), "requester-1", 0, AUTHORIZATION);

        ArgumentCaptor<PenaltyScoreDeductionEvent> penalty = ArgumentCaptor.forClass(PenaltyScoreDeductionEvent.class);
        verify(dependencies.outbox).enqueue(penalty.capture());
        assertEquals(1, penalty.getValue().getPenaltyAmount());
        assertEquals("courier-1", penalty.getValue().getCourierId());
        assertEquals(PenaltySystemPolicy.SUCCESSFUL_DELIVERY, penalty.getValue().getAppliedReason());
        verify(dependencies.outbox, never()).enqueue(any(PenaltyScoreAdditionEvent.class));
    }

    @Test
    void overdueAutomaticCompletionAddsOneAndStillQueuesCreditTransfer() {
        Order order = deliveredOrderAt(START, START.plusSeconds(960));
        Instant deliveredAt = START.plusSeconds(16 * 60L);
        TestDependencies dependencies = dependencies(order, "AUTO_COMPLETE", "AUTO_COMPLETE:" + order.getId(),
                List.of(checkpoint(order, OrderStatus.ACCEPTED, START),
                        checkpoint(order, OrderStatus.DELIVERED, deliveredAt)));

        assertTrue(service(dependencies).autoComplete(order.getId(), deliveredAt.plusSeconds(48 * 3600L)));

        ArgumentCaptor<PenaltyScoreAdditionEvent> penalty = ArgumentCaptor.forClass(PenaltyScoreAdditionEvent.class);
        verify(dependencies.outbox).enqueue(penalty.capture());
        assertEquals(1, penalty.getValue().getPenaltyAmount());
        assertEquals("courier-1", penalty.getValue().getCourierId());
        assertEquals(PenaltySystemPolicy.OVERDUE_DELIVERY, penalty.getValue().getAppliedReason());
        verify(dependencies.outbox).enqueue(any(OrderCompletionTaskEvent.class));
        verify(dependencies.outbox, never()).enqueue(any(PenaltyScoreDeductionEvent.class));
    }

    @Test
    void successfulCompletionReceiptReplayDoesNotQueueAnotherPenaltyOrCreditEvent() {
        Order order = deliveredOrder();
        TestDependencies dependencies = dependencies(order, "COMPLETE", "replay", deliveryHistory(order));
        CommandReceipt receipt = new CommandReceipt("COMPLETE", "replay", order.getId(), START)
                .bind("requester-1", CommandReceipt.fingerprint("COMPLETE", order.getId(), "requester-1", 0L));
        when(dependencies.receipts.findExisting("COMPLETE", "replay")).thenReturn(Optional.of(receipt));
        when(dependencies.orders.get(order.getId())).thenReturn(Optional.of(order));

        service(dependencies).complete("replay", order.getId(), "requester-1", 0, AUTHORIZATION);

        verify(dependencies.outbox, never()).enqueue(any(OrderTaskEvent.class));
        verify(dependencies.orders, never()).getForUpdate(any());
    }

    @Test
    void delayedStartCompletesSuccessfullyWithoutReadingCheckpointHistory() {
        Order order = deliveredOrderAt(START.plusSeconds(3600), START.plusSeconds(4200));
        TestDependencies dependencies = dependencies(order, "COMPLETE", "late-start", List.of());

        service(dependencies).complete("late-start", order.getId(), "requester-1", 0, AUTHORIZATION);

        verify(dependencies.outbox).enqueue(any(PenaltyScoreDeductionEvent.class));
        verify(dependencies.outbox, never()).enqueue(any(PenaltyScoreAdditionEvent.class));
        verify(dependencies.checkpoints, never()).findByOrderId(any());
    }

    @Test
    void legacyMissingTimingCannotSilentlyReceiveAnIncorrectCompletionPenalty() {
        Order legacy = spy(deliveredOrder());
        when(legacy.getDeliveryDeadlineAt()).thenReturn(null);
        TestDependencies dependencies = dependencies(legacy, "COMPLETE", "unknown-time", List.of());

        assertFalse(service(dependencies).autoComplete(legacy.getId(), START.plusSeconds(49 * 3600L)));
        OrderProblem failure = assertThrows(OrderProblem.class,
                () -> service(dependencies).complete("unknown-time", legacy.getId(), "requester-1", 0, AUTHORIZATION));
        assertEquals("CONFLICT", failure.getCode());
        assertEquals(OrderStatus.DELIVERED, legacy.getStatus());
        verify(dependencies.outbox, never()).enqueue(any(OrderTaskEvent.class));
        verify(dependencies.checkpoints, never()).save(any());
        verify(dependencies.receipts, never()).save(any());
    }

    @Test
    void startPersistsDeadlineUsingExactlyTheCheckpointTimestamp() {
        Order order = Order.open("requester-1", "item", "pickup", "delivery", 3, 15, START, START.plusSeconds(3600));
        order.accept("courier-1", 0, START);
        TestDependencies dependencies = dependencies(order, "START", "start-time", List.of());

        service(dependencies).start("start-time", order.getId(), "courier-1", 0, AUTHORIZATION);

        ArgumentCaptor<OrderCheckpoint> checkpoint = ArgumentCaptor.forClass(OrderCheckpoint.class);
        verify(dependencies.checkpoints).save(checkpoint.capture());
        assertEquals(checkpoint.getValue().getOccurredAt().plusSeconds(900), order.getDeliveryDeadlineAt());
    }

    private TestDependencies dependencies(
            Order order,
            String operation,
            String commandId,
            List<OrderCheckpoint> initialHistory) {
        OrderRepository orders = mock(OrderRepository.class);
        OrderCheckpointRepository checkpoints = mock(OrderCheckpointRepository.class);
        CommandReceiptRepository receipts = mock(CommandReceiptRepository.class);
        UserServicePort users = mock(UserServicePort.class);
        CreditServicePort credits = mock(CreditServicePort.class);
        OrderEventOutboxRepository outbox = mock(OrderEventOutboxRepository.class);
        ApplicationEventPublisher applicationEvents = mock(ApplicationEventPublisher.class);
        List<OrderCheckpoint> history = new ArrayList<>(initialHistory);
        when(receipts.findExisting(operation, commandId)).thenReturn(Optional.empty());
        when(users.verifyRequester("requester-1", AUTHORIZATION)).thenReturn("requester-1");
        when(users.verifyCourier("courier-1", AUTHORIZATION)).thenReturn("courier-1");
        when(orders.getForUpdate(order.getId())).thenReturn(Optional.of(order));
        when(orders.getForLifecycleUpdate(order.getId())).thenReturn(Optional.of(order));
        when(orders.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(checkpoints.findByOrderId(order.getId())).thenAnswer(invocation -> List.copyOf(history));
        doAnswer(invocation -> {
            OrderCheckpoint checkpoint = invocation.getArgument(0);
            history.add(checkpoint);
            return checkpoint;
        }).when(checkpoints).save(any(OrderCheckpoint.class));
        return new TestDependencies(orders, checkpoints, receipts, users, credits, outbox, applicationEvents,
                spy(new OrderTaskEventFactory(Mappers.getMapper(OrderTaskEventMapper.class), TestPenaltySequences.store())));
    }

    private OrderTransitionService service(TestDependencies dependencies) {
        return new OrderTransitionService(
                dependencies.orders,
                dependencies.checkpoints,
                dependencies.receipts,
                dependencies.users,
                dependencies.credits,
                dependencies.outbox,
                dependencies.applicationEvents,
                dependencies.eventFactory,
                mock(OrderAuditLogger.class), org.mockito.Mockito.mock(sg.edu.nus.foc.order.application.PenaltyOutcomeRecorder.class));
    }

    private Order deliveredOrder() {
        Order order = Order.open("requester-1", "item", "pickup", "delivery", 3, 15, START, START.plusSeconds(3600));
        order.accept("courier-1", 0, START.plusSeconds(60));
        order.start("courier-1", 0, START.plusSeconds(60));
        order.markPickedUp("courier-1", 0);
        order.markDelivered("courier-1", 0, START.plusSeconds(600));
        return order;
    }

    private Order deliveredOrderAt(Instant startedAt, Instant deliveredAt) {
        Order order = Order.open("requester-1", "item", "pickup", "delivery", 3, 15, START, START.plusSeconds(7200));
        order.accept("courier-1", 0, START);
        order.start("courier-1", 0, startedAt);
        order.markPickedUp("courier-1", 0);
        order.markDelivered("courier-1", 0, deliveredAt);
        return order;
    }

    private List<OrderCheckpoint> deliveryHistory(Order order) {
        return List.of(
                checkpoint(order, OrderStatus.ACCEPTED, START.plusSeconds(60)),
                checkpoint(order, OrderStatus.DELIVERED, START.plusSeconds(10 * 60L)));
    }

    private OrderCheckpoint checkpoint(Order order, OrderStatus status, Instant occurredAt) {
        return new OrderCheckpoint(order.getId(), status, occurredAt, "courier-1", null);
    }

    private record TestDependencies(
            OrderRepository orders,
            OrderCheckpointRepository checkpoints,
            CommandReceiptRepository receipts,
            UserServicePort users,
            CreditServicePort credits,
            OrderEventOutboxRepository outbox,
            ApplicationEventPublisher applicationEvents,
            OrderTaskEventFactory eventFactory) {
    }
}
