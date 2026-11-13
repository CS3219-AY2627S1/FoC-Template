package sg.edu.nus.foc.user.logic;

import static org.junit.jupiter.api.Assertions.*;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

class OrderServiceClientTest {
    private HttpServer server;
    private final AtomicReference<String> path = new AtomicReference<>();
    private final AtomicReference<String> authorization = new AtomicReference<>();

    @AfterEach
    void stop() {
        if (server != null) server.stop(0);
    }

    private OrderServiceClient client(int status, String body) throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            path.set(exchange.getRequestURI().toString());
            authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, bytes.length);
            try (java.io.OutputStream output = exchange.getResponseBody()) { output.write(bytes); }
        });
        server.start();
        return new OrderServiceClient(RestClient.builder(), "http://127.0.0.1:" + server.getAddress().getPort());
    }

    @Test
    void privateBooleanContractUsesTargetUidAndNoUserCredentials() throws Exception {
        assertTrue(client(200, "true").canDeleteUser("target-student"));
        assertEquals("/api/orders/internal/users/target-student/can-delete", path.get());
        assertNull(authorization.get());
    }

    @Test
    void falseBlocksDeletion() throws Exception {
        assertFalse(client(200, "false").canDeleteUser("student"));
    }

    @Test
    void missingOrMalformedResponseFailsClosed() throws Exception {
        OrderServiceClient client = client(200, "null");
        ResponseStatusException failure = assertThrows(ResponseStatusException.class,
                () -> client.canDeleteUser("student"));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, failure.getStatusCode());
    }

    @Test
    void oldObjectResponseDoesNotAccidentallyAuthorizeDeletion() throws Exception {
        OrderServiceClient client = client(200, "{\"hasActiveOrders\":false}");
        assertThrows(ResponseStatusException.class, () -> client.canDeleteUser("student"));
    }

    @Test
    void dependencyFailureFailsClosed() throws Exception {
        OrderServiceClient client = client(503, "{}");
        ResponseStatusException failure = assertThrows(ResponseStatusException.class,
                () -> client.canDeleteUser("student"));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, failure.getStatusCode());
    }

    @Test
    void preparationUsesStableOperationAndOnlyAuthoritativeActiveDenialAllowsRestore() throws Exception {
        assertTrue(client(200, "true").prepareDeletion("student", "saved-operation"));
        assertEquals("/api/orders/internal/users/student/deletion-preparations/saved-operation", path.get());
        assertNull(authorization.get());
        server.stop(0);
        assertFalse(client(409, "{\"error\":\"ACTIVE_ORDER_INVOLVEMENT\"}").prepareDeletion("student", "saved-operation"));
    }

    @Test
    void genericConflictAndUnexpectedBooleanRemainUncertain() throws Exception {
        OrderServiceClient wrongOperation = client(409, "{\"error\":\"CONFLICT\"}");
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, assertThrows(ResponseStatusException.class,
                () -> wrongOperation.prepareDeletion("student", "saved-operation")).getStatusCode());
        server.stop(0);
        OrderServiceClient falseSuccess = client(200, "false");
        assertThrows(ResponseStatusException.class, () -> falseSuccess.prepareDeletion("student", "saved-operation"));
    }
}
