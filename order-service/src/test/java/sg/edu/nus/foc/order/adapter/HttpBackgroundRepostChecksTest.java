package sg.edu.nus.foc.order.adapter;

import static org.junit.jupiter.api.Assertions.*;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import sg.edu.nus.foc.order.domain.OrderProblem;

class HttpBackgroundRepostChecksTest {
    @Test
    void privateReadsUseNoJwtAndRejectUnconfirmedEligibilityOrLocations() throws Exception {
        AtomicReference<String> user = new AtomicReference<>("{\"userId\":\"U\",\"eligible\":true}");
        AtomicReference<String> pair = new AtomicReference<>("{\"valid\":true}");
        AtomicReference<String> funding = new AtomicReference<>("true");
        AtomicReference<String> authorization = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            String path = exchange.getRequestURI().getPath();
            String body = path.contains("order-requesters") ? user.get()
                    : path.contains("funding-ready") ? funding.get() : pair.get();
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
        try {
            String url = "http://127.0.0.1:" + server.getAddress().getPort();
            HttpBackgroundRepostChecks checks = new HttpBackgroundRepostChecks(url, url, url,
                    Duration.ofSeconds(1), Duration.ofSeconds(1));
            checks.validate("U", "P", "D");
            assertNull(authorization.get());
            assertTrue(checks.fundingReady("O", "U"));
            funding.set("false");
            assertFalse(checks.fundingReady("O", "U"));
            user.set("{\"userId\":\"U\",\"eligible\":false}");
            assertEquals("FORBIDDEN", assertThrows(OrderProblem.class, () -> checks.validate("U", "P", "D")).getCode());
            user.set("{\"userId\":\"other\",\"eligible\":true}");
            assertEquals("SERVICE_UNAVAILABLE", assertThrows(OrderProblem.class, () -> checks.validate("U", "P", "D")).getCode());
            user.set("{\"userId\":\"U\",\"eligible\":true}");
            pair.set("{\"valid\":false}");
            assertEquals("VALIDATION_ERROR", assertThrows(OrderProblem.class, () -> checks.validate("U", "P", "D")).getCode());
            pair.set("{}");
            assertEquals("SERVICE_UNAVAILABLE", assertThrows(OrderProblem.class, () -> checks.validate("U", "P", "D")).getCode());
        } finally { server.stop(0); }
    }

    @Test
    void unavailablePrivatePeerFailsClosedBeforeAnyReservation() {
        HttpBackgroundRepostChecks checks = new HttpBackgroundRepostChecks("http://127.0.0.1:1",
                "http://127.0.0.1:1", "http://127.0.0.1:1", Duration.ofMillis(50), Duration.ofMillis(50));
        assertEquals("SERVICE_UNAVAILABLE", assertThrows(OrderProblem.class, () -> checks.validate("U", "P", "D")).getCode());
        assertEquals("SERVICE_UNAVAILABLE", assertThrows(OrderProblem.class, () -> checks.fundingReady("O", "U")).getCode());
    }

    @Test
    void confirmedMissingRequesterStopsButRouteErrorsAndOutagesRemainTemporary() throws Exception {
        AtomicReference<String> body = new AtomicReference<>(
                "{\"status\":404,\"error\":\"NOT_FOUND\",\"message\":\"User not found\"}");
        java.util.concurrent.atomic.AtomicInteger status = new java.util.concurrent.atomic.AtomicInteger(404);
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/users/internal/order-requesters/U", exchange -> {
            assertNull(exchange.getRequestHeaders().getFirst("Authorization"));
            byte[] bytes = body.get().getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(status.get(), bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
        try {
            String url = "http://127.0.0.1:" + server.getAddress().getPort();
            HttpBackgroundRepostChecks checks = new HttpBackgroundRepostChecks(url, url, url,
                    Duration.ofSeconds(1), Duration.ofSeconds(1));
            assertEquals("NOT_FOUND", assertThrows(OrderProblem.class, () -> checks.validate("U", "P", "D")).getCode());
            body.set("{\"error\":\"NOT_FOUND\",\"message\":\"No endpoint handles this path.\"}");
            assertEquals("SERVICE_UNAVAILABLE", assertThrows(OrderProblem.class, () -> checks.validate("U", "P", "D")).getCode());
            body.set("not a JSON response");
            assertEquals("SERVICE_UNAVAILABLE", assertThrows(OrderProblem.class, () -> checks.validate("U", "P", "D")).getCode());
            body.set("{\"error\":\"NOT_FOUND\",\"message\":\"User not found\"}");
            status.set(503);
            assertEquals("SERVICE_UNAVAILABLE", assertThrows(OrderProblem.class, () -> checks.validate("U", "P", "D")).getCode());
        } finally {
            server.stop(0);
        }
    }
}
