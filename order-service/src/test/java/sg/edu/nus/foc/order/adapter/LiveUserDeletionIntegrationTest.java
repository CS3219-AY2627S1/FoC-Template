package sg.edu.nus.foc.order.adapter;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestClient;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.Network;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;
import sg.edu.nus.foc.order.application.OrderOutboxDispatcher;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.infrastructure.JpaOrderRepository;

/** Real User HTTP -> Order HTTP -> PostgreSQL, with real MongoDB and Firebase Auth emulator.
 * Each database/emulator is disposable; no shared stack, credentials or cloud resources. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.DEFINED_PORT, properties = {
    "spring.profiles.active=prod", "order.peers.mode=mock", "order.security.user-service.mode=mock",
    "order.security.auth.project-id=demo-foc", "order.security.auth.emulator-host=local-fixture:9099",
    "order.lifecycle.cron=-", "order.messaging.outbox.recovery-cron=-",
    "FOC_INTERNAL_ORDER_API_ENABLED=true", "logging.level.root=WARN",
    "logging.level.org.springframework=ERROR", "logging.level.org.hibernate=ERROR"
})
@Testcontainers
class LiveUserDeletionIntegrationTest {
    private static final int ORDER_PORT = callbackPort();
    private static final Network NETWORK = Network.newNetwork();
    private static final Set<OrderStatus> TERMINAL = Set.of(
            OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.EXPIRED);
    @Container static final PostgreSQLContainer<?> DATABASE = new PostgreSQLContainer<>("postgres:15-alpine");
    // MongoDB 8 exits on the CI runner's Linux 6.19+ kernel (SERVER-121912).
    @Container static final GenericContainer<?> MONGO = new GenericContainer<>("mongo:7.0.43")
            .withNetwork(NETWORK).withNetworkAliases("mongo").withExposedPorts(27017);
    @Container static final GenericContainer<?> AUTH = new GenericContainer<>(image("infra/firebase-emulator", "auth"))
            .withNetwork(NETWORK).withNetworkAliases("auth").withExposedPorts(9099)
            .withCommand("firebase", "emulators:start", "--only", "auth", "--project", "demo-foc")
            .waitingFor(Wait.forListeningPort()).withStartupTimeout(Duration.ofMinutes(3));
    @Container static final GenericContainer<?> USER = new GenericContainer<>(image("user-service", "user"))
            .withNetwork(NETWORK).dependsOn(MONGO, AUTH).withExposedPorts(8080)
            .withEnv("MONGODB_URI", "mongodb://mongo:27017/UserServiceDB")
            .withEnv("FIREBASE_AUTH_PROJECT_ID", "demo-foc")
            .withEnv("FIREBASE_AUTH_EMULATOR_HOST", "auth:9099")
            .withEnv("FOC_INTERNAL_ORDER_API_ENABLED", "true")
            .withEnv("ORDER_SERVICE_URL", "http://host.testcontainers.internal:" + ORDER_PORT)
            .withEnv("USER_MESSAGING_MODE", "emulator")
            .withEnv("USER_PUBSUB_PUSH_MODE", "emulator")
            .withEnv("PUBSUB_EMULATOR_HOST", "127.0.0.1:9")
            .withEnv("PUBSUB_PROJECT_ID", "demo-foc-local")
            .withEnv("USER_OUTBOX_RECOVERY_CRON", "-")
            .withEnv("USER_ACCOUNT_DELETION_RECOVERY_DELAY_MS", "1000")
            .withEnv("LOG_LEVEL", "WARN")
            .waitingFor(Wait.forHttp("/actuator/health").forStatusCode(200))
            .withStartupTimeout(Duration.ofMinutes(3));

    @Autowired private JpaOrderRepository orders;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private sg.edu.nus.foc.order.application.recovery.OrderCommandStore commands;
    @MockitoBean private OrderOutboxDispatcher dispatcher;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry properties) {
        properties.add("server.port", () -> ORDER_PORT);
        properties.add("spring.datasource.url", DATABASE::getJdbcUrl);
        properties.add("spring.datasource.username", DATABASE::getUsername);
        properties.add("spring.datasource.password", DATABASE::getPassword);
    }

    @ParameterizedTest
    @EnumSource(OrderStatus.class)
    void requesterDeletionUsesEveryActualPersistedStatus(OrderStatus status) throws Exception {
        Map<String, String> account = account();
        saveOrder(account.get("localId"), "other-courier", status);
        assertDeletion(account, TERMINAL.contains(status));
    }

    @ParameterizedTest
    @EnumSource(value = OrderStatus.class, names = "OPEN", mode = EnumSource.Mode.EXCLUDE)
    void assignedCourierDeletionUsesEveryActualPersistedStatus(OrderStatus status) throws Exception {
        Map<String, String> account = account();
        saveOrder("other-requester", account.get("localId"), status);
        assertDeletion(account, TERMINAL.contains(status));
    }

    @Test
    void oneActiveOrderBlocksEvenAmongSeveralTerminalOrdersAndBothRoles() throws Exception {
        Map<String, String> account = account();
        String uid = account.get("localId");
        for (OrderStatus status : TERMINAL) saveOrder(uid, "old-courier", status);
        Order active = saveOrder("other-requester", uid, OrderStatus.DELIVERED);
        assertDeletion(account, false);
        jdbc.update("update orders set status = 'COMPLETED' where id = ?", active.getId());
        assertDeletion(account, true);
    }

    @Test
    void noCurrentInvolvementPermitsSoftDeleteWithoutRemovingHistory() throws Exception {
        Map<String, String> account = account();
        saveOrder("unrelated-owner", "unrelated-courier", OrderStatus.ACCEPTED);
        assertDeletion(account, true);
    }

    @Test
    void pendingCreationWithoutAnOrderCardStillBlocksIdentityDeletion() throws Exception {
        Map<String, String> account = account();
        String uid = account.get("localId");
        commands.register(UUID.randomUUID().toString(),
                new sg.edu.nus.foc.order.application.recovery.CommandRequest("CREATE", uid, null, 0,
                        new sg.edu.nus.foc.order.application.recovery.CommandRequest.Creation("pending", "pickup", "delivery",
                                1, 15, Instant.now().plusSeconds(7200), false, null, 0, 0, null)));
        // The old diagnostic GET sees no committed Order; only preparation sees the unresolved intent.
        assertDeletion(account, false, account.get("idToken"), "/api/users/me", true);
    }

    @Test
    void crashedDeletionRecoversThePersistedOperationWithoutNewCredentials() throws Exception {
        Map<String, String> account = account();
        String uid = account.get("localId");
        String operation = UUID.randomUUID().toString();
        assertEquals(Boolean.TRUE, RestClient.create("http://127.0.0.1:" + ORDER_PORT).post()
                .uri("/api/orders/internal/users/{uid}/deletion-preparations/{operation}", uid, operation)
                .retrieve().body(Boolean.class));
        assertEquals(0, MONGO.execInContainer("mongosh", "UserServiceDB", "--quiet", "--eval",
                "db.users.updateOne({userId:'" + uid + "'},{$set:{status:'DEACTIVATION_PENDING',deletionOperationId:'"
                        + operation + "',deletionCanRestore:false}})").getExitCode());
        Instant deadline = Instant.now().plusSeconds(30);
        String status;
        do {
            status = MONGO.execInContainer("mongosh", "UserServiceDB", "--quiet", "--eval",
                    "print(db.users.findOne({userId:'" + uid + "'}).status)").getStdout().trim();
            if ("DEACTIVATED".equals(status)) break;
            TimeUnit.MILLISECONDS.sleep(200);
        } while (Instant.now().isBefore(deadline));
        assertEquals("DEACTIVATED", status);
        assertEquals(operation, jdbc.queryForObject("select operation_id from order_user_deletion_guards where user_id=?",
                String.class, uid));
        assertEquals(1, jdbc.queryForObject("select count(*) from order_user_deletion_preparations where user_id=?",
                Integer.class, uid));
        assertInactiveToken(account);
    }

    @Test
    void administratorDeletionChecksTheTargetUserNotTheAdministrator() throws Exception {
        Map<String, String> admin = account();
        org.testcontainers.containers.Container.ExecResult elevated = MONGO.execInContainer(
                "mongosh", "UserServiceDB", "--quiet", "--eval",
                "db.users.updateOne({userId:'" + admin.get("localId") + "'},{$set:{roles:['admin']}})");
        assertEquals(0, elevated.getExitCode(), elevated.getStderr());
        Map<String, String> target = account();
        Order active = saveOrder(target.get("localId"), "other-courier", OrderStatus.OPEN);
        String path = "/api/users/" + target.get("localId");
        assertDeletion(target, false, admin.get("idToken"), path);
        jdbc.update("update orders set status = 'CANCELLED' where id = ?", active.getId());
        assertDeletion(target, true, admin.get("idToken"), path);
    }

    @Test
    void unrelatedNonAdminCannotDeactivateAnotherUser() throws Exception {
        Map<String, String> caller = account();
        Map<String, String> target = account();
        int status = RestClient.create("http://" + USER.getHost() + ":" + USER.getMappedPort(8080))
                .delete().uri("/api/users/" + target.get("localId"))
                .headers(h -> h.setBearerAuth(caller.get("idToken")))
                .exchange((request, response) -> response.getStatusCode().value());
        assertEquals(403, status);
    }

    private Order saveOrder(String requester, String courier, OrderStatus status) {
        Instant now = Instant.now();
        Order order = Order.open(requester, "deletion safety", "pickup", "delivery", 1, 15,
                now, now.plusSeconds(7200));
        ReflectionTestUtils.setField(order, "status", status);
        if (status != OrderStatus.OPEN) ReflectionTestUtils.setField(order, "courierId", courier);
        return orders.saveAndFlush(order);
    }

    @SuppressWarnings("unchecked")
    private Map<String, String> account() throws Exception {
        String email = "delete-" + UUID.randomUUID() + "@u.nus.edu";
        Map<String, String> account = auth().post().uri("/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key")
                .body(Map.of("email", email, "password", "TestPassword123!", "returnSecureToken", true))
                .retrieve().body(Map.class);
        assertNotNull(account);
        String uid = account.get("localId");
        org.testcontainers.containers.Container.ExecResult seed = MONGO.execInContainer(
                "mongosh", "UserServiceDB", "--quiet", "--eval",
                "db.users.insertOne({userId:'" + uid + "',email:'" + email
                        + "',roles:['requester','courier'],status:'ACTIVE'})");
        assertEquals(0, seed.getExitCode(), seed.getStderr());
        return account;
    }

    private void assertDeletion(Map<String, String> account, boolean allowed) throws Exception {
        assertDeletion(account, allowed, account.get("idToken"), "/api/users/me");
    }

    private void assertDeletion(Map<String, String> account, boolean allowed, String token, String path) throws Exception {
        assertDeletion(account, allowed, token, path, allowed);
    }

    private void assertDeletion(Map<String, String> account, boolean allowed, String token, String path,
            boolean snapshotAllowed) throws Exception {
        String uid = account.get("localId");
        Boolean actual = RestClient.create("http://127.0.0.1:" + ORDER_PORT).get()
                .uri("/api/orders/internal/users/{uid}/can-delete", uid).retrieve().body(Boolean.class);
        assertEquals(snapshotAllowed, actual);
        int status = RestClient.create("http://" + USER.getHost() + ":" + USER.getMappedPort(8080))
                .delete().uri(path).headers(h -> h.setBearerAuth(token))
                .exchange((request, response) -> response.getStatusCode().value());
        assertEquals(allowed ? 200 : 409, status);
        org.testcontainers.containers.Container.ExecResult saved = MONGO.execInContainer(
                "mongosh", "UserServiceDB", "--quiet", "--eval",
                "print(db.users.findOne({userId:'" + uid + "'}).status)");
        assertEquals(allowed ? "DEACTIVATED" : "ACTIVE", saved.getStdout().trim());
        Map<?, ?> requester = RestClient.create("http://" + USER.getHost() + ":" + USER.getMappedPort(8080))
                .get().uri("/api/users/internal/order-requesters/{uid}", uid).retrieve().body(Map.class);
        assertNotNull(requester);
        assertEquals(!allowed, requester.get("eligible"), "Deactivated requesters must not automatically repost");
        if (allowed) {
            assertTrue(Boolean.TRUE.equals(jdbc.queryForObject(
                    "select blocked from order_user_deletion_guards where user_id=?", Boolean.class, uid)));
            assertInactiveToken(account);
        }
        int identity = auth().post().uri("/identitytoolkit.googleapis.com/v1/accounts:lookup?key=demo-key")
                .body(Map.of("idToken", account.get("idToken")))
                .exchange((request, response) -> response.getStatusCode().value());
        assertEquals(allowed ? 400 : 200, identity);
    }

    private RestClient auth() {
        return RestClient.create("http://" + AUTH.getHost() + ":" + AUTH.getMappedPort(9099));
    }

    private static DockerImageName image(String directory, String name) {
        String tag = "foc-deletion-integration-" + name + ":" + UUID.randomUUID();
        Path repositoryRoot = Path.of("..").toAbsolutePath().normalize();
        Path source = repositoryRoot.resolve(directory).normalize();
        try {
            ProcessBuilder builder;
            if ("user-service".equals(directory)) {
                // User Service Dockerfile needs the entire Maven reactor as context.
                builder = new ProcessBuilder(
                        "docker", "build",
                        "-f", source.resolve("Dockerfile").toString(),
                        "-t", tag,
                        repositoryRoot.toString()
                );
            } else {
                // Other images retain their existing directory-specific context.
                builder = new ProcessBuilder("docker", "build", "-t", tag, source.toString());
            }
            Process build = builder
                    .redirectErrorStream(true)
                    .redirectOutput(Path.of("target", "deletion-" + name + "-build.log").toFile()).start();
            // Cold Firebase builds download the CLI/emulators before exporting the image.
            if (!build.waitFor(10, TimeUnit.MINUTES)) {
                build.destroyForcibly();
                throw new IllegalStateException("Isolated " + name + " test image build timed out");
            }
            if (build.exitValue() != 0) throw new IllegalStateException("See target/deletion-" + name + "-build.log");
            return DockerImageName.parse(tag);
        } catch (java.io.IOException failure) {
            throw new IllegalStateException("Docker and actual User/Firebase sources are required", failure);
        } catch (InterruptedException failure) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(failure);
        }
    }

    private void assertInactiveToken(Map<String, String> account) {
        RestClient client = RestClient.create("http://" + USER.getHost() + ":" + USER.getMappedPort(8080));
        Map<?, ?> context = client.get().uri("/api/users/role-context")
                .headers(headers -> headers.setBearerAuth(account.get("idToken"))).retrieve().body(Map.class);
        assertNotNull(context);
        assertEquals(java.util.List.of(), context.get("roles"));
        int updateStatus = client.put().uri("/api/users/me")
                .headers(headers -> headers.setBearerAuth(account.get("idToken")))
                .body(Map.of("username", "must-not-update"))
                .exchange((request, response) -> response.getStatusCode().value());
        assertEquals(403, updateStatus);
    }

    private static int callbackPort() {
        try (java.net.ServerSocket socket = new java.net.ServerSocket(0)) {
            int port = socket.getLocalPort();
            org.testcontainers.Testcontainers.exposeHostPorts(port);
            return port;
        } catch (java.io.IOException failure) {
            throw new IllegalStateException("Cannot allocate isolated Order port", failure);
        }
    }
}
