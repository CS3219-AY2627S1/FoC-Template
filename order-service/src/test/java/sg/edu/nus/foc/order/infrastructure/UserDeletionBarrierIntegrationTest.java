package sg.edu.nus.foc.order.infrastructure;

import static org.junit.jupiter.api.Assertions.*;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClient;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import sg.edu.nus.foc.order.application.OrderOutboxDispatcher;
import sg.edu.nus.foc.order.application.recovery.CommandRequest;
import sg.edu.nus.foc.order.application.recovery.OrderCommandStore;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "order.lifecycle.cron=-", "order.messaging.outbox.recovery-cron=-",
        "FOC_INTERNAL_ORDER_API_ENABLED=true"})
@Testcontainers
class UserDeletionBarrierIntegrationTest {
    @Container
    static final PostgreSQLContainer<?> DATABASE = new PostgreSQLContainer<>("postgres:15-alpine");
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", DATABASE::getJdbcUrl);
        properties.add("spring.datasource.username", DATABASE::getUsername);
        properties.add("spring.datasource.password", DATABASE::getPassword);
    }

    @LocalServerPort private int port;
    @Autowired private OrderCommandStore commands;
    @Autowired private OrderRepository orders;
    @Autowired private JpaOrderRepository jpa;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PlatformTransactionManager transactions;
    @Autowired private sg.edu.nus.foc.order.domain.repository.UserDeletionGuard deletionGuard;
    @MockitoBean private OrderOutboxDispatcher dispatcher;

    @Test
    void preparedBarrierSurvivesReplayAndPreventsLateCommandsAndFinalizers() {
        String uid = UUID.randomUUID().toString();
        String operation = UUID.randomUUID().toString();
        assertEquals(200, prepare(uid, operation));
        assertEquals(200, prepare(uid, operation));
        assertThrows(OrderProblem.class, () -> commands.register(UUID.randomUUID().toString(), create(uid)));
        Order late = open(uid);
        assertThrows(OrderProblem.class, () -> new TransactionTemplate(transactions).execute(tx -> orders.save(late)));
        assertTrue(jpa.findById(late.getId()).isEmpty());
        assertEquals(1, jdbc.queryForObject("select count(*) from order_user_deletion_guards where user_id=? and blocked", Integer.class, uid));
    }

    @ParameterizedTest
    @EnumSource(OrderStatus.class)
    void activeRequesterOrCourierBlocksAndDeniedOperationNeverChangesItsDecision(OrderStatus status) {
        for (boolean requester : new boolean[] {true, false}) {
            String uid = UUID.randomUUID().toString();
            Order order = open(requester ? uid : "other-" + uid);
            ReflectionTestUtils.setField(order, "courierId", requester ? "courier" : uid);
            ReflectionTestUtils.setField(order, "status", status);
            jpa.saveAndFlush(order);
            String operation = UUID.randomUUID().toString();
            boolean terminal = Set.of(OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.EXPIRED).contains(status);
            assertEquals(terminal ? 200 : 409, prepare(uid, operation));
            if (!terminal) {
                jdbc.update("update orders set status='COMPLETED' where id=?", order.getId());
                assertEquals(409, prepare(uid, operation), "Lost denial replies must remain authoritative");
                assertEquals(200, prepare(uid, UUID.randomUUID().toString()));
            }
        }
    }

    @Test
    void earlierUncommittedRegistrationWinsAndDeletionSeesItAfterWaiting() throws Exception {
        String uid = UUID.randomUUID().toString();
        CountDownLatch registered = new CountDownLatch(1);
        CountDownLatch commit = new CountDownLatch(1);
        CompletableFuture<Void> writer = CompletableFuture.runAsync(() -> new TransactionTemplate(transactions)
                .executeWithoutResult(tx -> {
                    commands.register(UUID.randomUUID().toString(), create(uid));
                    registered.countDown();
                    await(commit);
                }));
        assertTrue(registered.await(10, TimeUnit.SECONDS));
        CompletableFuture<Integer> deletion = CompletableFuture.supplyAsync(() -> prepare(uid, UUID.randomUUID().toString()));
        try {
            assertThrows(java.util.concurrent.TimeoutException.class, () -> deletion.get(300, TimeUnit.MILLISECONDS));
        } finally {
            commit.countDown();
        }
        writer.get(10, TimeUnit.SECONDS);
        assertEquals(409, deletion.get(10, TimeUnit.SECONDS));
    }

    @Test
    void pendingRepostIncludingCompensationBlocksDeletionWithoutAnActiveOrder() {
        String uid = UUID.randomUUID().toString();
        Order expired = open(uid);
        ReflectionTestUtils.setField(expired, "status", OrderStatus.EXPIRED);
        jpa.saveAndFlush(expired);
        CommandRequest request = new CommandRequest("REPOST", uid, expired.getId(), expired.getVersion(), create(uid).creation());
        String key = UUID.randomUUID().toString();
        commands.registerAutomatic("AUTO_REPOST:" + expired.getId(), request, 120);
        assertEquals(409, prepare(uid, key));
    }

    @Test
    void earlierUncommittedDeletionWinsAgainstALateRegistration() throws Exception {
        String uid = UUID.randomUUID().toString();
        CountDownLatch prepared = new CountDownLatch(1);
        CountDownLatch commit = new CountDownLatch(1);
        CompletableFuture<Void> deletion = CompletableFuture.runAsync(() -> new TransactionTemplate(transactions)
                .executeWithoutResult(tx -> {
                    assertTrue(deletionGuard.prepare(uid, UUID.randomUUID().toString()));
                    prepared.countDown();
                    await(commit);
                }));
        assertTrue(prepared.await(10, TimeUnit.SECONDS));
        CompletableFuture<Void> late = CompletableFuture.runAsync(() ->
                commands.register(UUID.randomUUID().toString(), create(uid)));
        try {
            assertThrows(java.util.concurrent.TimeoutException.class, () -> late.get(300, TimeUnit.MILLISECONDS));
        } finally {
            commit.countDown();
        }
        deletion.get(10, TimeUnit.SECONDS);
        java.util.concurrent.ExecutionException rejected = assertThrows(java.util.concurrent.ExecutionException.class,
                () -> late.get(10, TimeUnit.SECONDS));
        assertInstanceOf(OrderProblem.class, rejected.getCause());
        assertEquals(0, jdbc.queryForObject("select count(*) from order_commands where actor_id=?", Integer.class, uid));
    }

    @Test
    void deletedCourierCannotBeAssignedByALateFinalizerAndAnotherOperationCannotUnblockUser() {
        String courier = UUID.randomUUID().toString();
        assertEquals(200, prepare(courier, "original-operation"));
        assertEquals(503, prepare(courier, "different-operation"));
        Order late = open("requester-" + courier);
        late.accept(courier, 0, Instant.now());
        assertThrows(OrderProblem.class, () -> new TransactionTemplate(transactions).execute(tx -> orders.save(late)));
        assertTrue(jpa.findById(late.getId()).isEmpty());
    }

    @Test
    void automaticRepostSelectionSkipsDeletedOwnersAndRetainsEligibleOwners() {
        Instant now = Instant.now();
        String deletedOwner = UUID.randomUUID().toString();
        Order blocked = expiredPlan(deletedOwner, now);
        Order eligible = expiredPlan(UUID.randomUUID().toString(), now);
        assertTrue(jpa.findDueAutomaticRepostIds(now).contains(blocked.getId()));
        assertEquals(200, prepare(deletedOwner, UUID.randomUUID().toString()));
        assertFalse(jpa.findDueAutomaticRepostIds(now).contains(blocked.getId()),
                "Deleted users must not repeatedly occupy the limited automatic-repost batch");
        assertTrue(jpa.findDueAutomaticRepostIds(now).contains(eligible.getId()));
    }

    private Order expiredPlan(String uid, Instant now) {
        Order order = Order.open(uid, "books", "pickup", "delivery", 1, 15,
                now.minusSeconds(10800), now.minusSeconds(7200),
                new sg.edu.nus.foc.order.domain.RepostPlan(true, now.minusSeconds(3600), 1, 15, now.plusSeconds(7200)));
        ReflectionTestUtils.setField(order, "status", OrderStatus.EXPIRED);
        return jpa.saveAndFlush(order);
    }

    private int prepare(String uid, String operation) {
        return RestClient.create("http://127.0.0.1:" + port).post()
                .uri("/api/orders/internal/users/{uid}/deletion-preparations/{operation}", uid, operation)
                .exchange((request, response) -> response.getStatusCode().value());
    }

    private CommandRequest create(String uid) {
        return new CommandRequest("CREATE", uid, null, 0,
                new CommandRequest.Creation("books", "pickup", "delivery", 1, 15,
                        Instant.now().plusSeconds(7200), false, null, 0, 0, null));
    }

    private Order open(String uid) {
        return Order.open(uid, "books", "pickup", "delivery", 1, 15,
                Instant.now(), Instant.now().plusSeconds(7200));
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(10, TimeUnit.SECONDS)) throw new AssertionError("Transaction coordination timed out");
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new AssertionError(interrupted);
        }
    }
}
