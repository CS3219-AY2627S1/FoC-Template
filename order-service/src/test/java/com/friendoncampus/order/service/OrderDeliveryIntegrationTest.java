package com.friendoncampus.order.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
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
import com.friendoncampus.order.messaging.OutboxEvent;
import com.friendoncampus.order.repository.OutboxEventRepository;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Phase 3 against a real PostgreSQL: the full happy path to COMPLETED, duplicate completion
 * (F7.1.1) and no cancellation after pickup (F3.4). Requires Docker.
 */
@SpringBootTest(properties = {"app.orders.expiry.enabled=false", "app.kafka.enabled=false"})
@Testcontainers
class OrderDeliveryIntegrationTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    private static final UUID REQUESTER = UUID.fromString("97947588-bb2e-42f2-91ba-9abf8e15a8e7");
    private static final UUID COURIER = UUID.fromString("5b0f3c1e-8a52-4f8e-9d37-2c1b6e4a7f10");

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @Autowired
    private OrderService orderService;

    @Autowired
    private OutboxEventRepository outboxEventRepository;

    @Autowired
    private JdbcTemplate jdbc;

    private final JsonMapper json = JsonMapper.builder().build();

    private UUID acceptedOrder() {
        OffsetDateTime deadline = OffsetDateTime.now(ZoneOffset.UTC).plusHours(1);
        UUID orderId = orderService.createOrder(new CreateOrderCommand(REQUESTER, "Collect printing",
                "Grab my printout", UUID.randomUUID(), "COM1 Print Shop", UUID.randomUUID(), "UTown Residence", 10, deadline)).getId();
        orderService.confirmReservation(orderId, UUID.randomUUID());
        orderService.accept(orderId, COURIER);
        return orderId;
    }

    private List<OutboxEvent> events(UUID orderId) {
        return outboxEventRepository.findByAggregateIdOrderByAggregateVersionAsc(orderId);
    }

    private List<String> history(UUID orderId) {
        return jdbc.queryForList("select action from order_transitions where order_id = ? order by order_version",
                String.class, orderId);
    }

    private List<String> eventTypes(UUID orderId) {
        return events(orderId).stream().map(OutboxEvent::getEventType).toList();
    }

    @Test
    void anOrderGoesFromAcceptedToCompletedAndSettlesTheRewardToTheCourier() {
        UUID orderId = acceptedOrder();

        orderService.pickUp(orderId, COURIER);
        orderService.deliver(orderId, COURIER);
        Order completed = orderService.complete(orderId, REQUESTER);

        assertThat(completed.getState()).isEqualTo(OrderState.COMPLETED);
        assertThat(completed.getCourierId()).isEqualTo(COURIER);
        assertThat(completed.getCompletedAt()).isNotNull();
        assertThat(history(orderId))
                .containsExactly("SUBMIT", "OPEN", "ACCEPT", "PICK_UP", "DELIVER", "COMPLETE");
        assertThat(eventTypes(orderId)).containsExactly("OrderSubmitted", "OrderCompleted");
        JsonNode settled = json.readTree(events(orderId).get(1).getPayload()).get("data");
        assertThat(settled.get("courierId").asString()).isEqualTo(COURIER.toString());
        assertThat(settled.get("completedAt").asString()).endsWith("Z");
        assertThat(settled.get("operationId").asString())
                .isEqualTo(events(orderId).get(1).getOperationId().toString());
        assertThat(orderService.getHistory(orderId, COURIER)).hasSize(6);
    }

    @Test
    void aRepeatedCompletionReturnsTheOrderWithoutASecondSettlement() {
        UUID orderId = acceptedOrder();
        orderService.pickUp(orderId, COURIER);
        orderService.deliver(orderId, COURIER);
        orderService.complete(orderId, REQUESTER);

        Order again = orderService.complete(orderId, REQUESTER);

        assertThat(again.getState()).isEqualTo(OrderState.COMPLETED);
        assertThat(eventTypes(orderId)).containsOnlyOnce("OrderCompleted");
    }

    @Test
    void concurrentCompletionsSettleOnlyOnce() throws Exception {
        UUID orderId = acceptedOrder();
        orderService.pickUp(orderId, COURIER);
        orderService.deliver(orderId, COURIER);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(4);
        List<Future<OrderState>> results = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            results.add(pool.submit(() -> {
                start.await();
                return orderService.complete(orderId, REQUESTER).getState();
            }));
        }
        start.countDown();
        for (Future<OrderState> result : results) {
            assertThat(result.get()).isEqualTo(OrderState.COMPLETED);
        }
        pool.shutdown();

        assertThat(eventTypes(orderId)).containsOnlyOnce("OrderCompleted");
    }

    @Test
    void repeatedPickupAndDeliveryRecordNothingNew() {
        UUID orderId = acceptedOrder();
        orderService.pickUp(orderId, COURIER);
        orderService.pickUp(orderId, COURIER);
        orderService.deliver(orderId, COURIER);
        orderService.deliver(orderId, COURIER);

        assertThat(history(orderId)).containsOnlyOnce("PICK_UP").containsOnlyOnce("DELIVER");
    }

    @Test
    void neitherSideCanCancelOrWithdrawOncePickedUp() {
        UUID orderId = acceptedOrder();
        orderService.pickUp(orderId, COURIER);

        assertThatThrownBy(() -> orderService.cancel(orderId, REQUESTER))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.CANCELLATION_NOT_ALLOWED));
        assertThatThrownBy(() -> orderService.withdraw(orderId, COURIER))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.CANCELLATION_NOT_ALLOWED));
        assertThat(orderService.getOrder(orderId, REQUESTER).getState()).isEqualTo(OrderState.PICKED_UP);
    }

    @Test
    void completingBeforeDeliveryIsRejectedAndChangesNothing() {
        UUID orderId = acceptedOrder();
        orderService.pickUp(orderId, COURIER);

        assertThatThrownBy(() -> orderService.complete(orderId, REQUESTER))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.INVALID_STATE_TRANSITION));
        assertThat(history(orderId)).endsWith("PICK_UP");
    }
}
