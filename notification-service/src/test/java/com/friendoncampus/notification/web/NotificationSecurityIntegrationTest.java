package com.friendoncampus.notification.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
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
import java.util.Date;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.data.domain.Page;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.friendoncampus.notification.messaging.CreditEventHandler;
import com.friendoncampus.notification.messaging.ChatMessageEventHandler;
import com.friendoncampus.notification.messaging.OrderLifecycleEventHandler;
import com.friendoncampus.notification.reminder.ReminderRepository;
import com.friendoncampus.notification.service.NotificationNotFoundException;
import com.friendoncampus.notification.service.NotificationQueryService;
import com.friendoncampus.notification.service.NotificationReadStateService;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;

/**
 * End-to-end security over the real filter chain: a stub User Service JWKS serves a test RS256 key,
 * so tokens are verified exactly as in production. Any valid session role may read, and the
 * recipient is always the token's {@code sub}.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "spring.autoconfigure.exclude="
                        + "org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration,"
                        + "org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration,"
                        + "org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration",
                "app.kafka.enabled=false",
                "app.retention.enabled=false",
                "app.reminders.enabled=false",
                "app.security.jwt.issuer=" + NotificationSecurityIntegrationTest.ISSUER,
                "app.security.jwt.audience=" + NotificationSecurityIntegrationTest.AUDIENCE
        })
class NotificationSecurityIntegrationTest {

    static final String ISSUER = "friend-on-campus-user-service";
    static final String AUDIENCE = "friend-on-campus-api";
    private static final String KEY_ID = "test-user-service-key";
    private static final String SUBJECT = "97947588-bb2e-42f2-91ba-9abf8e15a8e7";

    private static final KeyPair SIGNING_KEY = rsaKeyPair();
    private static final HttpServer JWKS_SERVER = startJwksServer();

    @LocalServerPort
    private int port;

    @MockitoBean
    private NotificationQueryService queryService;

    @MockitoBean
    private NotificationReadStateService readStateService;

    @MockitoBean
    private CreditEventHandler creditEventHandler;

    @MockitoBean
    private OrderLifecycleEventHandler orderLifecycleEventHandler;

    @MockitoBean
    private ChatMessageEventHandler chatMessageEventHandler;

    @MockitoBean
    private ReminderRepository reminderRepository;

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
    void rejectsARequestWithoutAToken() throws Exception {
        HttpResponse<String> response = get("/api/notifications/me", null);

        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(response.headers().firstValue("WWW-Authenticate")).hasValue("Bearer");
        assertThat(response.headers().firstValue("Content-Type")).hasValueSatisfying(
                type -> assertThat(type).startsWith("application/problem+json"));
        verify(queryService, never()).listFor(any(), any());
    }

    @Test
    void everySessionRoleReadsItsOwnNotifications() throws Exception {
        when(queryService.listFor(any(), any())).thenReturn(Page.empty());

        for (String role : List.of("REQUESTER", "COURIER", "ADMIN")) {
            HttpResponse<String> response = get("/api/notifications/me?userId=" + UUID.randomUUID(),
                    token(SIGNING_KEY, SUBJECT, ISSUER, AUDIENCE, role, Instant.now().plusSeconds(600)));

            assertThat(response.statusCode()).as(role).isEqualTo(200);
        }
        verify(queryService, times(3)).listFor(eq(UUID.fromString(SUBJECT)), any());
    }

    @Test
    void everySessionRolePollsOnlyItsOwnPushNotifications() throws Exception {
        var after = "2026-11-10T12:00:00Z";
        when(queryService.pushFor(any(), any())).thenReturn(
                new NotificationQueryService.PushBatch(List.of(), java.time.OffsetDateTime.parse(after)));

        for (String role : List.of("REQUESTER", "COURIER", "ADMIN")) {
            HttpResponse<String> response = get("/api/notifications/me/push?after=" + after,
                    token(SIGNING_KEY, SUBJECT, ISSUER, AUDIENCE, role, Instant.now().plusSeconds(600)));

            assertThat(response.statusCode()).as(role).isEqualTo(200);
        }
        verify(queryService, times(3)).pushFor(eq(UUID.fromString(SUBJECT)), any());
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
            assertThat(get("/api/notifications/me", token).statusCode()).isEqualTo(401);
        }
        verify(queryService, never()).listFor(any(), any());
    }

    @Test
    void writesAndUnknownPathsAreDenied() throws Exception {
        String token = token(SIGNING_KEY, SUBJECT, ISSUER, AUDIENCE, "REQUESTER", Instant.now().plusSeconds(600));
        HttpResponse<String> post = http.send(HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + port + "/api/notifications/me"))
                .header("Authorization", "Bearer " + token)
                .POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(post.statusCode()).isEqualTo(403);
        assertThat(get("/api/other", token).statusCode()).isEqualTo(403);
        // The pre-contract path is gone; there is no list of everyone's notifications.
        assertThat(get("/api/notifications", token).statusCode()).isEqualTo(403);
    }

    @Test
    void readMarkingAndTheUnreadCountNeedAToken() throws Exception {
        assertThat(send("PATCH", "/api/notifications/me/" + UUID.randomUUID() + "/read", null).statusCode())
                .isEqualTo(401);
        assertThat(get("/api/notifications/me/unread-count", null).statusCode()).isEqualTo(401);
        verify(readStateService, never()).markRead(any(), any());
        verify(queryService, never()).countUnread(any());
    }

    @Test
    void everySessionRoleMarksAndCountsOnlyItsOwn() throws Exception {
        UUID id = UUID.randomUUID();
        when(readStateService.markRead(any(), any())).thenThrow(new NotificationNotFoundException(id));

        for (String role : List.of("REQUESTER", "COURIER", "ADMIN")) {
            String token = token(SIGNING_KEY, SUBJECT, ISSUER, AUDIENCE, role, Instant.now().plusSeconds(600));
            assertThat(get("/api/notifications/me/unread-count?userId=" + UUID.randomUUID(), token).statusCode())
                    .as(role).isEqualTo(200);
            HttpResponse<String> patch = send("PATCH", "/api/notifications/me/" + id + "/read", token);
            assertThat(patch.statusCode()).as(role).isEqualTo(404);
            assertThat(patch.headers().firstValue("Content-Type")).hasValueSatisfying(
                    type -> assertThat(type).startsWith("application/problem+json"));
        }
        verify(queryService, times(3)).countUnread(UUID.fromString(SUBJECT));
        verify(readStateService, times(3)).markRead(UUID.fromString(SUBJECT), id);
    }

    @Test
    void otherReadStateRoutesAreDenied() throws Exception {
        String token = token(SIGNING_KEY, SUBJECT, ISSUER, AUDIENCE, "REQUESTER", Instant.now().plusSeconds(600));
        // Mark-all-read and marking unread are not part of the API.
        assertThat(send("PATCH", "/api/notifications/me/read", token).statusCode()).isEqualTo(403);
        assertThat(send("PATCH", "/api/notifications/me/read-all", token).statusCode()).isEqualTo(403);
        assertThat(send("DELETE", "/api/notifications/me/" + UUID.randomUUID() + "/read", token).statusCode())
                .isEqualTo(403);
        assertThat(send("POST", "/api/notifications/me/" + UUID.randomUUID() + "/read", token).statusCode())
                .isEqualTo(403);
        assertThat(get("/api/notifications/me/" + UUID.randomUUID() + "/read", token).statusCode()).isEqualTo(403);
        verify(readStateService, never()).markRead(any(), any());
    }

    @Test
    void theNotificationsPageIsPublicButOnlyForReading() throws Exception {
        // The page itself carries no data; its API calls still need a token.
        assertThat(get("/notifications", null).statusCode()).isNotIn(401, 403);
        assertThat(get("/notification-assets/index.js", null).statusCode()).isNotIn(401, 403);
        assertThat(get("/api/notifications/me", null).statusCode()).isEqualTo(401);
        assertThat(send("POST", "/notifications", null).statusCode()).isIn(401, 403);
    }

    @Test
    void healthAndApiDocsArePublic() throws Exception {
        assertThat(get("/actuator/health", null).statusCode()).isEqualTo(200);
        assertThat(get("/v3/api-docs", null).statusCode()).isEqualTo(200);
    }

    private HttpResponse<String> get(String path, String bearerToken) throws Exception {
        return send("GET", path, bearerToken);
    }

    private HttpResponse<String> send(String method, String path, String bearerToken) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + port + path))
                .method(method, HttpRequest.BodyPublishers.noBody());
        if (bearerToken != null) {
            request.header("Authorization", "Bearer " + bearerToken);
        }
        return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
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
}
