package sg.edu.nus.foc.order.infrastructure;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.google.api.core.ApiFutures;
import com.google.cloud.pubsub.v1.Publisher;
import com.google.pubsub.v1.PubsubMessage;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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
import sg.edu.nus.foc.order.application.recovery.*;
import sg.edu.nus.foc.order.application.OrderCreationService;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.messagingpublisher.dto.OpenOrderRefundTaskEvent;
import sg.edu.nus.foc.order.messagingpublisher.publisher.GoogleCloudPubSubEventPublisher;
import sg.edu.nus.foc.order.messagingpublisher.publisher.PubSubPublisherFactory;
import tools.jackson.databind.json.JsonMapper;

/** Real PostgreSQL/V15/locks and Order service; Credit/result transport are explicit fixtures. */
@SpringBootTest(properties = {"spring.profiles.active=local", "order.peers.mode=mock",
    "order.messaging.mode=cloud", "order.messaging.emulator-host=", "order.commands.enabled=true", "order.commands.recovery-policy=compensate",
    "order.lifecycle.cron=-", "order.messaging.outbox.recovery-cron=-", "debug=false", "logging.level.root=WARN"})
@Testcontainers
class OrderCompensationPostgresIntegrationTest {
    @Container static final PostgreSQLContainer<?> DB = new PostgreSQLContainer<>("postgres:15-alpine");
    @DynamicPropertySource static void database(DynamicPropertyRegistry p) {
        p.add("spring.datasource.url", DB::getJdbcUrl); p.add("spring.datasource.username", DB::getUsername); p.add("spring.datasource.password", DB::getPassword);
    }
    @Autowired OrderCommandService service;
    @Autowired OrderCommandStore commands;
    @Autowired OrderCompensationJournal journal;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactions;
    @Autowired JsonMapper json;
    @MockitoSpyBean LocalCreditCommandStub credit;
    @MockitoSpyBean OrderCreationService creation;
    @MockitoBean CreditCompensationPublisher publisher;
    @MockitoBean PubSubPublisherFactory publisherFactory;
    @Autowired GoogleCloudPubSubEventPublisher lifecyclePublisher;
    private Publisher fixtureTransport;

    @BeforeEach
    void isolateLifecycleTransport() {
        fixtureTransport = mock(Publisher.class);
        when(publisherFactory.forTopic(anyString(), anyString())).thenReturn(fixtureTransport);
        when(fixtureTransport.publish(any(PubsubMessage.class)))
                .thenReturn(ApiFutures.immediateFuture("fixture-message-id"));
    }

    @Test
    void lifecyclePublicationUsesOnlyFixtureTransport() {
        OpenOrderRefundTaskEvent event = new OpenOrderRefundTaskEvent();
        event.setEventId(key());
        event.setEventType("OpenOrderRefundTaskEvent");
        event.setEventVersion(2);
        event.setOrderId(key());
        event.setOrderStatus(OrderStatus.CANCELLED);
        event.setCreditAmount(5);
        event.setOccurredAt(Instant.now());

        assertEquals("fixture-message-id", lifecyclePublisher.publish("fixture-topic", event));
        verify(fixtureTransport).publish(any(PubsubMessage.class));
    }

