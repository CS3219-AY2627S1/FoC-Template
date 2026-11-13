package com.friendoncampus.order.messaging;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

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

import com.friendoncampus.order.service.CreateOrderCommand;
import com.friendoncampus.order.service.OrderService;

/**
 * Lifecycle events are off by default: transitions behave as before, with no
 * {@code order.lifecycle.events} rows and no sequence numbers taken. Requires Docker.
 */
@SpringBootTest(properties = {"app.orders.expiry.enabled=false", "app.kafka.enabled=false"})
@Testcontainers
class OrderLifecycleEventsDisabledIntegrationTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    private static final UUID REQUESTER = UUID.fromString("97947588-bb2e-42f2-91ba-9abf8e15a8e7");

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @Autowired
    private OrderService orderService;

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void byDefaultNoLifecycleEventIsWrittenAndNoNumberTaken() {
        UUID orderId = orderService.createOrder(new CreateOrderCommand(REQUESTER, "Buy coffee", "Flat white",
                UUID.randomUUID(), "Library cafe", UUID.randomUUID(), "Block E lobby", 3,
                OffsetDateTime.now(ZoneOffset.UTC).plusHours(1))).getId();
        orderService.confirmReservation(orderId, UUID.randomUUID());
        orderService.accept(orderId, UUID.randomUUID());

        assertThat(jdbc.queryForObject("select count(*) from outbox_events where aggregate_id = ? and topic = ?",
                Integer.class, orderId, "order.lifecycle.events")).isZero();
        assertThat(jdbc.queryForList("select event_type from outbox_events where aggregate_id = ?", String.class,
                orderId)).containsExactly("OrderSubmitted");
        assertThat(jdbc.queryForObject("select lifecycle_sequence from orders where id = ?", Long.class, orderId))
                .isZero();
        assertThat(jdbc.queryForObject("select count(*) from order_transitions where order_id = ?", Integer.class,
                orderId)).isEqualTo(3);
    }
}
