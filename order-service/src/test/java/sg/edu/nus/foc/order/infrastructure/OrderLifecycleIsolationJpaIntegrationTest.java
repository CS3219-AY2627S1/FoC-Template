package sg.edu.nus.foc.order.infrastructure;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import sg.edu.nus.foc.order.application.LifecycleProcessingService;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderCheckpoint;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.messagingpublisher.dto.OrderTaskEvent;
import sg.edu.nus.foc.order.messagingpublisher.interfaces.IOrderCompletionTaskPublisher;
import sg.edu.nus.foc.order.messagingpublisher.interfaces.IOpenOrderRefundTaskPublisher;

@SpringBootTest(properties = {
        "spring.profiles.active=local",
        "order.messaging.outbox.recovery-cron=-",
        "order.lifecycle.cron=-"
})
@Testcontainers(disabledWithoutDocker = true)
class OrderLifecycleIsolationJpaIntegrationTest {

    private static final Instant NOW = Instant.parse("2026-10-09T12:00:00Z");

    @Container
    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("order_lifecycle_isolation_test")
            .withUsername("order_test")
            .withPassword("order_test_password");

    @Autowired
    private JpaOrderRepository orders;

    @Autowired
    private JpaOrderCheckpointRepository checkpoints;

    @Autowired
    private JpaOrderEventOutboxRepository outbox;

    @Autowired
    private JpaCommandReceiptRepository receipts;

    @Autowired
    private JpaOrderCourierAttemptRepository attempts;

    @Autowired
    private LifecycleProcessingService lifecycle;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @MockitoSpyBean
    private OrderEventOutboxPersistenceAdapter outboxAdapter;

    // Never contact real Google Pub/Sub from database tests.
    @MockitoBean
    private IOrderCompletionTaskPublisher completionPublisher;

    @MockitoBean
    private IOpenOrderRefundTaskPublisher refundPublisher;


    @MockitoBean
    private sg.edu.nus.foc.order.messagingpublisher.interfaces.IPenaltyScoreAdditionPublisher additionPublisher;

    @MockitoBean
    private sg.edu.nus.foc.order.messagingpublisher.interfaces.IPenaltyScoreDeductionPublisher deductionPublisher;

