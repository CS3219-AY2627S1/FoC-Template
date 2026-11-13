package sg.edu.nus.foc.order.infrastructure;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.reset;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

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

import sg.edu.nus.foc.common.penalty.PenaltySystemPolicy;
import sg.edu.nus.foc.order.api.mapper.OrderMapper;
import sg.edu.nus.foc.order.application.AdminOrderCancellationService;
import sg.edu.nus.foc.order.application.OrderOutboxDispatcher;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderCheckpoint;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.messagingpublisher.dto.PenaltyScoreAdditionEvent;

@SpringBootTest(properties = {"spring.profiles.active=local", "order.lifecycle.cron=-", "order.messaging.outbox.recovery-cron=-"})
@Testcontainers
class AdminCancellationJpaIntegrationTest {

    private static final Instant ACCEPTED = Instant.parse("2026-10-16T00:00:00Z");

    @Container
    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("admin_cancel_test").withUsername("order_test").withPassword("order_test_password");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        properties.add("spring.datasource.username", POSTGRES::getUsername);
        properties.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired private AdminOrderCancellationService service;
    @Autowired private JpaOrderRepository orders;
    @Autowired private JpaOrderCheckpointRepository checkpoints;
    @Autowired private JpaOrderEventOutboxRepository outbox;
    @Autowired private JpaCommandReceiptRepository receipts;
    @Autowired private PlatformTransactionManager transactions;
    @Autowired private OrderMapper mapper;
    @MockitoSpyBean private OrderEventOutboxPersistenceAdapter outboxAdapter;
    @MockitoBean private OrderOutboxDispatcher dispatcher;

    @Autowired private JpaPenaltyOutcomeRepository penaltyOutcomes;

    @BeforeEach
    void clear() {
        reset(outboxAdapter);
        outbox.deleteAll();
        receipts.deleteAll();
        checkpoints.deleteAll();
        penaltyOutcomes.deleteAll();
        orders.deleteAll();
    }

    private Order assigned() {
        Order order = Order.open("requester", "item", "pickup", "delivery", 5, 30,
                ACCEPTED.minusSeconds(60), ACCEPTED.plusSeconds(3600));
        order.accept("courier", 0, ACCEPTED);
        order.placeCompletionHold("requester");
        Order saved = orders.saveAndFlush(order);
        checkpoints.saveAndFlush(new OrderCheckpoint(saved.getId(), OrderStatus.ACCEPTED, ACCEPTED, "courier", null));
        return saved;
    }

    @Test
    void commitAndReplayProduceOneRefundAndOneHighestPenalty() {
        Order order = assigned();
        List<PenaltySystemPolicy> penalties = List.of(PenaltySystemPolicy.WRONG_LOCATION_DELIVERY, PenaltySystemPolicy.WRONG_LOCATION_DELIVERY);
        service.cancel(order.getId(), "requester", "courier", penalties, "admin");
        service.cancel(order.getId(), "requester", "courier", penalties, "admin");
        Order saved = orders.findById(order.getId()).orElseThrow();
        assertEquals(OrderStatus.CANCELLED, saved.getStatus());
        assertEquals(order.getVersion() + 1, saved.getVersion());
        assertTrue(saved.isCompletionHold());
        assertEquals(sg.edu.nus.foc.order.domain.AdminPenaltyDecision.ADDITION_REQUESTED, saved.getAdminPenaltyDecision());
        assertEquals(4, saved.getAdminPenaltyAmount());
        assertEquals("courier", saved.getCourierId());
        assertEquals(1, receipts.count());
        assertEquals(2, checkpoints.count());
        assertEquals(2, outbox.count());
        assertTrue(outbox.findAll().stream().anyMatch(event -> event.getPayload().contains("WRONG_LOCATION_DELIVERY")));
        assertThrows(RuntimeException.class, () -> service.cancel(order.getId(), "requester", "courier", List.of(), "admin"));
        assertEquals(2, outbox.count());
    }

    @Test
    void secondIntentFailureRollsBackStatusCheckpointReceiptAndFirstIntent() {
        Order order = assigned();
        doAnswer(invocation -> {
            if (invocation.getArgument(0) instanceof PenaltyScoreAdditionEvent) {
                throw new IllegalStateException("Penalty outbox write failed");
            }
            return invocation.callRealMethod();
        }).when(outboxAdapter).enqueue(any());
        RuntimeException failure = assertThrows(RuntimeException.class, () -> service.cancel(order.getId(), "requester", "courier",
                List.of(PenaltySystemPolicy.WRONG_LOCATION_DELIVERY), "admin"));
        assertTrue(failure.getMessage().contains("Penalty outbox write failed"));
        Order saved = orders.findById(order.getId()).orElseThrow();
        assertEquals(OrderStatus.ACCEPTED, saved.getStatus());
        assertEquals(null, saved.getAdminPenaltyDecision());
        assertEquals(null, saved.getAdminResolutionAt());
        assertEquals(order.getVersion(), saved.getVersion());
        assertEquals(1, checkpoints.count());
        assertEquals(0, receipts.count());
        assertEquals(0, outbox.count());
    }

    @Test
    void persistedTimingUsesDeliveredTimeAndPreservesNullableWireField() {
        Order order = assigned();
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            Order locked = orders.findByIdForUpdate(order.getId()).orElseThrow();
            locked.start("courier", locked.getVersion(), ACCEPTED.plusSeconds(600));
            locked.markPickedUp("courier", locked.getVersion());
            locked.markDelivered("courier", locked.getVersion(), ACCEPTED.plusSeconds(1800));
            checkpoints.save(new OrderCheckpoint(order.getId(), OrderStatus.DELIVERED, ACCEPTED.plusSeconds(1800), "courier", null));
        });
        assertFalse(mapper.toResponse(orders.findById(order.getId()).orElseThrow()).getOverdue());
        assertEquals(ACCEPTED.plusSeconds(2400), orders.findById(order.getId()).orElseThrow().getDeliveryDeadlineAt());
        Order open = Order.open("requester", "item", "pickup", "delivery", 5, 30,
                ACCEPTED, ACCEPTED.plusSeconds(3600));
        assertEquals(null, mapper.toResponse(open).getOverdue());
    }

    @Test
    void competingRequestFailsWithoutWaitingOrWritingOverTheLockedOrder() throws Exception {
        Order order = assigned();
        CountDownLatch locked = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService worker = Executors.newSingleThreadExecutor();
        try {
            Future<?> holding = worker.submit(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> {
                orders.findByIdForUpdate(order.getId()).orElseThrow();
                locked.countDown();
                try {
                    if (!release.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Lock test timed out");
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(exception);
                }
            }));
            assertTrue(locked.await(10, TimeUnit.SECONDS));
            RuntimeException contention = assertThrows(RuntimeException.class,
                    () -> service.cancel(order.getId(), "requester", "courier", null, "admin"));
            assertTrue(contention instanceof org.springframework.dao.PessimisticLockingFailureException);
            assertEquals(0, outbox.count());
            release.countDown();
            holding.get(10, TimeUnit.SECONDS);
            service.cancel(order.getId(), "requester", "courier", null, "admin");
            assertEquals(1, outbox.count());
            assertEquals(sg.edu.nus.foc.order.domain.AdminPenaltyDecision.WAIVED, orders.findById(order.getId()).orElseThrow().getAdminPenaltyDecision());
        } finally {
            release.countDown();
            worker.shutdownNow();
        }
    }
}
