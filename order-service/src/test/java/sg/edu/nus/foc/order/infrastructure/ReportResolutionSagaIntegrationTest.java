package sg.edu.nus.foc.order.infrastructure;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import com.google.api.core.ApiFutures;
import com.google.cloud.pubsub.v1.Publisher;
import com.google.pubsub.v1.PubsubMessage;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import sg.edu.nus.foc.order.api.dto.response.ReportResolutionResponse;
import sg.edu.nus.foc.order.application.OrderCompletionHoldService;
import sg.edu.nus.foc.order.application.OrderOutboxAfterCommitListener;
import sg.edu.nus.foc.order.application.OrderOutboxDispatcher;
import sg.edu.nus.foc.order.application.reportresolution.*;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.messagingpublisher.publisher.PubSubPublisherFactory;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.json.JsonMapper;

/** Real PG/locks/transactions, HTTP adapter and outbox dispatch; absent Report and broker are explicit fixtures. */
@SpringBootTest(properties = {"spring.profiles.active=local", "order.peers.mode=mock", "order.lifecycle.cron=-",
    "order.messaging.outbox.recovery-cron=-", "order.reports.resolution.enabled=true", "FOC_ENVIRONMENT=local",
    "order.messaging.mode=emulator", "order.messaging.emulator-host=127.0.0.1:9", "order.messaging.project-id=demo-report-saga",
    "order.security.auth.project-id=demo-auth", "order.security.auth.emulator-host=localhost:9099",
    "order.reports.resolution.compensation-topic=report-resolution-compensation-local-v1",
    "order.reports.resolution.result-topic=report-resolution-compensation-result-local-v1",
    "order.reports.resolution.result-subscription=order-report-results-local-v1", "order.reports.resolution.push-mode=emulator",
    "order.reports.resolution.timeout=3s", "debug=false", "logging.level.root=WARN"})
