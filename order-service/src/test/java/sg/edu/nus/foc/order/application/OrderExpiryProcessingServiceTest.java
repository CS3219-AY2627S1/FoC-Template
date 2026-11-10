package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.mapstruct.factory.Mappers;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.util.ReflectionTestUtils;

import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderCheckpoint;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.domain.repository.OrderCheckpointRepository;
import sg.edu.nus.foc.order.domain.repository.OrderEventOutboxRepository;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;
import sg.edu.nus.foc.order.messagingpublisher.mapper.OrderTaskEventMapper;

class OrderExpiryProcessingServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-09T12:00:00Z");
    private final OrderRepository orders = mock(OrderRepository.class);
    private final OrderCheckpointRepository checkpoints = mock(OrderCheckpointRepository.class);
    private final OrderEventOutboxRepository outbox = mock(OrderEventOutboxRepository.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final OrderExpiryProcessingService expiry = new OrderExpiryProcessingService(
            orders, checkpoints, outbox, events,
            new OrderTaskEventFactory(Mappers.getMapper(OrderTaskEventMapper.class), TestPenaltySequences.store()), mock(OrderAuditLogger.class));

    @Test
    void exactDeadlineExpiresOnceAfterRecheckingTheLockedOrder() {
        Order order = order(NOW);
        when(orders.getForLifecycleUpdate(order.getId())).thenReturn(Optional.of(order));
        when(orders.save(order)).thenReturn(order);

        assertTrue(expiry.expire(order.getId(), NOW));
        assertFalse(expiry.expire(order.getId(), NOW));

        assertEquals(OrderStatus.EXPIRED, order.getStatus());
        verify(checkpoints).save(any(OrderCheckpoint.class));
        verify(outbox).enqueue(any());
        verify(events).publishEvent(any(OrderOutboxDispatchRequested.class));
    }

    @Test
    void missingAndNoLongerDueOrdersProduceNoWrites() {
        when(orders.getForLifecycleUpdate("missing")).thenReturn(Optional.empty());
        assertFalse(expiry.expire("missing", NOW));

        Order future = order(NOW.plusNanos(1));
        when(orders.getForLifecycleUpdate(future.getId())).thenReturn(Optional.of(future));
        assertFalse(expiry.expire(future.getId(), NOW));
        verify(orders, never()).save(any());
        verify(checkpoints, never()).save(any());
        verify(outbox, never()).enqueue(any());
    }

    @Test
    void assignedCourierIsRecheckedBeforeExpiring() {
        Order assigned = order(NOW);
        ReflectionTestUtils.setField(assigned, "courierId", "courier");
        when(orders.getForLifecycleUpdate(assigned.getId())).thenReturn(Optional.of(assigned));

        assertFalse(expiry.expire(assigned.getId(), NOW));

        assertEquals(OrderStatus.OPEN, assigned.getStatus());
        verify(outbox, never()).enqueue(any());
    }

    private Order order(Instant expiryTime) {
        return Order.open("requester", "item", "pickup", "delivery", 2, 15, NOW.minusSeconds(3600), expiryTime);
    }
}
