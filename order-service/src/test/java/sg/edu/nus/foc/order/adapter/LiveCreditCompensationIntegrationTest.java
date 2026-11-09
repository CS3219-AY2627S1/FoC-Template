package sg.edu.nus.foc.order.adapter;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.web.client.RestClient;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.Network;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;
import sg.edu.nus.foc.order.api.dto.response.OrderResponse;
import sg.edu.nus.foc.order.application.OrderCreationService;
import sg.edu.nus.foc.order.application.OrderOutboxDispatcher;
import sg.edu.nus.foc.order.application.OrderTransitionService;
import sg.edu.nus.foc.order.application.recovery.CommandRequest;
import sg.edu.nus.foc.order.application.recovery.CommandView;
import sg.edu.nus.foc.order.application.recovery.CreditCommandGateway;
import sg.edu.nus.foc.order.application.recovery.OrderCommandService;
import sg.edu.nus.foc.order.application.recovery.OrderCommandStore;
import sg.edu.nus.foc.order.application.recovery.OrderCompensationJournal;
import sg.edu.nus.foc.order.domain.OrderProblem;

/** Actual Order HTTP result receiver, Credit container, two real databases and
 * actual Pub/Sub emulator push in both directions. Only User/Supplier reads and
 * explicit crash/response-loss fault injection are fixtures. No cloud/ADC. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.DEFINED_PORT, properties = {
    "spring.profiles.active=prod", "server.address=127.0.0.1", "order.peers.mode=http",
    "order.security.user-service.mode=mock",
    "order.commands.enabled=true", "order.commands.recovery-policy=compensate",
    "order.commands.compensation.enabled=true", "order.commands.compensation.push-mode=emulator",
    "order.commands.compensation.request-topic=compensation-requests",
    "order.commands.compensation.result-subscription=order-compensation-results",
    "order.security.auth.project-id=demo-foc", "order.security.auth.emulator-host=local-fixture:9099",
    "order.lifecycle.cron=-", "order.messaging.outbox.recovery-cron=-",
    "order.messaging.publish-timeout=10s", "debug=false",
    "logging.level.org.springframework=ERROR", "logging.level.org.hibernate=ERROR",
    "logging.level.root=WARN", "FOC_ENVIRONMENT=local"
})
@Testcontainers
class LiveCreditCompensationIntegrationTest {
    // Host callback mapping must exist BEFORE the emulator container is created.
    private static final int ORDER_PORT = exposedOrderPort();
    private static final Network NETWORK = Network.newNetwork();
    @Container static final PostgreSQLContainer<?> CREDIT_DB = new PostgreSQLContainer<>("postgres:15-alpine")
            .withNetwork(NETWORK).withNetworkAliases("credit-db");
    @Container static final PostgreSQLContainer<?> ORDER_DB = new PostgreSQLContainer<>("postgres:15-alpine");
    @Container static final GenericContainer<?> PUBSUB = new GenericContainer<>(
            "gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators")
            .withNetwork(NETWORK).withNetworkAliases("pubsub-emulator").withExposedPorts(8085)
            .withCommand("gcloud", "beta", "emulators", "pubsub", "start",
                    "--project=demo-foc-local", "--host-port=0.0.0.0:8085")
            .waitingFor(Wait.forListeningPort()).withStartupTimeout(Duration.ofMinutes(2));
    @Container static final GenericContainer<?> CREDIT = new GenericContainer<>(creditImage())
            .withNetwork(NETWORK).withNetworkAliases("credit").dependsOn(CREDIT_DB, PUBSUB)
            .withExposedPorts(8080)
            .withEnv("SPRING_DATASOURCE_URL", "jdbc:postgresql://credit-db:5432/" + CREDIT_DB.getDatabaseName())
            .withEnv("SPRING_DATASOURCE_USERNAME", CREDIT_DB.getUsername())
            .withEnv("SPRING_DATASOURCE_PASSWORD", CREDIT_DB.getPassword())
            .withEnv("FIREBASE_AUTH_PROJECT_ID", "demo-foc")
            .withEnv("FIREBASE_AUTH_EMULATOR_HOST", "local-fixture:9099")
            .withEnv("FOC_ENVIRONMENT", "local").withEnv("USER_SERVICE_MODE", "mock")
            .withEnv("FOC_INTERNAL_ORDER_API_ENABLED", "true")
            .withEnv("CREDIT_PUBSUB_PUSH_MODE", "emulator")
            .withEnv("PUBSUB_EMULATOR_HOST", "pubsub-emulator:8085")
            .withEnv("PUBSUB_PROJECT_ID", "demo-foc-local")
            .withEnv("CREDIT_COMPENSATION_SUBSCRIPTION", "credit-compensation-requests")
            .withEnv("CREDIT_ORDER_OPEN_REFUND_SUBSCRIPTION", "credit-open-order-refund-local-v1")
            .withEnv("CREDIT_USER_CREATED_SUBSCRIPTION", "credit-user-created-local-v1")
            .withEnv("CREDIT_COMPENSATION_RESULT_TOPIC", "compensation-results")
            .withEnv("CREDIT_MESSAGING_MODE", "emulator")
            .withEnv("CREDIT_RESULT_OUTBOX_RECOVERY_CRON", "-").withEnv("LOG_LEVEL", "WARN")
            .waitingFor(Wait.forHttp("/actuator/health").forStatusCode(200))
            .withStartupTimeout(Duration.ofMinutes(3));

    private static DockerImageName creditImage() {
        String image = "foc-credit-compensation-contract:" + UUID.randomUUID();
        Path source = Path.of(System.getProperty("credit.contract.source", "../credit-service")).toAbsolutePath();
        try {
            Process build = new ProcessBuilder("docker", "build", "-t", image, source.toString())
                    .redirectErrorStream(true).redirectOutput(Path.of("target", "credit-compensation-build.log").toFile()).start();
            if (!build.waitFor(5, TimeUnit.MINUTES)) {
                build.destroyForcibly();
                throw new IllegalStateException("Actual Credit image build timed out.");
            }
            if (build.exitValue() != 0) throw new IllegalStateException("Actual Credit image build failed; see target/credit-compensation-build.log");
            return DockerImageName.parse(image);
        } catch (java.io.IOException failure) {
            throw new IllegalStateException("Docker and actual Credit source are required.", failure);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(interrupted);
        }
    }
    private static int exposedOrderPort() {
        try (java.net.ServerSocket socket = new java.net.ServerSocket(0)) {
            int port = socket.getLocalPort();
            org.testcontainers.Testcontainers.exposeHostPorts(port);
            return port;
        } catch (java.io.IOException failure) {
            throw new IllegalStateException("Cannot allocate isolated Order callback port.", failure);
        }
    }
    @DynamicPropertySource static void properties(DynamicPropertyRegistry properties) {
        properties.add("server.port", () -> ORDER_PORT);
        properties.add("spring.datasource.url", ORDER_DB::getJdbcUrl);
        properties.add("spring.datasource.username", ORDER_DB::getUsername);
        properties.add("spring.datasource.password", ORDER_DB::getPassword);
        properties.add("order.peers.credit-url", () -> "http://" + CREDIT.getHost() + ":" + CREDIT.getMappedPort(8080));
        properties.add("order.messaging.mode", () -> "emulator");
        properties.add("order.messaging.emulator-host", () -> PUBSUB.getHost() + ":" + PUBSUB.getMappedPort(8085));
        properties.add("order.messaging.project-id", () -> "demo-foc-local");
        properties.add("order.messaging.topics.open-order-refund", () -> "open-order-refund-local-v1");
    }
    @LocalServerPort int port;
    @Autowired OrderCommandService commands;
    @Autowired OrderCommandStore store;
    @Autowired OrderCompensationJournal journal;
    @Autowired OrderOutboxDispatcher dispatcher;
    @Autowired OrderTransitionService transitions;
    @Autowired sg.edu.nus.foc.order.application.OrderLifecycleScheduler lifecycle;
    @Autowired sg.edu.nus.foc.order.application.LifecycleProcessingService lifecycleProcessing;
    @Autowired JdbcTemplate orderDb;
    @Autowired sg.edu.nus.foc.order.infrastructure.JpaOrderRepository orderRepository;
    @MockitoSpyBean HttpCreditCommandGateway gateway;
    @MockitoSpyBean HttpPeerAdapters peers;
    @MockitoSpyBean OrderCreationService creation;
    @MockitoSpyBean HttpBackgroundRepostChecks backgroundChecks;
    private static boolean subscriptionsReady;

    @BeforeEach void fixturesAndSubscriptions() {
        doAnswer(call -> call.getArgument(0)).when(peers).verifyRequester(anyString(), nullable(String.class));
        doAnswer(call -> call.getArgument(0)).when(peers).verifyCourier(anyString(), nullable(String.class));
        doNothing().when(peers).requireCourierAcceptance(anyString(), nullable(String.class));
        doNothing().when(peers).validatePair(anyString(), anyString(), nullable(String.class));
        doNothing().when(backgroundChecks).validate(anyString(), anyString(), anyString());
        // Funding reads still call actual Credit through HTTP, not a fixture.
        assertTrue(commands.enabled(), "Explicit real transport gate must be open for this harness");
        if (!subscriptionsReady) {
            RestClient broker = broker();
            for (String topic : java.util.List.of("compensation-requests", "compensation-results", "open-order-refund-local-v1", "user-created-local-v1")) {
                broker.put().uri("/topics/" + topic).body(Map.of()).retrieve().toBodilessEntity();
            }
            subscription("credit-compensation-requests", "compensation-requests",
                    "http://credit:8080/api/credits/internal/command-compensations");
            subscription("order-compensation-results", "compensation-results",
                    "http://host.testcontainers.internal:" + port + "/api/orders/internal/credit-compensations");
            subscription("credit-open-order-refund-local-v1", "open-order-refund-local-v1",
                    "http://credit:8080/api/credits/internal/order-events/open-refund");
            subscription("credit-user-created-local-v1", "user-created-local-v1",
                    "http://credit:8080/api/credits/internal/user-events/created");
            subscriptionsReady = true;
        }
    }

    @Test void appliedReservationLostResponseIsReversedOnceThroughBothBrokerPushes() throws Exception {
        String actor = account(), key = key();
        loseResponse(key);
        CommandView pending = commands.submit(key, input(actor), token(actor));
        awaitRejected(key);
        assertEquals("REFUNDED", creditText("select status from credit_reservations where order_id=?", pending.orderId()));
        assertEquals(0L, creditDb().queryForObject("select reserved_balance from credit_accounts where user_id=?", Long.class, actor));
        assertEquals(50L, creditDb().queryForObject("select total_balance from credit_accounts where user_id=?", Long.class, actor));
        assertEquals(0, orderDb.queryForObject("select count(*) from orders where id=?", Integer.class, pending.orderId()));
        String payload = orderDb.queryForObject("select payload from order_event_outbox where command_id=?", String.class, key);
        String resultId = creditText("select result_event_id from credit_compensation_inbox where command_id=?", key);
        publish(payload); publish(payload);
        await(() -> creditDb().queryForObject("select attempt_count from credit_compensation_result_outbox where event_id=?", Integer.class, resultId) >= 2);
        assertEquals(resultId, creditText("select result_event_id from credit_compensation_inbox where command_id=?", key));
        assertEquals(1, creditDb().queryForObject("select count(*) from credit_ledger where origin_type='COMMAND_COMPENSATION' and origin_id=?", Integer.class, key));
        verify(gateway, times(1)).execute(eq(key), any(), anyLong(), anyString());
        assertEquals("REJECTED", commands.resume(key, actor, token(actor)).outcome());
        verify(gateway, times(1)).execute(eq(key), any(), anyLong(), anyString());
    }

    @Test void productionProfileStillRejectsUnsignedUserApiCalls() {
        int status = RestClient.builder().baseUrl("http://127.0.0.1:" + port).build()
                .get().uri("/api/orders/commands/capabilities")
                .exchange((request, response) -> response.getStatusCode().value());
        assertEquals(401, status);
    }

    @Test void historicalRetryCommandKeepsItsPolicyAcrossSubmitAndResume() {
        String actor = account(), key = key();
        CommandRequest input = input(actor);
        store.register(key, input); // Represents a command saved before cutover.
        CommandView completed = commands.submit(key, input, token(actor));
        assertEquals("SUCCESS", completed.outcome(), completed.message());
        assertEquals("RETRY", store.recoveryPolicy(key));
        assertEquals("SUCCESS", commands.resume(key, actor, token(actor)).outcome());
        assertEquals(0, orderDb.queryForObject("select count(*) from order_event_outbox where command_id=?", Integer.class, key));
    }

    @Test void compensationBeforeAnyOriginalRequestFencesEvenAHigherGeneration() throws Exception {
        String actor = account(), key = key();
        doThrow(new IllegalStateException("request never reached Credit")).when(gateway)
                .execute(eq(key), any(), anyLong(), anyString());
        CommandView pending = commands.submit(key, input(actor), token(actor));
        awaitRejected(key);
        assertEquals("FENCED_NO_EFFECT", creditText("select code from credit_command_records where command_id=?", key));
        reset(gateway);
        CreditCommandGateway.Result late = gateway.execute(key,
                new CreditCommandGateway.Mutation("CREATE", pending.orderId(), actor, 5), 99, token(actor));
        assertFalse(late.applied());
        assertEquals(0, creditDb().queryForObject("select count(*) from credit_reservations where order_id=?", Integer.class, pending.orderId()));
    }

    @Test void anActualHttpReadTimeoutAfterCreditCommitIsCompensated() throws Exception {
        String actor = account(), key = key();
        com.sun.net.httpserver.HttpServer proxy = com.sun.net.httpserver.HttpServer.create(
                new java.net.InetSocketAddress("127.0.0.1", 0), 0);
        java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(2);
        proxy.setExecutor(pool);
        proxy.createContext("/", exchange -> {
            try {
                java.net.URI destination = java.net.URI.create("http://" + CREDIT.getHost() + ":"
                        + CREDIT.getMappedPort(8080) + exchange.getRequestURI());
                java.net.http.HttpRequest.Builder request = java.net.http.HttpRequest.newBuilder(destination)
                        .method(exchange.getRequestMethod(), java.net.http.HttpRequest.BodyPublishers.ofByteArray(
                                exchange.getRequestBody().readAllBytes()));
                for (String header : java.util.List.of("Authorization", "Idempotency-Key", "X-Command-Generation", "Content-Type")) {
                    String value = exchange.getRequestHeaders().getFirst(header);
                    if (value != null) request.header(header, value);
                }
                java.net.http.HttpResponse<byte[]> response = java.net.http.HttpClient.newHttpClient()
                        .send(request.build(), java.net.http.HttpResponse.BodyHandlers.ofByteArray());
                // Real Credit committed before the proxy withholds its response.
                if ("PUT".equals(exchange.getRequestMethod())) Thread.sleep(2500);
                for (String header : java.util.List.of("Idempotency-Key", "Command-Outcome", "Content-Type")) {
                    response.headers().firstValue(header).ifPresent(value -> exchange.getResponseHeaders().set(header, value));
                }
                exchange.sendResponseHeaders(response.statusCode(), response.body().length);
                exchange.getResponseBody().write(response.body());
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            } finally { exchange.close(); }
        });
        proxy.start();
        try {
            HttpCreditCommandGateway slow = new HttpCreditCommandGateway(HttpCreditCommandGateway.client(
                    "http://127.0.0.1:" + proxy.getAddress().getPort(), Duration.ofSeconds(3), Duration.ofSeconds(1)));
            doAnswer(call -> slow.execute(call.getArgument(0), call.getArgument(1),
                    call.getArgument(2), call.getArgument(3))).when(gateway).execute(eq(key), any(), anyLong(), anyString());
            CommandView uncertain = commands.submit(key, input(actor), token(actor));
            awaitRejected(key);
            assertEquals("REFUNDED", creditText("select status from credit_reservations where order_id=?", uncertain.orderId()));
        } finally { proxy.stop(0); pool.shutdownNow(); }
    }

    @Test void lostResultIsRecreatedFromCreditOutboxWithoutRepeatingTheEffect() throws Exception {
        broker().post().uri("/subscriptions/order-compensation-results:modifyPushConfig")
                .body(Map.of("pushConfig", Map.of())).retrieve().toBodilessEntity();
        try {
            String actor = account(), key = key(); loseResponse(key);
            commands.submit(key, input(actor), token(actor));
            await(() -> creditDb().queryForObject("select count(*) from credit_compensation_inbox where command_id=?", Integer.class, key) == 1);
            await(() -> "PUBLISHED".equals(creditText("select state from credit_compensation_result_outbox where command_id=?", key)));
            assertEquals("PENDING", store.get(key).status());
            String compensation = orderDb.queryForObject("select compensation_id from order_commands where command_id=?", String.class, key);
            // Suppress the first result to prove semantic replay produces it again.
            tools.jackson.databind.JsonNode pulled = tools.jackson.databind.json.JsonMapper.builder().build().valueToTree(
                    broker().post().uri("/subscriptions/order-compensation-results:pull")
                            .body(Map.of("maxMessages", 10)).retrieve().body(Map.class));
            java.util.List<String> acknowledgments = new java.util.ArrayList<>();
            for (tools.jackson.databind.JsonNode message : pulled.path("receivedMessages")) {
                acknowledgments.add(message.path("ackId").asText());
            }
            assertFalse(acknowledgments.isEmpty(), "The first actual result must be discarded before testing replay.");
            if (!acknowledgments.isEmpty()) broker().post().uri("/subscriptions/order-compensation-results:acknowledge")
                    .body(Map.of("ackIds", acknowledgments)).retrieve().toBodilessEntity();
            orderDb.update("update order_commands set next_retry_at=to_timestamp(0) where command_id=?", key);
            commands.recoverDue();
            restoreResultPush();
            awaitRejected(key);
            assertEquals(compensation, orderDb.queryForObject("select compensation_id from order_commands where command_id=?", String.class, key));
            assertEquals(1, creditDb().queryForObject("select count(*) from credit_ledger where origin_type='COMMAND_COMPENSATION' and origin_id=?", Integer.class, key));
        } finally { restoreResultPush(); }
    }

    private void restoreResultPush() {
        broker().post().uri("/subscriptions/order-compensation-results:modifyPushConfig").body(Map.of("pushConfig",
                Map.of("pushEndpoint", "http://host.testcontainers.internal:" + port + "/api/orders/internal/credit-compensations")))
                .retrieve().toBodilessEntity();
    }

    @Test void lostAcceptanceResponseClearsOnlyItsAssignmentAndKeepsOrderOpen() throws Exception {
        String requester = account(), courier = account();
        OrderResponse opened = open(requester);
        String key = key(); loseResponse(key);
        commands.submit(key, new CommandRequest("ACCEPT", courier, opened.getId(), opened.getVersion(), null), token(courier));
        awaitRejected(key);
        assertNull(creditText("select courier_id from credit_reservations where order_id=?", opened.getId()));
        assertEquals("OPEN", orderDb.queryForObject("select status from orders where id=?", String.class, opened.getId()));
        assertEquals(5L, creditDb().queryForObject("select reserved_balance from credit_accounts where user_id=?", Long.class, requester));
    }

    @Test void expiredWorkerRacingTheFirstCompensationInsertCanNeverFinalizeSuccess() throws Exception {
        String actor = account(), key = key();
        java.util.concurrent.CountDownLatch entered = new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.CountDownLatch release = new java.util.concurrent.CountDownLatch(1);
        doAnswer(call -> {
            entered.countDown();
            assertTrue(release.await(15, TimeUnit.SECONDS));
            return call.callRealMethod();
        }).when(gateway).execute(eq(key), any(), anyLong(), anyString());
        try (java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newSingleThreadExecutor()) {
            java.util.concurrent.Future<CommandView> original = pool.submit(() -> commands.submit(key, input(actor), token(actor)));
            assertTrue(entered.await(15, TimeUnit.SECONDS));
            try {
                orderDb.update("update order_commands set lease_expires_at=to_timestamp(0),"
                        + "resolution_deadline_at=to_timestamp(0),next_retry_at=to_timestamp(0) where command_id=?", key);
                commands.recoverDue(); // Revokes the original owner before releasing it.
            } finally { release.countDown(); }
            dispatcher.dispatchDueBatch();
            assertNotEquals("SUCCESS", original.get(20, TimeUnit.SECONDS).outcome());
            awaitRejected(key);
            assertEquals(0, orderDb.queryForObject("select count(*) from orders where id=?", Integer.class, store.get(key).orderId()));
            assertEquals(0L, creditDb().queryForObject("select reserved_balance from credit_accounts where user_id=?", Long.class, actor));
            assertEquals("COMPENSATED", creditText("select outcome from credit_command_records where command_id=?", key));
        }
    }

    @Test void lostAbortResponseRestoresExactAssignmentWithoutAbortedHistory() throws Exception {
        String requester = account(), courier = account();
        OrderResponse opened = open(requester);
        String acceptKey = key();
        OrderResponse accepted = commands.submit(acceptKey,
                new CommandRequest("ACCEPT", courier, opened.getId(), opened.getVersion(), null), token(courier)).result();
        assertNotNull(accepted);
        String key = key(); loseResponse(key);
        commands.submit(key, new CommandRequest("ABORT", courier, accepted.getId(), accepted.getVersion(), null), token(courier));
        awaitRejected(key);
        assertEquals(courier, creditText("select courier_id from credit_reservations where order_id=?", opened.getId()));
        assertEquals(acceptKey, creditText("select courier_assignment_identity from credit_reservations where order_id=?", opened.getId()));
        assertEquals("ACCEPTED", orderDb.queryForObject("select status from orders where id=?", String.class, opened.getId()));
        assertEquals(0, orderDb.queryForObject("select count(*) from order_courier_attempts where order_id=?", Integer.class, opened.getId()));
    }

    @Test void localWriteRollbackCompensatesButCommittedSuccessNeverDoes() throws Exception {
        String actor = account(), key = key();
        doAnswer(call -> { call.callRealMethod(); throw new IllegalStateException("local commit failed"); })
                .when(creation).createConfirmed(eq(key), anyString(), eq(actor), anyString(), anyString(), anyString(),
                        anyLong(), anyInt(), any(), nullable(sg.edu.nus.foc.order.domain.RepostPlan.class), anyString());
        CommandView rolledBack = commands.submit(key, input(actor), token(actor));
        awaitRejected(key);
        assertEquals(0, orderDb.queryForObject("select count(*) from orders where id=?", Integer.class, rolledBack.orderId()));
        assertEquals("REFUNDED", creditText("select status from credit_reservations where order_id=?", rolledBack.orderId()));
        String successKey = key();
        CommandView success = commands.submit(successKey, input(actor), token(actor));
        assertEquals("SUCCESS", success.outcome(), success.message());
        orderDb.update("update order_commands set resolution_deadline_at=to_timestamp(0),lease_expires_at=null where command_id=?", successKey);
        commands.recoverDue();
        assertEquals("SUCCESS", store.get(successKey).outcome());
        assertEquals(0, orderDb.queryForObject("select count(*) from order_event_outbox where command_id=?", Integer.class, successKey));
    }

    @Test void manualRepostFailureCompensatesCandidateNotOriginal() throws Exception {
        String actor = account();
        OrderResponse original = open(actor);
        orderDb.update("update orders set expires_at=clock_timestamp()-interval '1 second' where id=?", original.getId());
        lifecycle.processDueOrders();
        await(() -> "REFUNDED".equals(creditText("select status from credit_reservations where order_id=?", original.getId())));
        long version = orderDb.queryForObject("select version from orders where id=?", Long.class, original.getId());
        String key = key(); loseResponse(key);
        commands.submit(key, new CommandRequest("REPOST", actor, original.getId(), version,
                input(actor).creation()), token(actor));
        awaitRejected(key);
        String candidate = store.get(key).candidateOrderId();
        assertNotEquals(original.getId(), candidate);
        assertEquals("REFUNDED", creditText("select status from credit_reservations where order_id=?", candidate));
        assertNull(orderDb.queryForObject("select reposted_order_id from orders where id=?", String.class, original.getId()));
        assertEquals(0, orderDb.queryForObject("select count(*) from orders where id=?", Integer.class, candidate));
    }

    @Test void automaticRepostUsesNoJwtAndCreatesOnlyOneLinkedSuccessor() throws Exception {
        String actor = account();
        OrderResponse original = automaticOriginal(actor);
        CommandView first = commands.submitAutomatic(original.getId(), Instant.now());
        assertEquals("SUCCESS", first.outcome(), first.message());
        CommandView duplicate = commands.submitAutomatic(original.getId(), Instant.now());
        assertEquals(first.commandId(), duplicate.commandId());
        assertEquals(first.result().getId(), duplicate.result().getId());
        assertEquals(1, orderDb.queryForObject("select count(*) from orders where original_order_id=?", Integer.class, original.getId()));
        assertEquals("RESERVED", creditText("select status from credit_reservations where order_id=?", first.result().getId()));
    }

    @Test void refundDeliveryLagDoesNotRegisterOrAttemptAnAutomaticReservation() {
        String actor = account();
        Instant now = Instant.now();
        CommandRequest.Creation fields = new CommandRequest.Creation("refund lag", "pickup", "delivery", 5, 15,
                now.plusSeconds(3600), true, now.plusSeconds(3600), 4, 15, now.plusSeconds(7200));
        OrderResponse original = commands.submit(key(), new CommandRequest("CREATE", actor, null, 0, fields), token(actor)).result();
        assertNotNull(original);
        // Model expiry committed while its refund delivery is still outstanding.
        orderDb.update("update orders set status='EXPIRED', expires_at=clock_timestamp()-interval '2 seconds', "
                + "due_at=clock_timestamp()-interval '1 second',version=version+1 where id=?", original.getId());
        OrderProblem waiting = assertThrows(OrderProblem.class,
                () -> commands.submitAutomatic(original.getId(), Instant.now()));
        assertEquals("SERVICE_UNAVAILABLE", waiting.getCode());
        assertTrue(store.find("AUTO_REPOST:" + original.getId()).isEmpty());
        verify(gateway, never()).execute(eq("AUTO_REPOST:" + original.getId()), any(), anyLong(), any());
    }

    @Test void minuteSchedulerCreatesOneAutomaticSuccessorAndSkipsAnExpiredHeldOriginal() throws Exception {
        String actor = account();
        OrderResponse original = automaticOriginal(actor);
        OrderResponse held = automaticOriginal(actor);
        orderDb.update("update orders set completion_hold=true where id=?", held.getId());
        org.springframework.test.util.ReflectionTestUtils.setField(lifecycleProcessing, "automaticRepostEnabled", true);
        try {
            lifecycle.processDueOrders();
            lifecycle.processDueOrders();
            assertEquals(1, orderDb.queryForObject("select count(*) from orders where original_order_id=?", Integer.class, original.getId()));
            assertEquals(0, orderDb.queryForObject("select count(*) from orders where original_order_id=?", Integer.class, held.getId()));
            assertTrue(store.find("AUTO_REPOST:" + held.getId()).isEmpty());
        } finally {
            org.springframework.test.util.ReflectionTestUtils.setField(lifecycleProcessing, "automaticRepostEnabled", false);
        }
    }

    @Test void manualRepostCannotPassTheAutomaticPendingOriginalGuard() throws Exception {
        String actor = account();
        OrderResponse original = automaticOriginal(actor);
        java.util.concurrent.CountDownLatch entered = new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.CountDownLatch release = new java.util.concurrent.CountDownLatch(1);
        doAnswer(call -> {
            entered.countDown();
            assertTrue(release.await(15, TimeUnit.SECONDS));
            return null;
        }).when(backgroundChecks).validate(eq(actor), anyString(), anyString());
        try (java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newSingleThreadExecutor()) {
            java.util.concurrent.Future<CommandView> automatic =
                    pool.submit(() -> commands.submitAutomatic(original.getId(), Instant.now()));
            assertTrue(entered.await(15, TimeUnit.SECONDS));
            try {
                long version = orderDb.queryForObject("select version from orders where id=?", Long.class, original.getId());
                OrderProblem blocked = assertThrows(OrderProblem.class, () -> commands.submit(key(),
                        new CommandRequest("REPOST", actor, original.getId(), version, input(actor).creation()), token(actor)));
                assertEquals("CONFLICT", blocked.getCode());
            } finally { release.countDown(); }
            assertEquals("SUCCESS", automatic.get(20, TimeUnit.SECONDS).outcome());
            assertEquals(1, orderDb.queryForObject("select count(*) from orders where original_order_id=?", Integer.class, original.getId()));
        }
    }

    @Test void automaticLostCreditReplyCompensatesWithoutCreatingAnOrderOrForwardRetry() throws Exception {
        String actor = account();
        OrderResponse original = automaticOriginal(actor);
        String key = "AUTO_REPOST:" + original.getId();
        doAnswer(call -> { call.callRealMethod(); throw new IllegalStateException("lost background reply"); })
                .when(gateway).execute(eq(key), any(), anyLong(), isNull());
        CommandView pending = commands.submitAutomatic(original.getId(), Instant.now());
        awaitRejected(key);
        assertEquals("REFUNDED", creditText("select status from credit_reservations where order_id=?", store.get(key).candidateOrderId()));
        assertNull(orderDb.queryForObject("select reposted_order_id from orders where id=?", String.class, original.getId()));
        assertTrue(orderRepository.findDueAutomaticRepostIds(Instant.now()).contains(original.getId()));
        CommandView retry = commands.submitAutomatic(original.getId(), Instant.now());
        assertEquals("SUCCESS", retry.outcome());
        assertNotEquals(key, retry.commandId());
        assertNotEquals(store.get(key).candidateOrderId(), retry.result().getId());
        assertEquals("RESERVED", creditText("select status from credit_reservations where order_id=?", retry.result().getId()));
        assertEquals(1, orderDb.queryForObject("select count(*) from orders where original_order_id=?", Integer.class, original.getId()));
        verify(gateway, times(1)).execute(eq(key), any(), anyLong(), isNull());
    }

    @Test void automaticRepostRetriesTemporaryPreCreditFailuresOnLaterSchedulerPasses() throws Exception {
        String actor = account(); OrderResponse original = automaticOriginal(actor);
        doThrow(new OrderProblem("SERVICE_UNAVAILABLE", "Temporary requester lookup failure"))
                .doThrow(new IllegalStateException("Temporary supplier timeout"))
                .doNothing().when(backgroundChecks).validate(eq(actor), anyString(), anyString());
        org.springframework.test.util.ReflectionTestUtils.setField(lifecycleProcessing, "automaticRepostEnabled", true);
        try {
            lifecycle.processDueOrders();
            assertEquals(1, automaticCount(original.getId()));
            assertTrue(orderRepository.findDueAutomaticRepostIds(Instant.now()).contains(original.getId()));
            lifecycle.processDueOrders();
            assertEquals(2, automaticCount(original.getId()));
            assertEquals(0, orderDb.queryForObject("select count(*) from order_commands where order_id=? and automatic_execution and possible_effect", Integer.class, original.getId()));
            lifecycle.processDueOrders(); lifecycle.processDueOrders();
            assertEquals(3, automaticCount(original.getId()));
            assertEquals(1, orderDb.queryForObject("select count(*) from orders where original_order_id=?", Integer.class, original.getId()));
            assertTrue(Boolean.TRUE.equals(orderDb.queryForObject("select used from orders where id=?", Boolean.class, original.getId())));
            assertFalse(orderRepository.findDueAutomaticRepostIds(Instant.now()).contains(original.getId()));
        } finally { org.springframework.test.util.ReflectionTestUtils.setField(lifecycleProcessing, "automaticRepostEnabled", false); }
    }

    @Test void insufficientCreditsStopsAutomaticPlanEvenAfterBalanceRecoversButAllowsManualRepost() throws Exception {
        String actor = account(); OrderResponse original = automaticOriginal(actor);
        creditDb().update("update credit_accounts set total_balance=0 where user_id=?", actor);
        CommandView rejected = commands.submitAutomatic(original.getId(), Instant.now());
        assertEquals("REJECTED", rejected.outcome()); assertEquals("INSUFFICIENT_CREDITS", rejected.reason());
        assertFalse(store.automaticRetrySafe(rejected.commandId()));
        assertFalse(orderRepository.findDueAutomaticRepostIds(Instant.now()).contains(original.getId()));
        assertTrue(orderDb.queryForObject("select repost_failure_message from orders where id=?", String.class,
                original.getId()).contains("insufficient"));
        creditDb().update("update credit_accounts set total_balance=50 where user_id=?", actor);
        for (int scan = 0; scan < 3; scan++) {
            assertEquals(rejected.commandId(), commands.submitAutomatic(original.getId(), Instant.now()).commandId());
        }
        assertEquals(1, automaticCount(original.getId()));
        assertEquals("REJECTED", store.get(rejected.commandId()).outcome());
        assertFalse(orderDb.queryForObject("select used from orders where id=?", Boolean.class, original.getId()));
        assertEquals(0L, creditDb().queryForObject("select reserved_balance from credit_accounts where user_id=?", Long.class, actor));
        long version = orderDb.queryForObject("select version from orders where id=?", Long.class, original.getId());
        CommandView success = commands.submit(key(), new CommandRequest("REPOST", actor, original.getId(),
                version, input(actor).creation()), token(actor));
        assertEquals("SUCCESS", success.outcome());
        assertEquals(5L, creditDb().queryForObject("select reserved_balance from credit_accounts where user_id=?", Long.class, actor));
        assertEquals(1, orderDb.queryForObject("select count(*) from orders where original_order_id=?", Integer.class, original.getId()));
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {
        "FORBIDDEN", "ACCOUNT_NOT_FOUND", "NOT_FOUND", "VALIDATION_ERROR", "REPOST_EXPIRED"
    })
    void confirmedBusinessRejectionStopsBothSelectionAndDirectAutomaticRetries(String code) throws Exception {
        String actor = account();
        OrderResponse original = automaticOriginal(actor);
        doThrow(new OrderProblem(code, "The saved repost details need attention."))
                .when(backgroundChecks).validate(eq(actor), anyString(), anyString());
        CommandView rejected = commands.submitAutomatic(original.getId(), Instant.now());
        assertEquals("REJECTED", rejected.outcome());
        assertEquals(code, rejected.reason());
        assertFalse(store.automaticRetrySafe(rejected.commandId()));
        assertFalse(orderRepository.findDueAutomaticRepostIds(Instant.now()).contains(original.getId()));
        doNothing().when(backgroundChecks).validate(eq(actor), anyString(), anyString());
        assertEquals(rejected.commandId(), commands.submitAutomatic(original.getId(), Instant.now()).commandId());
        assertEquals(1, automaticCount(original.getId()));
        verify(gateway, never()).execute(eq(rejected.commandId()), any(), anyLong(), any());
        assertNull(orderDb.queryForObject("select reposted_order_id from orders where id=?", String.class, original.getId()));
    }

    @Test void olderBusinessRejectionCannotBeBypassedByALaterSafeFailureFromThePreviousPolicy() throws Exception {
        String actor = account();
        OrderResponse original = automaticOriginal(actor);
        doThrow(new OrderProblem("SERVICE_UNAVAILABLE", "Temporary lookup failure"))
                .when(backgroundChecks).validate(eq(actor), anyString(), anyString());
        CommandView first = commands.submitAutomatic(original.getId(), Instant.now());
        CommandView latest = commands.submitAutomatic(original.getId(), Instant.now());
        assertEquals("REJECTED", first.outcome());
        assertEquals("REJECTED", latest.outcome());
        assertNotEquals(first.commandId(), latest.commandId());
        // Model persisted history from the previous policy, which retried even
        // business rejections. A later temporary outcome must not erase the stop.
        orderDb.update("update order_commands set reason='INSUFFICIENT_CREDITS' where command_id=?", first.commandId());
        assertFalse(orderRepository.findDueAutomaticRepostIds(Instant.now()).contains(original.getId()));
        assertFalse(store.automaticRetrySafe(latest.commandId()));
        doNothing().when(backgroundChecks).validate(eq(actor), anyString(), anyString());
        assertEquals(latest.commandId(), commands.submitAutomatic(original.getId(), Instant.now()).commandId());
        assertEquals(2, automaticCount(original.getId()));
        assertNull(orderDb.queryForObject("select reposted_order_id from orders where id=?", String.class, original.getId()));
    }

    @Test void unresolvedAutomaticCreditEffectBlocksANewAttemptUntilCompensationCommits() throws Exception {
        String actor = account(); OrderResponse original = automaticOriginal(actor);
        String firstKey = "AUTO_REPOST:" + original.getId();
        var entered = new java.util.concurrent.CountDownLatch(1);
        var release = new java.util.concurrent.CountDownLatch(1);
        doAnswer(call -> {
            call.callRealMethod(); entered.countDown();
            assertTrue(release.await(15, TimeUnit.SECONDS));
            throw new IllegalStateException("Lost reservation response");
        }).when(gateway).execute(eq(firstKey), any(), anyLong(), isNull());
        try (var worker = java.util.concurrent.Executors.newSingleThreadExecutor()) {
            var request = worker.submit(() -> commands.submitAutomatic(original.getId(), Instant.now()));
            assertTrue(entered.await(15, TimeUnit.SECONDS));
            try {
                assertEquals("PENDING", commands.submitAutomatic(original.getId(), Instant.now()).status());
                assertEquals(1, automaticCount(original.getId()));
                assertFalse(orderRepository.findDueAutomaticRepostIds(Instant.now()).contains(original.getId()));
            } finally { release.countDown(); }
            request.get(20, TimeUnit.SECONDS);
        }
        awaitRejected(firstKey);
        assertEquals("SUCCESS", commands.submitAutomatic(original.getId(), Instant.now()).outcome());
        assertEquals(2, automaticCount(original.getId()));
        verify(gateway, times(1)).execute(eq(firstKey), any(), anyLong(), isNull());
    }

    @Test void failedAutomaticRepostStillRespectsHoldsAndTheConfiguredPlanExpiry() throws Exception {
        String actor = account(); OrderResponse original = automaticOriginal(actor);
        doThrow(new OrderProblem("SERVICE_UNAVAILABLE", "Temporary lookup failure"))
                .when(backgroundChecks).validate(eq(actor), anyString(), anyString());
        assertEquals("REJECTED", commands.submitAutomatic(original.getId(), Instant.now()).outcome());
        assertTrue(orderRepository.findDueAutomaticRepostIds(Instant.now()).contains(original.getId()));
        orderDb.update("update orders set completion_hold=true where id=?", original.getId());
        assertFalse(orderRepository.findDueAutomaticRepostIds(Instant.now()).contains(original.getId()));
        orderDb.update("update orders set completion_hold=false,repost_expires_at=clock_timestamp()-interval '1 second' where id=?", original.getId());
        assertFalse(orderRepository.findDueAutomaticRepostIds(Instant.now()).contains(original.getId()));
        assertThrows(OrderProblem.class, () -> commands.submitAutomatic(original.getId(), Instant.now()));
        assertEquals(1, automaticCount(original.getId()));
    }

    private int automaticCount(String orderId) {
        return orderDb.queryForObject("select count(*) from order_commands where order_id=? and automatic_execution", Integer.class, orderId);
    }

    @Test void concurrentRetriesAfterASafeFailureCreateOnlyOneFreshAttempt() throws Exception {
        String actor = account(); OrderResponse original = automaticOriginal(actor);
        doThrow(new OrderProblem("SERVICE_UNAVAILABLE", "Temporary lookup failure"))
                .doNothing().when(backgroundChecks).validate(eq(actor), anyString(), anyString());
        assertEquals("REJECTED", commands.submitAutomatic(original.getId(), Instant.now()).outcome());
        var ready = new java.util.concurrent.CountDownLatch(2);
        doAnswer(call -> {
            boolean refunded = (boolean) call.callRealMethod();
            ready.countDown(); assertTrue(ready.await(15, TimeUnit.SECONDS)); return refunded;
        }).when(backgroundChecks).fundingReady(eq(original.getId()), eq(actor));
        try (var workers = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<CommandView> retry = () -> {
                try { return commands.submitAutomatic(original.getId(), Instant.now()); }
                catch (OrderProblem conflict) { assertEquals("CONFLICT", conflict.getCode()); return null; }
                catch (org.springframework.dao.PessimisticLockingFailureException busy) { return null; }
            };
            var first = workers.submit(retry); var second = workers.submit(retry);
            CommandView a = first.get(25, TimeUnit.SECONDS), b = second.get(25, TimeUnit.SECONDS);
            assertTrue(a != null && "SUCCESS".equals(a.outcome()) || b != null && "SUCCESS".equals(b.outcome()));
        }
        assertEquals(2, automaticCount(original.getId()));
        assertEquals(1, orderDb.queryForObject("select count(*) from orders where original_order_id=?", Integer.class, original.getId()));
        assertEquals(4L, creditDb().queryForObject("select reserved_balance from credit_accounts where user_id=?", Long.class, actor));
    }

    private OrderResponse automaticOriginal(String actor) throws Exception {
        Instant now = Instant.now();
        CommandRequest.Creation fields = new CommandRequest.Creation("automatic test", "pickup", "delivery", 5, 15,
                now.plusSeconds(3600), true, now.plusSeconds(3600), 4, 15, now.plusSeconds(7200));
        OrderResponse original = commands.submit(key(), new CommandRequest("CREATE", actor, null, 0, fields), token(actor)).result();
        assertNotNull(original);
        orderDb.update("update orders set expires_at=clock_timestamp()-interval '2 seconds', due_at=clock_timestamp()-interval '1 second' where id=?", original.getId());
        lifecycle.processDueOrders();
        await(() -> "REFUNDED".equals(creditText("select status from credit_reservations where order_id=?", original.getId())));
        return original;
    }

    private void loseResponse(String key) {
        doAnswer(call -> { call.callRealMethod(); throw new IllegalStateException("lost actual Credit response"); })
                .when(gateway).execute(eq(key), any(), anyLong(), anyString());
    }
    private void awaitRejected(String key) throws Exception {
        await(() -> "COMPLETED".equals(store.get(key).status()));
        assertEquals("REJECTED", store.get(key).outcome());
        assertEquals("FULLY_COMPENSATED", orderDb.queryForObject("select final_stage_status from order_commands where command_id=?", String.class, key));
    }
    private void await(java.util.function.BooleanSupplier condition) {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(45);
        while (System.nanoTime() < deadline) {
            // Explicit deterministic recovery tick, not a mocked delivery. The
            // immediate attempt can precede a DB-clock next_attempt_at on Windows.
            dispatcher.dispatchDueBatch();
            if (condition.getAsBoolean()) return;
            try {
                Thread.sleep(100);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("Interrupted while awaiting actual compensation delivery", interrupted);
            }
        }
        fail("Actual compensation delivery did not reach the expected committed state.");
    }
    private RestClient broker() {
        return RestClient.builder().baseUrl("http://" + PUBSUB.getHost() + ":" + PUBSUB.getMappedPort(8085)
                + "/v1/projects/demo-foc-local").build();
    }
    private void subscription(String id, String topic, String endpoint) {
        broker().put().uri("/subscriptions/" + id).body(Map.of("topic", "projects/demo-foc-local/topics/" + topic,
                "ackDeadlineSeconds", 10, "pushConfig", Map.of("pushEndpoint", endpoint))).retrieve().toBodilessEntity();
    }
    private void publish(String payload) {
        broker().post().uri("/topics/compensation-requests:publish").body(Map.of("messages", java.util.List.of(Map.of(
                "data", Base64.getEncoder().encodeToString(payload.getBytes(StandardCharsets.UTF_8)),
                "attributes", Map.of("eventType", "CreditCompensationRequested", "eventVersion", "1")))))
                .retrieve().toBodilessEntity();
    }
    private JdbcTemplate creditDb() {
        return new JdbcTemplate(new DriverManagerDataSource(CREDIT_DB.getJdbcUrl(), CREDIT_DB.getUsername(), CREDIT_DB.getPassword()));
    }
    private String creditText(String sql, String value) { return creditDb().queryForObject(sql, String.class, value); }
    private static String key() { return UUID.randomUUID().toString(); }
    private static String token(String actor) {
        Instant now = Instant.now();
        String header = Base64.getUrlEncoder().withoutPadding().encodeToString("{\"alg\":\"none\"}".getBytes(StandardCharsets.UTF_8));
        String claims = "{\"sub\":\"" + actor + "\",\"aud\":\"demo-foc\",\"iss\":\"https://securetoken.google.com/demo-foc\","
                + "\"iat\":" + now.getEpochSecond() + ",\"exp\":" + now.plusSeconds(3600).getEpochSecond() + "}";
        return "Bearer " + header + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(claims.getBytes(StandardCharsets.UTF_8)) + ".";
    }
    private String account() {
        String actor = key();
        String eventId = key();
        String payload = """
                {"eventId":"%s","userId":"%s","email":"%s@u.nus.edu",
                 "occurredAt":"%s","schemaVersion":1}
                """.formatted(eventId, actor, actor, Instant.now());
        broker().post().uri("/topics/user-created-local-v1:publish")
                .body(Map.of("messages", java.util.List.of(Map.of(
                        "data", Base64.getEncoder().encodeToString(payload.getBytes(StandardCharsets.UTF_8)),
                        "attributes", Map.of("eventId", eventId, "eventType", "UserCreated", "eventVersion", "1")))))
                .retrieve().toBodilessEntity();
        await(() -> creditDb().queryForObject("select count(*) from credit_accounts where user_id=?", Integer.class, actor) == 1);
        return actor;
    }
    private CommandRequest input(String actor) {
        return new CommandRequest("CREATE", actor, null, 0, new CommandRequest.Creation("real compensation test",
                "pickup", "delivery", 5, 15, Instant.now().plusSeconds(7200), false, null, 0, 0, null));
    }
    private OrderResponse open(String actor) {
        CommandView result = commands.submit(key(), input(actor), token(actor));
        assertEquals("SUCCESS", result.outcome(), result.message());
        return result.result();
    }
}