    @DynamicPropertySource
    static void datasourceProperties(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        properties.add("spring.datasource.username", POSTGRES::getUsername);
        properties.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired private JpaPenaltyOutcomeRepository penaltyOutcomes;

    @BeforeEach
    void clearIsolatedDatabase() {
        outbox.deleteAll();
        receipts.deleteAll();
        checkpoints.deleteAll();
        attempts.deleteAll();
        penaltyOutcomes.deleteAll();
        orders.deleteAll();
    }

    @Test
    void failedExpiryRollsBackItsOrderCheckpointAndIntentWhileTheNextOrderCommits() {
        Order failed = openOrder("failed", NOW.minusSeconds(7200));
        Order successful = openOrder("successful", NOW.minusSeconds(7100));
        orders.saveAllAndFlush(List.of(failed, successful));
        failAfterSavingIntent(failed.getId());

        assertEquals(1, lifecycle.expireDue(NOW));

        assertEquals(OrderStatus.OPEN, orders.findById(failed.getId()).orElseThrow().getStatus());
        assertEquals(OrderStatus.EXPIRED, orders.findById(successful.getId()).orElseThrow().getStatus());
        assertTrue(checkpoints.findByOrderIdOrderByOccurredAtAsc(failed.getId()).isEmpty());
        assertEquals(1, checkpoints.findByOrderIdOrderByOccurredAtAsc(successful.getId()).size());
        assertEquals(List.of(successful.getId()), outbox.findAll().stream().map(event -> event.getOrderId()).toList());
    }

    @Test
    void failedCompletionDoesNotRollBackTheLaterCompletion() {
        Instant cutoff = NOW.minus(Order.AUTOMATIC_COMPLETION_DELAY);
        Order failed = deliveredOrder("failed", cutoff.minusSeconds(2));
        Order successful = deliveredOrder("successful", cutoff.minusSeconds(1));
        failAfterSavingIntent(failed.getId());

        assertEquals(1, lifecycle.autoCompleteDue(NOW));

        assertEquals(OrderStatus.DELIVERED, orders.findById(failed.getId()).orElseThrow().getStatus());
        assertEquals(OrderStatus.COMPLETED, orders.findById(successful.getId()).orElseThrow().getStatus());
        assertFalse(checkpoints.findByOrderIdOrderByOccurredAtAsc(failed.getId()).stream()
                .anyMatch(checkpoint -> checkpoint.getStatus() == OrderStatus.COMPLETED));
        assertEquals(2, outbox.count());
        assertTrue(outbox.findAll().stream().allMatch(event -> successful.getId().equals(event.getOrderId())));
        assertEquals(java.util.Set.of("OrderCompletionTaskEvent", "PenaltyScoreDeductionEvent"),
                new java.util.HashSet<>(outbox.findAll().stream().map(event -> event.getEventType()).toList()));
    }

    @Test
    void lockedExpiryIsSkippedWithoutWaitingAndTheOtherOrderStillCommits() {
        Order locked = openOrder("locked", NOW.minusSeconds(7200));
        Order successful = openOrder("successful", NOW.minusSeconds(7100));
        orders.saveAllAndFlush(List.of(locked, successful));

        assertTimeoutPreemptively(Duration.ofSeconds(10), () ->
                new TransactionTemplate(transactionManager).execute(status -> {
                    orders.findByIdForUpdate(locked.getId()).orElseThrow();
                    assertEquals(1, lifecycle.expireDue(NOW));
                    return null;
                }));

        assertEquals(OrderStatus.OPEN, orders.findById(locked.getId()).orElseThrow().getStatus());
        assertEquals(OrderStatus.EXPIRED, orders.findById(successful.getId()).orElseThrow().getStatus());
    }

    @Test
    void idQueryUsesPersistedDeliveryTimeDespiteOlderCheckpointsAndReturnsEachOrderOnce() {
        Instant cutoff = NOW.minus(Order.AUTOMATIC_COMPLETION_DELAY);
        Order due = deliveredOrder("due", cutoff.minusSeconds(1));
        Order recent = deliveredOrder("recent", cutoff.plusSeconds(1));
        checkpoints.saveAllAndFlush(List.of(
                new OrderCheckpoint(due.getId(), OrderStatus.DELIVERED, cutoff.minusSeconds(2), "courier", null),
                new OrderCheckpoint(recent.getId(), OrderStatus.DELIVERED, cutoff.minusSeconds(3), "courier", null)));

        assertEquals(List.of(due.getId()), orders.findDueForAutoCompletionIds(OrderStatus.DELIVERED, cutoff));
    }

    private void failAfterSavingIntent(String orderId) {
        doAnswer(invocation -> {
            invocation.callRealMethod();
            OrderTaskEvent event = invocation.getArgument(0);
            if (orderId.equals(event.getOrderId())) {
                throw new IllegalStateException("rollback this order after intent save");
            }
            return null;
        }).when(outboxAdapter).enqueue(any());
    }

    private Order openOrder(String requester, Instant createdAt) {
        return Order.open(requester, "item", "pickup", "delivery", 2, 15, createdAt, NOW);
    }

    private Order deliveredOrder(String requester, Instant deliveredAt) {
        Order order = Order.open(requester, "item", "pickup", "delivery", 2, 15,
                deliveredAt.minusSeconds(3600), deliveredAt.plusSeconds(3600));
        order.accept("courier", 0, deliveredAt.minusSeconds(1800));
        order.start("courier", 0, deliveredAt.minusSeconds(600));
        order.markPickedUp("courier", 0);
        order.markDelivered("courier", 0, deliveredAt);
        orders.saveAndFlush(order);
        checkpoints.saveAllAndFlush(List.of(
                new OrderCheckpoint(order.getId(), OrderStatus.ACCEPTED, deliveredAt.minusSeconds(1800), "courier", null),
                new OrderCheckpoint(order.getId(), OrderStatus.DELIVERED, deliveredAt, "courier", null)));
        return order;
    }
}
