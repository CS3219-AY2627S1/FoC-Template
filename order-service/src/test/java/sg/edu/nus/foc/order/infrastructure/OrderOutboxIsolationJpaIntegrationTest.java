package sg.edu.nus.foc.order.infrastructure;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;

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
import tools.jackson.databind.json.JsonMapper;

import sg.edu.nus.foc.order.application.OrderOutboxDispatcher;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderEventOutbox;
import sg.edu.nus.foc.order.domain.OutboxState;
import sg.edu.nus.foc.order.messagingpublisher.dto.OrderCompletionTaskEvent;
import sg.edu.nus.foc.order.messagingpublisher.interfaces.IOrderCompletionTaskPublisher;
import sg.edu.nus.foc.order.messagingpublisher.interfaces.IOpenOrderRefundTaskPublisher;

@SpringBootTest(properties = {
        "spring.profiles.active=local",
        "order.messaging.outbox.recovery-cron=-",
        "order.lifecycle.cron=-"
})
@Testcontainers(disabledWithoutDocker = true)
class OrderOutboxIsolationJpaIntegrationTest {

    @Container
    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:15-alpine")
            .withDatabaseName("order_outbox_isolation_test")
            .withUsername("order_test")
            .withPassword("order_test_password");

    @Autowired
    private JpaOrderRepository orders;

    @Autowired
    private JpaOrderEventOutboxRepository repository;

    @Autowired
    private OrderOutboxDispatcher dispatcher;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @MockitoSpyBean
    private OrderEventOutboxPersistenceAdapter adapter;

    // Isolated database tests must never publish to real cloud topics.
    @MockitoBean
    private IOrderCompletionTaskPublisher completionPublisher;

    @MockitoBean
    private IOpenOrderRefundTaskPublisher refundPublisher;


    @MockitoBean
    private sg.edu.nus.foc.order.messagingpublisher.interfaces.IPenaltyScoreAdditionPublisher additionPublisher;

    @MockitoBean
    private sg.edu.nus.foc.order.messagingpublisher.interfaces.IPenaltyScoreDeductionPublisher deductionPublisher;

    private Instant now;
    private Order order;

    @DynamicPropertySource
    static void datasourceProperties(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        properties.add("spring.datasource.username", POSTGRES::getUsername);
        properties.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired private JpaPenaltyOutcomeRepository penaltyOutcomes;

    @BeforeEach
    void setupIsolatedRows() {
        repository.deleteAll();
        penaltyOutcomes.deleteAll();
        orders.deleteAll();
        now = Instant.now();
        order = orders.saveAndFlush(Order.open("requester", "item", "pickup", "delivery", 2, 15,
                now.minusSeconds(3600), now.plusSeconds(3600)));
    }

    @Test
    void databaseSelectsOnlyDueIdsInOrderWithinTheLimitWithoutClaimingThem() {
        pending("due-pending", now.minusSeconds(10));
        pending("future-pending", now.plusSeconds(3600));
        OrderEventOutbox expiredLease = pending("expired-lease", now.minusSeconds(30));
        expiredLease.claim(now.minusSeconds(20), now.minusSeconds(1));
        repository.saveAndFlush(expiredLease);
        OrderEventOutbox activeLease = pending("active-lease", now.minusSeconds(30));
        activeLease.claim(now.minusSeconds(20), now.plusSeconds(60));
        repository.saveAndFlush(activeLease);
        OrderEventOutbox published = pending("published", now.minusSeconds(40));
        published.claim(now.minusSeconds(30), now.plusSeconds(60));
        published.markPublished(now.minusSeconds(20));
        repository.saveAndFlush(published);

        assertEquals(List.of("expired-lease", "due-pending"), adapter.findDueIds(now, 10));
        assertEquals(List.of("expired-lease"), adapter.findDueIds(now, 1));
        assertEquals(OutboxState.PENDING, row("due-pending").getState());
        assertEquals(0, row("due-pending").getAttemptCount());
    }

    @Test
    void retryWriteRollsBackOnlyItsEventAndLaterEventStillPublishes() {
        pending("failed", now.minusSeconds(20));
        pending("successful", now.minusSeconds(10));
        doThrow(new IllegalStateException("publisher failed")).when(completionPublisher)
                .publishOrderCompletionTask(org.mockito.ArgumentMatchers.argThat(
                        event -> event.getEventId().equals("failed")));
        doAnswer(invocation -> {
            invocation.callRealMethod();
            throw new IllegalStateException("failure after retry state mutation");
        }).when(adapter).scheduleRetry(eq("failed"), any(), any());

        dispatcher.dispatchDueBatch();

        assertEquals(OutboxState.IN_PROGRESS, row("failed").getState());
        assertEquals(1, row("failed").getAttemptCount());
        assertNull(row("failed").getLastError());
        assertEquals(OutboxState.PUBLISHED, row("successful").getState());
        assertEquals(List.of("failed"), adapter.findDueIds(now.plusSeconds(300), 10));
    }

    @Test
    void failedPublishedMarkerRollsBackBeforeRetryAndLaterSuccess() {
        pending("failed-marker", now.minusSeconds(20));
        pending("successful", now.minusSeconds(10));
        doAnswer(invocation -> {
            invocation.callRealMethod();
            throw new IllegalStateException("failure after published state mutation");
        }).when(adapter).markPublished(eq("failed-marker"), any());

        dispatcher.dispatchDueBatch();

        assertEquals(OutboxState.PENDING, row("failed-marker").getState());
        assertNull(row("failed-marker").getPublishedAt());
        assertEquals(OutboxState.PUBLISHED, row("successful").getState());
    }

    @Test
    void dispatchTransactionsCommitEvenWhenAnUnrelatedOuterTransactionRollsBack() {
        pending("independent", now.minusSeconds(20));

        assertThrows(IllegalStateException.class, () ->
                new TransactionTemplate(transactionManager).execute(status -> {
                    dispatcher.dispatch("independent");
                    throw new IllegalStateException("rollback unrelated caller");
                }));

        assertEquals(OutboxState.PUBLISHED, row("independent").getState());
    }

    private OrderEventOutbox pending(String eventId, Instant createdAt) {
        OrderCompletionTaskEvent event = new OrderCompletionTaskEvent();
        event.setEventId(eventId);
        event.setEventType("OrderCompletionTaskEvent");
        event.setOrderId(order.getId());
        event.setOccurredAt(createdAt);
        return repository.saveAndFlush(OrderEventOutbox.pending(eventId, order.getId(),
                event.getEventType(), 2, order.getVersion(),
                JsonMapper.builder().build().writeValueAsString(event), createdAt));
    }

    private OrderEventOutbox row(String eventId) {
        return repository.findById(eventId).orElseThrow();
    }
}
