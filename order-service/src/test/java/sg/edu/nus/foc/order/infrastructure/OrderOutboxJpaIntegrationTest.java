package sg.edu.nus.foc.order.infrastructure;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderCheckpoint;
import sg.edu.nus.foc.order.domain.OrderEventOutbox;
import sg.edu.nus.foc.order.domain.OutboxState;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.application.OrderTransitionService;
import sg.edu.nus.foc.order.domain.repository.OrderEventOutboxRepository;
import sg.edu.nus.foc.order.messagingpublisher.dto.OrderCompletionTaskEvent;

@SpringBootTest(properties = {
    "spring.profiles.active=local",
    "order.messaging.outbox.recovery-cron=-",
    "order.lifecycle.cron=-"
})
@Testcontainers(disabledWithoutDocker = true)
class OrderOutboxJpaIntegrationTest {
    @Test void exhaustedEventsRemainDurableAndOnlyExplicitRedriveReleasesThem() {
        Instant now = Instant.now();
        Order order = Order.open("redrive-owner", "item", "p", "d", 1, 15, now, now.plusSeconds(3600));
        orders.saveAndFlush(order);
        OrderCompletionTaskEvent event = new OrderCompletionTaskEvent();
        event.setEventId(UUID.randomUUID().toString());
        event.setOrderId(order.getId());
        event.setEventType("OrderCompletionTaskEvent");
        event.setEventVersion(2);
        event.setOccurredAt(now);
        outbox.enqueue(event);
        String payload = jpaOutbox.findById(event.getEventId()).orElseThrow().getPayload();
        for (int i = 0; i < 10; i++) {
            outbox.claim(event.getEventId(), now.plusSeconds(1), now.plusSeconds(30)).orElseThrow();
            outbox.scheduleRetry(event.getEventId(), now, "failed publish");
        }
        assertEquals(OutboxState.FAILED, jpaOutbox.findById(event.getEventId()).orElseThrow().getState());
        assertEquals(List.of(event.getEventId()), outbox.failedIds(100));
        assertFalse(outbox.claim(event.getEventId(), now.plusSeconds(60), now.plusSeconds(90)).isPresent());
        outbox.redrive(event.getEventId(), now);
        assertEquals(payload, jpaOutbox.findById(event.getEventId()).orElseThrow().getPayload());
        assertThrows(sg.edu.nus.foc.order.domain.OrderProblem.class, () -> outbox.redrive(event.getEventId(), now));
        assertThrows(sg.edu.nus.foc.order.domain.OrderProblem.class, () -> outbox.redrive("missing", now));
        outbox.claim(event.getEventId(), now.plusSeconds(1), now.plusSeconds(30)).orElseThrow();
        outbox.markPublished(event.getEventId(), now.plusSeconds(2));
    }
    @Container
    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("order_outbox_jpa_test")
            .withUsername("order_test")
            .withPassword("order_test_password");

    @Autowired
    private JpaOrderRepository orders;

    @Autowired
    private JpaOrderCheckpointRepository checkpoints;

    @Autowired
    private JpaOrderEventOutboxRepository jpaOutbox;

    @Autowired
    private OrderEventOutboxRepository outbox;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private OrderTransitionService transitions;

    @Autowired
    private JpaOrderCourierAttemptRepository attempts;

