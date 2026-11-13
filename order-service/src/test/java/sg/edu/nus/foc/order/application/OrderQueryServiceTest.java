package sg.edu.nus.foc.order.application;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.jupiter.api.Test;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.domain.repository.OrderPage;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;

class OrderQueryServiceTest {
    @Test
    void adminDateRangeIsValidatedBeforeTheDatabaseAndCombinedWithExactId() {
        OrderRepository repository = mock(OrderRepository.class);
        OrderQueryService service = new OrderQueryService(repository);
        java.time.Instant from = java.time.Instant.parse("2026-10-15T16:00:00Z");
        java.time.Instant before = from.plusSeconds(86400);
        service.allOrders(OrderStatus.ACCEPTED, "order-1", from, before, 0, 10);
        verify(repository).findAllOrders(OrderStatus.ACCEPTED, "order-1", from, before, 0, 10);
        org.junit.jupiter.api.Assertions.assertThrows(sg.edu.nus.foc.order.domain.OrderProblem.class,
                () -> service.allOrders(null, null, before, from, 0, 10));
    }
    @Test
    void allOrdersPassesAnAbsentStatusThroughForAllStatuses() {
        OrderRepository repository = mock(OrderRepository.class);
        OrderPage result = new OrderPage(List.of(), 1, 20, 21, 2);
        when(repository.findAllOrders(null, 1, 20)).thenReturn(result);

        OrderPage actual = new OrderQueryService(repository).allOrders(null, 1, 20);

        verify(repository).findAllOrders(null, 1, 20);
        org.junit.jupiter.api.Assertions.assertSame(result, actual);
    }

    @Test
    void allOrdersPassesTheRequestedStatusAndPageThrough() {
        OrderRepository repository = mock(OrderRepository.class);
        OrderPage result = new OrderPage(List.of(), 0, 10, 0, 0);
        when(repository.findAllOrders(OrderStatus.COMPLETED, 0, 10)).thenReturn(result);

        OrderPage actual = new OrderQueryService(repository).allOrders(OrderStatus.COMPLETED, 0, 10);

        verify(repository).findAllOrders(OrderStatus.COMPLETED, 0, 10);
        org.junit.jupiter.api.Assertions.assertSame(result, actual);
    }

    @Test
    void requestedOrdersUseTheRepositoryBoundary() {
        OrderRepository repository = mock(OrderRepository.class);
        OrderPage result = new OrderPage(List.of(), 0, 100, 0, 0);
        when(repository.findRequestedBy("requester", -1, 999)).thenReturn(result);

        new OrderQueryService(repository).requestedBy("requester", -1, 999);

        verify(repository).findRequestedBy("requester", -1, 999);
    }

    @Test
    void courierOrdersUseTheRepositoryBoundary() {
        OrderRepository repository = mock(OrderRepository.class);
        OrderPage result = new OrderPage(List.of(), 2, 20, 0, 0);
        when(repository.findCourierOrders("courier", 2, 20)).thenReturn(result);

        new OrderQueryService(repository).courierFor("courier", 2, 20);

        verify(repository).findCourierOrders("courier", 2, 20);
    }

    @Test
    void personalStatusFiltersAndNullArePassedToTheRepositoryBoundary() {
        OrderRepository repository = mock(OrderRepository.class);
        OrderQueryService queries = new OrderQueryService(repository);
        queries.requestedBy("requester", OrderStatus.EXPIRED, 2, 10);
        queries.courierFor("courier", OrderStatus.ABORTED, 1, 20);
        queries.requestedBy("requester", null, 0, 20);
        queries.courierFor("courier", null, 0, 20);
        verify(repository).findRequestedBy("requester", OrderStatus.EXPIRED, 2, 10);
        verify(repository).findCourierOrders("courier", OrderStatus.ABORTED, 1, 20);
        verify(repository).findRequestedBy("requester", null, 0, 20);
        verify(repository).findCourierOrders("courier", null, 0, 20);
    }
}
