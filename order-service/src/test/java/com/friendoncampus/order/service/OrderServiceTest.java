package com.friendoncampus.order.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.friendoncampus.order.domain.Order;
import com.friendoncampus.order.domain.OrderState;
import com.friendoncampus.order.domain.OrderTransition;
import com.friendoncampus.order.messaging.OrderEventRecorder;
import com.friendoncampus.order.repository.OrderRepository;
import com.friendoncampus.order.repository.OrderTransitionRepository;

@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-16T12:00:00Z");
    private static final UUID REQUESTER = UUID.randomUUID();

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private OrderTransitionRepository transitionRepository;

    @Mock
    private OrderEventRecorder eventRecorder;

    private OrderService orderService;

    @BeforeEach
    void setUp() {
        orderService = new OrderService(orderRepository, transitionRepository, eventRecorder,
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void createOrderPersistsPendingCreditOrderAndRecordsOrderSubmitted() {
        UUID pickup = UUID.randomUUID();
        UUID dropoff = UUID.randomUUID();
        OffsetDateTime deadline = OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC).plusDays(1);
        CreateOrderCommand command = new CreateOrderCommand(
                REQUESTER, "Collect printing", "Grab my printout", pickup, "COM1 Print Shop", dropoff, "UTown Residence", 10, deadline);
        when(orderRepository.saveAndFlush(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Order saved = orderService.createOrder(command);

        ArgumentCaptor<Order> orderCaptor = ArgumentCaptor.forClass(Order.class);
        verify(orderRepository).saveAndFlush(orderCaptor.capture());
        Order persisted = orderCaptor.getValue();
        assertThat(persisted.getState()).isEqualTo(OrderState.PENDING_CREDIT);
        assertThat(persisted.getRequesterId()).isEqualTo(REQUESTER);
        assertThat(persisted.getPickupLocationId()).isEqualTo(pickup);
        assertThat(persisted.getDropoffLocationId()).isEqualTo(dropoff);
        assertThat(persisted.getCreditReward()).isEqualTo(10);
        assertThat(persisted.getPickupDeadline()).isEqualTo(deadline);
        assertThat(saved).isSameAs(persisted);

        ArgumentCaptor<OrderTransition> transitionCaptor = ArgumentCaptor.forClass(OrderTransition.class);
        verify(eventRecorder).record(any(Order.class), transitionCaptor.capture());
        assertThat(transitionCaptor.getValue().eventType()).isEqualTo("OrderSubmitted");
    }

    @Test
    void repeatingACancelRecordsNothingNew() {
        UUID orderId = UUID.randomUUID();
        Order cancelled = Order.submit(REQUESTER, "t", "d", UUID.randomUUID(), "COM1 Print Shop", UUID.randomUUID(), "UTown Residence", 5,
                OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC).plusDays(1));
        ReflectionTestUtils.setField(cancelled, "state", OrderState.CANCELLED);
        when(orderRepository.findByIdForUpdate(orderId)).thenReturn(Optional.of(cancelled));

        assertThat(orderService.cancel(orderId, REQUESTER)).isSameAs(cancelled);

        verify(eventRecorder, never()).record(any(), any());
        verify(orderRepository, never()).saveAndFlush(any());
    }

    @Test
    void hiddenOrdersAreReportedAsNotFound() {
        UUID orderId = UUID.randomUUID();
        Order accepted = Order.submit(REQUESTER, "t", "d", UUID.randomUUID(), "COM1 Print Shop", UUID.randomUUID(), "UTown Residence", 5,
                OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC).plusDays(1));
        ReflectionTestUtils.setField(accepted, "state", OrderState.ACCEPTED);
        ReflectionTestUtils.setField(accepted, "courierId", UUID.randomUUID());
        when(orderRepository.findById(orderId)).thenReturn(Optional.of(accepted));

        assertThatThrownBy(() -> orderService.getOrder(orderId, UUID.randomUUID()))
                .isInstanceOf(OrderNotFoundException.class);
    }
}
