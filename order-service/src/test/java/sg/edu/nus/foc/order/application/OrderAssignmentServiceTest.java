package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.CALLS_REAL_METHODS;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.mockito.MockedStatic;

import sg.edu.nus.foc.order.domain.CommandReceipt;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderCheckpoint;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.domain.repository.CommandReceiptRepository;
import sg.edu.nus.foc.order.domain.repository.OrderCheckpointRepository;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;

class OrderAssignmentServiceTest {
    private static final String AUTHORIZATION = "Bearer courier-token";
    private static final Instant NOW = Instant.parse("2026-10-06T10:00:00Z");

    private MockedStatic<Instant> currentTime;

    @BeforeEach
    void fixCurrentTime() {
        currentTime = mockStatic(Instant.class, CALLS_REAL_METHODS);
        currentTime.when(Instant::now).thenReturn(NOW);
    }

    @AfterEach
    void restoreCurrentTime() {
        currentTime.close();
    }

    @Test
    void waitsForCreditAssignmentBeforeChangingAndSavingOrderStatus() {
        OrderRepository orders = mock(OrderRepository.class);
        OrderCheckpointRepository checkpoints = mock(OrderCheckpointRepository.class);
        CommandReceiptRepository receipts = mock(CommandReceiptRepository.class);
        UserServicePort users = mock(UserServicePort.class);
        CreditServicePort credits = mock(CreditServicePort.class);
        OrderAuditLogger audit = mock(OrderAuditLogger.class);
        Order order = openOrder();

        when(users.verifyCourier("courier-1", AUTHORIZATION)).thenReturn("courier-1");
        when(receipts.findExisting("ACCEPT", "accept-1")).thenReturn(Optional.empty());
        when(orders.getForUpdate(order.getId())).thenReturn(Optional.of(order));
        when(orders.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));
        doAnswer(invocation -> {
            assertEquals(OrderStatus.OPEN, order.getStatus());
            assertNull(order.getCourierId());
            return null;
        }).when(credits).assignCourier(order.getId(), "courier-1", AUTHORIZATION);

        OrderAssignmentService service = new OrderAssignmentService(
                orders, checkpoints, receipts, users, credits, audit);
        Order accepted = service.accept("accept-1", order.getId(), "courier-1", 0, AUTHORIZATION);