    String key() { return UUID.randomUUID().toString(); }
    @Test void heldAbortReturnsTheReportExplanationAndNeverCallsCredit() {
        String requester = key();
        String courier = key();
        CommandView created = service.submit(key(), input(requester), null);
        CommandView accepted = service.submit(key(), new CommandRequest("ACCEPT", courier,
                created.result().getId(), created.result().getVersion(), null), null);
        String orderId = accepted.result().getId();
        jdbc.update("update orders set completion_hold=true where id=?", orderId);
        String commandId = key();
        CommandView result = service.submit(commandId, new CommandRequest("ABORT", courier,
                orderId, accepted.result().getVersion(), null), null);
        assertEquals("REJECTED", result.outcome());
        assertEquals("ORDER_ON_HOLD", result.reason());
        assertEquals("This order has an active report. Please resolve it before proceeding.", result.message());
        assertEquals("FULLY_COMPENSATED", field(commandId, "final_stage_status"));
        assertEquals(0, jdbc.queryForObject("select count(*) from order_event_outbox where command_id=?", Integer.class, commandId));
        verify(credit, never()).execute(eq(commandId), any(), anyLong(), nullable(String.class));
    }
    CommandRequest input(String actor) {
        return new CommandRequest("CREATE", actor, null, 0, new CommandRequest.Creation("fixture", "pickup", "delivery", 5, 15,
            Instant.now().plusSeconds(7200), false, null, 0, 0, null));
    }
    String field(String key, String column) {
        return jdbc.queryForObject("select " + column + " from order_commands where command_id=?", String.class, key);
    }
    CreditCompensationRequest request(String k) {
        return json.readValue(jdbc.queryForObject("select payload from order_event_outbox where event_id=?", String.class, field(k,"compensation_id")), CreditCompensationRequest.class);
    }
    CreditCompensationResult confirmed(CreditCompensationRequest q) {
        return new CreditCompensationResult(key(), q.eventId(), q.commandId(), q.operation(), q.orderId(), q.generation(), "COMPENSATED", "REVERSED");
    }
    void timeout(String k) {
        doAnswer(call -> { call.callRealMethod(); throw new IllegalStateException("lost Credit response"); })
            .when(credit).execute(eq(k), any(), anyLong(), nullable(String.class));
    }
    @Test void commitIsTerminalEvenIfTheClientNeverReceivesTheResponse() {
        String k = key();
        var result = service.submit(k, input(key()), null);
        assertEquals("SUCCESS", result.outcome());
        assertEquals("SUCCESS", field(k,"credit_step_status"));
        assertEquals("SUCCESS", field(k,"final_stage_status"));
        jdbc.update("update order_commands set resolution_deadline_at=clock_timestamp()-interval '1 minute' where command_id=?", k);
        journal.recover(k);
        assertNull(field(k,"compensation_id"));
        assertEquals(1, jdbc.queryForObject("select count(*) from orders where id=?", Integer.class, result.orderId()));
    }
    @Test void timeoutWaitsForAMatchingResultAndDuplicateResultDoesNotRepeatFinalization() {
        String k = key(), actor = key(); timeout(k);
        var pending = service.submit(k, input(actor), null);
        assertEquals("PENDING", pending.status()); assertEquals("COMPENSATING", pending.reason());
        assertEquals("PENDING", field(k,"credit_step_status"));
        var request = request(k);
        assertEquals("RESERVE", request.operation()); assertEquals(5L, request.amount());
        // The result is a contract fixture, not evidence that actual Credit reversed funds.
        var result = confirmed(request);
        journal.accept(result); journal.accept(result);
        assertEquals("FULLY_COMPENSATED", field(k,"final_stage_status"));
        assertEquals("COMPENSATED", field(k,"credit_step_status"));
        assertEquals("REJECTED", service.status(k, actor, null).outcome());
        assertEquals(1, jdbc.queryForObject("select count(*) from order_compensation_result_inbox where command_id=?", Integer.class, k));
        assertEquals(0, jdbc.queryForObject("select count(*) from orders where id=?", Integer.class, pending.orderId()));
    }
    @Test void selfAcceptanceIsATerminalNoEffectFailureWithoutSendingAssignment() {
        String actor = key(); var opened = service.submit(key(), input(actor), null).result(); String k = key();
        var result = service.submit(k, new CommandRequest("ACCEPT", actor, opened.getId(), opened.getVersion(), null), null);
        assertEquals("COMPLETED", result.status()); assertEquals("REJECTED", result.outcome());
        assertEquals("FAILED", field(k,"credit_step_status")); assertNull(field(k,"compensation_id"));
        verify(credit, never()).execute(eq(k), any(), anyLong(), nullable(String.class));
    }
    @Test void successfulCreditAndLocalRollbackProduceCompensationWithoutAnOrder() {
        String k = key();
        doThrow(new IllegalStateException("local write failed")).when(creation).createConfirmed(eq(k), anyString(), anyString(), anyString(), anyString(), anyString(), anyLong(), anyInt(), any(), any(), nullable(String.class));
        var result = service.submit(k, input(key()), null);
        assertEquals("PENDING", result.status()); assertEquals("SUCCESS", field(k,"credit_step_status"));
        assertEquals(0, jdbc.queryForObject("select count(*) from orders where id=?", Integer.class, result.orderId()));
        assertNotNull(request(k));
    }
    @Test void acceptAndAbortUseCorrectOperationWithoutBloatedPayload() {
        var opened = service.submit(key(), input(key()), null).result(); String courier = key(), accept = key();
        var accepted = service.submit(accept, new CommandRequest("ACCEPT", courier, opened.getId(), opened.getVersion(), null), null).result();
        String abort = key(); timeout(abort);
        var waiting = service.submit(abort, new CommandRequest("ABORT", courier, accepted.getId(), accepted.getVersion(), null), null);
        assertEquals("PENDING", waiting.status()); var q = request(abort);
        assertEquals("CLEAR_COURIER", q.operation()); assertEquals(courier, q.actorId()); assertNull(q.amount());
        assertEquals("ACCEPTED", jdbc.queryForObject("select status from orders where id=?", String.class, accepted.getId()));
        assertThrows(OrderProblem.class, () -> commands.guard(accepted.getId()));
        // Credit's owner must verify exact revision restoration before emitting this result.
        journal.accept(confirmed(q));
        assertEquals("ACCEPTED", jdbc.queryForObject("select status from orders where id=?", String.class, accepted.getId()));
    }
    @Test void schedulerHonorsActiveLeaseThenFencesStaleWorkerWithoutReexecutingCredit() {
        String k = key(); commands.register(k, input(key()), "COMPENSATE", 120);
        var claim = commands.claim(k, "old-worker", 120, true).orElseThrow();
        new TransactionTemplate(transactions).executeWithoutResult(tx -> commands.markPossibleEffect(claim));
        jdbc.update("update order_commands set resolution_deadline_at=clock_timestamp()-interval '1 minute' where command_id=?", k);
        journal.recover(k); assertNull(field(k,"compensation_id"));
        jdbc.update("update order_commands set lease_expires_at=clock_timestamp()-interval '1 second' where command_id=?", k);
        journal.recover(k); assertNotNull(field(k,"compensation_id"));
        assertThrows(OrderProblem.class, () -> new TransactionTemplate(transactions).executeWithoutResult(tx -> commands.assertOwned(claim)));
        verify(credit, never()).execute(eq(k), any(), anyLong(), nullable(String.class));
    }
    @Test void newerConfigurationCannotRebindAnExistingRetryCommand() {
        String k = key(); var request = input(key()); commands.register(k, request);
        assertThrows(OrderProblem.class, () -> commands.register(k, request, "COMPENSATE", 120));
        assertEquals("RETRY", field(k,"recovery_policy"));
    }
    @Test void wrongResultRollsBackInboxAndLeavesGuardUnresolved() {
        String k = key(); timeout(k); service.submit(k, input(key()), null);
        var q = request(k);
        var foreign = new CreditCompensationResult(key(), q.eventId(), k, q.operation(), key(), q.generation(), "COMPENSATED", "REVERSED");
        assertThrows(OrderProblem.class, () -> journal.accept(foreign));
        assertEquals("PENDING", field(k,"status"));
        assertEquals(0, jdbc.queryForObject("select count(*) from order_compensation_result_inbox where command_id=?", Integer.class, k));
    }
    @Test void localSuccessRowLockWinsAgainstConcurrentCompensationSelection() throws Exception {
        String k = key(); commands.register(k, input(key()), "COMPENSATE", 120);
        var claim = commands.claim(k, "worker", 120, true).orElseThrow();
        journal.remoteSucceeded(claim);
        CountDownLatch locked = new CountDownLatch(1), release = new CountDownLatch(1);
        var worker = CompletableFuture.runAsync(() -> new TransactionTemplate(transactions).executeWithoutResult(tx -> {
            commands.assertOwned(claim); locked.countDown();
            try { assertTrue(release.await(10, TimeUnit.SECONDS)); }
            catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException(e); }
            journal.localSucceeded(claim);
            commands.complete(claim, "SUCCESS", "SUCCEEDED", "done", new sg.edu.nus.foc.order.api.dto.response.OrderResponse());
        }));
        try {
            assertTrue(locked.await(10, TimeUnit.SECONDS));
            assertThrows(RuntimeException.class, () -> journal.abandon(claim, "TIMEOUT"));
        } finally { release.countDown(); }
        worker.get(10, TimeUnit.SECONDS);
        journal.abandon(claim, "UNKNOWN_COMMIT");
        assertEquals("SUCCESS", field(k,"final_stage_status")); assertNull(field(k,"compensation_id"));
    }

    @Test void version14UpgradePreservesLegacyCommandsAndSeparatesOutboxReferences() {
        String schema = "upgrade_" + key().replace("-", "");
        org.flywaydb.core.Flyway.configure().dataSource(DB.getJdbcUrl(), DB.getUsername(), DB.getPassword())
                .schemas(schema).defaultSchema(schema).target("14").load().migrate();
        String k = key();
        jdbc.update("insert into " + schema + ".order_commands(command_id,actor_id,kind,order_id,input_hash,payload) values (?,?,'CREATE',?,?,?::jsonb)",
                k, "legacy", key(), "h".repeat(64), "{}");
        var flyway = org.flywaydb.core.Flyway.configure().dataSource(DB.getJdbcUrl(), DB.getUsername(), DB.getPassword())
                .schemas(schema).defaultSchema(schema).load();
        flyway.migrate();
        // V16 is additive: upgrading must not delegate legacy user-authorized commands.
        assertEquals("21", flyway.info().current().getVersion().toString());
        assertFalse(Boolean.TRUE.equals(jdbc.queryForObject("select automatic_execution from " + schema
                + ".order_commands where command_id=?", Boolean.class, k)));
        assertEquals("RETRY", jdbc.queryForObject("select recovery_policy from " + schema + ".order_commands where command_id=?", String.class, k));
        // Compensating a never-created Order can still enqueue against its command.
        jdbc.update("insert into " + schema + ".order_event_outbox(event_id,command_id,event_type,event_version,order_version,payload,state,attempt_count,created_at,next_attempt_at) "
                + "values (?,?,'CreditCompensationRequested',1,0,'{}','PENDING',0,clock_timestamp(),clock_timestamp())", key(), k);
        assertEquals(1, jdbc.queryForObject("select count(*) from " + schema + ".order_event_outbox where command_id=? and order_id is null", Integer.class, k));
    }
}
