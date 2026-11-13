package com.friendoncampus.order.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
import com.friendoncampus.order.domain.OrderDetails;
import com.friendoncampus.order.domain.OrderErrorCode;
import com.friendoncampus.order.domain.OrderState;
import com.friendoncampus.order.domain.OrderTransitionException;
import com.friendoncampus.order.messaging.CreditOutcomeHandler;
import com.friendoncampus.order.messaging.CreditOutcomeHandler.Outcome;
import com.friendoncampus.order.messaging.CreditOutcomeRejectedException;
import com.friendoncampus.order.messaging.OutboxEvent;
import com.friendoncampus.order.repository.OutboxEventRepository;
import com.friendoncampus.order.support.MutableClock;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Editing an OPEN order (T4) and changing its reward through Credit (T5, T5a, T5b) against a real
 * PostgreSQL, with Credit outcomes shaped as the event communication blueprint defines them.
 * Requires Docker.
 */
@SpringBootTest(properties = {"app.orders.expiry.enabled=false", "app.kafka.enabled=false"})
@Testcontainers
class OrderEditRewardIntegrationTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    private static final UUID REQUESTER = UUID.fromString("97947588-bb2e-42f2-91ba-9abf8e15a8e7");
    private static final UUID COURIER = UUID.fromString("5b0f3c1e-8a52-4f8e-9d37-2c1b6e4a7f10");
    private static final UUID PICKUP = UUID.fromString("9fd58f13-c8d5-4320-b757-7893d69a4ae0");
    private static final UUID DROPOFF = UUID.fromString("eb46dc78-e25e-4f07-a7a2-26bff615d170");
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
    private CreditOutcomeHandler handler;

    @Autowired
    private OutboxEventRepository outboxEventRepository;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private OrderQueryService orderQueryService;

    private final JsonMapper json = JsonMapper.builder().build();

    @BeforeEach
    void resetClock() {
        CLOCK.set(Instant.now().truncatedTo(ChronoUnit.MICROS));
    }

    private OffsetDateTime now() {
        return OffsetDateTime.ofInstant(CLOCK.instant(), ZoneOffset.UTC);
    }

    /** An OPEN order with reward 10 and a deadline one hour away. */
    private Order openOrder() {
        UUID orderId = orderService.createOrder(new CreateOrderCommand(REQUESTER, "Collect printing",
                "Grab my printout", PICKUP, "COM1 Print Shop", DROPOFF, "UTown Residence", 10,
                now().plusHours(1))).getId();
        return orderService.confirmReservation(orderId, UUID.randomUUID());
    }

    private OrderDetails details(String title, int reward) {
        return new OrderDetails(title, "Grab my printout", PICKUP, "COM1 Print Shop", DROPOFF, "UTown Residence",
                reward, now().plusHours(2));
    }

    private Order reload(UUID orderId) {
        return orderService.getOrder(orderId, REQUESTER);
    }

    private List<String> history(UUID orderId) {
        return jdbc.queryForList("select action from order_transitions where order_id = ? order by order_version",
                String.class, orderId);
    }

    private List<OutboxEvent> events(UUID orderId, String eventType) {
        return outboxEventRepository.findByAggregateIdOrderByAggregateVersionAsc(orderId).stream()
                .filter(event -> event.getEventType().equals(eventType))
                .toList();
    }

    private JsonNode rewardChangeRequested(UUID orderId) {
        List<OutboxEvent> requested = events(orderId, "OrderRewardChangeRequested");
        return json.readTree(requested.get(requested.size() - 1).getPayload());
    }

    private String creditOutcome(JsonNode command, String eventType, Map<String, Object> extraData) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("operationId", command.get("data").get("operationId").asString());
        data.put("orderId", command.get("aggregateId").asString());
        data.putAll(extraData);
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("eventId", UUID.randomUUID().toString());
        envelope.put("eventType", eventType);
        envelope.put("eventVersion", 1);
        envelope.put("aggregateType", "Order");
        envelope.put("aggregateId", command.get("aggregateId").asString());
        envelope.put("aggregateVersion", command.get("aggregateVersion").asLong());
        envelope.put("occurredAt", "2026-10-17T10:00:00Z");
        envelope.put("producer", "credit-service");
        envelope.put("correlationId", command.get("correlationId").asString());
        envelope.put("causationId", command.get("eventId").asString());
        envelope.put("actor", Map.of("type", "SYSTEM"));
        envelope.put("data", data);
        return json.writeValueAsString(envelope);
    }

    private String adjusted(JsonNode command, int amount) {
        return creditOutcome(command, "CreditAdjusted", Map.of("reservationId", UUID.randomUUID().toString(),
                "amount", amount, "availableBalance", 0, "reservedBalance", amount));
    }

    private String adjustmentRejected(JsonNode command) {
        return creditOutcome(command, "CreditAdjustmentRejected", Map.of("reasonCode", "INSUFFICIENT_CREDITS"));
    }

    @Test
    void editingDetailsOnlyWritesHistoryButNoEvent() {
        Order order = openOrder();

        Order edited = orderService.edit(order.getId(), REQUESTER, order.getVersion(), details("Collect notes", 10));

        assertThat(edited.getTitle()).isEqualTo("Collect notes");
        assertThat(edited.getVersion()).isGreaterThan(order.getVersion());
        Order stored = reload(order.getId());
        assertThat(stored.getTitle()).isEqualTo("Collect notes");
        assertThat(stored.getPendingCreditReward()).isNull();
        assertThat(history(order.getId())).containsExactly("SUBMIT", "OPEN", "EDIT");
        assertThat(outboxEventRepository.findByAggregateIdOrderByAggregateVersionAsc(order.getId()))
                .extracting(OutboxEvent::getEventType).containsExactly("OrderSubmitted");
    }

    @Test
    void resendingTheSameEditChangesNothing() {
        Order order = openOrder();
        OrderDetails edit = details("Collect notes", 10);
        Order edited = orderService.edit(order.getId(), REQUESTER, order.getVersion(), edit);

        Order retried = orderService.edit(order.getId(), REQUESTER, order.getVersion(), edit);

        assertThat(retried.getVersion()).isEqualTo(edited.getVersion());
        assertThat(history(order.getId())).containsOnlyOnce("EDIT");
    }

    @Test
    void aRewardEditWritesOneBlueprintRewardChangeAndKeepsTheReward() {
        Order order = openOrder();

        Order edited = orderService.edit(order.getId(), REQUESTER, order.getVersion(), details("Collect notes", 15));

        assertThat(edited.getCreditReward()).isEqualTo(10);
        assertThat(edited.getPendingCreditReward()).isEqualTo(15);
        assertThat(jdbc.queryForObject("select pending_credit_reward from orders where id = ?", Integer.class,
                order.getId())).isEqualTo(15);
        assertThat(events(order.getId(), "OrderRewardChangeRequested")).hasSize(1);
        JsonNode event = rewardChangeRequested(order.getId());
        assertThat(event.get("aggregateVersion").asLong()).isEqualTo(edited.getVersion());
        assertThat(event.get("actor").get("role").asString()).isEqualTo("REQUESTER");
        JsonNode data = event.get("data");
        List<String> fields = new ArrayList<>(data.propertyNames());
        // JSONB does not keep key order, so compare the set of fields.
        assertThat(fields).containsExactlyInAnyOrder("operationId", "orderId", "newCreditReward");
        assertThat(data.get("orderId").asString()).isEqualTo(order.getId().toString());
        assertThat(data.get("newCreditReward").isInt()).isTrue();
        assertThat(data.get("newCreditReward").asInt()).isEqualTo(15);
        UUID.fromString(data.get("operationId").asString());

        // While pending: no acceptance and no further edit.
        assertThatThrownBy(() -> orderService.accept(order.getId(), COURIER))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.REWARD_ADJUSTMENT_PENDING));
        assertThatThrownBy(() -> orderService.edit(order.getId(), REQUESTER, edited.getVersion(),
                details("Something else", 15)))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.REWARD_ADJUSTMENT_PENDING));
        assertThat(history(order.getId())).containsExactly("SUBMIT", "OPEN", "EDIT");
    }

    @Test
    void creditAdjustedAppliesTheNewRewardAndClearsPending() {
        Order order = openOrder();
        orderService.edit(order.getId(), REQUESTER, order.getVersion(), details("Collect printing", 15));
        String outcome = adjusted(rewardChangeRequested(order.getId()), 15);

        assertThat(handler.handle(outcome)).isEqualTo(Outcome.APPLIED);

        Order applied = reload(order.getId());
        assertThat(applied.getCreditReward()).isEqualTo(15);
        assertThat(applied.getPendingCreditReward()).isNull();
        assertThat(history(order.getId())).containsExactly("SUBMIT", "OPEN", "EDIT", "REWARD_CHANGE_APPLIED");
        assertThat(jdbc.queryForObject("select actor_role from order_transitions where order_id = ? and action = ?",
                String.class, order.getId(), "REWARD_CHANGE_APPLIED")).isEqualTo("SYSTEM");
        assertThat(outboxEventRepository.findByAggregateIdOrderByAggregateVersionAsc(order.getId()))
                .extracting(OutboxEvent::getEventType)
                .containsExactly("OrderSubmitted", "OrderRewardChangeRequested");

        // A redelivery is an inbox duplicate and changes nothing.
        long version = applied.getVersion();
        assertThat(handler.handle(outcome)).isEqualTo(Outcome.DUPLICATE);
        assertThat(reload(order.getId()).getVersion()).isEqualTo(version);
        assertThat(history(order.getId())).containsOnlyOnce("REWARD_CHANGE_APPLIED");

        // The order is acceptable again.
        assertThat(orderService.accept(order.getId(), COURIER).getState()).isEqualTo(OrderState.ACCEPTED);
    }

    @Test
    void creditAdjustmentRejectedKeepsTheOldRewardAndAllowsANewEdit() {
        Order order = openOrder();
        orderService.edit(order.getId(), REQUESTER, order.getVersion(), details("Collect printing", 50));

        assertThat(handler.handle(adjustmentRejected(rewardChangeRequested(order.getId()))))
                .isEqualTo(Outcome.APPLIED);

        Order rejected = reload(order.getId());
        assertThat(rejected.getCreditReward()).isEqualTo(10);
        assertThat(rejected.getPendingCreditReward()).isNull();
        assertThat(history(order.getId())).containsExactly("SUBMIT", "OPEN", "EDIT", "REWARD_CHANGE_REJECTED");

        Order again = orderService.edit(order.getId(), REQUESTER, rejected.getVersion(), details("Collect printing", 12));
        assertThat(again.getPendingCreditReward()).isEqualTo(12);
        assertThat(events(order.getId(), "OrderRewardChangeRequested")).hasSize(2);
    }

    @Test
    void anOutcomeAfterCancellationIsRecordedButChangesNothing() {
        Order order = openOrder();
        orderService.edit(order.getId(), REQUESTER, order.getVersion(), details("Collect printing", 15));
        JsonNode command = rewardChangeRequested(order.getId());
        Order cancelled = orderService.cancel(order.getId(), REQUESTER);
        assertThat(cancelled.getPendingCreditReward()).isNull();
        String outcome = adjusted(command, 15);

        assertThat(handler.handle(outcome)).isEqualTo(Outcome.IGNORED);

        Order stored = reload(order.getId());
        assertThat(stored.getState()).isEqualTo(OrderState.CANCELLED);
        assertThat(stored.getCreditReward()).isEqualTo(10);
        assertThat(stored.getPendingCreditReward()).isNull();
        assertThat(stored.getVersion()).isEqualTo(cancelled.getVersion());
        assertThat(history(order.getId())).containsExactly("SUBMIT", "OPEN", "EDIT", "CANCEL");
        String eventId = json.readTree(outcome).get("eventId").asString();
        assertThat(jdbc.queryForObject("select outcome from processed_events where event_id = ?::uuid",
                String.class, eventId)).isEqualTo("IGNORED");
        assertThat(handler.handle(outcome)).isEqualTo(Outcome.DUPLICATE);
    }

    @Test
    void anAnswerToAnOlderRewardChangeIsIgnored() {
        Order order = openOrder();
        Order first = orderService.edit(order.getId(), REQUESTER, order.getVersion(), details("Collect printing", 15));
        JsonNode firstCommand = rewardChangeRequested(order.getId());
        handler.handle(adjustmentRejected(firstCommand));
        orderService.edit(order.getId(), REQUESTER, reload(order.getId()).getVersion(), details("Collect printing", 15));
        assertThat(first.getPendingCreditReward()).isEqualTo(15);

        // A late second answer to the first request must not settle the second one.
        assertThat(handler.handle(adjusted(firstCommand, 15))).isEqualTo(Outcome.IGNORED);
        assertThat(reload(order.getId()).getPendingCreditReward()).isEqualTo(15);
        assertThat(reload(order.getId()).getCreditReward()).isEqualTo(10);
    }

    @Test
    void anAdjustmentOutcomeAnsweringAnotherCommandIsAnOperationConflict() {
        Order order = openOrder();
        JsonNode submitted = json.readTree(events(order.getId(), "OrderSubmitted").get(0).getPayload());

        assertThatThrownBy(() -> handler.handle(adjusted(submitted, 10)))
                .isInstanceOfSatisfying(CreditOutcomeRejectedException.class, exception ->
                        assertThat(exception.getReasonCode()).isEqualTo("OPERATION_ID_CONFLICT"));
        assertThat(jdbc.queryForObject("select count(*) from processed_events where aggregate_id = ?",
                Integer.class, order.getId())).isZero();
    }

    @Test
    void editingAnOverdueOrderExpiresItAndTheExpiryIsKept() {
        Order order = openOrder();
        CLOCK.advance(Duration.ofHours(1));

        assertThatThrownBy(() -> orderService.edit(order.getId(), REQUESTER, order.getVersion(),
                details("Collect notes", 15)))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.ORDER_EXPIRED));

        Order stored = reload(order.getId());
        assertThat(stored.getState()).isEqualTo(OrderState.EXPIRED);
        assertThat(stored.getTitle()).isEqualTo("Collect printing");
        assertThat(history(order.getId())).containsExactly("SUBMIT", "OPEN", "EXPIRE");
    }

    @Test
    void aRejectedEditChangesNothing() {
        Order order = openOrder();

        assertThatThrownBy(() -> orderService.edit(order.getId(), REQUESTER, order.getVersion() - 1,
                details("Collect notes", 15)))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.VERSION_CONFLICT));
        assertThatThrownBy(() -> orderService.edit(order.getId(), COURIER, order.getVersion(),
                details("Collect notes", 15)))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.NOT_ORDER_REQUESTER));

        Order stored = reload(order.getId());
        assertThat(stored.getVersion()).isEqualTo(order.getVersion());
        assertThat(stored.getPendingCreditReward()).isNull();
        assertThat(history(order.getId())).containsExactly("SUBMIT", "OPEN");
        assertThat(events(order.getId(), "OrderRewardChangeRequested")).isEmpty();
    }

    @Test
    void concurrentEditsFromTheSameVersionHaveExactlyOneWinner() throws Exception {
        Order order = openOrder();
        int editors = 6;
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(editors);
        List<Future<OrderErrorCode>> results = new ArrayList<>();
        for (int i = 0; i < editors; i++) {
            OrderDetails edit = details("Edit " + i, 10 + i);
            results.add(pool.submit((Callable<OrderErrorCode>) () -> {
                start.await();
                try {
                    orderService.edit(order.getId(), REQUESTER, order.getVersion(), edit);
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
        // Losers see either the newer version or, if the winner changed the reward, the pending flag.
        assertThat(outcomes.stream().filter(code -> code != null))
                .hasSize(editors - 1)
                .allMatch(code -> code == OrderErrorCode.VERSION_CONFLICT
                        || code == OrderErrorCode.REWARD_ADJUSTMENT_PENDING);
        assertThat(history(order.getId())).containsOnlyOnce("EDIT");
        assertThat(events(order.getId(), "OrderRewardChangeRequested").size()).isLessThanOrEqualTo(1);
    }

    @Test
    void concurrentDetailEditsFromTheSameVersionLoseWithVersionConflict() throws Exception {
        Order order = openOrder();
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        List<Future<OrderErrorCode>> results = new ArrayList<>();
        for (String title : List.of("Edit A", "Edit B")) {
            results.add(pool.submit((Callable<OrderErrorCode>) () -> {
                start.await();
                try {
                    orderService.edit(order.getId(), REQUESTER, order.getVersion(), details(title, 10));
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

        assertThat(outcomes).containsExactlyInAnyOrder(null, OrderErrorCode.VERSION_CONFLICT);
        assertThat(history(order.getId())).containsOnlyOnce("EDIT");
    }

    /** True when a courier browsing the open pool can see the order. */
    private boolean inPool(UUID orderId) {
        return orderQueryService.findOpenPool(UUID.randomUUID(), new OrderPoolQuery(null, null, null, null,
                OrderPoolSort.DEADLINE, new OrderPaging(0, 50))).getContent().stream()
                .anyMatch(order -> order.getId().equals(orderId));
    }

    @Test
    void aPendingRewardChangeHidesTheOrderFromThePoolUntilCreditAnswers() {
        Order order = openOrder();
        assertThat(inPool(order.getId())).isTrue();

        orderService.edit(order.getId(), REQUESTER, reload(order.getId()).getVersion(), details("Collect printing", 15));
        assertThat(inPool(order.getId())).isFalse();

        handler.handle(adjusted(rewardChangeRequested(order.getId()), 15));
        assertThat(inPool(order.getId())).isTrue();
        assertThat(reload(order.getId()).getCreditReward()).isEqualTo(15);
    }
}
