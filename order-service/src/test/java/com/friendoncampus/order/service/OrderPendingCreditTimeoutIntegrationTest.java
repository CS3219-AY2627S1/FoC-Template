package com.friendoncampus.order.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
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
import com.friendoncampus.order.domain.OrderState;
import com.friendoncampus.order.domain.TerminalReason;
import com.friendoncampus.order.messaging.CreditOutcomeHandler;
import com.friendoncampus.order.messaging.CreditOutcomeHandler.Outcome;
import com.friendoncampus.order.messaging.OutboxEvent;
import com.friendoncampus.order.repository.OutboxEventRepository;
import com.friendoncampus.order.support.MutableClock;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Blueprint "pending-credit timeout", Order side, against a real PostgreSQL: a PENDING_CREDIT order
 * Credit does not answer expires once at {@code min(pickupDeadline, createdAt + T)} with
 * {@code CREDIT_RESERVATION_TIMEOUT} and one {@code OrderExpired}; late Credit answers are IGNORED
 * and never reopen it; a timeout racing {@code CreditReserved} has one winner. T is the default
 * two minutes. Requires Docker.
 */
@SpringBootTest(properties = {"app.orders.expiry.enabled=false", "app.kafka.enabled=false"})
@Testcontainers
class OrderPendingCreditTimeoutIntegrationTest {

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
    private CreditOutcomeHandler creditOutcomeHandler;

    @Autowired
    private OutboxEventRepository outboxEventRepository;

    @Autowired
    private JdbcTemplate jdbc;

    private final JsonMapper json = JsonMapper.builder().build();

    @BeforeEach
    void resetClock() {
        CLOCK.set(Instant.now().truncatedTo(ChronoUnit.MICROS));
    }

    private UUID submit(Duration untilDeadline) {
        OffsetDateTime deadline = OffsetDateTime.ofInstant(CLOCK.instant(), ZoneOffset.UTC).plus(untilDeadline);
        return orderService.createOrder(new CreateOrderCommand(REQUESTER, "Collect printing", "Grab my printout",
                UUID.randomUUID(), "COM1 Print Shop", UUID.randomUUID(), "UTown Residence", 10, deadline)).getId();
    }

