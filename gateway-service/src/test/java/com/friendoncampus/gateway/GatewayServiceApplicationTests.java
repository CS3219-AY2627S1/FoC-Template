package com.friendoncampus.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class GatewayServiceApplicationTests {

    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(2))
            .build();

    private static HttpServer userService;
    private static HttpServer supplierService;
    private static HttpServer creditService;
    private static HttpServer orderService;
    private static HttpServer adminService;
    private static HttpServer notificationService;

    @LocalServerPort
    private int gatewayPort;

    @BeforeAll
    static void startDownstreams() {
        ensureDownstreamsStarted();
    }

    @AfterAll
    static void stopDownstreams() {
        userService.stop(0);
        supplierService.stop(0);
        creditService.stop(0);
        orderService.stop(0);
        adminService.stop(0);
        notificationService.stop(0);
    }

    @DynamicPropertySource
    static void downstreamProperties(DynamicPropertyRegistry registry) {
        ensureDownstreamsStarted();
        registry.add("USER_SERVICE_URL", () -> serviceUrl(userService));
        registry.add("SUPPLIER_SERVICE_URL", () -> serviceUrl(supplierService));
        registry.add("CREDIT_SERVICE_URL", () -> serviceUrl(creditService));
        registry.add("ORDER_SERVICE_URL", () -> serviceUrl(orderService));
        registry.add("ADMIN_SERVICE_URL", () -> serviceUrl(adminService));
        registry.add("NOTIFICATION_SERVICE_URL", () -> serviceUrl(notificationService));
    }

    @Test
    void forwardsUserApiMethodQueryAndBodyWithoutRewritingThePath() throws Exception {
        HttpRequest request = request("/api/users/login?returnTo=%2Fsuppliers")
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"email\":\"student@u.nus.edu\"}"))
                .build();

        HttpResponse<String> response = send(request);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body())
                .contains("\"backend\":\"user\"")
                .contains("\"method\":\"POST\"")
                .contains("\"path\":\"/api/users/login\"")
                .contains("\"query\":\"returnTo=%2Fsuppliers\"")
                .contains("student@u.nus.edu");
    }

    @Test
    void forwardsSupplierApiAuthorizationBodyAndQuery() throws Exception {
        HttpRequest request = request("/api/suppliers/00000000-0000-0000-0000-000000000001?source=gateway")
                .header("Authorization", "Bearer signed-token")
                .header("Content-Type", "application/json")
                .PUT(HttpRequest.BodyPublishers.ofString("{\"version\":0}"))
                .build();

        HttpResponse<String> response = send(request);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body())
                .contains("\"backend\":\"supplier\"")
                .contains("\"method\":\"PUT\"")
                .contains("\"path\":\"/api/suppliers/00000000-0000-0000-0000-000000000001\"")
                .contains("\"query\":\"source=gateway\"")
                .contains("\"authorization\":\"Bearer signed-token\"")
                .contains("\\\"version\\\":0");
    }

    @Test
    void routesAdministrativeSupplierApiToSupplierService() throws Exception {
        HttpResponse<String> response = send(request("/api/admin/suppliers?status=INACTIVE")
                .header("Authorization", "Bearer admin-token")
                .GET()
                .build());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body())
                .contains("\"backend\":\"supplier\"")
                .contains("\"path\":\"/api/admin/suppliers\"")
                .contains("\"query\":\"status=INACTIVE\"");
    }

    @Test
    void forwardsAuthenticatedCreditQueriesWithoutRewritingThePath() throws Exception {
        HttpResponse<String> response = send(request("/api/credits/me/transactions?page=1&size=8")
                .header("Authorization", "Bearer requester-token")
                .GET()
                .build());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body())
                .contains("\"backend\":\"credit\"")
                .contains("\"path\":\"/api/credits/me/transactions\"")
                .contains("\"query\":\"page=1&size=8\"")
                .contains("\"authorization\":\"Bearer requester-token\"");
    }

    @Test
    void routesPackagedFrontendsWithoutACatchAll() throws Exception {
        Map<String, String> expectedBackends = Map.ofEntries(
                Map.entry("/admin", "admin"),
                Map.entry("/admin/cases/test-id", "admin"),
                Map.entry("/admin-assets/index.js", "admin"),
                Map.entry("/", "user"),
                Map.entry("/user-assets/index.js", "user"),
                Map.entry("/suppliers", "supplier"),
                Map.entry("/suppliers/example-id", "supplier"),
                Map.entry("/admin/suppliers/example-id/edit", "supplier"),
                Map.entry("/supplier-assets/index.js", "supplier"),
                Map.entry("/credits", "credit"),
                Map.entry("/credits/history", "credit"),
                Map.entry("/credit-assets/index.js", "credit"),
                Map.entry("/errands", "order"),
                Map.entry("/errands/browse", "order"),
                Map.entry("/order-assets/index.js", "order"),
                Map.entry("/notifications", "notification"),
                Map.entry("/notifications/anything", "notification"),
                Map.entry("/notification-assets/index.js", "notification"));

        for (Map.Entry<String, String> expected : expectedBackends.entrySet()) {
            HttpResponse<String> response = get(expected.getKey());
            assertThat(response.statusCode()).as(expected.getKey()).isEqualTo(200);
            assertThat(response.body())
                    .as(expected.getKey())
                    .contains("\"backend\":\"" + expected.getValue() + "\"")
                    .contains("\"path\":\"" + expected.getKey() + "\"");
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/orders", "/api/orders/example-id/cancel"})
    void forwardsOrderRequestsAndPreservesDownstreamProblems(String path) throws Exception {
        HttpResponse<String> response = send(request(path + "?source=gateway")
                .header("Authorization", "Bearer requester-token")
                .header("Content-Type", "application/json")
                .header("X-Stub-Response-Status", "409")
                .POST(HttpRequest.BodyPublishers.ofString("{\"title\":\"Collect lunch\"}"))
                .build());

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(response.headers().firstValue("Content-Type").orElse(""))
                .startsWith("application/problem+json");
        assertThat(response.body())
                .contains("\"backend\":\"order\"")
                .contains("\"method\":\"POST\"")
                .contains("\"path\":\"" + path + "\"")
                .contains("\"query\":\"source=gateway\"")
                .contains("\"authorization\":\"Bearer requester-token\"")
                .contains("Collect lunch");
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/notifications/me", "/api/notifications/me/unread-count"})
    void forwardsNotificationReadsWithTheBearerTokenAndPreservesProblems(String path) throws Exception {
        HttpResponse<String> response = send(request(path + "?page=0&size=20")
                .header("Authorization", "Bearer courier-token")
                .header("X-Stub-Response-Status", "401")
                .GET()
                .build());

        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(response.headers().firstValue("Content-Type").orElse(""))
                .startsWith("application/problem+json");
        assertThat(response.body())
                .contains("\"backend\":\"notification\"")
                .contains("\"method\":\"GET\"")
                .contains("\"path\":\"" + path + "\"")
                .contains("\"query\":\"page=0&size=20\"")
                .contains("\"authorization\":\"Bearer courier-token\"");
    }

    @Test
    void forwardsNotificationReadMarkingMethods() throws Exception {
        HttpResponse<String> single = send(request("/api/notifications/me/example-id/read")
                .header("Authorization", "Bearer courier-token")
                .method("PATCH", HttpRequest.BodyPublishers.noBody())
                .build());
        HttpResponse<String> all = send(request("/api/notifications/me/read-all")
                .header("Authorization", "Bearer courier-token")
                .POST(HttpRequest.BodyPublishers.noBody())
                .build());

        assertThat(single.statusCode()).isEqualTo(200);
        assertThat(single.body()).contains("\"backend\":\"notification\"", "\"method\":\"PATCH\"");
        assertThat(all.statusCode()).isEqualTo(200);
        assertThat(all.body()).contains("\"backend\":\"notification\"", "\"method\":\"POST\"");
    }

    @Test
    void routesJwksToUserService() throws Exception {
        HttpResponse<String> response = get("/.well-known/jwks.json");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).isEqualTo("{\"keys\":[{\"kid\":\"test-key\"}]}");
    }

    @Test
    void mapsServiceOpenApiDocuments() throws Exception {
        Map<String, String> expectedBodies = Map.ofEntries(
                Map.entry("/docs/admin/openapi.json", "{\"openapi\":\"3.1.0\",\"service\":\"admin\"}"),
                Map.entry("/docs/user/openapi.json", "{\"openapi\":\"3.1.0\",\"service\":\"user\"}"),
                Map.entry("/docs/supplier/openapi.json", "{\"openapi\":\"3.1.0\",\"service\":\"supplier\"}"),
                Map.entry("/docs/supplier/openapi.yaml", "openapi: 3.1.0\\nservice: supplier\\n"),
                Map.entry("/docs/credit/openapi.json", "{\"openapi\":\"3.1.0\",\"service\":\"credit\"}"),
                Map.entry("/docs/order/openapi.json", "{\"openapi\":\"3.1.0\",\"service\":\"order\"}"),
                Map.entry("/docs/notification/openapi.json",
                        "{\"openapi\":\"3.1.0\",\"service\":\"notification\"}"),
                Map.entry("/docs/credit/openapi.yaml", "openapi: 3.1.0\\nservice: credit\\n"));

        for (Map.Entry<String, String> expected : expectedBodies.entrySet()) {
            HttpResponse<String> response = get(expected.getKey());
            assertThat(response.statusCode()).as(expected.getKey()).isEqualTo(200);
            assertThat(response.body()).as(expected.getKey()).isEqualTo(expected.getValue());
        }

        HttpResponse<String> userYaml = get("/docs/user/openapi.yaml");
        assertThat(userYaml.statusCode()).isEqualTo(200);
        assertThat(userYaml.headers().firstValue("Content-Type").orElse(""))
                .startsWith("application/vnd.oai.openapi");
        assertThat(userYaml.body())
                .contains("openapi:", "3.1.0")
                .contains("service:", "user");
    }

    @ParameterizedTest
    @ValueSource(ints = {200, 201, 204, 400, 401, 403, 404, 409})
    void preservesDownstreamStatuses(int downstreamStatus) throws Exception {
        HttpResponse<String> response = send(request("/api/suppliers/status-check")
                .header("X-Stub-Response-Status", Integer.toString(downstreamStatus))
                .GET()
                .build());

        assertThat(response.statusCode()).isEqualTo(downstreamStatus);
        if (downstreamStatus == 204) {
            assertThat(response.body()).isEmpty();
        } else if (downstreamStatus >= 400) {
            assertThat(response.headers().firstValue("Content-Type").orElse(""))
                    .startsWith("application/problem+json");
        }
    }

    @Test
    void exposesGatewayHealthAndRejectsUnknownRoutes() throws Exception {
        HttpResponse<String> health = get("/actuator/health");
        HttpResponse<String> missing = get("/not-a-configured-route");

        assertThat(health.statusCode()).isEqualTo(200);
        assertThat(health.body()).contains("\"status\":\"UP\"");
        assertThat(missing.statusCode()).isEqualTo(404);
    }

    @Test
    void exposesSwaggerUiConfiguredForAllServices() throws Exception {
        HttpResponse<String> index = get("/swagger-ui/index.html");
        HttpResponse<String> configuration = get("/v3/api-docs/swagger-config");

        assertThat(index.statusCode()).isEqualTo(200);
        assertThat(index.body()).contains("Swagger UI");
        assertThat(configuration.statusCode()).isEqualTo(200);
        assertThat(configuration.body())
                .contains("/docs/admin/openapi.json")
                .contains("/docs/user/openapi.json")
                .contains("/docs/supplier/openapi.json")
                .contains("/docs/credit/openapi.json")
                .contains("/docs/order/openapi.json")
                .contains("/docs/notification/openapi.json")
                .contains("Credit Service");
    }

    @Test
    void forwardsAdminMutationAndPreservesDependencyUnavailableProblem() throws Exception {
        var response = send(request("/api/admin/cases/example/actions?source=gateway")
                .header("Authorization", "Bearer admin-token")
                .header("Content-Type", "application/json")
                .header("Idempotency-Key", "test-operation")
                .header("X-Stub-Response-Status", "503")
                .POST(HttpRequest.BodyPublishers.ofString("{\"amount\":-5}")) .build());
        assertThat(response.statusCode()).isEqualTo(503);
        assertThat(response.headers().firstValue("Content-Type").orElse("")).startsWith("application/problem+json");
        assertThat(response.body()).contains("\"backend\":\"admin\"", "Bearer admin-token", "source=gateway", "amount");
    }

    @ParameterizedTest
    @ValueSource(strings = {"/internal/admin/cases/test/access", "/internal/admin/orders/test/evidence",
            "/internal/users/test/admin-eligibility", "/internal/users/test/authorization"})
    void neverExposesServiceOnlyCallbacks(String path) throws Exception {
        assertThat(get(path).statusCode()).isEqualTo(404);
    }

    private HttpRequest.Builder request(String path) {
        return HttpRequest.newBuilder(URI.create("http://localhost:" + gatewayPort + path))
                .timeout(Duration.ofSeconds(5));
    }

    private HttpResponse<String> get(String path) throws IOException, InterruptedException {
        return send(request(path).GET().build());
    }

    private HttpResponse<String> send(HttpRequest request) throws IOException, InterruptedException {
        return HTTP.send(request, HttpResponse.BodyHandlers.ofString());
    }

    private static synchronized void ensureDownstreamsStarted() {
        if (userService != null) {
            return;
        }
        try {
            userService = stubService("user");
            supplierService = stubService("supplier");
            creditService = stubService("credit");
            orderService = stubService("order");
            adminService = stubService("admin");
            notificationService = stubService("notification");
        } catch (IOException exception) {
            throw new IllegalStateException("Unable to start gateway test downstreams", exception);
        }
    }

    private static HttpServer stubService(String name) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        server.createContext("/", exchange -> respond(name, exchange));
        server.start();
        return server;
    }

    private static String serviceUrl(HttpServer server) {
        return "http://localhost:" + server.getAddress().getPort();
    }

    private static void respond(String serviceName, HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        if ("/.well-known/jwks.json".equals(path)) {
            send(exchange, 200, "application/json", "{\"keys\":[{\"kid\":\"test-key\"}]}");
            return;
        }
        if ("/v3/api-docs".equals(path)) {
            send(exchange, 200, "application/json",
                    "{\"openapi\":\"3.1.0\",\"service\":\"" + serviceName + "\"}");
            return;
        }
        if ("/v3/api-docs.yaml".equals(path)) {
            send(exchange, 200, "application/yaml", "openapi: 3.1.0\\nservice: " + serviceName + "\\n");
            return;
        }

        int status = exchange.getRequestHeaders().getFirst("X-Stub-Response-Status") == null
                ? 200
                : Integer.parseInt(exchange.getRequestHeaders().getFirst("X-Stub-Response-Status"));
        if (status == 204) {
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
            return;
        }

        String requestBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        String authorization = exchange.getRequestHeaders().getFirst("Authorization");
        String query = exchange.getRequestURI().getRawQuery();
        String body = "{" +
                "\"backend\":\"" + json(serviceName) + "\"," +
                "\"method\":\"" + json(exchange.getRequestMethod()) + "\"," +
                "\"path\":\"" + json(path) + "\"," +
                "\"query\":" + nullableJson(query) + "," +
                "\"authorization\":" + nullableJson(authorization) + "," +
                "\"body\":\"" + json(requestBody) + "\"}";
        send(exchange, status, status >= 400 ? "application/problem+json" : "application/json", body);
    }

    private static void send(HttpExchange exchange, int status, String contentType, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().put("Content-Type", List.of(contentType));
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    private static String nullableJson(String value) {
        return value == null ? "null" : "\"" + json(value) + "\"";
    }

    private static String json(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
