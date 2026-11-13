package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import org.mapstruct.factory.Mappers;
import org.mockito.ArgumentCaptor;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.SimpleTransactionStatus;

import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderCheckpoint;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.domain.repository.OrderCheckpointRepository;
import sg.edu.nus.foc.order.domain.repository.CommandReceiptRepository;
import sg.edu.nus.foc.order.domain.repository.OrderEventOutboxRepository;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;
import sg.edu.nus.foc.order.messagingpublisher.mapper.OrderTaskEventMapper;

class LifecycleTransactionIsolationTest {

    private static final Instant NOW = Instant.parse("2026-10-09T12:00:00Z");

    @Test
    void commitFailureIsCaughtAfterTheProxyAndTheNextOrderStillCommits() {
        OrderRepository orders = mock(OrderRepository.class);
        PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
        List<TransactionStatus> statuses = transactions(manager);
        Order failed = order("failed");
        Order successful = order("successful");
        when(orders.findDueUnassignedIds(OrderStatus.OPEN, NOW))
                .thenReturn(List.of(failed.getId(), successful.getId()));
        when(orders.getForLifecycleUpdate(failed.getId())).thenReturn(Optional.of(failed));
        when(orders.getForLifecycleUpdate(successful.getId())).thenReturn(Optional.of(successful));
        when(orders.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        AtomicInteger commits = new AtomicInteger();
        doAnswer(invocation -> {
            if (commits.getAndIncrement() == 0) {
                throw new IllegalStateException("commit unavailable");
            }
            return null;
        }).when(manager).commit(any());

        assertEquals(1, coordinator(orders, expiryProxy(orders, manager)).expireDue(NOW));

        assertEquals(2, statuses.size());
        assertNotSame(statuses.get(0), statuses.get(1));
        verify(manager, times(2)).commit(any());
        verifyNewTransactions(manager);
    }

    @Test
    void processingFailureRollsBackItsTransactionBeforeTheNextOrderCommits() {
        OrderRepository orders = mock(OrderRepository.class);
        PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
        List<TransactionStatus> statuses = transactions(manager);
        Order successful = order("successful");
        when(orders.findDueUnassignedIds(OrderStatus.OPEN, NOW))
                .thenReturn(List.of("failed", successful.getId()));
        when(orders.getForLifecycleUpdate("failed")).thenThrow(new IllegalStateException("lock unavailable"));
        when(orders.getForLifecycleUpdate(successful.getId())).thenReturn(Optional.of(successful));
        when(orders.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        assertEquals(1, coordinator(orders, expiryProxy(orders, manager)).expireDue(NOW));

        verify(manager).rollback(statuses.get(0));
        verify(manager).commit(statuses.get(1));
        verifyNewTransactions(manager);
    }

    @Test
    void automaticCompletionHasIndependentRollbackAndCommitBoundaries() {
        OrderRepository orders = mock(OrderRepository.class);
        PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
        List<TransactionStatus> statuses = transactions(manager);
        Instant deliveredAt = NOW.minus(Order.AUTOMATIC_COMPLETION_DELAY);
        Order successful = Order.open("requester", "item", "pickup", "delivery", 2, 15,
                deliveredAt.minusSeconds(3600), deliveredAt.plusSeconds(3600));
        successful.accept("courier", 0, deliveredAt.minusSeconds(1800));
        successful.start("courier", 0, deliveredAt.minusSeconds(600));
        successful.markPickedUp("courier", 0);
        successful.markDelivered("courier", 0, deliveredAt);
        when(orders.findDueForAutoCompletionIds(deliveredAt)).thenReturn(List.of("failed", successful.getId()));
        when(orders.getForLifecycleUpdate("failed")).thenThrow(new IllegalStateException("lock unavailable"));
        when(orders.getForLifecycleUpdate(successful.getId())).thenReturn(Optional.of(successful));
        when(orders.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        OrderCheckpointRepository checkpoints = mock(OrderCheckpointRepository.class);
        when(checkpoints.findByOrderId(successful.getId())).thenReturn(List.of(
                new OrderCheckpoint(successful.getId(), OrderStatus.ACCEPTED,
                        deliveredAt.minusSeconds(1800), "courier", null),
                new OrderCheckpoint(successful.getId(), OrderStatus.DELIVERED, deliveredAt, "courier", null)));
        OrderTransitionService target = new OrderTransitionService(
                orders, checkpoints, mock(CommandReceiptRepository.class), mock(UserServicePort.class),
                mock(CreditServicePort.class), mock(OrderEventOutboxRepository.class),
                mock(ApplicationEventPublisher.class),
                new OrderTaskEventFactory(Mappers.getMapper(OrderTaskEventMapper.class), TestPenaltySequences.store()), mock(OrderAuditLogger.class), org.mockito.Mockito.mock(sg.edu.nus.foc.order.application.PenaltyOutcomeRecorder.class));
        ProxyFactory proxy = new ProxyFactory(target);
        proxy.addAdvice(new TransactionInterceptor(manager, new AnnotationTransactionAttributeSource()));
        OrderTransitionService transitions = (OrderTransitionService) proxy.getProxy();
        LifecycleProcessingService coordinator = new LifecycleProcessingService(
                orders, mock(OrderExpiryProcessingService.class), mock(OrderRepostService.class),
                mock(OrderAuditLogger.class), transitions);

        assertEquals(1, coordinator.autoCompleteDue(NOW));

        verify(manager).rollback(statuses.get(0));
        verify(manager).commit(statuses.get(1));
        verifyNewTransactions(manager);
        assertEquals(OrderStatus.COMPLETED, successful.getStatus());
    }

    private List<TransactionStatus> transactions(PlatformTransactionManager manager) {
        List<TransactionStatus> statuses = new ArrayList<>();
        when(manager.getTransaction(any())).thenAnswer(invocation -> {
            TransactionStatus status = new SimpleTransactionStatus();
            statuses.add(status);
            return status;
        });
        return statuses;
    }

    private void verifyNewTransactions(PlatformTransactionManager manager) {
        ArgumentCaptor<TransactionDefinition> definitions = ArgumentCaptor.forClass(TransactionDefinition.class);
        verify(manager, times(2)).getTransaction(definitions.capture());
        for (TransactionDefinition definition : definitions.getAllValues()) {
            assertEquals(TransactionDefinition.PROPAGATION_REQUIRES_NEW, definition.getPropagationBehavior());
        }
    }

    private OrderExpiryProcessingService expiryProxy(OrderRepository orders, PlatformTransactionManager manager) {
        OrderExpiryProcessingService target = new OrderExpiryProcessingService(
                orders, mock(OrderCheckpointRepository.class), mock(OrderEventOutboxRepository.class),
                mock(ApplicationEventPublisher.class),
                new OrderTaskEventFactory(Mappers.getMapper(OrderTaskEventMapper.class), TestPenaltySequences.store()), mock(OrderAuditLogger.class));
        ProxyFactory proxy = new ProxyFactory(target);
        proxy.addAdvice(new TransactionInterceptor(manager, new AnnotationTransactionAttributeSource()));
        return (OrderExpiryProcessingService) proxy.getProxy();
    }

    private LifecycleProcessingService coordinator(OrderRepository orders, OrderExpiryProcessingService expiry) {
        return new LifecycleProcessingService(orders, expiry, mock(OrderRepostService.class),
                mock(OrderAuditLogger.class), mock(OrderTransitionService.class));
    }

    private Order order(String requester) {
        return Order.open(requester, "item", "pickup", "delivery", 2, 15, NOW.minusSeconds(3600), NOW);
    }
}
