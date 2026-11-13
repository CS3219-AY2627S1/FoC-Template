package sg.edu.nus.foc.order.infrastructure;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.locks.LockSupport;
import java.util.function.Supplier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import sg.edu.nus.foc.order.adapter.MockPeerAdapters;
import sg.edu.nus.foc.order.application.*;
import sg.edu.nus.foc.order.domain.*;

/**
 * CHANGE-092/093 / F3, F4.1.5, F4.1.7-8, F5.1, F10, NFR3.
 * Real PostgreSQL, Flyway, repositories and transactional service proxies.
 * Peers and external delivery are deliberately NOT under integration test.
 */
@SpringBootTest(properties = {
    "spring.profiles.active=local",
    "order.peers.mode=mock",
    "order.messaging.outbox.recovery-cron=-",
    "order.lifecycle.cron=-",
    "debug=false",
    "logging.level.root=WARN",
    "logging.level.org.hibernate.SQL=OFF"
})
@Testcontainers // Required verification: unavailable Docker must fail, not skip.
class OrderConcurrencyPostgresIntegrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("order_concurrency_test")
            .withUsername("order_test")
            .withPassword("isolated_test_password");

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        properties.add("spring.datasource.username", POSTGRES::getUsername);
        properties.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired OrderAssignmentService assignments;
    @Autowired OrderTransitionService transitions;
    @Autowired LifecycleProcessingService lifecycle;
    @Autowired JpaOrderRepository orders;
    @Autowired JpaOrderCheckpointRepository checkpoints;
    @Autowired JpaCommandReceiptRepository receipts;
    @Autowired JpaOrderEventOutboxRepository outbox;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired JdbcTemplate jdbc;
    @MockitoBean MockPeerAdapters peers;
    @MockitoBean OrderOutboxDispatcher dispatcher;
    @MockitoSpyBean OrderCheckpointPersistenceAdapter checkpointAdapter;
    @MockitoSpyBean OrderPersistenceAdapter orderAdapter;
    private final java.util.concurrent.ConcurrentMap<String, RuntimeException> lifecycleLockFailures =
            new java.util.concurrent.ConcurrentHashMap<>();

    @Autowired private JpaPenaltyOutcomeRepository penaltyOutcomes;

    @BeforeEach
    void authenticationOnly() {
        // Each race has its own isolated state, even when an earlier assertion fails.
        jdbc.update("delete from order_commands");
        outbox.deleteAll();
        receipts.deleteAll();
        checkpoints.deleteAll();
        jdbc.update("delete from order_courier_attempts");
        penaltyOutcomes.deleteAll();
        orders.deleteAll();
        lifecycleLockFailures.clear();
        doAnswer(call -> {
            try { return call.callRealMethod(); }
            catch (RuntimeException failure) {
                lifecycleLockFailures.put(Thread.currentThread().getName(), failure);
                throw failure;
            }
        }).when(orderAdapter).getForLifecycleUpdate(anyString());
        when(peers.verifyRequester(anyString(), nullable(String.class)))
                .thenAnswer(call -> call.getArgument(0));
        when(peers.verifyCourier(anyString(), nullable(String.class)))
                .thenAnswer(call -> call.getArgument(0));
    }

    @ParameterizedTest(name = "first courier A = {0}")
    @ValueSource(booleans = {true, false})
    void simultaneousAcceptancesOnlyAssignOneCourier(boolean firstIsA) throws Exception {
        Order order = saveOpen(Instant.now().plusSeconds(3600));
        String first = firstIsA ? "courier-A" : "courier-B";
        String second = firstIsA ? "courier-B" : "courier-A";
        Race result = race(order, OrderStatus.ACCEPTED,
                () -> accept(order, first), () -> accept(order, second), false);

        assertSuccess(result.first());
        assertConflict(result.second());
        assertCommitted(order, OrderStatus.ACCEPTED, first, 1, 0, 1);
        verify(peers).assignCourier(order.getId(), first, null);
        verify(peers, never()).assignCourier(order.getId(), second, null);
        verifyNoInteractions(dispatcher);
    }

    @ParameterizedTest(name = "acceptance before requester cancellation = {0}")
    @ValueSource(booleans = {true, false})
    void acceptanceAndRequesterCancellationCommitOnlyOneOutcome(boolean acceptanceFirst) throws Exception {
        Order order = saveOpen(Instant.now().plusSeconds(3600));
        String courier = "courier-accept-cancel";
        String cancelCommandId = "cancel-" + order.getId();
        Supplier<Object> accept = () -> accept(order, courier);
        Supplier<Object> cancel = () -> transitions.cancel(
                cancelCommandId, order.getId(), order.getRequesterId(), order.getVersion(), null);
        Race result = race(
                order,
                acceptanceFirst ? OrderStatus.ACCEPTED : OrderStatus.CANCELLED,
                acceptanceFirst ? accept : cancel,
                acceptanceFirst ? cancel : accept,
                false);

        assertSuccess(result.first());
        assertConflict(result.second());
        assertCommitted(
                order,
                acceptanceFirst ? OrderStatus.ACCEPTED : OrderStatus.CANCELLED,
                acceptanceFirst ? courier : null,
                1,
                acceptanceFirst ? 0 : 1,
                1);
        assertEquals(1, checkpoints.findByOrderIdOrderByOccurredAtAsc(order.getId()).size());
        List<CommandReceipt> committedReceipts = receipts.findAll().stream()
                .filter(receipt -> receipt.getOrderId().equals(order.getId()))
                .toList();
        assertEquals(acceptanceFirst ? "ACCEPT" : "CANCEL", committedReceipts.getFirst().getOperation());
        assertEquals(
                acceptanceFirst ? "accept-" + courier + "-" + order.getId() : cancelCommandId,
                committedReceipts.getFirst().getCommandId());

        if (acceptanceFirst) {
            verify(peers, times(1)).assignCourier(order.getId(), courier, null);
            verifyNoInteractions(dispatcher);
        } else {
            verify(peers, never()).assignCourier(anyString(), anyString(), nullable(String.class));
            assertEvent(order, "OpenOrderRefundTaskEvent");
            OrderEventOutbox refund = outbox.findAll().stream()
                    .filter(event -> event.getOrderId().equals(order.getId()))
                    .findFirst().orElseThrow();
            verify(dispatcher, times(1)).dispatch(refund.getEventId());
        }
        verify(peers, never()).holdForReopen(anyString(), nullable(String.class));
    }

    @ParameterizedTest(name = "cancellation first = {0}")
    @ValueSource(booleans = {true, false})
    void cancellationAndExpiryCommitOnlyOneRefund(boolean cancellationFirst) throws Exception {
        Order order = saveOpen(Instant.now().minusSeconds(60));
        Supplier<Object> cancel = () -> transitions.cancel("cancel-" + order.getId(),
                order.getId(), order.getRequesterId(), order.getVersion(), null);
        Supplier<Object> expire = () -> lifecycle.expireDue(Instant.now());
        Race result = race(order, cancellationFirst ? OrderStatus.CANCELLED : OrderStatus.EXPIRED,
                cancellationFirst ? cancel : expire, cancellationFirst ? expire : cancel, cancellationFirst);

        assertSuccess(result.first());
        if (cancellationFirst) {
            assertEquals(0, assertSuccess(result.second()));
        } else {
            assertEquals(1, result.first().value());
            assertConflict(result.second());
        }
        assertCommitted(order, cancellationFirst ? OrderStatus.CANCELLED : OrderStatus.EXPIRED,
                null, 1, 1, cancellationFirst ? 1 : 0);
        assertEvent(order, "OpenOrderRefundTaskEvent");
        verify(peers, never()).assignCourier(anyString(), anyString(), nullable(String.class));
        verify(dispatcher, times(1)).dispatch(anyString());
    }

    @ParameterizedTest(name = "acceptance first = {0}")
    @ValueSource(booleans = {true, false})
    void acceptanceAndExpiryCannotBothWin(boolean acceptanceFirst) throws Exception {
        // Explicit lifecycle cutoff avoids wall-clock sleeps. Acceptance uses the
        // real clock before expiry; the competing expiry pass uses that deadline.
        Order order = saveOpen(Instant.now().plusSeconds(3600));
        Supplier<Object> accept = () -> accept(order, "courier-race");
        Supplier<Object> expire = () -> lifecycle.expireDue(order.getExpiresAt());
        Race result = race(order, acceptanceFirst ? OrderStatus.ACCEPTED : OrderStatus.EXPIRED,
                acceptanceFirst ? accept : expire, acceptanceFirst ? expire : accept, acceptanceFirst);

        assertSuccess(result.first());
        if (acceptanceFirst) {
            assertEquals(0, assertSuccess(result.second()));
            verify(peers).assignCourier(order.getId(), "courier-race", null);
            verifyNoInteractions(dispatcher);
        } else {
            assertEquals(1, result.first().value());
            assertConflict(result.second());
            verify(peers, never()).assignCourier(anyString(), anyString(), nullable(String.class));
            assertEvent(order, "OpenOrderRefundTaskEvent");
            verify(dispatcher).dispatch(anyString());
        }
        assertCommitted(order, acceptanceFirst ? OrderStatus.ACCEPTED : OrderStatus.EXPIRED,
                acceptanceFirst ? "courier-race" : null, 1,
                acceptanceFirst ? 0 : 1, acceptanceFirst ? 1 : 0);
    }

    @ParameterizedTest(name = "requester completion first = {0}")
    @ValueSource(booleans = {true, false})
    void requesterAndSchedulerCompletionCommitOnlyOneOutcome(boolean requesterFirst) throws Exception {
        Instant now = Instant.now();
        Order order = saveDelivered(now.minusSeconds(72 * 3600));
        Supplier<Object> complete = () -> transitions.complete("complete-" + order.getId(),
                order.getId(), order.getRequesterId(), order.getVersion(), null);
        Supplier<Object> scheduled = () -> lifecycle.autoCompleteDue(now);
        Race result = race(order, OrderStatus.COMPLETED,
                requesterFirst ? complete : scheduled, requesterFirst ? scheduled : complete,
                requesterFirst);

        assertSuccess(result.first());
        if (requesterFirst) {
            // The existing due query explicitly requests NOWAIT. A loser may
            // fail closed with 55P03 rather than wait; next scheduler tick is safe.
            if (result.second().failure() != null) {
                assertTrue(isLockUnavailable(result.second().failure()));
            } else {
                assertEquals(0, result.second().value());
            }
        } else {
            assertEquals(1, result.first().value());
            assertConflict(result.second());
        }
        assertEquals(0, lifecycle.autoCompleteDue(now.plusSeconds(60)));
        assertFalse(transitions.autoComplete(order.getId(), now.plusSeconds(60)));
        assertCommitted(order, OrderStatus.COMPLETED, "courier-delivered", 1, 2, 1);
        assertEvent(order, "OrderCompletionTaskEvent");
        verify(dispatcher, times(2)).dispatch(anyString());
        verify(peers, never()).assignCourier(anyString(), anyString(), nullable(String.class));
    }

    private Order accept(Order order, String courier) {
        return assignments.accept("accept-" + courier + "-" + order.getId(),
                order.getId(), courier, order.getVersion(), null);
    }

    private Order saveOpen(Instant expiry) {
        Order saved = orders.saveAndFlush(Order.open("requester-" + UUID.randomUUID(),
                "race test", "pickup", "delivery", 5, 15, expiry.minusSeconds(7200), expiry));
        // PostgreSQL stores microseconds, Instant supports nanoseconds. Read the
        // persisted deadline before using exact equality as a scheduler cutoff.
        return orders.findById(saved.getId()).orElseThrow();
    }

    private Order saveDelivered(Instant deliveredAt) {
        Order order = Order.open("requester-" + UUID.randomUUID(), "completed race",
                "pickup", "delivery", 5, 15, deliveredAt.minusSeconds(3600), deliveredAt.plusSeconds(3600));
        order.accept("courier-delivered", order.getVersion(), deliveredAt.minusSeconds(600));
        order.start("courier-delivered", order.getVersion(), deliveredAt.minusSeconds(600));
        order.markPickedUp("courier-delivered", order.getVersion());
        order.markDelivered("courier-delivered", order.getVersion(), deliveredAt);
        return new TransactionTemplate(transactionManager).execute(tx -> {
            Order saved = orders.saveAndFlush(order);
            checkpoints.saveAllAndFlush(List.of(
                    new OrderCheckpoint(saved.getId(), OrderStatus.ACCEPTED,
                            deliveredAt.minusSeconds(600), "courier-delivered", null),
                    new OrderCheckpoint(saved.getId(), OrderStatus.DELIVERED,
                            deliveredAt, "courier-delivered", null)));
            return saved;
        });
    }

    private Race race(Order order, OrderStatus gatedStatus, Supplier<Object> firstAction,
            Supplier<Object> secondAction, boolean allowNowait) throws Exception {
        String firstName = "race-first-" + UUID.randomUUID();
        String secondName = "race-second-" + UUID.randomUUID();
        CountDownLatch winnerLocked = new CountDownLatch(1);
        CountDownLatch releaseWinner = new CountDownLatch(1);
        ExecutorService workers = Executors.newFixedThreadPool(2);
        doAnswer(call -> {
            OrderCheckpoint checkpoint = call.getArgument(0);
            if (Thread.currentThread().getName().equals(firstName)
                    && checkpoint.getOrderId().equals(order.getId()) && checkpoint.getStatus() == gatedStatus) {
                // The REAL service already holds the REAL row lock here.
                winnerLocked.countDown();
                if (!releaseWinner.await(20, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("Timed out awaiting race-test release");
                }
            }
            return call.callRealMethod();
        }).when(checkpointAdapter).save(any(OrderCheckpoint.class));
        try {
            Future<Outcome> first = workers.submit(() -> transaction(firstName, firstAction));
            assertTrue(winnerLocked.await(15, TimeUnit.SECONDS), "Winner never reached checkpoint gate");
            Future<Outcome> second = workers.submit(() -> transaction(secondName, secondAction));
            assertRealContention(secondName, second, allowNowait);
            releaseWinner.countDown();
            return new Race(first.get(25, TimeUnit.SECONDS), second.get(25, TimeUnit.SECONDS));
        } finally {
            releaseWinner.countDown();
            workers.shutdownNow();
            assertTrue(workers.awaitTermination(25, TimeUnit.SECONDS), "Race workers did not terminate");
        }
    }

    private Outcome transaction(String name, Supplier<Object> action) {
        Thread.currentThread().setName(name);
        try {
            Object value = new TransactionTemplate(transactionManager).execute(tx -> {
                jdbc.queryForObject("select set_config('application_name', ?, true)", String.class, name);
                jdbc.queryForObject("select set_config('lock_timeout', '15s', true)", String.class);
                jdbc.queryForObject("select set_config('statement_timeout', '20s', true)", String.class);
                return action.get();
            });
            return new Outcome(value, null);
        } catch (RuntimeException failure) {
            return new Outcome(null, failure);
        }
    }

    private void assertRealContention(String secondName, Future<Outcome> second, boolean allowNowait)
            throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        while (System.nanoTime() < deadline) {
            Boolean blocked = jdbc.queryForObject("select exists (select 1 from pg_stat_activity "
                    + "where application_name = ? and wait_event_type = 'Lock' "
                    + "and cardinality(pg_blocking_pids(pid)) > 0)", Boolean.class, secondName);
            if (Boolean.TRUE.equals(blocked)) return;
            if (second.isDone()) {
                Outcome outcome = second.get();
                // CHANGE-093 isolates each lifecycle row and catches NOWAIT failures.
                // Prove a real PostgreSQL 55P03 occurred, not merely an early return.
                boolean safelySkipped = outcome.failure() == null && Integer.valueOf(0).equals(outcome.value())
                        && isLockUnavailable(lifecycleLockFailures.get(secondName));
                assertTrue(allowNowait && (isLockUnavailable(outcome.failure()) || safelySkipped),
                        () -> "Competitor finished without row-lock contention: " + outcome);
                return;
            }
            LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(20));
        }
        fail("PostgreSQL never reported the competing transaction waiting for the winner's lock");
    }

    private boolean isLockUnavailable(Throwable failure) {
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sql && "55P03".equals(sql.getSQLState())) return true;
        }
        return false;
    }

    private Object assertSuccess(Outcome result) {
        assertNull(result.failure(), () -> "Unexpected transaction failure: " + result.failure());
        return result.value();
    }

    private void assertConflict(Outcome result) {
        OrderProblem problem = assertInstanceOf(OrderProblem.class, result.failure());
        assertEquals("CONFLICT", problem.getCode());
        assertNull(result.value());
    }

    private void assertCommitted(Order original, OrderStatus status, String courier,
            long terminalCheckpointCount, long eventCount, long receiptCount) {
        Order saved = orders.findById(original.getId()).orElseThrow();
        assertEquals(status, saved.getStatus());
        assertEquals(courier, saved.getCourierId());
        assertEquals(original.getVersion() + 1, saved.getVersion(), "Exactly one committed Order change");
        assertEquals(terminalCheckpointCount, checkpoints.findByOrderIdOrderByOccurredAtAsc(original.getId())
                .stream().filter(c -> c.getStatus() == OrderStatus.ACCEPTED && status == OrderStatus.ACCEPTED
                        || c.getStatus() == OrderStatus.CANCELLED || c.getStatus() == OrderStatus.EXPIRED
                        || c.getStatus() == OrderStatus.COMPLETED).count());
        assertEquals(eventCount, outbox.findAll().stream()
                .filter(e -> e.getOrderId().equals(original.getId())).count());
        assertEquals(receiptCount, receipts.findAll().stream()
                .filter(r -> r.getOrderId().equals(original.getId())).count());
    }

    private void assertEvent(Order order, String type) {
        List<OrderEventOutbox> events = outbox.findAll().stream()
                .filter(event -> event.getOrderId().equals(order.getId()) && type.equals(event.getEventType())).toList();
        assertEquals(1, events.size());
        assertEquals(type, events.getFirst().getEventType());
        assertEquals(OutboxState.PENDING, events.getFirst().getState());
        assertEquals(orders.findById(order.getId()).orElseThrow().getVersion(), events.getFirst().getOrderVersion());
    }

    private record Outcome(Object value, RuntimeException failure) {}
    private record Race(Outcome first, Outcome second) {}
}
