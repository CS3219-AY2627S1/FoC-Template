package sg.edu.nus.foc.supplier.api;

import static org.hamcrest.Matchers.hasItem;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

import com.jayway.jsonpath.JsonPath;
import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpServer;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import sg.edu.nus.foc.supplier.support.FirestoreEmulator;
import sg.edu.nus.foc.supplier.web.RequestIdFilter;

/**
 * The Supplier Service against a stand-in User Service over real HTTP ({@code USER_SERVICE_MODE=http}):
 * roles come from {@code GET /api/users/role-context} with the caller's own token, only endpoints that
 * need roles call it, and a User Service outage degrades to 503 on those endpoints alone.
 */
@SpringBootTest
@AutoConfigureMockMvc
class UserServiceIntegrationTest {

    private static final String DATABASE = "user-service-test";
    private static final UserServiceStub USER_SERVICE = UserServiceStub.start();

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        FirestoreEmulator.clear(DATABASE);
        registry.add("foc.supplier.firestore.emulator-host", FirestoreEmulator::endpoint);
        registry.add("foc.supplier.firestore.database-id", () -> DATABASE);
        registry.add("foc.supplier.user-service.mode", () -> "http");
        registry.add("foc.supplier.user-service.base-url", USER_SERVICE::url);
        registry.add("foc.supplier.user-service.timeout", () -> "1s");
        // Every request asks the User Service, so each test controls the answer.
        registry.add("foc.supplier.user-service.role-cache-ttl", () -> "0s");
    }

    @AfterAll
    static void stopUserService() {
        USER_SERVICE.server.stop(0);
    }

    @Autowired
    private MockMvc mvc;

    @BeforeEach
    void reset() {
        USER_SERVICE.answer(200, "{\"userId\":\"u1\",\"roles\":[\"requester\",\"courier\"]}", 0);
        USER_SERVICE.requests.clear();
    }

    private static RequestPostProcessor token(String value) {
        return jwt().jwt(j -> j.tokenValue(value).subject("uid-" + value).claim("email", value + "@u.nus.edu"));
    }

    private static String body(String name) {
        return """
                {"name":"%s","type":"Food","building":"COM3","latitude":1.2948,"longitude":103.7746,
                 "openingTime":"08:00","closingTime":"20:00"}
                """.formatted(name);
    }

    private String createAsAdmin(String name) throws Exception {
        USER_SERVICE.answer(200, "{\"userId\":\"a\",\"roles\":[\"admin\"]}", 0);
        String json = mvc.perform(post("/api/suppliers").with(token("admin")).contentType(MediaType.APPLICATION_JSON)
                        .content(body(name)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(json, "$.id");
    }

    @Test
    void adminActionsUseRolesFromTheUserServiceWithTheCallersToken() throws Exception {
        USER_SERVICE.answer(200, "{\"userId\":\"a\",\"roles\":[\"requester\",\"courier\",\"admin\"]}", 0);
        mvc.perform(post("/api/suppliers").with(token("admin-token")).header(RequestIdFilter.HEADER, "req-42")
                        .contentType(MediaType.APPLICATION_JSON).content(body("Kiosk " + UUID.randomUUID())))
                .andExpect(status().isCreated());

        Assertions.assertThat(USER_SERVICE.requests).singleElement().satisfies(headers -> {
            Assertions.assertThat(headers.getFirst("Authorization")).isEqualTo("Bearer admin-token");
            Assertions.assertThat(headers.getFirst(RequestIdFilter.HEADER)).isEqualTo("req-42");
        });
        mvc.perform(get("/api/suppliers/permissions").with(token("admin-token")))
                .andExpect(jsonPath("$.roles", hasItem("admin")))
                .andExpect(jsonPath("$.canManageSuppliers").value(true));
    }

    @Test
    void usersWithoutTheAdminRoleOrWithoutAProfileCannotManageSuppliers() throws Exception {
        mvc.perform(post("/api/suppliers").with(token("student")).contentType(MediaType.APPLICATION_JSON)
                        .content(body("Kiosk " + UUID.randomUUID())))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("FORBIDDEN"));

        USER_SERVICE.answer(404, "{}", 0);
        mvc.perform(get("/api/suppliers/permissions").with(token("newcomer")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.roles.length()").value(0))
                .andExpect(jsonPath("$.canManageSuppliers").value(false));
        mvc.perform(get("/api/suppliers").param("status", "all").with(token("newcomer")))
                .andExpect(status().isForbidden());
    }

    @Test
    void browsingAndOrderValidationKeepWorkingWhileTheUserServiceIsDown() throws Exception {
        String pickup = createAsAdmin("Pickup " + UUID.randomUUID());
        String delivery = createAsAdmin("Delivery " + UUID.randomUUID());
        USER_SERVICE.answer(500, "{\"error\":\"boom\"}", 0);
        USER_SERVICE.requests.clear();

        mvc.perform(get("/api/suppliers").with(token("student"))).andExpect(status().isOk());
        mvc.perform(get("/api/suppliers/{id}", pickup).with(token("student"))).andExpect(status().isOk());
        mvc.perform(post("/api/suppliers/validate").with(token("order-caller")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"pickupSupplierId\":\"" + pickup + "\",\"deliverySupplierId\":\"" + delivery + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(true));
        Assertions.assertThat(USER_SERVICE.requests).isEmpty();
    }

    @Test
    void roleDependentEndpointsAnswer503WhenTheUserServiceFailsOrTimesOut() throws Exception {
        USER_SERVICE.answer(500, "{\"error\":\"boom\"}", 0);
        mvc.perform(post("/api/suppliers").with(token("admin")).contentType(MediaType.APPLICATION_JSON)
                        .content(body("Kiosk " + UUID.randomUUID())))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value("SERVICE_UNAVAILABLE"))
                .andExpect(jsonPath("$.path").value("/api/suppliers"));
        mvc.perform(get("/api/suppliers/permissions").with(token("admin")))
                .andExpect(status().isServiceUnavailable());
        mvc.perform(get("/api/suppliers").param("status", "inactive").with(token("admin")))
                .andExpect(status().isServiceUnavailable());

        USER_SERVICE.answer(200, "{\"userId\":\"a\",\"roles\":[\"admin\"]}", 1500);
        mvc.perform(get("/api/suppliers/permissions").with(token("admin")))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value("SERVICE_UNAVAILABLE"));
    }

    /** A minimal User Service: answers role-context with a configurable status, body and delay. */
    private static final class UserServiceStub {
        final HttpServer server;
        final List<Headers> requests = new CopyOnWriteArrayList<>();
        private volatile int status;
        private volatile String body;
        private volatile long delayMillis;

        private UserServiceStub(HttpServer server) {
            this.server = server;
        }

        static UserServiceStub start() {
            try {
                HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
                UserServiceStub stub = new UserServiceStub(server);
                server.createContext("/api/users/role-context", exchange -> {
                    stub.requests.add(exchange.getRequestHeaders());
                    try {
                        Thread.sleep(stub.delayMillis);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                    byte[] bytes = stub.body.getBytes(StandardCharsets.UTF_8);
                    exchange.getResponseHeaders().add("Content-Type", "application/json");
                    try {
                        exchange.sendResponseHeaders(stub.status, bytes.length);
                        try (OutputStream out = exchange.getResponseBody()) {
                            out.write(bytes);
                        }
                    } catch (IOException e) {
                        // The caller timed out and closed the connection.
                    }
                });
                server.setExecutor(java.util.concurrent.Executors.newCachedThreadPool());
                server.start();
                return stub;
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
        }

        String url() {
            return "http://127.0.0.1:" + server.getAddress().getPort();
        }

        void answer(int newStatus, String newBody, long newDelayMillis) {
            status = newStatus;
            body = newBody;
            delayMillis = newDelayMillis;
        }
    }
}
