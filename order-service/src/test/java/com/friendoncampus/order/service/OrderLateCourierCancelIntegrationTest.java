package com.friendoncampus.order.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
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

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Free cancellation once the courier is late, against a real PostgreSQL: cancelling an ACCEPTED
 * order at or after its pickup deadline publishes an {@code OrderCancelled} that Credit releases in
 * full ({@code compensationRequired=false}, no courier); before the deadline the courier is still
 * compensated. A late pickup racing the cancel has one winner. Requires Docker.
 */
@SpringBootTest(properties = {"app.orders.expiry.enabled=false", "app.kafka.enabled=false",
        "app.orders.credit-reconciliation.enabled=false"})
@Testcontainers
class OrderLateCourierCancelIntegrationTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    private static final UUID REQUESTER = UUID.fromString("97947588-bb2e-42f2-91ba-9abf8e15a8e7");
    private static final UUID COURIER = UUID.fromString("5b0f3c1e-8a52-4f8e-9d37-2c1b6e4a7f10");
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
    private OutboxEventRepository outboxEventRepository;

    @Autowired
    private JdbcTemplate jdbc;

    private final JsonMapper json = JsonMapper.builder().build();

    @BeforeEach
    void resetClock() {
        CLOCK.set(Instant.now().truncatedTo(ChronoUnit.MICROS));
    }

    /** An order accepted by COURIER whose pickup deadline is {@code untilDeadline} from now. */
    private UUID acceptedOrder(Duration untilDeadline) {
        OffsetDateTime deadline = OffsetDateTime.ofInstant(CLOCK.instant(), ZoneOffset.UTC).plus(untilDeadline);
        UUID orderId = orderService.createOrder(new CreateOrderCommand(REQUESTER, "Collect printing",
                "Grab my printout", UUID.randomUUID(), "COM1 Print Shop", UUID.randomUUID(), "UTown Residence", 10,
                deadline)).getId();
        orderService.confirmReservation(orderId, UUID.randomUUID());
        orderService.accept(orderId, COURIER);
        return orderId;
    }

    private JsonNode cancelledData(UUID orderId) {
        OutboxEvent cancelled = outboxEventRepository.findByAggregateIdOrderByAggregateVersionAsc(orderId).stream()
                .filter(event -> event.getEventType().equals("OrderCancelled"))
                .reduce((first, second) -> second)
                .orElseThrow();
        return json.readTree(cancelled.getPayload()).get("data");
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

    @Test
    void cancellingOnceTheCourierIsLateAsksCreditForAFullRelease() {
        UUID orderId = acceptedOrder(Duration.ofMinutes(30));
        CLOCK.advance(Duration.ofMinutes(30));

        Order cancelled = orderService.cancel(orderId, REQUESTER);

        assertThat(cancelled.getState()).isEqualTo(OrderState.CANCELLED);
        assertThat(cancelled.getCourierId()).isNull();
        assertThat(cancelled.getTerminalReason()).isEqualTo(TerminalReason.REQUESTER_CANCELLED_COURIER_LATE);
        JsonNode data = cancelledData(orderId);
        assertThat(data.get("compensationRequired").asBoolean()).isFalse();
        assertThat(data.get("courierId").isNull()).isTrue();
        assertThat(data.get("reason").asString()).isEqualTo("REQUESTER_CANCELLED_COURIER_LATE");
        // The courier keeps seeing the errand they were removed from.
        assertThat(orderService.getHistory(orderId, REQUESTER)).hasSize(4);
    }

    @Test
    void cancellingBeforeTheDeadlineStillCompensatesTheCourier() {
        UUID orderId = acceptedOrder(Duration.ofMinutes(30));
        CLOCK.advance(Duration.ofMinutes(30).minusNanos(1_000));

        orderService.cancel(orderId, REQUESTER);

        JsonNode data = cancelledData(orderId);
        assertThat(data.get("compensationRequired").asBoolean()).isTrue();
        assertThat(data.get("courierId").asString()).isEqualTo(COURIER.toString());
        assertThat(data.get("reason").asString()).isEqualTo("REQUESTER_CANCELLED_ACCEPTED");
    }

    @Test
    void aRepeatedLateCancelRecordsNothingMore() {
        UUID orderId = acceptedOrder(Duration.ofMinutes(5));
        CLOCK.advance(Duration.ofMinutes(10));

        orderService.cancel(orderId, REQUESTER);
        orderService.cancel(orderId, REQUESTER);

        assertThat(eventTypes(orderId)).containsExactly("OrderSubmitted", "OrderCancelled");
        assertThat(history(orderId)).containsExactly("SUBMIT", "OPEN", "ACCEPT", "CANCEL");
    }

    @Test
    void aLatePickupIsStillAllowedBeforeTheRequesterCancels() {
        UUID orderId = acceptedOrder(Duration.ofMinutes(5));
        CLOCK.advance(Duration.ofMinutes(10));

        assertThat(orderService.pickUp(orderId, COURIER).getState()).isEqualTo(OrderState.PICKED_UP);
    }

    @Test
    void aLatePickupRacingTheCancelHasOneWinner() throws Exception {
        for (int round = 0; round < 5; round++) {
            UUID orderId = acceptedOrder(Duration.ofMinutes(5));
            CLOCK.advance(Duration.ofMinutes(10));
            CountDownLatch start = new CountDownLatch(1);
            ExecutorService pool = Executors.newFixedThreadPool(2);
            Future<OrderErrorCode> cancel = pool.submit(attempt(start, () -> orderService.cancel(orderId, REQUESTER)));
            Future<OrderErrorCode> pickUp = pool.submit(attempt(start, () -> orderService.pickUp(orderId, COURIER)));
            start.countDown();
            OrderErrorCode cancelOutcome = cancel.get();
            OrderErrorCode pickUpOutcome = pickUp.get();
            pool.shutdown();
            CLOCK.set(Instant.now().truncatedTo(ChronoUnit.MICROS));

            Order order = orderService.getOrder(orderId, REQUESTER);
            if (cancelOutcome == null) {
                // The cancel cleared the courier, so the errand is no longer theirs to see (404).
                assertThat(pickUpOutcome).as("round %d", round).isEqualTo(OrderErrorCode.ORDER_NOT_FOUND);
                assertThat(order.getState()).isEqualTo(OrderState.CANCELLED);
                assertThat(eventTypes(orderId)).containsExactly("OrderSubmitted", "OrderCancelled");
            } else {
                assertThat(cancelOutcome).as("round %d", round).isEqualTo(OrderErrorCode.CANCELLATION_NOT_ALLOWED);
                assertThat(pickUpOutcome).isNull();
                assertThat(order.getState()).isEqualTo(OrderState.PICKED_UP);
                assertThat(eventTypes(orderId)).containsExactly("OrderSubmitted");
            }
        }
    }

    private static Callable<OrderErrorCode> attempt(CountDownLatch start, Runnable action) {
        return () -> {
            start.await();
            try {
                action.run();
                return null;
            } catch (OrderTransitionException exception) {
                return exception.getCode();
            } catch (OrderNotFoundException exception) {
                return OrderErrorCode.ORDER_NOT_FOUND;
            }
        };
    }
}