    @DynamicPropertySource
    static void datasourceProperties(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        properties.add("spring.datasource.username", POSTGRES::getUsername);
        properties.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Test
    void flywaySchemaValidatesAndJpaOutboxCanClaimRetryAndPublish() {
        Instant now = Instant.now();
        Order order = Order.open(
                "requester-1",
                "item",
                "pickup",
                "delivery",
                5,
                15,
                now,
                now.plusSeconds(3600));
        orders.saveAndFlush(order);

        OrderCompletionTaskEvent event = new OrderCompletionTaskEvent();
        event.setEventId(UUID.randomUUID().toString());
        event.setEventType("OrderCompletionTaskEvent");
        event.setEventVersion(1);
        event.setOrderId(order.getId());
        event.setOrderVersion(1);
        event.setOccurredAt(now);
        outbox.enqueue(event);

        List<OrderEventOutbox> claimed = outbox.claimDue(now.plusSeconds(1), now.plusSeconds(60), 10);

        assertEquals(1, claimed.size());
        assertEquals(OutboxState.IN_PROGRESS, claimed.get(0).getState());
        assertEquals(1, claimed.get(0).getAttemptCount());
        assertNotNull(claimed.get(0).getPayload());

        outbox.scheduleRetry(event.getEventId(), now.plusSeconds(2), "temporary failure");
        OrderEventOutbox retried = outbox.claim(event.getEventId(), now.plusSeconds(3), now.plusSeconds(63))
                .orElseThrow();
        assertEquals(2, retried.getAttemptCount());
        outbox.markPublished(event.getEventId(), now.plusSeconds(4));

        OrderEventOutbox published = jpaOutbox.findById(event.getEventId()).orElseThrow();
        assertEquals(OutboxState.PUBLISHED, published.getState());
        assertEquals(2, published.getAttemptCount());
        assertNull(published.getLastError());
    }

    @Test
    void databaseRollbackRemovesBothOrderAndItsOutboxIntent() {
        Instant now = Instant.now();
        Order order = Order.open(
                "requester-rollback",
                "rollback item",
                "pickup-rollback",
                "delivery-rollback",
                2,
                15,
                now,
                now.plusSeconds(3600));
        OrderCompletionTaskEvent event = new OrderCompletionTaskEvent();
        event.setEventId(UUID.randomUUID().toString());
        event.setEventType("OrderCompletionTaskEvent");
        event.setEventVersion(1);
        event.setOrderId(order.getId());
        event.setOrderVersion(1);
        event.setOccurredAt(now);

        assertThrows(IllegalStateException.class, () -> new TransactionTemplate(transactionManager).execute(status -> {
            orders.saveAndFlush(order);
            outbox.enqueue(event);
            throw new IllegalStateException("force rollback");
        }));

        assertFalse(orders.findById(order.getId()).isPresent());
        assertFalse(jpaOutbox.existsById(event.getEventId()));
    }

    @Test
    @Transactional
    void dueAutoCompletionQueryUsesDeliveredStatusAndCheckpointCutoff() {
        Instant now = Instant.parse("2026-10-07T12:00:00Z");
        Instant cutoff = now.minusSeconds(48 * 60L * 60L);
        Order dueOrder = deliveredOrder("auto-due", cutoff.minusSeconds(1));
        Order recentOrder = deliveredOrder("auto-recent", cutoff.plusSeconds(1));
        orders.saveAllAndFlush(List.of(dueOrder, recentOrder));
        checkpoints.saveAllAndFlush(List.of(
                new OrderCheckpoint(
                        dueOrder.getId(), OrderStatus.ACCEPTED, cutoff.minusSeconds(1800), "courier-auto-due", null),
                new OrderCheckpoint(dueOrder.getId(), OrderStatus.DELIVERED, cutoff.minusSeconds(1), "courier-auto-due", null),
                new OrderCheckpoint(
                        recentOrder.getId(), OrderStatus.ACCEPTED, cutoff.plusSeconds(1), "courier-auto-recent", null),
                new OrderCheckpoint(
                        recentOrder.getId(), OrderStatus.DELIVERED, cutoff.plusSeconds(1), "courier-auto-recent", null)));

        List<Order> dueOrders = orders.findDueForAutoCompletion(OrderStatus.DELIVERED, cutoff);

        assertEquals(List.of(dueOrder.getId()), dueOrders.stream().map(Order::getId).toList());
    }

    @Test
    void abortHistoryCurrentStateAndPenaltyIntentRollBackTogether() {
        Instant now = Instant.now();
        Order order = Order.open("requester-abort-rollback", "item", "pickup", "delivery", 2, 15,
                now, now.plusSeconds(3600));
        order.accept("courier-abort-rollback", order.getVersion(), now);
        orders.saveAndFlush(order);
        long expectedVersion = orders.findById(order.getId()).orElseThrow().getVersion();
        long attemptCount = attempts.count();

        assertThrows(IllegalStateException.class, () -> new TransactionTemplate(transactionManager).execute(status -> {
            transitions.cancelAccepted("abort-rollback", order.getId(), "courier-abort-rollback", expectedVersion, null);
            throw new IllegalStateException("force failure after abort persistence");
        }));

        Order persisted = orders.findById(order.getId()).orElseThrow();
        assertEquals(OrderStatus.ACCEPTED, persisted.getStatus());
        assertEquals("courier-abort-rollback", persisted.getCourierId());
        assertEquals(attemptCount, attempts.count());
        assertFalse(jpaOutbox.findAll().stream().anyMatch(event -> order.getId().equals(event.getOrderId())));
        assertFalse(checkpoints.findByOrderIdOrderByOccurredAtAsc(order.getId()).stream()
                .anyMatch(checkpoint -> checkpoint.getStatus() == OrderStatus.ABORTED));
    }

    private Order deliveredOrder(String requesterId, Instant deliveredAt) {
        Instant createdAt = deliveredAt.minusSeconds(3600);
        Order order = Order.open(
                requesterId,
                "item-" + requesterId,
                "pickup-" + requesterId,
                "delivery-" + requesterId,
                5,
                15,
                createdAt,
                createdAt.plusSeconds(7200));
        order.accept("courier-" + requesterId, order.getVersion(), deliveredAt.minusSeconds(1800));
        order.start("courier-" + requesterId, order.getVersion(), deliveredAt.minusSeconds(600));
        order.markPickedUp("courier-" + requesterId, order.getVersion());
        order.markDelivered("courier-" + requesterId, order.getVersion(), deliveredAt);
        return order;
    }
}