@Testcontainers
class ReportResolutionSagaIntegrationTest {
    @Container static final PostgreSQLContainer<?> DB = new PostgreSQLContainer<>("postgres:15-alpine");
    static final JsonMapper JSON = JsonMapper.builder().build();
    static final ConcurrentMap<String, ReportResolutionMessages.Command> remote = new ConcurrentHashMap<>();
    static final ConcurrentMap<String, Boolean> fenced = new ConcurrentHashMap<>();
    static final AtomicInteger calls = new AtomicInteger();
    static volatile String behavior = "APPLY";
    static volatile CountDownLatch entered, unblock;
    static final ExecutorService HTTP_EXECUTOR = Executors.newCachedThreadPool(Thread.ofPlatform().daemon(true).factory());
    static final HttpServer REPORT = server();
    static HttpServer server() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.setExecutor(HTTP_EXECUTOR);
            server.createContext("/api/reports/internal/order-resolutions/", exchange -> {
                try {
                    assertEquals("PUT", exchange.getRequestMethod());
                    assertEquals("Bearer fixture", exchange.getRequestHeaders().getFirst("Authorization"));
                    var c = JSON.readValue(exchange.getRequestBody().readAllBytes(), ReportResolutionMessages.Command.class);
                    calls.incrementAndGet();
                    if ("DELAY".equals(behavior)) { entered.countDown(); unblock.await(8, TimeUnit.SECONDS); }
                    boolean noEffect = "NO_EFFECT".equals(behavior) || fenced.containsKey(c.commandId());
                    if (!noEffect) remote.put(c.commandId(), c);
                    var response = new ReportResolutionMessages.Resolution(c.commandId(), c.reportId(),
                            "WRONG_BINDING".equals(behavior) ? "wrong" : c.orderId(), c.requesterId(), c.courierId(), c.adminId(),
                            c.generation(), noEffect ? "NO_EFFECT" : "APPLIED", noEffect ? "NOT_APPLIED" : "RESOLVED");
                    byte[] body = JSON.writeValueAsBytes(response);
                    exchange.getResponseHeaders().set("Content-Type", "application/json");
                    exchange.sendResponseHeaders("LOST_RESPONSE".equals(behavior) ? 503 : 200, body.length);
                    exchange.getResponseBody().write(body);
                } catch (Exception e) { exchange.sendResponseHeaders(500, -1); }
                finally { exchange.close(); }
            });
            server.start(); return server;
        } catch (Exception e) { throw new ExceptionInInitializerError(e); }
    }
    @AfterAll static void close() { REPORT.stop(0); HTTP_EXECUTOR.shutdownNow(); }
    @DynamicPropertySource static void properties(DynamicPropertyRegistry p) {
        p.add("spring.datasource.url", DB::getJdbcUrl); p.add("spring.datasource.username", DB::getUsername); p.add("spring.datasource.password", DB::getPassword);
        p.add("order.reports.resolution.base-url", () -> "http://127.0.0.1:" + REPORT.getAddress().getPort());
    }
    @Autowired ReportResolutionService service;
    @Autowired ReportResolutionJournal journal;
    @Autowired OrderCompletionHoldService holds;
    @Autowired JpaOrderRepository orders;
    @Autowired JpaOrderCompletionHoldRepository holdRows;
    @Autowired JdbcTemplate jdbc;
    @Autowired OrderOutboxDispatcher dispatcher;
    @MockitoSpyBean OrderCompletionHoldPersistenceAdapter holdPersistence;
    @MockitoBean OrderOutboxAfterCommitListener immediate;
    @MockitoBean PubSubPublisherFactory publishers;
    private Publisher broker;

    @BeforeEach void fixture() {
        remote.clear(); fenced.clear(); calls.set(0); behavior = "APPLY";
        entered = new CountDownLatch(1); unblock = new CountDownLatch(1);
        broker = mock(Publisher.class);
        when(publishers.forTopic(anyString(), anyString())).thenReturn(broker);
        when(broker.publish(any(PubsubMessage.class))).thenReturn(ApiFutures.immediateFuture("fixture-broker-id"));
    }
    record Case(String orderId, String reportId, String key) { }
    private Case held() {
        Instant now = Instant.now();
        Order order = Order.open("owner", "books", "pickup", "delivery", 5, 30, now, now.plusSeconds(7200));
        order.accept("courier", 0, now.plusSeconds(1));
        order = orders.saveAndFlush(order);
        String report = UUID.randomUUID().toString();
        holds.place(order.getId(), report, "owner", null);
        return new Case(order.getId(), report, UUID.randomUUID().toString());
    }
    private ReportResolutionResponse resolve(Case c) { return service.resolve(c.key(), c.orderId(), c.reportId(), "admin", "Evidence reviewed", "Bearer fixture"); }
    private String field(Case c, String field) { return jdbc.queryForObject("select " + field + " from order_report_resolutions where command_id=?", String.class, c.key()); }
    private boolean held(Case c) { return orders.findById(c.orderId()).orElseThrow().isCompletionHold(); }
    private ReportResolutionMessages.Compensation compensation(Case c) {
        return JSON.readValue(jdbc.queryForObject("select payload from order_event_outbox where event_id=?", String.class, field(c,"compensation_id")), ReportResolutionMessages.Compensation.class);
    }
    private ReportResolutionMessages.Result result(ReportResolutionMessages.Compensation q, String outcome, String code) {
        return new ReportResolutionMessages.Result(UUID.randomUUID().toString(), q.eventId(), q.commandId(), q.reportId(), q.orderId(), q.requesterId(), q.courierId(), q.adminId(), q.generation(), outcome, code);
    }
    private void overdue(Case c) { jdbc.update("update order_report_resolutions set lease_until=clock_timestamp()-interval '1 second',next_retry_at=clock_timestamp()-interval '1 second' where command_id=?", c.key()); }

    @Test void successfulRemoteAndLocalCommitReleaseOnlyThisHoldAndReplayWithoutCallingAgain() {
        Case c = held(); String other = UUID.randomUUID().toString(); holds.place(c.orderId(), other, "owner", null);
        var done = resolve(c);
        assertEquals("SUCCEEDED", done.status()); assertTrue(held(c));
        assertNotNull(holdRows.findById(c.reportId()).orElseThrow().getReleasedAt());
        assertNull(holdRows.findById(other).orElseThrow().getReleasedAt());
        assertEquals(orders.findById(c.orderId()).orElseThrow().getVersion(), done.order().getVersion());
        assertEquals(done.order().getVersion(), resolve(c).order().getVersion()); assertEquals(1, calls.get());
        assertNull(field(c,"compensation_id"));
        assertEquals(0, jdbc.queryForObject("select count(*) from order_event_outbox where order_id=?", Integer.class, c.orderId()));
        journal.recover(c.key()); assertEquals("SUCCEEDED", field(c,"state"));
        assertThrows(OrderProblem.class, () -> service.resolve(c.key(), c.orderId(), c.reportId(), "admin", "Changed reply", "Bearer fixture"));
    }

    @Test void releaseFailureRollsBackHoldAndPublishesOneCompensationOnlyAfterSeparateCommit() {
        Case c = held();
        doThrow(new IllegalStateException("local failure")).when(holdPersistence).release(any());
        var pending = resolve(c);
        assertEquals("COMPENSATING", pending.status()); assertTrue(held(c));
        assertNull(holdRows.findById(c.reportId()).orElseThrow().getReleasedAt());
        var q = compensation(c);
        assertEquals(c.reportId(), q.reportId()); assertEquals("courier", q.courierId()); assertEquals("owner", q.requesterId()); assertEquals(2, q.generation());
        // The dispatcher uses host time; make eligibility explicit despite millisecond DB/host clock skew.
        jdbc.update("update order_event_outbox set next_attempt_at=clock_timestamp()-interval '1 second' where event_id=?",q.eventId());
        dispatcher.dispatch(q.eventId());
        var captured = org.mockito.ArgumentCaptor.forClass(PubsubMessage.class); verify(broker).publish(captured.capture());
        assertEquals(q, JSON.readValue(captured.getValue().getData().toStringUtf8(), ReportResolutionMessages.Compensation.class));
        assertEquals("ReportResolutionCompensationRequested", captured.getValue().getAttributesOrThrow("eventType"));
        assertEquals("COMPENSATING", service.status(c.key()).status()); // Broker acceptance is not a business result.
        var committed = result(q,"COMPENSATED","REVERSED"); journal.accept(committed); journal.accept(committed);
        assertEquals("COMPENSATED", service.status(c.key()).status()); assertTrue(held(c));
        assertEquals(1, jdbc.queryForObject("select count(*) from order_report_resolution_results where command_id=?", Integer.class, c.key()));
        assertEquals(q, compensation(c)); assertEquals("COMPENSATED", resolve(c).status()); assertEquals(1, calls.get());
    }

    @Test void lostRemoteReplyKeepsHoldUntilConfirmedReversalAndNoTokensAreStored() {
        Case c = held(); behavior = "LOST_RESPONSE";
        assertEquals("COMPENSATING", resolve(c).status()); assertTrue(remote.containsKey(c.key())); assertTrue(held(c));
        var q = compensation(c);
        assertFalse(jdbc.queryForObject("select row_to_json(r)::text from order_report_resolutions r where command_id=?", String.class, c.key()).contains("Bearer fixture"));
        assertThrows(OrderProblem.class, () -> holds.release(c.orderId(), c.reportId(), "admin"));
        journal.accept(result(q,"COMPENSATED","REVERSED")); assertTrue(held(c));
    }

    @Test void providerRejectionHasNoCompensationAndInvalidInputsNeverCallReport() {
        Case c = held(); behavior = "NO_EFFECT";
        assertEquals("REJECTED", resolve(c).status()); assertNull(field(c,"compensation_id")); assertTrue(held(c));
        assertThrows(OrderProblem.class, () -> service.resolve("bad key ", c.orderId(), c.reportId(), "admin", "Reply", "Bearer fixture"));
        assertThrows(OrderProblem.class, () -> service.resolve(UUID.randomUUID().toString(), c.orderId(), c.reportId(), "admin", " ", "Bearer fixture"));
        assertThrows(OrderProblem.class, () -> service.resolve(UUID.randomUUID().toString(), c.orderId(), c.reportId(), "admin", "Reply", null));
        assertEquals(1, calls.get());
    }

    @Test void wrongRemoteBindingCannotReleaseHoldAndResultBindingOrContentCannotBeReused() {
        Case c = held(); behavior = "WRONG_BINDING"; resolve(c); var q = compensation(c); assertTrue(held(c));
        var good = result(q,"COMPENSATED","REVERSED");
        var wrong = new ReportResolutionMessages.Result(good.eventId(), good.compensationId(), good.commandId(), "other", good.orderId(), good.requesterId(), good.courierId(), good.adminId(), 2,"COMPENSATED","REVERSED");
        assertThrows(OrderProblem.class, () -> journal.accept(wrong));
        journal.accept(good);
        var conflicting = new ReportResolutionMessages.Result(good.eventId(), good.compensationId(), good.commandId(), good.reportId(), good.orderId(), good.requesterId(), good.courierId(), good.adminId(), 2,"COMPENSATED","FENCED_NO_EFFECT");
        assertThrows(OrderProblem.class, () -> journal.accept(conflicting));
        assertThrows(OrderProblem.class, () -> journal.accept(result(q,"RECONCILIATION_REQUIRED","REVISION_CONFLICT")));
    }

    @Test void crashedBeforeSendIsRejectedWithoutPublishingAndCrashedAfterPossibleEffectIsFenced() {
        Case untouched = held(); journal.begin(untouched.key(), untouched.orderId(), untouched.reportId(), "admin", "Reply"); overdue(untouched);
        service.recoverDue(); assertEquals("REJECTED", field(untouched,"state")); assertNull(field(untouched,"compensation_id"));
        Case uncertain = held(); var start = journal.begin(uncertain.key(), uncertain.orderId(), uncertain.reportId(), "admin", "Reply");
        journal.possibleEffect(start); overdue(uncertain); service.recoverDue();
        assertEquals("COMPENSATING", field(uncertain,"state")); var q = compensation(uncertain);
        journal.accept(result(q,"COMPENSATED","FENCED_NO_EFFECT")); assertTrue(held(uncertain));
        assertThrows(OrderProblem.class, () -> journal.complete(start));
    }

    @Test void lostResultRepublishesSameEventButFailedOutboxRequiresExplicitRedrive() {
        Case c = held(); behavior = "LOST_RESPONSE"; resolve(c); var q = compensation(c);
        jdbc.update("update order_event_outbox set next_attempt_at=clock_timestamp()-interval '1 second' where event_id=?",q.eventId());
        dispatcher.dispatch(q.eventId());
        assertEquals("PUBLISHED", jdbc.queryForObject("select state from order_event_outbox where event_id=?", String.class, q.eventId()));
        overdue(c); journal.recover(c.key());
        assertEquals(q, compensation(c));
        assertEquals("PENDING", jdbc.queryForObject("select state from order_event_outbox where event_id=?", String.class, q.eventId()));
        jdbc.update("update order_event_outbox set state='FAILED',attempt_count=10 where event_id=?", q.eventId());
        overdue(c); journal.recover(c.key());
        assertEquals("FAILED", jdbc.queryForObject("select state from order_event_outbox where event_id=?", String.class, q.eventId()));
        assertTrue(held(c));
    }

    @Test void leaseRecoveryFencesAStillInFlightRemoteCallAndCannotStealCommittedSuccess() throws Exception {
        Case c = held(); behavior = "DELAY";
        ExecutorService worker = Executors.newSingleThreadExecutor();
        try {
            var call = worker.submit(() -> resolve(c)); assertTrue(entered.await(3, TimeUnit.SECONDS));
            overdue(c); journal.recover(c.key()); var q = compensation(c); fenced.put(c.key(), true);
            journal.accept(result(q,"COMPENSATED","FENCED_NO_EFFECT")); unblock.countDown();
            assertEquals("COMPENSATED", call.get(5, TimeUnit.SECONDS).status()); assertFalse(remote.containsKey(c.key())); assertTrue(held(c));
        } finally { unblock.countDown(); worker.shutdownNow(); }
        Case success = held(); behavior = "APPLY"; var start = journal.begin(success.key(), success.orderId(), success.reportId(), "admin", "Evidence reviewed");
        journal.possibleEffect(start);
        var command = start.command(); journal.confirm(start, new ReportResolutionMessages.Resolution(command.commandId(), command.reportId(), command.orderId(), command.requesterId(), command.courierId(), command.adminId(),1,"APPLIED","RESOLVED"));
        journal.complete(start); journal.abandon(start);
        assertEquals("SUCCEEDED", field(success,"state")); assertNull(field(success,"compensation_id"));
    }

    @Test void confirmedRemoteEffectCannotBeFalselyFencedAndRevisionConflictsStayHeld() {
        Case c = held(); doThrow(new IllegalStateException("local failure")).when(holdPersistence).release(any()); resolve(c); var q = compensation(c);
        assertThrows(OrderProblem.class, () -> journal.accept(result(q,"COMPENSATED","FENCED_NO_EFFECT")));
        journal.accept(result(q,"RECONCILIATION_REQUIRED","REVISION_CONFLICT"));
        assertEquals("RECONCILIATION_REQUIRED", field(c,"state")); assertTrue(held(c));
        assertThrows(OrderProblem.class, () -> service.resolve(UUID.randomUUID().toString(), c.orderId(), c.reportId(), "admin", "Another resolution", "Bearer fixture"));
    }
}
