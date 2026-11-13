package com.friendoncampus.order.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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

import com.friendoncampus.order.domain.OrderDetails;
import com.friendoncampus.order.domain.OrderErrorCode;
import com.friendoncampus.order.support.MutableClock;

/**
 * Idempotent order creation against a real PostgreSQL (V5): a retried create with the same
 * {@code Idempotency-Key} returns the first order and writes no second order, history row or
 * {@code OrderSubmitted}, including when the retries race. Requires Docker.
 */
@SpringBootTest(properties = {"app.orders.expiry.enabled=false", "app.kafka.enabled=false"})
@Testcontainers
class OrderCreateIdempotencyIntegrationTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

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
    private JdbcTemplate jdbc;

    private UUID requester;
    private UUID pickup;
    private UUID dropoff;
    private OffsetDateTime deadline;

    @BeforeEach
    void setUp() {
        CLOCK.set(Instant.now().truncatedTo(ChronoUnit.MICROS));
        // A fresh requester per test keeps the counts below independent of other tests' rows.
        requester = UUID.randomUUID();
        pickup = UUID.randomUUID();
        dropoff = UUID.randomUUID();
        deadline = OffsetDateTime.ofInstant(CLOCK.instant(), ZoneOffset.UTC).plusHours(2);
    }

    private CreateOrderCommand command(int reward) {
        return command(requester, reward);
    }

    private CreateOrderCommand command(UUID requesterId, int reward) {
        return new CreateOrderCommand(requesterId, "Collect printing", "Grab my printout", pickup,
                "COM1 Print Shop", dropoff, "UTown Residence", reward, deadline);
    }

    private int ordersOf(UUID requesterId) {
        return jdbc.queryForObject("select count(*) from orders where requester_id = ?", Integer.class, requesterId);
    }

    private int submittedEventsOf(UUID requesterId) {
        return jdbc.queryForObject("select count(*) from outbox_events e join orders o on o.id = e.aggregate_id"
                + " where o.requester_id = ? and e.event_type = 'OrderSubmitted'", Integer.class, requesterId);
    }

    private int submitTransitionsOf(UUID requesterId) {
        return jdbc.queryForObject("select count(*) from order_transitions t join orders o on o.id = t.order_id"
                + " where o.requester_id = ? and t.action = 'SUBMIT'", Integer.class, requesterId);
    }

    @Test
    void aRetryWithTheSameKeyReturnsTheFirstOrderAndWritesNothing() {
        CreateOrderResult first = orderService.createOrder(command(10), "retry-key-1");
        CreateOrderResult retry = orderService.createOrder(command(10), "retry-key-1");

        assertThat(first.replayed()).isFalse();
        assertThat(retry.replayed()).isTrue();
        assertThat(retry.order().getId()).isEqualTo(first.order().getId());
        assertThat(ordersOf(requester)).isEqualTo(1);
        assertThat(submittedEventsOf(requester)).isEqualTo(1);
        assertThat(submitTransitionsOf(requester)).isEqualTo(1);
    }

    @Test
    void theSameKeyWithADifferentRequestIsRejectedAndWritesNothing() {
        orderService.createOrder(command(10), "retry-key-2");

        assertThatThrownBy(() -> orderService.createOrder(command(11), "retry-key-2"))
                .isInstanceOfSatisfying(IdempotencyKeyException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.IDEMPOTENCY_KEY_REUSED));
        assertThat(ordersOf(requester)).isEqualTo(1);
        assertThat(submittedEventsOf(requester)).isEqualTo(1);
    }

    @Test
    void theSameDeadlineSentWithAnotherOffsetIsStillARetry() {
        CreateOrderResult first = orderService.createOrder(command(10), "retry-key-3");
        CreateOrderCommand sameMomentInSingapore = new CreateOrderCommand(requester, "Collect printing",
                "Grab my printout", pickup, "COM1 Print Shop", dropoff, "UTown Residence", 10,
                deadline.withOffsetSameInstant(ZoneOffset.ofHours(8)));

        CreateOrderResult retry = orderService.createOrder(sameMomentInSingapore, "retry-key-3");

        assertThat(retry.replayed()).isTrue();
        assertThat(retry.order().getId()).isEqualTo(first.order().getId());
    }

    @Test
    void aLateRetryStillMatchesAfterTheOrderWasEdited() {
        CreateOrderResult first = orderService.createOrder(command(10), "retry-key-4");
        UUID orderId = first.order().getId();
        orderService.confirmReservation(orderId, UUID.randomUUID());
        long version = orderService.getOrder(orderId, requester).getVersion();
        orderService.edit(orderId, requester, version, new OrderDetails("Collect two printouts",
                "Grab my printout", pickup, "COM1 Print Shop", dropoff, "UTown Residence", 10, deadline));

        CreateOrderResult retry = orderService.createOrder(command(10), "retry-key-4");

        assertThat(retry.replayed()).isTrue();
        assertThat(retry.order().getId()).isEqualTo(orderId);
        assertThat(retry.order().getTitle()).isEqualTo("Collect two printouts");
        assertThat(ordersOf(requester)).isEqualTo(1);
    }

    @Test
    void keysAreScopedToTheRequester() {
        UUID otherRequester = UUID.randomUUID();

        CreateOrderResult mine = orderService.createOrder(command(10), "shared-key");
        CreateOrderResult theirs = orderService.createOrder(command(otherRequester, 10), "shared-key");

        assertThat(theirs.replayed()).isFalse();
        assertThat(theirs.order().getId()).isNotEqualTo(mine.order().getId());
        assertThat(ordersOf(requester)).isEqualTo(1);
        assertThat(ordersOf(otherRequester)).isEqualTo(1);
    }

    @Test
    void withoutAKeyEveryRequestCreatesAnOrder() {
        orderService.createOrder(command(10), null);
        orderService.createOrder(command(10), null);

        assertThat(ordersOf(requester)).isEqualTo(2);
        assertThat(submittedEventsOf(requester)).isEqualTo(2);
    }

    @Test
    void concurrentRetriesWithOneKeyCreateExactlyOneOrder() throws Exception {
        int attempts = 6;
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(attempts);
        List<Future<CreateOrderResult>> results = new ArrayList<>();
        for (int i = 0; i < attempts; i++) {
            results.add(pool.submit((Callable<CreateOrderResult>) () -> {
                start.await();
                return orderService.createOrder(command(10), "double-click");
            }));
        }
        start.countDown();
        List<CreateOrderResult> outcomes = new ArrayList<>();
        for (Future<CreateOrderResult> result : results) {
            outcomes.add(result.get());
        }
        pool.shutdown();

        assertThat(outcomes.stream().filter(result -> !result.replayed())).hasSize(1);
        assertThat(outcomes.stream().map(result -> result.order().getId()).distinct()).hasSize(1);
        assertThat(ordersOf(requester)).isEqualTo(1);
        assertThat(submittedEventsOf(requester)).isEqualTo(1);
        assertThat(submitTransitionsOf(requester)).isEqualTo(1);
    }
}