    private Order reload(UUID orderId) {
        return orderService.getOrder(orderId, REQUESTER);
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

    private JsonNode published(UUID orderId, String eventType) {
        return json.readTree(outboxEventRepository.findByAggregateIdOrderByAggregateVersionAsc(orderId).stream()
                .filter(event -> event.getEventType().equals(eventType))
                .findFirst()
                .orElseThrow()
                .getPayload());
    }

    /** A blueprint Credit outcome answering the order's OrderSubmitted. */
    private String answerToSubmission(UUID orderId, String eventType, Map<String, Object> extraData) {
        JsonNode submitted = published(orderId, "OrderSubmitted");
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("operationId", submitted.get("data").get("operationId").asString());
        data.put("orderId", orderId.toString());
        data.putAll(extraData);
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("eventId", UUID.randomUUID().toString());
        envelope.put("eventType", eventType);
        envelope.put("eventVersion", 1);
        envelope.put("aggregateType", "Order");
        envelope.put("aggregateId", orderId.toString());
        envelope.put("aggregateVersion", submitted.get("aggregateVersion").asLong());
        envelope.put("occurredAt", "2026-11-09T10:00:00Z");
        envelope.put("producer", "credit-service");
        envelope.put("correlationId", submitted.get("correlationId").asString());
        envelope.put("causationId", submitted.get("eventId").asString());
        envelope.put("actor", Map.of("type", "SYSTEM"));
        envelope.put("data", data);
        return json.writeValueAsString(envelope);
    }

    private String creditReserved(UUID orderId) {
        return answerToSubmission(orderId, "CreditReserved", Map.of("reservationId", UUID.randomUUID().toString(),
                "amount", 10, "availableBalance", 0, "reservedBalance", 10));
    }

    private String creditReservationRejected(UUID orderId) {
        return answerToSubmission(orderId, "CreditReservationRejected", Map.of("reasonCode", "INSUFFICIENT_CREDITS"));
    }

    private String inboxOutcome(String event) {
        return jdbc.queryForObject("select outcome from processed_events where event_id = ?::uuid", String.class,
                json.readTree(event).get("eventId").asString());
    }

    @Test
    void anUnansweredOrderExpiresOnceAtTheTimeoutWithOneOrderExpired() {
        UUID orderId = submit(Duration.ofHours(2));

        CLOCK.advance(Duration.ofMinutes(2).minusNanos(1_000));
        expiryScheduler.expireOverdueOrders();
        assertThat(reload(orderId).getState()).isEqualTo(OrderState.PENDING_CREDIT);

        CLOCK.advance(Duration.ofNanos(1_000));
        expiryScheduler.expireOverdueOrders();
        expiryScheduler.expireOverdueOrders();

        Order order = reload(orderId);
        assertThat(order.getState()).isEqualTo(OrderState.EXPIRED);
        assertThat(order.getTerminalReason()).isEqualTo(TerminalReason.CREDIT_RESERVATION_TIMEOUT);
        assertThat(history(orderId)).containsExactly("SUBMIT", "EXPIRE");
        assertThat(eventTypes(orderId)).containsExactly("OrderSubmitted", "OrderExpired");
        JsonNode expired = published(orderId, "OrderExpired");
        assertThat(expired.get("eventVersion").asInt()).isEqualTo(1);
        assertThat(expired.get("actor").get("type").asString()).isEqualTo("SYSTEM");
        assertThat(expired.get("data").get("reason").asString()).isEqualTo("CREDIT_RESERVATION_TIMEOUT");
        assertThat(expired.get("data").get("operationId").asString())
                .isNotEqualTo(published(orderId, "OrderSubmitted").get("data").get("operationId").asString());
    }

    @Test
    void creationIsStampedFromTheServiceClockSoTheTimeoutUsesOneClock() {
        CLOCK.set(Instant.now().minus(Duration.ofDays(3)).truncatedTo(ChronoUnit.MICROS));
        UUID orderId = submit(Duration.ofDays(4));

        assertThat(reload(orderId).getCreatedAt().toInstant()).isEqualTo(CLOCK.instant());
        // Three days "ago" by the JVM clock, but only now by the service clock: not timed out yet.
        expiryScheduler.expireOverdueOrders();
        assertThat(reload(orderId).getState()).isEqualTo(OrderState.PENDING_CREDIT);
    }

    @Test
    void aDeadlineSoonerThanTheTimeoutEndsTheWaitAtTheDeadline() {
        UUID orderId = submit(Duration.ofMinutes(1));

        CLOCK.advance(Duration.ofMinutes(1));
        expiryScheduler.expireOverdueOrders();

        assertThat(reload(orderId).getTerminalReason()).isEqualTo(TerminalReason.CREDIT_RESERVATION_TIMEOUT);
    }

    @Test
    void aDelayedCreditReservedAfterTheTimeoutIsIgnoredAndDoesNotReopen() {
        UUID orderId = submit(Duration.ofHours(2));
        CLOCK.advance(Duration.ofMinutes(2));
        expiryScheduler.expireOverdueOrders();

        String late = creditReserved(orderId);
        assertThat(creditOutcomeHandler.handle(late)).isEqualTo(Outcome.IGNORED);
        // A redelivery is a duplicate, not a second IGNORED record.
        assertThat(creditOutcomeHandler.handle(late)).isEqualTo(Outcome.DUPLICATE);

        Order order = reload(orderId);
        assertThat(order.getState()).isEqualTo(OrderState.EXPIRED);
        assertThat(order.getCreditReservationId()).isNull();
        assertThat(inboxOutcome(late)).isEqualTo("IGNORED");
        assertThat(history(orderId)).containsExactly("SUBMIT", "EXPIRE");
        assertThat(eventTypes(orderId)).containsExactly("OrderSubmitted", "OrderExpired");
    }

    @Test
    void aDelayedRejectionAfterTheTimeoutIsIgnored() {
        UUID orderId = submit(Duration.ofHours(2));
        CLOCK.advance(Duration.ofMinutes(2));
        expiryScheduler.expireOverdueOrders();

        String late = creditReservationRejected(orderId);
        assertThat(creditOutcomeHandler.handle(late)).isEqualTo(Outcome.IGNORED);

        Order order = reload(orderId);
        assertThat(order.getState()).isEqualTo(OrderState.EXPIRED);
        assertThat(order.getTerminalReason()).isEqualTo(TerminalReason.CREDIT_RESERVATION_TIMEOUT);
        assertThat(history(orderId)).containsExactly("SUBMIT", "EXPIRE");
    }

    @Test
    void anOrderCreditAnsweredInTimeIsNeverTimedOut() {
        UUID orderId = submit(Duration.ofHours(2));
        assertThat(creditOutcomeHandler.handle(creditReserved(orderId))).isEqualTo(Outcome.APPLIED);

        CLOCK.advance(Duration.ofMinutes(5));
        expiryScheduler.expireOverdueOrders();

        assertThat(reload(orderId).getState()).isEqualTo(OrderState.OPEN);
        assertThat(eventTypes(orderId)).containsExactly("OrderSubmitted");
    }

    @Test
    void aTimeoutRacingCreditReservedHasOneWinnerAndNeverReopens() throws Exception {
        for (int round = 0; round < 5; round++) {
            UUID orderId = submit(Duration.ofHours(2));
            String reserved = creditReserved(orderId);
            CLOCK.advance(Duration.ofMinutes(2));
            CountDownLatch start = new CountDownLatch(1);
            ExecutorService pool = Executors.newFixedThreadPool(2);
            Future<Boolean> timeout = pool.submit(() -> {
                start.await();
                return orderService.timeOutPendingCreditIfDue(orderId);
            });
            Future<Outcome> answer = pool.submit(() -> {
                start.await();
                return creditOutcomeHandler.handle(reserved);
            });
            start.countDown();
            boolean timedOut = timeout.get();
            Outcome outcome = answer.get();
            pool.shutdown();
            CLOCK.set(Instant.now().truncatedTo(ChronoUnit.MICROS));

            Order order = reload(orderId);
            if (timedOut) {
                assertThat(outcome).as("round %d", round).isEqualTo(Outcome.IGNORED);
                assertThat(order.getState()).isEqualTo(OrderState.EXPIRED);
                assertThat(eventTypes(orderId)).containsExactly("OrderSubmitted", "OrderExpired");
            } else {
                // Credit's answer locked first and the deadline is two hours away: the order opens.
                assertThat(outcome).as("round %d", round).isEqualTo(Outcome.APPLIED);
                assertThat(order.getState()).isEqualTo(OrderState.OPEN);
                assertThat(eventTypes(orderId)).containsExactly("OrderSubmitted");
            }
            assertThat(history(orderId)).as("round %d", round).hasSize(2);
        }
    }
}
