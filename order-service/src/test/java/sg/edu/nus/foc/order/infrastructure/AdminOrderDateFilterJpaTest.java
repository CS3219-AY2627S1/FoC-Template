package sg.edu.nus.foc.order.infrastructure;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import sg.edu.nus.foc.order.application.OrderOutboxDispatcher;
import sg.edu.nus.foc.order.application.OrderQueryService;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.domain.repository.OrderPage;

@SpringBootTest(properties = {"spring.profiles.active=local", "order.lifecycle.cron=-", "order.messaging.outbox.recovery-cron=-"})
@Testcontainers
@Transactional
class AdminOrderDateFilterJpaTest {
    private static final Instant FROM = Instant.parse("2026-10-15T16:00:00Z");
    @Container
    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("admin_dates").withUsername("order_test").withPassword("order_test_password");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        properties.add("spring.datasource.username", POSTGRES::getUsername);
        properties.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired private JpaOrderRepository orders;
    @Autowired private OrderQueryService queries;
    @MockitoBean private OrderOutboxDispatcher dispatcher;

    private Order save(Instant created, boolean accepted) {
        Order order = Order.open("owner", "books", "pickup", "delivery", 5, 30, created, created.plusSeconds(3600));
        if (accepted) order.accept("courier", 0, created.plusSeconds(1));
        return orders.saveAndFlush(order);
    }

    @Test
    void filtersInclusiveStartExclusiveEndBeforeCountingAndPaging() {
        save(FROM.minusNanos(1000), true);
        Order start = save(FROM, true);
        Order last = save(FROM.plusSeconds(86400).minusNanos(1000), true);
        save(FROM.plusSeconds(86400), true);
        save(FROM.plusSeconds(3600), false);
        OrderPage first = queries.allOrders(OrderStatus.ACCEPTED, null, FROM, FROM.plusSeconds(86400), 0, 1);
        assertEquals(2, first.getTotalItems());
        assertEquals(2, first.getTotalPages());
        assertEquals(last.getId(), first.getItems().getFirst().getId());
        assertEquals(start.getId(), queries.allOrders(OrderStatus.ACCEPTED, null, FROM, FROM.plusSeconds(86400), 1, 1).getItems().getFirst().getId());
        assertTrue(queries.allOrders(OrderStatus.OPEN, last.getId(), FROM, FROM.plusSeconds(86400), 0, 10).getItems().isEmpty());
        assertEquals(List.of(last.getId()), queries.allOrders(OrderStatus.ACCEPTED, last.getId(), FROM, FROM.plusSeconds(86400), 0, 10)
                .getItems().stream().map(Order::getId).toList());
    }

    @Test
    void oneSidedAndNoDateRangesRemainDatabasePaged() {
        Order before = save(FROM.minusSeconds(1), false);
        Order after = save(FROM, false);
        assertEquals(1, queries.allOrders(null, null, FROM, null, 0, 10).getTotalItems());
        assertEquals(before.getId(), queries.allOrders(null, null, null, FROM, 0, 10).getItems().getFirst().getId());
        assertEquals(2, queries.allOrders(null, null, null, null, 0, 1).getTotalItems());
        assertEquals(after.getId(), queries.allOrders(null, after.getId(), null, null, 0, 10).getItems().getFirst().getId());
    }

    @Test
    void actionEligibilityFiltersStatesAndHeldRowsBeforeCountingAndPaging() {
        for (OrderStatus status : OrderStatus.values()) {
            Order order = save(FROM.plusSeconds(status.ordinal()), false);
            org.springframework.test.util.ReflectionTestUtils.setField(order, "status", status);
            if (status != OrderStatus.OPEN) org.springframework.test.util.ReflectionTestUtils.setField(order, "courierId", "courier");
            if (status == OrderStatus.DELIVERED) org.springframework.test.util.ReflectionTestUtils.setField(order, "completionHold", true);
            orders.saveAndFlush(order);
        }
        OrderPage first = queries.allOrders(null, null, FROM, FROM.plusSeconds(60), true, 0, 2);
        assertEquals(5, first.getTotalItems());
        assertEquals(3, first.getTotalPages());
        assertEquals(2, first.getItems().size());
        Order held = first.getItems().getFirst();
        assertEquals(OrderStatus.DELIVERED, held.getStatus());
        assertTrue(held.isCompletionHold());
        assertEquals(1, queries.allOrders(null, null, FROM, FROM.plusSeconds(60), true, 2, 2).getItems().size());
        assertEquals(1, queries.allOrders(null, held.getId(), null, null, true, 0, 20).getTotalItems());
        assertEquals(0, queries.allOrders(OrderStatus.COMPLETED, null, null, null, true, 0, 20).getTotalItems());
        assertEquals(1, queries.allOrders(OrderStatus.OPEN, null, null, null, true, 0, 20).getTotalItems());
        assertEquals(0, queries.allOrders(null, null, FROM.plusSeconds(60), null, true, 0, 20).getTotalItems());
        assertEquals(OrderStatus.values().length, queries.allOrders(null, null, null, null, false, 0, 20).getTotalItems());
    }
}
