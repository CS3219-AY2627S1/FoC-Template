package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderCompletionHold;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.domain.repository.OrderCompletionHoldRepository;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;

class OrderCompletionHoldServiceTest {

    private final OrderRepository orders = mock(OrderRepository.class);
    private final OrderCompletionHoldRepository holds = mock(OrderCompletionHoldRepository.class);
    private final UserServicePort users = mock(UserServicePort.class);
    private final OrderCompletionHoldService service = new OrderCompletionHoldService(
            orders, holds, users, mock(OrderAuditLogger.class));

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(value = OrderStatus.class, mode = org.junit.jupiter.params.provider.EnumSource.Mode.EXCLUDE, names = "COMPLETED")
    void commitsAHoldUsingTheVerifiedRequesterAndKeepsOrderStatus(OrderStatus status) {
        Order order = candidate();
        org.springframework.test.util.ReflectionTestUtils.setField(order, "status", status);
        when(users.verifyRequester("owner", "Bearer token")).thenReturn("owner");
        when(orders.getForUpdate(order.getId())).thenReturn(Optional.of(order));
        when(orders.save(order)).thenReturn(order);

        Order result = service.place(order.getId(), "report-1", "owner", "Bearer token");

        assertTrue(result.isCompletionHold());
        assertEquals(status, result.getStatus());
        verify(holds).save(any(OrderCompletionHold.class));
        verify(orders).getForUpdate(order.getId());
    }

    @Test
    void repeatedReportPlacementMakesNoAdditionalWrites() {
        Order order = candidate();
        order.placeCompletionHold("owner");
        when(users.verifyRequester("owner", "Bearer token")).thenReturn("owner");
        when(orders.getForUpdate(order.getId())).thenReturn(Optional.of(order));
        when(holds.findByReportId("report-1")).thenReturn(Optional.of(
                new OrderCompletionHold("report-1", order.getId(), "owner", Instant.now())));

        assertTrue(service.place(order.getId(), "report-1", "owner", "Bearer token").isCompletionHold());
        verify(holds, never()).save(any());
        verify(orders, never()).save(any());
    }

    @Test
    void reportBindingAndAnotherVerifiedRequesterAreRejected() {
        Order order = candidate();
        when(users.verifyRequester("owner", "Bearer token")).thenReturn("other");
        when(orders.getForUpdate(order.getId())).thenReturn(Optional.of(order));
        assertEquals("FORBIDDEN", assertThrows(OrderProblem.class,
                () -> service.place(order.getId(), "report-1", "owner", "Bearer token")).getCode());
        verify(holds, never()).save(any());

        when(users.verifyRequester("owner", "Bearer token")).thenReturn("owner");
        when(holds.findByReportId("report-1")).thenReturn(Optional.of(
                new OrderCompletionHold("report-1", "another-order", "owner", Instant.now())));
        assertEquals("CONFLICT", assertThrows(OrderProblem.class,
                () -> service.place(order.getId(), "report-1", "owner", "Bearer token")).getCode());
    }

    @Test
    void invalidReportsAndMissingOrdersAreRejected() {
        assertEquals("VALIDATION_ERROR", assertThrows(OrderProblem.class,
                () -> service.place("missing", " ", "owner", "Bearer token")).getCode());
        when(users.verifyRequester("owner", "Bearer token")).thenReturn("owner");
        assertEquals("NOT_FOUND", assertThrows(OrderProblem.class,
                () -> service.place("missing", "report", "owner", "Bearer token")).getCode());
    }

    @Test void completedOrderCannotReceiveANewHold() {
        Order order = candidate();
        order.confirmCompletion("owner", 0);
        when(users.verifyRequester("owner", "Bearer token")).thenReturn("owner");
        when(orders.getForUpdate(order.getId())).thenReturn(Optional.of(order));
        assertEquals("CONFLICT", assertThrows(OrderProblem.class,
                () -> service.place(order.getId(), "new-report", "owner", "Bearer token")).getCode());
        org.junit.jupiter.api.Assertions.assertFalse(order.isCompletionHold());
        verify(holds, never()).save(any());
        verify(orders, never()).save(any());
    }

    private static Order candidate() {
        Instant now = Instant.parse("2026-10-14T00:00:00Z");
        Order order = Order.open("owner", "books", "pickup", "delivery", 5, 30, now, now.plusSeconds(3600));
        order.accept("courier", 0, now);
        order.start("courier", 0, now);
        order.markPickedUp("courier", 0);
        order.markDelivered("courier", 0, now.plusSeconds(1900));
        return order;
    }
}