        assertEquals(OrderStatus.ACCEPTED, accepted.getStatus());
        assertEquals("courier-1", accepted.getCourierId());
        InOrder sequence = inOrder(credits, checkpoints, orders, receipts);
        sequence.verify(credits).assignCourier(
                order.getId(), "courier-1", AUTHORIZATION);
        sequence.verify(checkpoints).save(any(OrderCheckpoint.class));
        sequence.verify(orders).save(order);
        sequence.verify(receipts).save(any(CommandReceipt.class));
    }

    @Test
    void leavesOrderOpenAndWritesNoAcceptanceRecordsWhenCreditRejectsAssignment() {
        OrderRepository orders = mock(OrderRepository.class);
        OrderCheckpointRepository checkpoints = mock(OrderCheckpointRepository.class);
        CommandReceiptRepository receipts = mock(CommandReceiptRepository.class);
        UserServicePort users = mock(UserServicePort.class);
        CreditServicePort credits = mock(CreditServicePort.class);
        Order order = openOrder();

        when(users.verifyCourier("courier-1", AUTHORIZATION)).thenReturn("courier-1");
        when(receipts.findExisting("ACCEPT", "accept-2")).thenReturn(Optional.empty());
        when(orders.getForUpdate(order.getId())).thenReturn(Optional.of(order));
        doThrow(new IllegalStateException("Credit Service unavailable"))
                .when(credits)
                .assignCourier(order.getId(), "courier-1", AUTHORIZATION);

        OrderAssignmentService service = new OrderAssignmentService(
                orders, checkpoints, receipts, users, credits, mock(OrderAuditLogger.class));

        assertThrows(IllegalStateException.class,
                () -> service.accept("accept-2", order.getId(), "courier-1", 0, AUTHORIZATION));

        assertEquals(OrderStatus.OPEN, order.getStatus());
        assertNull(order.getCourierId());
        verify(checkpoints, never()).save(any(OrderCheckpoint.class));
        verify(orders, never()).save(any(Order.class));
        verify(receipts, never()).save(any(CommandReceipt.class));
    }

    @Test
    void validatesOrderBeforeCallingCreditAndDoesNotCallCreditForExpiredOrder() {
        OrderRepository orders = mock(OrderRepository.class);
        OrderCheckpointRepository checkpoints = mock(OrderCheckpointRepository.class);
        CommandReceiptRepository receipts = mock(CommandReceiptRepository.class);
        UserServicePort users = mock(UserServicePort.class);
        CreditServicePort credits = mock(CreditServicePort.class);
        Instant createdAt = NOW.minusSeconds(3 * 60 * 60L);
        Order expired = Order.open(
                "requester-1", "item", "pickup", "delivery", 8, 15, createdAt, NOW.minusSeconds(1));

        when(users.verifyCourier("courier-1", AUTHORIZATION)).thenReturn("courier-1");
        when(receipts.findExisting("ACCEPT", "accept-expired")).thenReturn(Optional.empty());
        when(orders.getForUpdate(expired.getId())).thenReturn(Optional.of(expired));

        OrderAssignmentService service = new OrderAssignmentService(
                orders, checkpoints, receipts, users, credits, mock(OrderAuditLogger.class));

        assertThrows(OrderProblem.class,
                () -> service.accept("accept-expired", expired.getId(), "courier-1", 0, AUTHORIZATION));

        verify(credits, never()).assignCourier(
                expired.getId(), "courier-1", AUTHORIZATION);
        assertEquals(OrderStatus.OPEN, expired.getStatus());
    }

    @Test
    void doesNotAcceptOrderThatExpiresWhileCreditAssignmentIsInFlight() {
        OrderRepository orders = mock(OrderRepository.class);
        OrderCheckpointRepository checkpoints = mock(OrderCheckpointRepository.class);
        CommandReceiptRepository receipts = mock(CommandReceiptRepository.class);
        UserServicePort users = mock(UserServicePort.class);
        CreditServicePort credits = mock(CreditServicePort.class);
        Instant createdAt = NOW.minusSeconds(30 * 60L);
        Instant expiresAt = NOW.plusSeconds(3);
        Order order = Order.open(
                "requester-1", "item", "pickup", "delivery", 8, 15, createdAt, expiresAt);

        when(users.verifyCourier("courier-1", AUTHORIZATION)).thenReturn("courier-1");
        when(receipts.findExisting("ACCEPT", "accept-expiring")).thenReturn(Optional.empty());
        when(orders.getForUpdate(order.getId())).thenReturn(Optional.of(order));
        doAnswer(invocation -> {
            currentTime.when(Instant::now).thenReturn(expiresAt);
            return null;
        }).when(credits).assignCourier(
                order.getId(), "courier-1", AUTHORIZATION);

        OrderAssignmentService service = new OrderAssignmentService(
                orders, checkpoints, receipts, users, credits, mock(OrderAuditLogger.class));

        assertThrows(OrderProblem.class,
                () -> service.accept("accept-expiring", order.getId(), "courier-1", 0, AUTHORIZATION));

        assertEquals(OrderStatus.OPEN, order.getStatus());
        assertNull(order.getCourierId());
        verify(credits).assignCourier(
                order.getId(), "courier-1", AUTHORIZATION);
        verify(checkpoints, never()).save(any(OrderCheckpoint.class));
        verify(orders, never()).save(any(Order.class));
        verify(receipts, never()).save(any(CommandReceipt.class));
    }

    private Order openOrder() {
        return Order.open(
                "requester-1", "item", "pickup", "delivery", 8, 15, NOW, NOW.plusSeconds(3600));
    }
}
