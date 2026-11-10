package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mapstruct.factory.Mappers;
import org.springframework.context.ApplicationEventPublisher;

import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.domain.repository.OrderCheckpointRepository;
import sg.edu.nus.foc.order.domain.repository.OrderEventOutboxRepository;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;
import sg.edu.nus.foc.order.messagingpublisher.dto.OrderTaskEvent;
import sg.edu.nus.foc.order.messagingpublisher.mapper.OrderTaskEventMapper;

class LifecycleFailureIsolationTest {

    private static final Instant NOW = Instant.parse("2026-10-09T12:00:00Z");
    private final OrderRepository orders = mock(OrderRepository.class);
    private final OrderCheckpointRepository checkpoints = mock(OrderCheckpointRepository.class);
    private final OrderEventOutboxRepository outbox = mock(OrderEventOutboxRepository.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final OrderTransitionService transitions = mock(OrderTransitionService.class);

    @Test
    void failedExpiryDoesNotStopTheNextDueOrder() {
        Order failed = dueOrder("failed");
        Order successful = dueOrder("successful");
        when(orders.findDueUnassignedIds(OrderStatus.OPEN, NOW))
                .thenReturn(List.of(failed.getId(), successful.getId()));
        when(orders.getForLifecycleUpdate(failed.getId())).thenReturn(java.util.Optional.of(failed));
        when(orders.getForLifecycleUpdate(successful.getId())).thenReturn(java.util.Optional.of(successful));
        when(orders.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));
        doAnswer(invocation -> {
            OrderTaskEvent event = invocation.getArgument(0);
            if (event.getOrderId().equals(failed.getId())) {
                throw new IllegalStateException("outbox unavailable for first order");
            }
            return null;
        }).when(outbox).enqueue(any());

        int completed = assertDoesNotThrow(() -> lifecycle().expireDue(NOW));

        assertEquals(1, completed);
        verify(orders).save(successful);
        assertEquals(OrderStatus.EXPIRED, successful.getStatus());
    }

    @Test
    void failedAutoCompletionDoesNotStopLaterEligibleOrders() {
        Order failed = dueOrder("failed");
        Order successful = dueOrder("successful");
        Order changed = dueOrder("already changed");
        Instant cutoff = NOW.minus(Order.AUTOMATIC_COMPLETION_DELAY);
        when(orders.findDueForAutoCompletionIds(cutoff))
                .thenReturn(List.of(failed.getId(), successful.getId(), changed.getId()));
        when(transitions.autoComplete(failed.getId(), NOW)).thenThrow(new IllegalStateException("commit failed"));
        when(transitions.autoComplete(successful.getId(), NOW)).thenReturn(true);
        when(transitions.autoComplete(changed.getId(), NOW)).thenReturn(false);

        int completed = assertDoesNotThrow(() -> lifecycle().autoCompleteDue(NOW));

        assertEquals(1, completed);
        verify(transitions).autoComplete(successful.getId(), NOW);
        verify(transitions).autoComplete(changed.getId(), NOW);
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 1, 2})
    void completionContinuesWhenFailureIsFirstMiddleOrLast(int failedIndex) {
        List<String> ids = List.of("one", "two", "three");
        when(orders.findDueForAutoCompletionIds(NOW.minus(Order.AUTOMATIC_COMPLETION_DELAY))).thenReturn(ids);
        for (int index = 0; index < ids.size(); index++) {
            if (index == failedIndex) {
                when(transitions.autoComplete(ids.get(index), NOW)).thenThrow(new IllegalStateException("failed"));
            } else {
                when(transitions.autoComplete(ids.get(index), NOW)).thenReturn(true);
            }
        }

        assertEquals(2, lifecycle().autoCompleteDue(NOW));

        for (String id : ids) {
            verify(transitions).autoComplete(id, NOW);
        }
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 1, 2})
    void expiryContinuesWhenFailureIsFirstMiddleOrLast(int failedIndex) {
        List<Order> candidates = List.of(dueOrder("one"), dueOrder("two"), dueOrder("three"));
        when(orders.findDueUnassignedIds(OrderStatus.OPEN, NOW))
                .thenReturn(candidates.stream().map(Order::getId).toList());
        for (int index = 0; index < candidates.size(); index++) {
            if (index == failedIndex) {
                when(orders.getForLifecycleUpdate(candidates.get(index).getId()))
                        .thenThrow(new IllegalStateException("lock unavailable"));
            } else {
                when(orders.getForLifecycleUpdate(candidates.get(index).getId()))
                        .thenReturn(java.util.Optional.of(candidates.get(index)));
            }
        }
        when(orders.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        assertEquals(2, lifecycle().expireDue(NOW));

        for (Order candidate : candidates) {
            verify(orders).getForLifecycleUpdate(candidate.getId());
        }
    }

    @Test
    void allFailuresAndEmptyPassesReportZeroWithoutEscaping() {
        when(orders.findDueUnassignedIds(OrderStatus.OPEN, NOW)).thenReturn(List.of("failed"), List.of());
        when(orders.getForLifecycleUpdate("failed")).thenThrow(new IllegalStateException("locked"));
        when(orders.findDueForAutoCompletionIds(NOW.minus(Order.AUTOMATIC_COMPLETION_DELAY)))
                .thenReturn(List.of("failed"), List.of());
        when(transitions.autoComplete("failed", NOW)).thenThrow(new IllegalStateException("locked"));
        LifecycleProcessingService lifecycle = lifecycle();

        assertEquals(0, lifecycle.expireDue(NOW));
        assertEquals(0, lifecycle.autoCompleteDue(NOW));
        assertEquals(0, lifecycle.expireDue(NOW));
        assertEquals(0, lifecycle.autoCompleteDue(NOW));
    }

    private LifecycleProcessingService lifecycle() {
        return new LifecycleProcessingService(
                orders, new OrderExpiryProcessingService(orders, checkpoints, outbox, events,
                        new OrderTaskEventFactory(Mappers.getMapper(OrderTaskEventMapper.class), TestPenaltySequences.store()),
                        mock(OrderAuditLogger.class)),
                mock(OrderRepostService.class), mock(OrderAuditLogger.class), transitions);
    }

    private Order dueOrder(String requester) {
        return Order.open(requester, "item", "pickup", "delivery", 2, 15, NOW.minusSeconds(3600), NOW);
    }
}
