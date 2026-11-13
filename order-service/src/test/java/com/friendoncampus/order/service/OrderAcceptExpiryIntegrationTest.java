package com.friendoncampus.order.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import com.friendoncampus.order.domain.Order;
import com.friendoncampus.order.domain.OrderErrorCode;
import com.friendoncampus.order.domain.OrderState;
import com.friendoncampus.order.domain.OrderTransitionException;
import com.friendoncampus.order.domain.TerminalReason;
import com.friendoncampus.order.messaging.OutboxEvent;
import com.friendoncampus.order.repository.OutboxEventRepository;
import com.friendoncampus.order.support.MutableClock;

/**
 * Phase 2 against a real PostgreSQL: acceptance races, lazy and scheduled expiry, and withdrawal
 * either side of the deadline. Race tests run real concurrent transactions. Requires Docker.
 */
@SpringBootTest(properties = {"app.orders.expiry.enabled=false", "app.kafka.enabled=false"})
@Testcontainers
class OrderAcceptExpiryIntegrationTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    private static final UUID REQUESTER = UUID.fromString("97947588-bb2e-42f2-91ba-9abf8e15a8e7");
    private static final MutableClock CLOCK = new MutableClock(Instant.now());

    @TestConfiguration
    static class TestClock {
        @Bean
        @Primary
        MutableClock testClock() {
            return CLOCK;
        }
    }

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @Autowired
    private OrderService orderService;

    @Autowired
    private OrderExpiryScheduler expiryScheduler;

    @Autowired
    private OutboxEventRepository outboxEventRepository;

    @Autowired
    private JdbcTemplate jdbc;

    @BeforeEach
    void resetClock() {
        // Created rows are stamped with real time, so keep the test clock at real time too. The
        // sub-microsecond part mimics Linux clocks (nanoseconds), which PostgreSQL cannot store, so
        // deadline-boundary tests behave the same on every machine.
        CLOCK.set(Instant.now().truncatedTo(ChronoUnit.MICROS).plusNanos(700));
    }

    /** Creates an order and opens it, with the deadline {@code untilDeadline} from now. */
    private UUID openOrder(Duration untilDeadline) {
        OffsetDateTime deadline = OffsetDateTime.ofInstant(CLOCK.instant(), ZoneOffset.UTC).plus(untilDeadline);
        UUID orderId = orderService.createOrder(new CreateOrderCommand(REQUESTER, "Collect printing",
                "Grab my printout", UUID.randomUUID(), "COM1 Print Shop", UUID.randomUUID(), "UTown Residence", 10, deadline)).getId();
        orderService.confirmReservation(orderId, UUID.randomUUID());
        return orderId;
    }

    private List<String> eventTypes(UUID orderId) {
        return outboxEventRepository.findByAggregateIdOrderByAggregateVersionAsc(orderId).stream()
                .map(OutboxEvent::getEventType)
                .toList();
    }

    private List<String> history(UUID orderId) {
        return jdbc.queryForList("select action from order_transitions where order_id = ? order by order_version",
                String.class, orderId);
    }

    private Order reload(UUID orderId) {
        return orderService.getOrder(orderId, REQUESTER);
    }

    @Test
    void whenManyCouriersAcceptAtOnceExactlyOneWins() throws Exception {
        UUID orderId = openOrder(Duration.ofHours(1));
        int couriers = 8;
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(couriers);
        List<Future<OrderErrorCode>> results = new ArrayList<>();
        List<UUID> courierIds = new ArrayList<>();
        for (int i = 0; i < couriers; i++) {
            UUID courier = UUID.randomUUID();
            courierIds.add(courier);
            results.add(pool.submit((Callable<OrderErrorCode>) () -> {
                start.await();
                try {
                    orderService.accept(orderId, courier);
                    return null;
                } catch (OrderTransitionException exception) {
                    return exception.getCode();
                }
            }));
        }
        start.countDown();
        List<OrderErrorCode> outcomes = new ArrayList<>();
        for (Future<OrderErrorCode> result : results) {
            outcomes.add(result.get());
        }
        pool.shutdown();

        assertThat(outcomes.stream().filter(code -> code == null)).hasSize(1);
        assertThat(outcomes.stream().filter(code -> code != null))
                .hasSize(couriers - 1)
                .allMatch(code -> code == OrderErrorCode.ORDER_ALREADY_ACCEPTED);
        Order accepted = reload(orderId);
        assertThat(accepted.getState()).isEqualTo(OrderState.ACCEPTED);
        assertThat(courierIds).contains(accepted.getCourierId());
        assertThat(history(orderId)).containsOnlyOnce("ACCEPT");
    }

    @Test
    void acceptanceRacingTheExpiryJobAtTheDeadlineHasOneOutcome() throws Exception {
        UUID orderId = openOrder(Duration.ofMinutes(5));
        UUID courier = UUID.randomUUID();
        CLOCK.advance(Duration.ofMinutes(5));
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        Future<OrderErrorCode> accept = pool.submit(() -> {
            start.await();
            try {
                orderService.accept(orderId, courier);
                return null;
            } catch (OrderTransitionException exception) {
                return exception.getCode();
            }
        });
        Future<?> expire = pool.submit(() -> {
            start.await();
            orderService.expireIfStillOverdue(orderId);
            return null;
        });
        start.countDown();
        OrderErrorCode acceptOutcome = accept.get();
        expire.get();
        pool.shutdown();

        // At the deadline the order can only expire; the courier is told why.
        assertThat(acceptOutcome).isEqualTo(OrderErrorCode.ORDER_EXPIRED);
        assertThat(reload(orderId).getState()).isEqualTo(OrderState.EXPIRED);
        assertThat(history(orderId)).containsOnlyOnce("EXPIRE").doesNotContain("ACCEPT");
        assertThat(eventTypes(orderId)).containsOnlyOnce("OrderExpired");
    }

    @Test
    void acceptingAnOverdueOrderExpiresItAndTheExpiryIsKept() {
        UUID orderId = openOrder(Duration.ofMinutes(5));
        CLOCK.advance(Duration.ofMinutes(5));

        assertThatThrownBy(() -> orderService.accept(orderId, UUID.randomUUID()))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.ORDER_EXPIRED));

        Order order = reload(orderId);
        assertThat(order.getState()).isEqualTo(OrderState.EXPIRED);
        assertThat(order.getCourierId()).isNull();
        assertThat(history(orderId)).containsExactly("SUBMIT", "OPEN", "EXPIRE");
        assertThat(eventTypes(orderId)).containsExactly("OrderSubmitted", "OrderExpired");
    }

    @Test
    void cancellingAnOverdueOpenOrderExpiresItInstead() {
        UUID orderId = openOrder(Duration.ofMinutes(5));
        CLOCK.advance(Duration.ofMinutes(6));

        assertThatThrownBy(() -> orderService.cancel(orderId, REQUESTER))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.ORDER_EXPIRED));

        assertThat(reload(orderId).getTerminalReason()).isEqualTo(TerminalReason.PICKUP_DEADLINE_PASSED);
    }

    @Test
    void theExpiryJobExpiresOverdueOpenOrdersButNotAcceptedOnes() {
        UUID overdue = openOrder(Duration.ofMinutes(5));
        UUID accepted = openOrder(Duration.ofMinutes(5));
        UUID notYetDue = openOrder(Duration.ofHours(2));
        orderService.accept(accepted, UUID.randomUUID());
        CLOCK.advance(Duration.ofMinutes(5));

        expiryScheduler.expireOverdueOrders();
        expiryScheduler.expireOverdueOrders();

        assertThat(reload(overdue).getState()).isEqualTo(OrderState.EXPIRED);
        assertThat(reload(accepted).getState()).isEqualTo(OrderState.ACCEPTED);
        assertThat(reload(notYetDue).getState()).isEqualTo(OrderState.OPEN);
        assertThat(eventTypes(overdue)).containsOnlyOnce("OrderExpired");
    }

    @Test
    void withdrawingBeforeTheDeadlineReopensForOtherCouriers() {
        UUID orderId = openOrder(Duration.ofHours(1));
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        orderService.accept(orderId, first);

        assertThat(orderService.withdraw(orderId, first).getState()).isEqualTo(OrderState.OPEN);
        assertThat(orderService.accept(orderId, second).getCourierId()).isEqualTo(second);
        assertThat(history(orderId)).containsSubsequence("ACCEPT", "WITHDRAW", "ACCEPT");
        // Accepting and reopening change no credits, so nothing is published for them.
        assertThat(eventTypes(orderId)).containsExactly("OrderSubmitted");
    }

    @Test
    void withdrawingAfterTheDeadlineExpiresTheOrder() {
        UUID orderId = openOrder(Duration.ofMinutes(5));
        UUID courier = UUID.randomUUID();
        orderService.accept(orderId, courier);
        CLOCK.advance(Duration.ofMinutes(10));

        Order order = orderService.withdraw(orderId, courier);

        assertThat(order.getState()).isEqualTo(OrderState.EXPIRED);
        assertThat(order.getTerminalReason()).isEqualTo(TerminalReason.COURIER_WITHDREW_AFTER_DEADLINE);
        assertThat(eventTypes(orderId)).endsWith("OrderExpired");
        OutboxEvent expired = outboxEventRepository.findByAggregateIdOrderByAggregateVersionAsc(orderId).stream()
                .filter(event -> event.getEventType().equals("OrderExpired")).findFirst().orElseThrow();
        tools.jackson.databind.JsonNode data = tools.jackson.databind.json.JsonMapper.builder().build()
                .readTree(expired.getPayload()).get("data");
        // Exactly the blueprint's OrderExpired fields.
        assertThat(data.propertyNames()).containsExactlyInAnyOrder("operationId", "orderId", "reason", "expiredAt");
        assertThat(data.get("reason").asString()).isEqualTo("COURIER_WITHDREW_AFTER_DEADLINE");
        assertThat(data.get("expiredAt").asString()).endsWith("Z");
    }

    @Test
    void repeatedAcceptAndWithdrawRequestsRecordNothingNew() {
        UUID orderId = openOrder(Duration.ofHours(1));
        UUID courier = UUID.randomUUID();
        orderService.accept(orderId, courier);
        orderService.accept(orderId, courier);
        orderService.withdraw(orderId, courier);
        orderService.withdraw(orderId, courier);

        assertThat(history(orderId)).containsExactly("SUBMIT", "OPEN", "ACCEPT", "WITHDRAW");
        assertThat(eventTypes(orderId)).containsExactly("OrderSubmitted");
        assertThat(jdbc.queryForObject("select count(*) from order_transitions where order_id = ?",
                Integer.class, orderId)).isEqualTo(4);
    }

    @Test
    void aCourierCannotAcceptAnOrderThatNeverReachedThePool() {
        OffsetDateTime deadline = OffsetDateTime.ofInstant(CLOCK.instant(), ZoneOffset.UTC).plusHours(1);
        UUID pending = orderService.createOrder(new CreateOrderCommand(REQUESTER, "t", "d",
                UUID.randomUUID(), "COM1 Print Shop", UUID.randomUUID(), "UTown Residence", 5, deadline)).getId();

        assertThatThrownBy(() -> orderService.accept(pending, UUID.randomUUID()))
                .isInstanceOf(OrderNotFoundException.class);
    }
}
