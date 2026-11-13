package com.friendoncampus.order.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.NoSuchAlgorithmException;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Date;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.friendoncampus.order.domain.Order;
import com.friendoncampus.order.service.CreateOrderCommand;
import com.friendoncampus.order.service.CreateOrderResult;
import com.friendoncampus.order.messaging.OrderEventRecorder;
import com.friendoncampus.order.repository.OutboxEventRepository;
import com.friendoncampus.order.service.OrderService;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;

/**
 * End-to-end security tests over the real filter chain: a stub User Service JWKS serves a test
 * RS256 key, so tokens are verified exactly as in production. Only a valid REQUESTER token may
 * create an order, and the requester is bound to the token's {@code sub}.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "spring.autoconfigure.exclude="
                        + "org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration,"
                        + "org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration,"
                        + "org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration",
                "app.orders.expiry.enabled=false",
                "app.kafka.enabled=false",
                "app.security.jwt.issuer=" + OrderSecurityIntegrationTest.ISSUER,
                "app.security.jwt.audience=" + OrderSecurityIntegrationTest.AUDIENCE
        })
class OrderSecurityIntegrationTest {
    @MockitoBean com.friendoncampus.order.dispute.DisputeBus disputeBus;
    @MockitoBean com.friendoncampus.order.authorization.CurrentAuthorization currentAuthorization;

    @MockitoBean com.friendoncampus.order.service.DisputeReviewService disputeReviews;

    static final String ISSUER = "friend-on-campus-user-service";
    static final String AUDIENCE = "friend-on-campus-api";
    private static final String KEY_ID = "test-user-service-key";
    private static final String SUBJECT = "97947588-bb2e-42f2-91ba-9abf8e15a8e7";

    private static final KeyPair SIGNING_KEY = rsaKeyPair();
    private static final HttpServer JWKS_SERVER = startJwksServer();

    @LocalServerPort
    private int port;

    @MockitoBean
    private OrderService orderService;

    @MockitoBean
    private OrderEventRecorder orderEventRecorder;

    @MockitoBean
    private com.friendoncampus.order.service.OrderQueryService orderQueryService;

    @MockitoBean
    private com.friendoncampus.order.service.OrderExpiryScheduler orderExpiryScheduler;

    @MockitoBean
    private com.friendoncampus.order.messaging.CreditOutcomeHandler creditOutcomeHandler;

    // JPA is off here; the outbox gauges read their backlog through this mock.
    @MockitoBean
    private OutboxEventRepository outboxEventRepository;

    private final HttpClient http = HttpClient.newHttpClient();

    @DynamicPropertySource
    static void jwksUri(DynamicPropertyRegistry registry) {
        registry.add("app.security.jwt.jwk-set-uri", () -> "http://127.0.0.1:"
                + JWKS_SERVER.getAddress().getPort() + "/.well-known/jwks.json");
    }

    @AfterAll
    static void stopJwksServer() {
        JWKS_SERVER.stop(0);
    }

    @Test
    void rejectsRequestWithoutToken() throws Exception {
        HttpResponse<String> response = post(null);

        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(response.headers().firstValue("WWW-Authenticate")).hasValue("Bearer");
        assertThat(response.headers().firstValue("Content-Type")).hasValueSatisfying(
                type -> assertThat(type).startsWith("application/problem+json"));
        verify(orderService, never()).createOrder(any(), any());
    }

    @Test
    void createsOrderForRequesterAndBindsRequesterToSubject() throws Exception {
        when(orderService.createOrder(any(CreateOrderCommand.class), any())).thenAnswer(invocation -> {
            CreateOrderCommand command = invocation.getArgument(0);
            return new CreateOrderResult(Order.submit(command.requesterId(), command.title(), command.description(),
                    command.pickupLocationId(), "COM1 Print Shop", command.dropoffLocationId(), "UTown Residence", command.creditReward(),
                    command.pickupDeadline()), false);
        });

        HttpResponse<String> response = post(token(SIGNING_KEY, SUBJECT, ISSUER, AUDIENCE, "REQUESTER",
                Instant.now().plusSeconds(600)));

        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(response.body()).contains(SUBJECT);
        assertThat(response.body()).contains("PENDING_CREDIT");
    }

    @Test
    void forbidsNonRequesterSessionRoles() throws Exception {
        for (String role : List.of("COURIER", "ADMIN")) {
            HttpResponse<String> response = post(token(SIGNING_KEY, SUBJECT, ISSUER, AUDIENCE, role,
                    Instant.now().plusSeconds(600)));

            assertThat(response.statusCode()).as(role).isEqualTo(403);
        }
        verify(orderService, never()).createOrder(any(), any());
    }

    @Test
    void onlyARequesterSessionMayCancel() throws Exception {
        String orderId = "3f2a9c4e-6b1d-4e8f-a7c3-5d9e0b1f2a64";
        for (String role : List.of("COURIER", "ADMIN")) {
            HttpResponse<String> response = http.send(HttpRequest.newBuilder()
                    .uri(URI.create("http://localhost:" + port + "/api/orders/" + orderId + "/cancel"))
                    .header("Authorization", "Bearer " + token(SIGNING_KEY, SUBJECT, ISSUER, AUDIENCE, role,
                            Instant.now().plusSeconds(600)))
                    .POST(HttpRequest.BodyPublishers.noBody())
                    .build(), HttpResponse.BodyHandlers.ofString());

            assertThat(response.statusCode()).as(role).isEqualTo(403);
        }
        verify(orderService, never()).cancel(any(), any());
    }

    @Test
    void onlyARequesterSessionMayEdit() throws Exception {
        String orderId = "3f2a9c4e-6b1d-4e8f-a7c3-5d9e0b1f2a64";
        String body = validBody().replace("{", "{\n  \"version\": 1,");
        for (String role : List.of("COURIER", "ADMIN")) {
            HttpResponse<String> response = http.send(HttpRequest.newBuilder()
                    .uri(URI.create("http://localhost:" + port + "/api/orders/" + orderId))
                    .header("Authorization", "Bearer " + token(SIGNING_KEY, SUBJECT, ISSUER, AUDIENCE, role,
                            Instant.now().plusSeconds(600)))
                    .header("Content-Type", "application/json")
                    .method("PATCH", HttpRequest.BodyPublishers.ofString(body))
                    .build(), HttpResponse.BodyHandlers.ofString());

            assertThat(response.statusCode()).as(role).isEqualTo(403);
        }
        verify(orderService, never()).edit(any(), any(), anyLong(), any());

        when(orderService.edit(any(), any(), anyLong(), any())).thenReturn(Order.submit(
                UUID.fromString(SUBJECT), "Collect printing", "Grab my printout",
                UUID.randomUUID(), "COM1 Print Shop", UUID.randomUUID(), "UTown Residence", 10,
                OffsetDateTime.now(ZoneOffset.UTC).plusDays(1)));
        HttpResponse<String> requester = http.send(HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + port + "/api/orders/" + orderId))
                .header("Authorization", "Bearer " + token(SIGNING_KEY, SUBJECT, ISSUER, AUDIENCE, "REQUESTER",
                        Instant.now().plusSeconds(600)))
                .header("Content-Type", "application/json")
                .method("PATCH", HttpRequest.BodyPublishers.ofString(body))
                .build(), HttpResponse.BodyHandlers.ofString());
        assertThat(requester.statusCode()).isEqualTo(200);
    }

    @Test
    void onlyACourierSessionMayAcceptOrWithdraw() throws Exception {
        String orderId = "3f2a9c4e-6b1d-4e8f-a7c3-5d9e0b1f2a64";
        for (String action : List.of("accept", "withdraw")) {
            for (String role : List.of("REQUESTER", "ADMIN")) {
                HttpResponse<String> response = http.send(HttpRequest.newBuilder()
                        .uri(URI.create("http://localhost:" + port + "/api/orders/" + orderId + "/" + action))
                        .header("Authorization", "Bearer " + token(SIGNING_KEY, SUBJECT, ISSUER, AUDIENCE, role,
                                Instant.now().plusSeconds(600)))
                        .POST(HttpRequest.BodyPublishers.noBody())
                        .build(), HttpResponse.BodyHandlers.ofString());

                assertThat(response.statusCode()).as(action + " as " + role).isEqualTo(403);
            }
        }
        verify(orderService, never()).accept(any(), any());
        verify(orderService, never()).withdraw(any(), any());
    }

    @Test
    void pickupAndDeliveryNeedACourierSessionAndCompletionARequesterSession() throws Exception {
        String orderId = "3f2a9c4e-6b1d-4e8f-a7c3-5d9e0b1f2a64";
        List<String[]> forbidden = List.of(
                new String[] {"pickup", "REQUESTER"}, new String[] {"pickup", "ADMIN"},
                new String[] {"deliver", "REQUESTER"}, new String[] {"deliver", "ADMIN"},
                new String[] {"complete", "COURIER"}, new String[] {"complete", "ADMIN"});
        for (String[] attempt : forbidden) {
            HttpResponse<String> response = http.send(HttpRequest.newBuilder()
                    .uri(URI.create("http://localhost:" + port + "/api/orders/" + orderId + "/" + attempt[0]))
                    .header("Authorization", "Bearer " + token(SIGNING_KEY, SUBJECT, ISSUER, AUDIENCE, attempt[1],
                            Instant.now().plusSeconds(600)))
                    .POST(HttpRequest.BodyPublishers.noBody())
                    .build(), HttpResponse.BodyHandlers.ofString());

            assertThat(response.statusCode()).as(attempt[0] + " as " + attempt[1]).isEqualTo(403);
        }
        verify(orderService, never()).pickUp(any(), any());
        verify(orderService, never()).deliver(any(), any());
        verify(orderService, never()).complete(any(), any());
    }

    @Test
    void theErrandUiIsPublicButTheApiIsNot() throws Exception {
        for (String path : List.of("/errands", "/errands/browse", "/order-assets/index.html")) {
            HttpResponse<String> response = http.send(HttpRequest.newBuilder()
                    .uri(URI.create("http://localhost:" + port + path)).GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).as(path).isNotIn(401, 403);
        }
        HttpResponse<String> api = http.send(HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + port + "/api/orders")).GET().build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(api.statusCode()).isEqualTo(401);
    }

    @Test
    void readsNeedAValidTokenButAnyRole() throws Exception {
        when(orderService.getOrder(any(), any())).thenReturn(Order.submit(
                UUID.fromString(SUBJECT), "Collect printing", "Grab my printout",
                UUID.randomUUID(), "COM1 Print Shop", UUID.randomUUID(), "UTown Residence", 10, OffsetDateTime.now(ZoneOffset.UTC).plusDays(1)));
        HttpResponse<String> anonymous = http.send(HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + port + "/api/orders/3f2a9c4e-6b1d-4e8f-a7c3-5d9e0b1f2a64"))
                .GET().build(), HttpResponse.BodyHandlers.ofString());
        assertThat(anonymous.statusCode()).isEqualTo(401);

        HttpResponse<String> courier = http.send(HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + port + "/api/orders/3f2a9c4e-6b1d-4e8f-a7c3-5d9e0b1f2a64"))
                .header("Authorization", "Bearer " + token(SIGNING_KEY, SUBJECT, ISSUER, AUDIENCE, "COURIER",
                        Instant.now().plusSeconds(600)))
                .GET().build(), HttpResponse.BodyHandlers.ofString());
        assertThat(courier.statusCode()).isEqualTo(200);
    }

    @Test
    void listReadsNeedAValidTokenButAnyRole() throws Exception {
        org.springframework.data.domain.Page<Order> empty = org.springframework.data.domain.Page.empty();
        when(orderQueryService.findOpenPool(any(), any())).thenReturn(empty);
        when(orderQueryService.findRequested(any(), any(), any())).thenReturn(empty);
        when(orderQueryService.findDelivered(any(), any(), any())).thenReturn(empty);
        for (String path : List.of("/api/orders", "/api/orders/me/requested", "/api/orders/me/delivered")) {
            HttpResponse<String> anonymous = http.send(HttpRequest.newBuilder()
                    .uri(URI.create("http://localhost:" + port + path))
                    .GET().build(), HttpResponse.BodyHandlers.ofString());
            assertThat(anonymous.statusCode()).as(path).isEqualTo(401);
            for (String role : List.of("REQUESTER", "COURIER")) {
                HttpResponse<String> signedIn = http.send(HttpRequest.newBuilder()
                        .uri(URI.create("http://localhost:" + port + path))
                        .header("Authorization", "Bearer " + token(SIGNING_KEY, SUBJECT, ISSUER, AUDIENCE, role,
                                Instant.now().plusSeconds(600)))
                        .GET().build(), HttpResponse.BodyHandlers.ofString());
                assertThat(signedIn.statusCode()).as(path + " as " + role).isEqualTo(200);
            }
        }
        verify(orderQueryService, org.mockito.Mockito.times(2))
                .findOpenPool(org.mockito.ArgumentMatchers.eq(UUID.fromString(SUBJECT)), any());
    }

    @Test
    void onlyAnAdminSessionMayListAnotherUsersOrders() throws Exception {
        org.springframework.data.domain.Page<Order> empty = org.springframework.data.domain.Page.empty();
        when(orderQueryService.findRequested(any(), any(), any())).thenReturn(empty);
        when(orderQueryService.findDelivered(any(), any(), any())).thenReturn(empty);
        UUID requester = UUID.randomUUID();
        for (String path : List.of("/api/orders/admin/users/" + requester + "/requested",
                "/api/orders/admin/users/" + requester + "/delivered")) {
            HttpResponse<String> anonymous = http.send(HttpRequest.newBuilder()
                    .uri(URI.create("http://localhost:" + port + path))
                    .GET().build(), HttpResponse.BodyHandlers.ofString());
            assertThat(anonymous.statusCode()).as(path).isEqualTo(401);
            for (String role : List.of("REQUESTER", "COURIER")) {
                assertThat(getAs(path, role).statusCode()).as(path + " as " + role).isEqualTo(403);
            }
            assertThat(getAs(path, "ADMIN").statusCode()).as(path + " as ADMIN").isEqualTo(200);
        }
        verify(orderQueryService).findRequested(org.mockito.ArgumentMatchers.eq(requester), any(), any());
        verify(orderQueryService).findDelivered(org.mockito.ArgumentMatchers.eq(requester), any(), any());
    }

    @Test
    void adminRoutesAcceptNoWrites() throws Exception {
        HttpResponse<String> response = http.send(HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + port + "/api/orders/admin/users/" + UUID.randomUUID()
                        + "/requested"))
                .header("Authorization", "Bearer " + token(SIGNING_KEY, SUBJECT, ISSUER, AUDIENCE, "ADMIN",
                        Instant.now().plusSeconds(600)))
                .POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(403);
    }

    private HttpResponse<String> getAs(String path, String role) throws Exception {
        return http.send(HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + port + path))
                .header("Authorization", "Bearer " + token(SIGNING_KEY, SUBJECT, ISSUER, AUDIENCE, role,
                        Instant.now().plusSeconds(600)))
                .GET().build(), HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void anUnexpectedServerErrorIsReportedAs500NotForbidden() throws Exception {
        when(orderService.getOrder(any(), any())).thenThrow(new IllegalStateException("boom"));

        HttpResponse<String> response = http.send(HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + port + "/api/orders/3f2a9c4e-6b1d-4e8f-a7c3-5d9e0b1f2a64"))
                .header("Authorization", "Bearer " + token(SIGNING_KEY, SUBJECT, ISSUER, AUDIENCE, "REQUESTER",
                        Instant.now().plusSeconds(600)))
                .GET().build(), HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(500);
    }

    @Test
    void rejectsTokensThatBreakTheUserServiceContract() throws Exception {
        Instant valid = Instant.now().plusSeconds(600);
        List<String> invalidTokens = List.of(
                token(rsaKeyPair(), SUBJECT, ISSUER, AUDIENCE, "REQUESTER", valid),
                token(SIGNING_KEY, SUBJECT, ISSUER, AUDIENCE, "REQUESTER", Instant.now().minusSeconds(120)),
                token(SIGNING_KEY, SUBJECT, "another-service", AUDIENCE, "REQUESTER", valid),
                token(SIGNING_KEY, SUBJECT, ISSUER, "another-api", "REQUESTER", valid),
                token(SIGNING_KEY, SUBJECT, ISSUER, AUDIENCE, null, valid),
                token(SIGNING_KEY, "not-a-uuid", ISSUER, AUDIENCE, "REQUESTER", valid));

        for (String token : invalidTokens) {
            assertThat(post(token).statusCode()).isEqualTo(401);
        }
        verify(orderService, never()).createOrder(any(), any());
    }

    private HttpResponse<String> post(String bearerToken) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + port + "/api/orders"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(validBody()));
        if (bearerToken != null) {
            request.header("Authorization", "Bearer " + bearerToken);
        }
        return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    private static String validBody() {
        String deadline = OffsetDateTime.now(ZoneOffset.UTC).plusDays(1).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
        return """
                {
                  "title": "Collect printing",
                  "description": "Grab my printout from COM1",
                  "pickupLocationId": "9fd58f13-c8d5-4320-b757-7893d69a4ae0",
                  "pickupLocationName": "COM1 Print Shop",
                  "dropoffLocationId": "eb46dc78-e25e-4f07-a7a2-26bff615d170",
                  "dropoffLocationName": "UTown Residence",
                  "creditReward": 10,
                  "pickupDeadline": "%s"
                }
                """.formatted(deadline);
    }

    private static String token(KeyPair keyPair, String subject, String issuer, String audience,
            String role, Instant expiresAt) throws Exception {
        Instant issuedAt = Instant.now().minusSeconds(300);
        JWTClaimsSet.Builder claims = new JWTClaimsSet.Builder()
                .subject(subject)
                .issuer(issuer)
                .audience(audience)
                .issueTime(Date.from(issuedAt))
                .expirationTime(Date.from(expiresAt));
        if (role != null) {
            claims.claim("role", role);
        }
        SignedJWT jwt = new SignedJWT(
                new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(KEY_ID).build(),
                claims.build());
        jwt.sign(new RSASSASigner((RSAPrivateKey) keyPair.getPrivate()));
        return jwt.serialize();
    }

    private static KeyPair rsaKeyPair() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(2048);
            return generator.generateKeyPair();
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static HttpServer startJwksServer() {
        RSAKey publicJwk = new RSAKey.Builder((RSAPublicKey) SIGNING_KEY.getPublic())
                .keyID(KEY_ID)
                .build();
        byte[] jwks = new JWKSet(publicJwk).toString().getBytes(StandardCharsets.UTF_8);
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/.well-known/jwks.json", exchange -> {
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, jwks.length);
                exchange.getResponseBody().write(jwks);
                exchange.close();
            });
            server.start();
            return server;
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }
    }

    private HttpResponse<String> getMetrics(String path, String role) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + port + path));
        if (role != null) {
            request.header("Authorization", "Bearer " + token(SIGNING_KEY, SUBJECT, ISSUER, AUDIENCE, role,
                    Instant.now().plusSeconds(600)));
        }
        return http.send(request.GET().build(), HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void onlyAnAdminSessionReadsTheOutboxMetrics() throws Exception {
        OutboxEventRepository.OutboxBacklog backlog = mock(OutboxEventRepository.OutboxBacklog.class);
        when(backlog.getPending()).thenReturn(3L);
        when(backlog.getOldestAgeSeconds()).thenReturn(42.0);
        when(backlog.getMaxAttempts()).thenReturn(2);
        when(outboxEventRepository.backlog(any())).thenReturn(backlog);

        HttpResponse<String> admin = getMetrics("/actuator/metrics/order.outbox.pending", "ADMIN");
        assertThat(admin.statusCode()).isEqualTo(200);
        assertThat(admin.body()).contains("\"value\":3.0");
        assertThat(getMetrics("/actuator/metrics/order.credit.unanswered", "ADMIN").statusCode())
                .as("reconciliation gauge").isEqualTo(200);
        assertThat(getMetrics("/actuator/metrics/order.credit.unanswered", "REQUESTER").statusCode()).isEqualTo(403);

        assertThat(getMetrics("/actuator/metrics", null).statusCode()).isEqualTo(401);
        for (String role : List.of("REQUESTER", "COURIER")) {
            assertThat(getMetrics("/actuator/metrics/order.outbox.pending", role).statusCode())
                    .as(role).isEqualTo(403);
        }
        // Health stays public for probes.
        assertThat(getMetrics("/actuator/health", null).statusCode()).isEqualTo(200);
    }
}
