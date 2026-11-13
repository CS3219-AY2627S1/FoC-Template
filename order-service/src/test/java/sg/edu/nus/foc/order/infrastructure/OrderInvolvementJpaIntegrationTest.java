package sg.edu.nus.foc.order.infrastructure;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import sg.edu.nus.foc.order.application.OrderInvolvementService;
import sg.edu.nus.foc.order.application.OrderOutboxDispatcher;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderCourierAttempt;
import sg.edu.nus.foc.order.domain.OrderStatus;

@SpringBootTest(properties = {"spring.profiles.active=local", "order.lifecycle.cron=-", "order.messaging.outbox.recovery-cron=-"})
@Testcontainers
@Transactional
class OrderInvolvementJpaIntegrationTest {

    private static final Instant NOW = Instant.parse("2026-10-14T10:00:00Z");
    private static final Set<OrderStatus> ACTIVE = Set.of(OrderStatus.OPEN, OrderStatus.ACCEPTED,
            OrderStatus.IN_PROGRESS, OrderStatus.PICKED_UP, OrderStatus.DELIVERED);

    @Container
    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("involvement_test").withUsername("order_test").withPassword("order_test_password");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        properties.add("spring.datasource.username", POSTGRES::getUsername);
        properties.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired private JpaOrderRepository orders;
    @Autowired private JpaOrderCourierAttemptRepository attempts;
    @Autowired private OrderInvolvementService involvement;
    @MockitoBean private OrderOutboxDispatcher dispatcher;

    @ParameterizedTest
    @EnumSource(OrderStatus.class)
    void databaseChecksBothRelationshipsAcrossEveryPersistedStatus(OrderStatus status) {
        Order order = open();
        // Persisted-state fixtures also cover legacy terminal ABORTED rows.
        ReflectionTestUtils.setField(order, "status", status);
        if (status != OrderStatus.OPEN) ReflectionTestUtils.setField(order, "courierId", "courier");
        orders.saveAndFlush(order);

        boolean expected = ACTIVE.contains(status);
        assertEquals(expected, involvement.user("owner").isHasActiveOrders());
        boolean terminal = Set.of(OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.EXPIRED).contains(status);
        assertEquals(terminal, involvement.canDeleteUser("owner"));
        assertEquals(terminal || status == OrderStatus.OPEN, involvement.canDeleteUser("courier"));
        assertTrue(involvement.canDeleteUser("other"));
        assertEquals(expected && status != OrderStatus.OPEN, involvement.user("courier").isHasActiveOrders());
        assertEquals(expected, involvement.supplier("pickup").isHasActiveOrders());
        assertEquals(expected, involvement.supplier("delivery").isHasActiveOrders());
        assertFalse(involvement.user("other").isHasActiveOrders());
        assertFalse(involvement.supplier("other").isHasActiveOrders());
    }

    @Test
    void heldOpenOrderCountsEvenWhenDeadlineAlreadyPassed() {
        Order order = Order.open("owner", "books", "pickup", "delivery", 5, 30,
                NOW.minusSeconds(86400), NOW.minusSeconds(3600));
        order.placeCompletionHold("owner");
        orders.saveAndFlush(order);
        assertTrue(involvement.user("owner").isHasActiveOrders());
        assertTrue(involvement.supplier("pickup").isHasActiveOrders());
    }

    @Test
    void historicalAbortedCourierIsNotCurrentInvolvementAfterReopen() {
        Order order = open();
        order.accept("old-courier", 0, NOW.plusSeconds(60));
        orders.saveAndFlush(order);
        attempts.saveAndFlush(new OrderCourierAttempt(order, "old-courier", order.getVersion(), NOW.plusSeconds(120)));
        order.reopenAfterAcceptedCancellation("old-courier", order.getVersion(), NOW.plusSeconds(120));
        orders.saveAndFlush(order);
        assertFalse(involvement.user("old-courier").isHasActiveOrders());
        assertTrue(involvement.user("owner").isHasActiveOrders());
        assertTrue(involvement.supplier("delivery").isHasActiveOrders());
    }

    @Test
    void emptyDatabaseReturnsFalseWithoutNeedingForeignRecords() {
        assertFalse(involvement.user("unknown").isHasActiveOrders());
        assertFalse(involvement.supplier("unknown").isHasActiveOrders());
    }

    private Order open() {
        return Order.open("owner", "books", "pickup", "delivery", 5, 30, NOW, NOW.plusSeconds(3600));
    }
}
