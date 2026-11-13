package com.friendoncampus.order.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import com.friendoncampus.order.domain.OrderErrorCode;
import com.friendoncampus.order.domain.OrderState;
import com.friendoncampus.order.domain.OrderTransitionException;
import com.friendoncampus.order.domain.TerminalReason;
import com.friendoncampus.order.messaging.OutboxEvent;
import com.friendoncampus.order.repository.OutboxEventRepository;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Runs against a real PostgreSQL (Testcontainers, Flyway V1 + V2) to prove that each transition
 * stores the order change, its history row and its outbox event together, or nothing at all.
 * Requires Docker.
 */
@SpringBootTest(properties = {"app.orders.expiry.enabled=false", "app.kafka.enabled=false"})
@Testcontainers
class OrderLifecyclePersistenceIntegrationTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    private static final Instant NOW = Instant.parse("2026-10-16T12:00:00Z");
    private static final UUID REQUESTER = UUID.fromString("97947588-bb2e-42f2-91ba-9abf8e15a8e7");

    @TestConfiguration
    static class FixedClock {
        @Bean
        @Primary
        Clock fixedClock() {
            return Clock.fixed(NOW, ZoneOffset.UTC);
        }
    }

    // The decoder would otherwise fetch User Service keys; no tokens are used here.
    @MockitoBean
    private JwtDecoder jwtDecoder;

    @Autowired
    private OrderService orderService;

    @Autowired
    private OutboxEventRepository outboxEventRepository;

    @Autowired
    private JdbcTemplate jdbc;

    private final JsonMapper json = JsonMapper.builder().build();

    private UUID createOrder() {
        // The deadline is relative to real time so the database CHECK (deadline > created_at) holds.
        OffsetDateTime deadline = OffsetDateTime.now(ZoneOffset.UTC).plusDays(1);
        return orderService.createOrder(new CreateOrderCommand(REQUESTER, "Collect printing",
                "Grab my printout", UUID.randomUUID(), "COM1 Print Shop", UUID.randomUUID(), "UTown Residence", 10, deadline)).getId();
    }

    private int count(String table, UUID orderId) {
        String column = table.equals("outbox_events") ? "aggregate_id" : "order_id";
        return jdbc.queryForObject("select count(*) from " + table + " where " + column + " = ?",
                Integer.class, orderId);
    }

    @Test
    void creatingAnOrderStoresOneHistoryRowAndABlueprintOrderSubmittedEvent() {
        UUID orderId = createOrder();

        assertThat(count("order_transitions", orderId)).isEqualTo(1);
        List<OutboxEvent> events = outboxEventRepository.findByAggregateIdOrderByAggregateVersionAsc(orderId);
        assertThat(events).hasSize(1);
        OutboxEvent event = events.get(0);
        assertThat(event.getEventType()).isEqualTo("OrderSubmitted");
        assertThat(event.getTopic()).isEqualTo("order.events");
        assertThat(event.getPublishedAt()).isNull();

        JsonNode envelope = json.readTree(event.getPayload());
        assertThat(envelope.get("eventId").asString()).isEqualTo(event.getId().toString());
        assertThat(envelope.get("aggregateId").asString()).isEqualTo(orderId.toString());
        assertThat(envelope.get("aggregateVersion").asLong()).isEqualTo(event.getAggregateVersion());
        assertThat(envelope.get("eventVersion").asInt()).isEqualTo(1);
        assertThat(envelope.get("aggregateType").asString()).isEqualTo("Order");
        assertThat(envelope.get("producer").asString()).isEqualTo("order-service");
        assertThat(envelope.get("occurredAt").asString()).endsWith("Z");
        assertThat(UUID.fromString(envelope.get("correlationId").asString())).isNotNull();
        assertThat(envelope.get("causationId").isNull()).isTrue();
        JsonNode actor = envelope.get("actor");
        assertThat(actor.get("type").asString()).isEqualTo("USER");
        assertThat(actor.get("userId").asString()).isEqualTo(REQUESTER.toString());
        assertThat(actor.get("role").asString()).isEqualTo("REQUESTER");
        JsonNode data = envelope.get("data");
        // Exactly the blueprint's OrderSubmitted fields.
        assertThat(data.propertyNames()).containsExactlyInAnyOrder(
                "operationId", "orderId", "requesterId", "creditReward");
        assertThat(data.get("operationId").asString()).isEqualTo(event.getOperationId().toString());
        assertThat(data.get("orderId").asString()).isEqualTo(orderId.toString());
        assertThat(data.get("requesterId").asString()).isEqualTo(REQUESTER.toString());
        assertThat(data.get("creditReward").asInt()).isEqualTo(10);
    }

    @Test
    void reservationThenCancelRecordsEachTransitionWithIncreasingVersions() {
        UUID orderId = createOrder();
        orderService.confirmReservation(orderId, UUID.randomUUID());

        assertThat(orderService.cancel(orderId, REQUESTER).getState()).isEqualTo(OrderState.CANCELLED);

        List<OutboxEvent> events = outboxEventRepository.findByAggregateIdOrderByAggregateVersionAsc(orderId);
        assertThat(events).extracting(OutboxEvent::getEventType)
                .containsExactly("OrderSubmitted", "OrderCancelled");
        assertThat(events).extracting(OutboxEvent::getAggregateVersion).doesNotHaveDuplicates().isSorted();
        assertThat(events).extracting(OutboxEvent::getOperationId).doesNotHaveDuplicates();
        JsonNode cancelledEnvelope = json.readTree(events.get(1).getPayload());
        assertThat(cancelledEnvelope.get("correlationId").asString())
                .isEqualTo(json.readTree(events.get(0).getPayload()).get("correlationId").asString());
        JsonNode cancelled = cancelledEnvelope.get("data");
        assertThat(cancelled.propertyNames()).containsExactlyInAnyOrder(
                "operationId", "orderId", "courierId", "compensationRequired", "reason", "cancelledAt");
        assertThat(cancelled.get("compensationRequired").asBoolean()).isFalse();
        assertThat(cancelled.get("courierId").isNull()).isTrue();
        assertThat(cancelled.get("reason").asString()).isEqualTo("REQUESTER_CANCELLED_OPEN");
        assertThat(cancelled.get("cancelledAt").asString()).endsWith("Z");
        assertThat(orderService.getHistory(orderId, REQUESTER)).hasSize(3);
    }

    @Test
    void repeatedRequestsAndRepliesRecordNothingNew() {
        UUID orderId = createOrder();
        UUID reservation = UUID.randomUUID();
        orderService.confirmReservation(orderId, reservation);
        orderService.confirmReservation(orderId, reservation);
        orderService.cancel(orderId, REQUESTER);
        orderService.cancel(orderId, REQUESTER);

        assertThat(count("order_transitions", orderId)).isEqualTo(3);
        // OrderSubmitted and OrderCancelled; opening changes no credits, so it is not published.
        assertThat(count("outbox_events", orderId)).isEqualTo(2);
    }

    @Test
    void aRejectedReservationEndsTheOrderAndARepeatIsIgnored() {
        UUID orderId = createOrder();

        orderService.rejectReservation(orderId, TerminalReason.INSUFFICIENT_CREDITS);
        orderService.rejectReservation(orderId, TerminalReason.INSUFFICIENT_CREDITS);

        assertThat(orderService.getOrder(orderId, REQUESTER).getState()).isEqualTo(OrderState.RESERVATION_FAILED);
        assertThat(count("order_transitions", orderId)).isEqualTo(2);
        // OrderSubmitted only: a rejected reservation changes no credits, so nothing is published.
        assertThat(count("outbox_events", orderId)).isEqualTo(1);
    }

    @Test
    void aRejectedActionLeavesNoHistoryOrEventBehind() {
        UUID orderId = createOrder();

        // Still PENDING_CREDIT, so cancel is not allowed yet.
        assertThatThrownBy(() -> orderService.cancel(orderId, REQUESTER))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.INVALID_STATE_TRANSITION));

        assertThat(orderService.getOrder(orderId, REQUESTER).getState()).isEqualTo(OrderState.PENDING_CREDIT);
        assertThat(count("order_transitions", orderId)).isEqualTo(1);
        assertThat(count("outbox_events", orderId)).isEqualTo(1);
    }

    @Test
    void locationNamesAreStoredAsSnapshots() {
        UUID orderId = createOrder();

        assertThat(jdbc.queryForMap("select pickup_location_name_snapshot, dropoff_location_name_snapshot"
                + " from orders where id = ?", orderId))
                .containsEntry("pickup_location_name_snapshot", "COM1 Print Shop")
                .containsEntry("dropoff_location_name_snapshot", "UTown Residence");
    }
}
