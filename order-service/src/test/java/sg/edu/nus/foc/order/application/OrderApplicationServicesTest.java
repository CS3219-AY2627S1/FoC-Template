package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mapstruct.factory.Mappers;
import org.springframework.context.ApplicationEventPublisher;
import sg.edu.nus.foc.order.adapter.MockPeerAdapters;
import sg.edu.nus.foc.order.domain.*;
import sg.edu.nus.foc.order.domain.repository.CommandReceiptRepository;
import sg.edu.nus.foc.order.domain.repository.OrderCheckpointRepository;
import sg.edu.nus.foc.order.domain.repository.OrderEventOutboxRepository;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;
import sg.edu.nus.foc.order.messagingpublisher.interfaces.IOrderCompletionTaskPublisher;
import sg.edu.nus.foc.order.messagingpublisher.mapper.OrderTaskEventMapper;

class OrderApplicationServicesTest {
    private static final Instant START = Instant.parse("2026-10-03T00:00:00Z");
    private static final String AUTH = "Bearer token";

    @Test
    void creationReservesCreditsPersistsCheckpointAndReceipt() {
        OrderRepository orders = mock(OrderRepository.class);
        CommandReceiptRepository receipts = mock(CommandReceiptRepository.class);
        OrderCheckpointRepository checkpoints = mock(OrderCheckpointRepository.class);
        UserServicePort users = mock(UserServicePort.class);
        SupplierServicePort suppliers = mock(SupplierServicePort.class);
        CreditServicePort credits = mock(CreditServicePort.class);
        OrderAuditLogger audit = mock(OrderAuditLogger.class);
        when(receipts.findExisting("CREATE", "create-1")).thenReturn(Optional.empty());
        when(users.verifyRequester("requester", AUTH)).thenReturn("requester");
        when(orders.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Order result = new OrderCreationService(orders, receipts, checkpoints, users, suppliers, credits, audit)
            .create("create-1", "requester", "item", "pickup", "delivery", 3, 15,
                Instant.now().plusSeconds(86400), null, AUTH);

        assertEquals(OrderStatus.OPEN, result.getStatus());
        verify(suppliers).validatePair("pickup", "delivery", AUTH);
        verify(credits).reserve(result.getId(), "requester", 3, AUTH);
        verify(checkpoints).save(any(OrderCheckpoint.class));
        verify(receipts).save(any(CommandReceipt.class));
        verify(audit).action("CREATE", result.getId(), "requester", "create-1", "accepted");
    }

    @Test
    void creationIsIdempotentByCommandReceipt() {
        Order existing = Order.open("requester", "item", "p", "d", 1, 15, START, START.plusSeconds(1800));
        CommandReceipt receipt = new CommandReceipt("CREATE", "same", existing.getId(), START)
                .bind("requester", CommandReceipt.fingerprint("item", "p", "d", 1L, 15, START.plusSeconds(1800), null, null, null, null, null));
        OrderRepository orders = mock(OrderRepository.class);
        CommandReceiptRepository receipts = mock(CommandReceiptRepository.class);
        when(receipts.findExisting("CREATE", "same")).thenReturn(Optional.of(receipt));
        when(orders.get(existing.getId())).thenReturn(Optional.of(existing));

        UserServicePort users = mock(UserServicePort.class);
        when(users.verifyRequester("requester", AUTH)).thenReturn("requester");
        Order result = new OrderCreationService(orders, receipts, mock(OrderCheckpointRepository.class),
            users, mock(SupplierServicePort.class), mock(CreditServicePort.class), mock(OrderAuditLogger.class))
            .create("same", "requester", "item", "p", "d", 1, 15, START.plusSeconds(1800), null, AUTH);

        assertSame(existing, result);
    }

    @Test
    void assignmentAcceptsAndIsIdempotentAndReportsMissingOrder() {
        OrderRepository orders = mock(OrderRepository.class);
        OrderCheckpointRepository checkpoints = mock(OrderCheckpointRepository.class);
        CommandReceiptRepository receipts = mock(CommandReceiptRepository.class);
        UserServicePort users = mock(UserServicePort.class);
        CreditServicePort credits = mock(CreditServicePort.class);
        OrderAuditLogger audit = mock(OrderAuditLogger.class);
        Instant acceptanceStartedAt = Instant.now();
        Order order = Order.open(
            "requester", "item", "p", "d", 1, 15, acceptanceStartedAt, acceptanceStartedAt.plusSeconds(86400));
        when(receipts.findExisting("ACCEPT", "accept-1")).thenReturn(Optional.empty());
        when(users.verifyCourier("courier", AUTH)).thenReturn("courier");
        when(orders.getForUpdate(order.getId())).thenReturn(Optional.of(order));
        when(orders.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Order result = new OrderAssignmentService(orders, checkpoints, receipts, users, credits, audit)
            .accept("accept-1", order.getId(), "courier", 0, AUTH);
        assertEquals(OrderStatus.ACCEPTED, result.getStatus());
        verify(credits).assignCourier(order.getId(), "courier", AUTH);
        verify(checkpoints).save(any(OrderCheckpoint.class));
        verify(receipts).save(any(CommandReceipt.class));

        Order existing = Order.open("requester", "item", "p", "d", 1, 15, START, START.plusSeconds(1800));
        CommandReceipt previous = new CommandReceipt("ACCEPT", "accept-2", existing.getId(), START)
                .bind("courier", CommandReceipt.fingerprint("ACCEPT", existing.getId(), "courier", 0L));
        when(receipts.findExisting("ACCEPT", "accept-2")).thenReturn(Optional.of(previous));
        when(orders.get(existing.getId())).thenReturn(Optional.of(existing));
        assertSame(existing, new OrderAssignmentService(orders, checkpoints, receipts, users, credits, audit)
            .accept("accept-2", existing.getId(), "courier", 0, AUTH));
        when(receipts.findExisting("ACCEPT", "missing")).thenReturn(Optional.empty());
        when(orders.getForUpdate("missing")).thenReturn(Optional.empty());
        assertThrows(OrderProblem.class, () -> new OrderAssignmentService(orders, checkpoints, receipts, users, credits, audit)
            .accept("missing", "missing", "courier", 0, AUTH));
    }

    @Test
    void courierTransitionsPersistCheckpointsAndRequesterOutcomesCallCredit() {
        OrderRepository orders = mock(OrderRepository.class);
        OrderCheckpointRepository checkpoints = mock(OrderCheckpointRepository.class);
        CommandReceiptRepository receipts = mock(CommandReceiptRepository.class);
        UserServicePort users = mock(UserServicePort.class);
        CreditServicePort credits = mock(CreditServicePort.class);
        OrderAuditLogger audit = mock(OrderAuditLogger.class);
        OrderTransitionService service = new OrderTransitionService(
            orders,
            checkpoints,
            receipts,
            users,
            credits,
            mock(OrderEventOutboxRepository.class),
            mock(ApplicationEventPublisher.class),
            new OrderTaskEventFactory(Mappers.getMapper(OrderTaskEventMapper.class), TestPenaltySequences.store()),
            audit, org.mockito.Mockito.mock(sg.edu.nus.foc.order.application.PenaltyOutcomeRecorder.class));
        Order order = Order.open("requester", "item", "p", "d", 2, 15, START, START.plusSeconds(1800));
        order.accept("courier", 0, START.plusSeconds(1));
        when(users.verifyCourier("courier", AUTH)).thenReturn("courier");
        when(receipts.findExisting(anyString(), anyString())).thenReturn(Optional.empty());
        when(orders.getForUpdate(order.getId())).thenReturn(Optional.of(order));
        when(orders.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service.start("start", order.getId(), "courier", 0, AUTH);
        service.pickup("pickup", order.getId(), "courier", 0, AUTH);
        service.deliver("deliver", order.getId(), "courier", 0, AUTH);
        assertEquals(OrderStatus.DELIVERED, order.getStatus());
        verify(checkpoints, times(3)).save(any(OrderCheckpoint.class));

        when(users.verifyRequester("requester", AUTH)).thenReturn("requester");
        when(checkpoints.findByOrderId(order.getId())).thenReturn(List.of(
            new OrderCheckpoint(order.getId(), OrderStatus.ACCEPTED, START.plusSeconds(60), "courier", null),
            new OrderCheckpoint(order.getId(), OrderStatus.DELIVERED, START.plusSeconds(10 * 60L), "courier", null)));
        service.complete("complete", order.getId(), "requester", 0, AUTH);
        assertEquals(OrderStatus.COMPLETED, order.getStatus());
        verifyNoInteractions(credits);

        Order cancelled = Order.open("requester", "item", "p", "d", 2, 15, START, START.plusSeconds(1800));
        when(orders.getForUpdate("cancelled")).thenReturn(Optional.of(cancelled));
        service.cancel("cancel", "cancelled", "requester", 0, AUTH);
        assertEquals(OrderStatus.CANCELLED, cancelled.getStatus());
    }

    @Test
    void transitionOutcomeReceiptsAreIdempotent() {
        Order existing = Order.open("requester", "item", "p", "d", 1, 15, START, START.plusSeconds(1800));
        CommandReceipt receipt = new CommandReceipt("COMPLETE", "same", existing.getId(), START)
                .bind("requester", CommandReceipt.fingerprint("COMPLETE", existing.getId(), "requester", 0L));
        CommandReceiptRepository receipts = mock(CommandReceiptRepository.class);
        OrderRepository orders = mock(OrderRepository.class);
        when(receipts.findExisting("COMPLETE", "same")).thenReturn(Optional.of(receipt));
        when(orders.get(existing.getId())).thenReturn(Optional.of(existing));
        OrderCheckpointRepository checkpoints = mock(OrderCheckpointRepository.class);
        UserServicePort requester = mock(UserServicePort.class);
        when(requester.verifyRequester("requester", AUTH)).thenReturn("requester");
        OrderTransitionService service = new OrderTransitionService(
            orders,
            checkpoints,
            receipts,
            requester,
            mock(CreditServicePort.class),
            mock(OrderEventOutboxRepository.class),
            mock(ApplicationEventPublisher.class),
            new OrderTaskEventFactory(Mappers.getMapper(OrderTaskEventMapper.class), TestPenaltySequences.store()),
            mock(OrderAuditLogger.class), org.mockito.Mockito.mock(sg.edu.nus.foc.order.application.PenaltyOutcomeRecorder.class));
        assertSame(existing, service.complete("same", existing.getId(), "requester", 0, AUTH));
    }

    @Test
    void automaticAndManualRepostReserveCreditsAndRespectIdempotency() {
        OrderRepository orders = mock(OrderRepository.class);
        OrderCheckpointRepository checkpoints = mock(OrderCheckpointRepository.class);
        CommandReceiptRepository receipts = mock(CommandReceiptRepository.class);
        SupplierServicePort suppliers = mock(SupplierServicePort.class);
        CreditServicePort credits = mock(CreditServicePort.class);
        UserServicePort users = mock(UserServicePort.class);
        OrderAuditLogger audit = mock(OrderAuditLogger.class);
        OrderRepostService service = new OrderRepostService(orders, checkpoints, receipts, suppliers, credits, users, audit, mock(RepostFailureRecorder.class));
        RepostPlan plan = new RepostPlan(true, START, 4, 20, START.plusSeconds(3600));
        Order original = Order.open("requester", "item", "p", "d", 2, 15, START.minusSeconds(1800), START, plan);
        original.expire(0, START);
        when(receipts.findExisting("AUTO_REPOST", "auto")).thenReturn(Optional.empty());
        when(orders.getForUpdate(original.getId())).thenReturn(Optional.of(original));
        when(orders.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));
        Order auto = service.automatic("auto", original.getId(), START.plusSeconds(1), AUTH);
        assertEquals(original.getId(), auto.getOriginalOrderId());
        verify(credits).reserve(auto.getId(), "requester", 4, AUTH);

        Order manualOriginal = Order.open("requester", "item", "p", "d", 2, 15, START.minusSeconds(1800), START, null);
        manualOriginal.expire(0, START);
        when(receipts.findExisting("MANUAL_REPOST", "manual")).thenReturn(Optional.empty());
        when(orders.getForUpdate(manualOriginal.getId())).thenReturn(Optional.of(manualOriginal));
        when(users.verifyRequester("requester", AUTH)).thenReturn("requester");
        Order manual = service.manual("manual", manualOriginal.getId(), "requester", 0, "new item", 3, 15, Instant.now().plusSeconds(3600), AUTH);
        assertEquals(manualOriginal.getId(), manual.getOriginalOrderId());
        verify(credits).reserve(manual.getId(), "requester", 3, AUTH);

        Order existing = Order.open("requester", "item", "p", "d", 1, 15, START, START.plusSeconds(1800));
        CommandReceipt previous = new CommandReceipt("AUTO_REPOST", "done", existing.getId(), START);
        when(receipts.findExisting("AUTO_REPOST", "done")).thenReturn(Optional.of(previous));
        when(orders.get(existing.getId())).thenReturn(Optional.of(existing));
        assertSame(existing, service.automatic("done", existing.getId(), START, AUTH));
    }

    @Test
    void lifecycleExpiresAndRepostsDueOrders() {
        OrderRepository orders = mock(OrderRepository.class);
        OrderCheckpointRepository checkpoints = mock(OrderCheckpointRepository.class);
        OrderRepostService reposts = mock(OrderRepostService.class);
        OrderEventOutboxRepository outbox = mock(OrderEventOutboxRepository.class);
        ApplicationEventPublisher applicationEvents = mock(ApplicationEventPublisher.class);
        OrderTaskEventFactory eventFactory = new OrderTaskEventFactory(
                Mappers.getMapper(OrderTaskEventMapper.class), TestPenaltySequences.store());
        OrderAuditLogger audit = mock(OrderAuditLogger.class);
        OrderTransitionService transitions = mock(OrderTransitionService.class);
        LifecycleProcessingService lifecycle = new LifecycleProcessingService(
                orders, new OrderExpiryProcessingService(orders, checkpoints, outbox, applicationEvents, eventFactory, audit),
                reposts, audit, transitions);
        Order expired = Order.open("requester", "item", "p", "d", 2, 15, START.minusSeconds(1800), START);
        when(orders.findDueUnassignedIds(OrderStatus.OPEN, START))
            .thenReturn(List.of(expired.getId()), List.of());
        when(orders.getForLifecycleUpdate(expired.getId())).thenReturn(Optional.of(expired));
        when(orders.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));
        assertEquals(1, lifecycle.expireDue(START));
        assertEquals(0, lifecycle.expireDue(START));
        verify(outbox).enqueue(any(sg.edu.nus.foc.order.messagingpublisher.dto.OpenOrderRefundTaskEvent.class));
        verify(applicationEvents).publishEvent(any(OrderOutboxDispatchRequested.class));
        verify(checkpoints).save(any(OrderCheckpoint.class));

        Instant autoCompletionNow = START.plusSeconds(50 * 60L * 60L);
        Instant deliveredBefore = autoCompletionNow.minusSeconds(48 * 60L * 60L);
        Order delivered = Order.open(
                "requester", "delivered item", "p", "d", 2, 15, START.minusSeconds(3600), START);
        when(orders.findDueForAutoCompletionIds(deliveredBefore)).thenReturn(List.of(delivered.getId()));
        when(transitions.autoComplete(delivered.getId(), autoCompletionNow)).thenReturn(true);
        assertEquals(1, lifecycle.autoCompleteDue(autoCompletionNow));
        verify(orders).findDueForAutoCompletionIds(deliveredBefore);
        verify(transitions).autoComplete(delivered.getId(), autoCompletionNow);

        RepostPlan plan = new RepostPlan(true, START, 1, 15, START.plusSeconds(3600));
        Order due = Order.open("requester", "item", "p", "d", 1, 15, START.minusSeconds(1800), START, plan);
        due.expire(0, START);
        when(orders.findDueUnassigned(OrderStatus.EXPIRED, START))
            .thenReturn(List.of(due));
        assertEquals(0, lifecycle.repostDue(START, AUTH));
        verify(reposts, never()).automatic(anyString(), anyString(), any(), any());
    }

    @Test
    void commandFacadeDispatchesCreateAndAccept() {
        OrderCreationService creation = mock(OrderCreationService.class);
        OrderAssignmentService assignment = mock(OrderAssignmentService.class);
        OrderTransitionService transitions = mock(OrderTransitionService.class);
        OrderRepostService reposts = mock(OrderRepostService.class);
        OrderCommandFacade facade = new OrderCommandFacade(creation, assignment, transitions, reposts);
        RepostPlan plan = new RepostPlan(false, null, 0, 0, null);
        Order order = Order.open("requester", "item", "p", "d", 1, 15, START, START.plusSeconds(1800));
        when(creation.create("c", "requester", "item", "p", "d", 1, 15, START.plusSeconds(1800), plan, AUTH)).thenReturn(order);
        assertSame(order, facade.create("c", "requester", "item", "p", "d", 1, 15, START.plusSeconds(1800), plan, AUTH));
        when(assignment.accept("a", "id", "courier", 0, AUTH)).thenReturn(order);
        assertSame(order, facade.accept("a", "id", "courier", 0, AUTH));
        verifyNoInteractions(transitions, reposts);
    }

    @Test
    void integratesCreationWithLocalPeerCreditReservation() {
        OrderRepository orders = mock(OrderRepository.class);
        CommandReceiptRepository receipts = mock(CommandReceiptRepository.class);
        OrderCheckpointRepository checkpoints = mock(OrderCheckpointRepository.class);
        MockPeerAdapters peers = new MockPeerAdapters();
        OrderAuditLogger audit = mock(OrderAuditLogger.class);
        when(receipts.findExisting("CREATE", "integration-create")).thenReturn(Optional.empty());
        when(orders.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Order created = new OrderCreationService(orders, receipts, checkpoints, peers, peers, peers, audit)
            .create("integration-create", "requester", "pickup", "pickup-id", "delivery-id", 5, 15,
                Instant.now().plusSeconds(3600), null, AUTH);

        assertEquals(OrderStatus.OPEN, created.getStatus());
        assertEquals(new MockPeerAdapters.CreditSnapshot(50, 5, 45), peers.creditSnapshot("requester"));
        assertEquals("RESERVED", peers.reservationState(created.getId()));
        verify(checkpoints).save(any(OrderCheckpoint.class));
    }
}
