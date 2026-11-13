package sg.edu.nus.foc.order.infrastructure;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.domain.OrderCourierAttempt;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;
import sg.edu.nus.foc.order.domain.repository.OrderPage;

@SpringBootTest(properties = {
    "spring.profiles.active=local",
    "order.messaging.outbox.recovery-cron=-",
    "order.lifecycle.cron=-"
})
@Testcontainers(disabledWithoutDocker = true)
@Transactional
class OrderPersonalStatusJpaIntegrationTest {
    private static final Instant START = Instant.parse("2026-10-08T00:00:00Z");

    @Container
    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("order_personal_status_test")
            .withUsername("order_test")
            .withPassword("order_test_password");

    @Autowired
    private JpaOrderRepository orders;

    @Autowired
    private OrderRepository persistence;


    @Test
    void requesterStatusMatchesAndTotalsExcludeOtherOwnersAndRepostedOriginals() {
        Order hidden = expired("requester", START);
        Order repost = hidden.createRepost("new", 4, 30, START.plusSeconds(5000), START.plusSeconds(9000));
        hidden.linkRepost(repost.getId());
        Order first = expired("requester", START.plusSeconds(1));
        Order second = expired("requester", START.plusSeconds(2));
        orders.saveAllAndFlush(List.of(hidden, repost, first, second, expired("other", START.plusSeconds(3))));

        OrderPage pageOne = persistence.findRequestedBy("requester", OrderStatus.EXPIRED, 0, 1);
        OrderPage pageTwo = persistence.findRequestedBy("requester", OrderStatus.EXPIRED, 1, 1);
        assertEquals(2, pageOne.getTotalItems());
        assertEquals(2, pageOne.getTotalPages());
        assertEquals(second.getId(), pageOne.getItems().getFirst().getId());
        assertEquals(first.getId(), pageTwo.getItems().getFirst().getId());
        assertEquals(1, persistence.findRequestedBy("requester", OrderStatus.OPEN, 0, 20).getTotalItems());
        assertEquals(3, persistence.findRequestedBy("requester", null, 0, 20).getTotalItems());
        assertTrue(orders.findById(hidden.getId()).isPresent());
    }

    @Test
    void courierFiltersKeepAbortedAttemptsAndCurrentOrdersSeparatelyBeforePaging() {
        for (int index = 0; index < 3; index++) {
            Order order = accepted("courier", START.plusSeconds(index * 10));
            persistence.saveAbortedAttempt(new OrderCourierAttempt(order, "courier", order.getVersion(),
                    START.plusSeconds(index * 10 + 2)));
            order.reopenAfterAcceptedCancellation("courier", order.getVersion(), START.plusSeconds(index * 10 + 2));
            orders.saveAndFlush(order);
        }
        Order current = accepted("courier", START.plusSeconds(100));
        accepted("other", START.plusSeconds(110));

        OrderPage first = persistence.findCourierOrders("courier", OrderStatus.ABORTED, 0, 2);
        OrderPage second = persistence.findCourierOrders("courier", OrderStatus.ABORTED, 1, 2);
        assertEquals(3, first.getTotalItems());
        assertEquals(2, first.getTotalPages());
        assertEquals(2, first.getItems().size());
        assertEquals(1, second.getItems().size());
        assertTrue(first.getItems().stream().allMatch(order -> order.getStatus() == OrderStatus.ABORTED
                && order.getAttemptId() != null && order.getCourierId().equals("courier")));
        assertEquals(current.getId(), persistence.findCourierOrders("courier", OrderStatus.ACCEPTED, 0, 20)
                .getItems().getFirst().getId());
        assertEquals(4, persistence.findCourierOrders("courier", null, 0, 20).getTotalItems());
        assertEquals(0, persistence.findCourierOrders("courier", OrderStatus.OPEN, 0, 20).getTotalItems());
    }

    @Test
    void emptyFilteredListsDoNotLeakAnotherUsersRowsOrCounts() {
        accepted("other", START);
        orders.saveAndFlush(expired("other", START.plusSeconds(5)));
        assertEquals(0, persistence.findRequestedBy("requester", OrderStatus.EXPIRED, 0, 20).getTotalItems());
        assertEquals(0, persistence.findCourierOrders("courier", OrderStatus.ACCEPTED, 0, 20).getTotalItems());
    }

    private Order accepted(String courier, Instant createdAt) {
        Order order = Order.open("requester", "item", "pickup", "delivery", 3, 30,
                createdAt, createdAt.plusSeconds(3600));
        order.accept(courier, 0, createdAt.plusSeconds(1));
        return orders.saveAndFlush(order);
    }

    private Order expired(String requester, Instant createdAt) {
        Order order = Order.open(requester, "item", "pickup", "delivery", 3, 30,
                createdAt, createdAt.plusSeconds(3600));
        order.expire(0, createdAt.plusSeconds(3600));
        return order;
    }

    @DynamicPropertySource
    static void datasourceProperties(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        properties.add("spring.datasource.username", POSTGRES::getUsername);
        properties.add("spring.datasource.password", POSTGRES::getPassword);
    }
}
