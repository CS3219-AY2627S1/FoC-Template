/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-6.1-sol), 2026-11-08
 * Scope (AI-08): Removed trailing full stops from alert text and updated examples and tests.
 * Tool and date: OpenAI Codex (gpt-6.1-sol), 2026-11-07
 * Scope (AI-22): Implemented and tested the requested requester delivery alert.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-08
 * Scope: Generated and refined chat notification integration tests.
 */
package com.campuscouriers.notification_service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;
import com.campuscouriers.notification_service.notification.Notification;
import com.campuscouriers.notification_service.notification.NotificationRepository;
import com.campuscouriers.notification_service.notification.NotificationService;
import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.kafka.KafkaContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class NotificationServiceApplicationTests {
    private static final String ISSUER = "campuscouriers-user-service";
    private static HttpServer jwks;
    private static RSAKey signingKey;
    private final HttpClient http = HttpClient.newBuilder()
        .version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(5)).build();
    private final JsonMapper json = JsonMapper.builder().build();

    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16-alpine");
    @Container
    static final KafkaContainer KAFKA = new KafkaContainer("apache/kafka:4.3.1");

    @BeforeAll
    static void startJwks() throws Exception {
        signingKey = new RSAKeyGenerator(2048).keyID("integration-test").generate();
        byte[] keys = new JWKSet(signingKey.toPublicJWK()).toString().getBytes(StandardCharsets.UTF_8);
        jwks = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        jwks.createContext("/.well-known/jwks.json", exchange -> {
            try (exchange) {
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, keys.length);
                exchange.getResponseBody().write(keys);
            }
        });
        jwks.start();
    }

    @AfterAll
    static void stopJwks() {
        if (jwks != null) {
            jwks.stop(0);
        }
    }

    @DynamicPropertySource
    static void connections(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.kafka.bootstrap-servers", KAFKA::getBootstrapServers);
        registry.add("notification.auth.issuer", () -> ISSUER);
        registry.add("notification.auth.jwk-set-uri",
            () -> "http://127.0.0.1:" + jwks.getAddress().getPort() + "/.well-known/jwks.json");
    }

    @Autowired KafkaTemplate<String, String> kafka;
    @Autowired NotificationRepository repository;
    @Autowired NotificationService notifications;
    @Autowired JdbcTemplate jdbc;
    @Autowired TransactionTemplate transactions;
    @LocalServerPort int port;

    @Test
    void historyAndReadActionsAreScopedToTheAuthenticatedUser() throws Exception {
        UUID alice = UUID.randomUUID();
        UUID bob = UUID.randomUUID();
        UUID aliceEvent = UUID.randomUUID();
        UUID secondAliceEvent = UUID.randomUUID();
        UUID bobEvent = UUID.randomUUID();
        notifications.save(aliceEvent, alice, "ERRAND_ACCEPTED", UUID.randomUUID(), "Alice's first");
        notifications.save(secondAliceEvent, alice, "ERRAND_ACCEPTED", UUID.randomUUID(), "Alice's second");
        notifications.save(bobEvent, bob, "ERRAND_ACCEPTED", UUID.randomUUID(), "Bob's");
        String aliceToken = token(alice);
        String bobToken = token(bob);

        assertThat(request("GET", "/notifications", null).statusCode()).isEqualTo(401);
        assertThat(request("GET", "/notifications", "invalid").statusCode()).isEqualTo(401);
        assertThat(request("GET", "/notifications",
            token(alice.toString(), "another-issuer", Instant.now().plusSeconds(60))).statusCode())
            .isEqualTo(401);
        assertThat(request("GET", "/notifications",
            token("not-an-account-id", ISSUER, Instant.now().plusSeconds(60))).statusCode())
            .isEqualTo(401);
        assertThat(request("GET", "/notifications",
            token(alice.toString(), ISSUER, Instant.now().minusSeconds(1))).statusCode())
            .isEqualTo(401);
        assertThat(request("GET", "/notifications?limit=101", aliceToken).statusCode()).isEqualTo(400);
        var history = request("GET", "/notifications?limit=1", aliceToken);
        assertThat(history.statusCode()).isEqualTo(200);
        JsonNode items = json.readTree(history.body()).get("items");
        assertThat(items.size()).isEqualTo(1);
        assertThat(items.get(0).get("id").asString()).isEqualTo(find(secondAliceEvent).getId().toString());
        assertThat(items.get(0).has("errandId")).isFalse();
        assertThat(items.get(0).get("data").get("errandId").asString())
            .isEqualTo(find(secondAliceEvent).getErrandId().toString());
        assertThat(items.get(0).get("data").has("conversationId")).isFalse();
        assertThat(items.get(0).get("data").has("messageId")).isFalse();
        assertThat(items.get(0).get("readAt").isNull()).isTrue();
        assertThat(unread(aliceToken)).isEqualTo(2);

        String readAlice = "/notifications/" + find(aliceEvent).getId() + "/read";
        assertThat(request("PATCH", readAlice, bobToken).statusCode()).isEqualTo(404);
        assertThat(request("PATCH", readAlice, aliceToken).statusCode()).isEqualTo(204);
        Instant readAt = find(aliceEvent).getReadAt();
        assertThat(readAt).isNotNull();
        assertThat(request("PATCH", readAlice, aliceToken).statusCode()).isEqualTo(204);
        assertThat(find(aliceEvent).getReadAt()).isEqualTo(readAt);
        assertThat(unread(aliceToken)).isEqualTo(1);
        assertThat(request("POST", "/notifications/read-all", aliceToken).statusCode()).isEqualTo(204);
        assertThat(unread(aliceToken)).isZero();
        assertThat(unread(bobToken)).isEqualTo(1);
    }

    @Test
    void countsCompletionAndCreditReceiptAsOneUnreadCardUntilBothAreRead() throws Exception {
        UUID courier = UUID.randomUUID();
        UUID otherUser = UUID.randomUUID();
        UUID errand = UUID.randomUUID();
        UUID completed = UUID.randomUUID();
        UUID credit = UUID.randomUUID();
        UUID delivered = UUID.randomUUID();
        notifications.save(completed, courier, "ERRAND_COMPLETED", errand, "Completed");
        notifications.save(credit, courier, "CREDIT_RECEIVED", errand, "Credit received");
        notifications.save(delivered, courier, "ERRAND_DELIVERED", errand, "Delivered");
        notifications.save(UUID.randomUUID(), otherUser, "CREDIT_RECEIVED", errand, "Credit received");
        String courierToken = token(courier);

        var history = request("GET", "/notifications?limit=1", courierToken);
        assertThat(history.statusCode()).isEqualTo(200);
        assertThat(json.readTree(history.body()).get("items").size()).isEqualTo(1);
        assertThat(unread(courierToken)).isEqualTo(2);

        assertThat(request("PATCH", "/notifications/" + find(completed).getId() + "/read",
            courierToken).statusCode()).isEqualTo(204);
        assertThat(unread(courierToken)).isEqualTo(2);

        assertThat(request("PATCH", "/notifications/" + find(credit).getId() + "/read",
            courierToken).statusCode()).isEqualTo(204);
        assertThat(unread(courierToken)).isEqualTo(1);
        assertThat(unread(token(otherUser))).isEqualTo(1);
    }

    @Test
    void liveDeliveryReachesBothRecipientTabsAndSkipsRedeliveryAndRollback() throws Exception {
        UUID alice = UUID.randomUUID();
        UUID bob = UUID.randomUUID();
        UUID accepted = UUID.randomUUID();
        String body = payload(UUID.randomUUID(), alice, UUID.randomUUID());
        try (BufferedReader firstTab = openStream(token(alice));
             BufferedReader secondTab = openStream(token(alice));
             BufferedReader otherUser = openStream(token(bob))) {
            for (BufferedReader stream : List.of(firstTab, secondTab, otherUser)) {
                assertThat(nextEvent(stream).type()).isEqualTo("connected");
            }
            kafka.send(record("errand.accepted", accepted, body)).get(10, TimeUnit.SECONDS);
            SseFrame first = nextEvent(firstTab);
            SseFrame second = nextEvent(secondTab);
            assertThat(first.type()).isEqualTo("notification");
            assertThat(first).isEqualTo(second);
            assertThat(first.id()).isEqualTo(find(accepted).getId().toString());
            var history = request("GET", "/notifications", token(alice));
            assertThat(json.readTree(first.data())).isEqualTo(json.readTree(history.body()).get("items").get(0));

            firstTab.close();
            transactions.executeWithoutResult(status -> {
                notifications.save(UUID.randomUUID(), alice, "ERRAND_ACCEPTED", UUID.randomUUID(), "Rolled back");
                status.setRollbackOnly();
            });
            kafka.send(record("errand.accepted", accepted, body)).get(10, TimeUnit.SECONDS);
            UUID nextAlice = UUID.randomUUID();
            kafka.send(record("errand.accepted", nextAlice, body)).get(10, TimeUnit.SECONDS);
            assertThat(nextEvent(secondTab).id()).isEqualTo(find(nextAlice).getId().toString());

            UUID nextBob = UUID.randomUUID();
            kafka.send(record("errand.accepted", nextBob,
                payload(UUID.randomUUID(), bob, UUID.randomUUID()))).get(10, TimeUnit.SECONDS);
            assertThat(nextEvent(otherUser).id()).isEqualTo(find(nextBob).getId().toString());
        }
    }

    @Test
    void streamRequiresAuthenticationAndClosesWhenTokenExpires() throws Exception {
        var preflight = http.send(httpRequest("/notifications/stream", null)
            .header("Origin", "http://localhost:5173")
            .header("Access-Control-Request-Method", "GET")
            .header("Access-Control-Request-Headers", "authorization,last-event-id")
            .method("OPTIONS", HttpRequest.BodyPublishers.noBody()).build(),
            HttpResponse.BodyHandlers.discarding());
        assertThat(preflight.statusCode()).isEqualTo(200);
        assertThat(preflight.headers().firstValue("Access-Control-Allow-Origin"))
            .contains("http://localhost:5173");
        var unauthorized = http.send(
            httpRequest("/notifications/stream", null).GET().build(), HttpResponse.BodyHandlers.ofInputStream());
        try (var body = unauthorized.body()) {
            assertThat(unauthorized.statusCode()).isEqualTo(401);
        }
        String expiring = token(UUID.randomUUID().toString(), ISSUER, Instant.now().plusSeconds(4));
        try (BufferedReader stream = openStream(expiring)) {
            assertThat(nextEvent(stream).type()).isEqualTo("connected");
            assertThat(nextEvent(stream)).isNull();
        }
    }

    private int unread(String token) throws Exception {
        var response = request("GET", "/notifications/unread-count", token);
        assertThat(response.statusCode()).isEqualTo(200);
        return json.readTree(response.body()).get("count").asInt();
    }

    private HttpResponse<String> request(String method, String path, String token) throws Exception {
        return http.send(httpRequest(path, token).method(method, HttpRequest.BodyPublishers.noBody()).build(),
            HttpResponse.BodyHandlers.ofString());
    }

    private HttpRequest.Builder httpRequest(String path, String token) {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
            .timeout(Duration.ofSeconds(10));
        if (token != null) {
            request.header("Authorization", "Bearer " + token);
        }
        return request;
    }

    private BufferedReader openStream(String token) throws Exception {
        var response = http.send(httpRequest("/notifications/stream", token)
            .header("Accept", "text/event-stream").GET().build(), HttpResponse.BodyHandlers.ofInputStream());
        BufferedReader reader = new BufferedReader(new InputStreamReader(response.body(), StandardCharsets.UTF_8));
        if (response.statusCode() != 200) {
            reader.close();
        }
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Content-Type").orElseThrow()).startsWith("text/event-stream");
        return reader;
    }

    private SseFrame nextEvent(BufferedReader reader) throws Exception {
        return CompletableFuture.supplyAsync(() -> {
            try {
                String type = null;
                String id = null;
                String data = null;
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.startsWith("event:")) {
                        type = line.substring(6).stripLeading();
                    } else if (line.startsWith("id:")) {
                        id = line.substring(3).stripLeading();
                    } else if (line.startsWith("data:")) {
                        data = line.substring(5).stripLeading();
                    } else if (line.isEmpty() && type != null) {
                        return new SseFrame(type, id, data);
                    }
                }
                return null;
            } catch (IOException exception) {
                throw new java.io.UncheckedIOException(exception);
            }
        }).get(12, TimeUnit.SECONDS);
    }

    private String token(UUID recipientId) throws Exception {
        return token(recipientId.toString(), ISSUER, Instant.now().plusSeconds(60));
    }

    private String token(String subject, String issuer, Instant expiresAt) throws Exception {
        SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256)
            .keyID(signingKey.getKeyID()).build(), new JWTClaimsSet.Builder()
            .issuer(issuer).subject(subject).expirationTime(Date.from(expiresAt)).build());
        jwt.sign(new RSASSASigner(signingKey));
        return jwt.serialize();
    }

    private record SseFrame(String type, String id, String data) {}

    @Test
    void mapsErrandTopicsToTheOtherParticipantAndCommitsOffsets() throws Exception {
        for (String topic : List.of("errand.accepted", "errand.delivered", "errand.completed", "errand.failed")) {
            UUID eventId = UUID.randomUUID();
            UUID requester = UUID.randomUUID();
            UUID courier = UUID.randomUUID();
            UUID errand = UUID.randomUUID();
            var result = kafka.send(record(topic, eventId,
                payload(errand, requester, courier))).get(10, TimeUnit.SECONDS);
            await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> {
                Notification saved = find(eventId);
                assertThat(saved.getRecipientId()).isEqualTo(
                    topic.equals("errand.accepted") || topic.equals("errand.delivered") ? requester : courier);
                assertThat(saved.getErrandId()).isEqualTo(errand);
                assertThat(saved.getType()).isEqualTo(topic.replace('.', '_').toUpperCase());
                assertThat(saved.getReadAt()).isNull();
                if (topic.equals("errand.completed")) {
                    assertThat(saved.getMessage())
                        .isEqualTo("The requester confirmed your errand is complete")
                        .doesNotContain("earned", "paid", "credits");
                }
            });
            assertCommitted(topic, result.getRecordMetadata().partition(),
                result.getRecordMetadata().offset());
        }
    }

    @Test
    void savesBothCreditAlertTypesAndDeduplicatesByCreditRecordId() throws Exception {
        for (String change : List.of("RECEIVED", "RELEASED")) {
            UUID event = UUID.randomUUID();
            UUID user = UUID.randomUUID();
            UUID order = UUID.randomUUID();
            String topic = "credit." + change.toLowerCase(java.util.Locale.ROOT);
            String body = """
                {"eventId":"%s","changeType":"%s","userId":"%s","orderId":"%s","amount":10}
                """.formatted(event, change, user, order);
            kafka.send(record(topic, UUID.randomUUID(), body)).get(10, TimeUnit.SECONDS);
            var replay = kafka.send(record(topic, UUID.randomUUID(), body)).get(10, TimeUnit.SECONDS);
            assertCommitted(topic, replay.getRecordMetadata().partition(), replay.getRecordMetadata().offset());
            assertThat(repository.findAll().stream().filter(n -> n.getSourceEventId().equals(event)))
                .singleElement().satisfies(saved -> {
                    assertThat(saved.getRecipientId()).isEqualTo(user);
                    assertThat(saved.getErrandId()).isEqualTo(order);
                    assertThat(saved.getType()).isEqualTo("CREDIT_" + change);
                    assertThat(saved.getMessage()).contains("10 credits");
                });
        }
    }

    @Test
    void kafkaRedeliveryDoesNotDuplicateNotifications() throws Exception {
        UUID eventId = UUID.randomUUID();
        String body = payload(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());
        kafka.send(record("errand.accepted", eventId, body)).get(10, TimeUnit.SECONDS);
        var last = kafka.send(record("errand.accepted", eventId, body)).get(10, TimeUnit.SECONDS);
        assertCommitted("errand.accepted", last.getRecordMetadata().partition(),
            last.getRecordMetadata().offset());
        assertThat(repository.findAll().stream().filter(n -> n.getSourceEventId().equals(eventId)))
            .hasSize(1);
    }

    @Test
    void expiryRedeliveryCreatesOneAlertSeparateFromCreditRelease() throws Exception {
        UUID expiryEvent = UUID.randomUUID();
        UUID requester = UUID.randomUUID();
        UUID errand = UUID.randomUUID();
        String expiry = """
            {"errandId":"%s","requesterId":"%s","resultingStatus":"EXPIRED"}
            """.formatted(errand, requester);
        String release = """
            {"eventId":"%s","orderId":"%s","userId":"%s","changeType":"RELEASED","amount":8}
            """.formatted(UUID.randomUUID(), errand, requester);

        kafka.send(record("errand.expired", expiryEvent, expiry)).get(10, TimeUnit.SECONDS);
        var replay = kafka.send(record("errand.expired", expiryEvent, expiry)).get(10, TimeUnit.SECONDS);
        var credit = kafka.send(record("credit.released", UUID.randomUUID(), release)).get(10, TimeUnit.SECONDS);
        assertCommitted("errand.expired", replay.getRecordMetadata().partition(), replay.getRecordMetadata().offset());
        assertCommitted("credit.released", credit.getRecordMetadata().partition(), credit.getRecordMetadata().offset());

        assertThat(repository.findAll().stream().filter(n -> n.getErrandId().equals(errand)))
            .extracting(Notification::getType)
            .containsExactlyInAnyOrder("ERRAND_EXPIRED", "CREDIT_RELEASED");
    }

    @Test
    void concurrentInsertsDeduplicateWithoutBlockingOtherRecipients() {
        UUID event = UUID.randomUUID();
        UUID recipient = UUID.randomUUID();
        UUID errand = UUID.randomUUID();
        CompletableFuture<?>[] saves = new CompletableFuture<?>[8];
        for (int i = 0; i < saves.length; i++) {
            saves[i] = CompletableFuture.runAsync(() ->
                notifications.save(event, recipient, "ERRAND_ACCEPTED", errand, "Accepted"));
        }
        CompletableFuture.allOf(saves).join();
        assertThat(repository.findAll().stream().filter(n -> n.getSourceEventId().equals(event)))
            .hasSize(1);
        assertThat(notifications.save(event, UUID.randomUUID(), "ERRAND_ACCEPTED", errand, "Accepted"))
            .isTrue();
    }

    @Test
    void nonDuplicateDatabaseErrorsAreNotSwallowed() {
        assertThatThrownBy(() -> notifications.save(UUID.randomUUID(), null,
            "ERRAND_ACCEPTED", UUID.randomUUID(), "Accepted"))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void databaseEnforcesTypeSpecificChatFields() {
        assertThatThrownBy(() -> notifications.save(
            UUID.randomUUID(), UUID.randomUUID(), "CHAT_MESSAGE", UUID.randomUUID(),
            "Missing chat identifiers"))
            .isInstanceOf(DataIntegrityViolationException.class);

        assertThatThrownBy(() -> notifications.save(
            UUID.randomUUID(), UUID.randomUUID(), "ERRAND_ACCEPTED", UUID.randomUUID(),
            UUID.randomUUID(), UUID.randomUUID(), "Unexpected chat identifiers"))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void invalidEventsGoToDeadLetterTopicAndDoNotBlockFollowingEvents() throws Exception {
        String valid = payload(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());
        var missingHeader = new ProducerRecord<String, String>("errand.accepted", "key", valid);
        assertDeadLetter(missingHeader);
        assertDeadLetter(record("errand.accepted", UUID.randomUUID(), "{broken"));
        assertDeadLetter(record("errand.accepted", UUID.randomUUID(), "{}"));
        assertDeadLetter(record("errand.accepted", UUID.randomUUID(), null));
        assertDeadLetter(record("errand.accepted", UUID.randomUUID(), valid.replace("10", "-1")));
        UUID healthy = UUID.randomUUID();
        kafka.send(record("errand.accepted", healthy, valid)).get(10, TimeUnit.SECONDS);
        await().atMost(Duration.ofSeconds(20)).untilAsserted(() -> assertThat(find(healthy)).isNotNull());
    }

    @Test
    void temporaryDatabaseFailureRetriesAndSaves() throws Exception {
        UUID recipient = UUID.randomUUID();
        UUID event = UUID.randomUUID();
        jdbc.execute("CREATE SEQUENCE transient_attempts");
        jdbc.execute("""
            CREATE FUNCTION transient_failure() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                IF NEW.recipient_id = '%s'::uuid AND nextval('transient_attempts') = 1 THEN
                    RAISE EXCEPTION 'Simulated transient database failure' USING ERRCODE = '08006';
                END IF;
                RETURN NEW;
            END $$
            """.formatted(recipient));
        jdbc.execute("CREATE TRIGGER transient_failure BEFORE INSERT ON notifications "
            + "FOR EACH ROW EXECUTE FUNCTION transient_failure()");
        try {
            var sent = kafka.send(record("errand.accepted", event,
                payload(UUID.randomUUID(), recipient, UUID.randomUUID()))).get(10, TimeUnit.SECONDS);
            await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(find(event)).isNotNull());
            assertCommitted("errand.accepted", sent.getRecordMetadata().partition(),
                sent.getRecordMetadata().offset());
            assertThat(jdbc.queryForObject("SELECT last_value FROM transient_attempts", Long.class))
                .isEqualTo(2L);
        } finally {
            jdbc.execute("DROP TRIGGER transient_failure ON notifications");
            jdbc.execute("DROP FUNCTION transient_failure()");
            jdbc.execute("DROP SEQUENCE transient_attempts");
        }
    }

    @Test
    void repeatedDatabaseFailuresReachDeadLetterTopic() throws Exception {
        UUID recipient = UUID.randomUUID();
        jdbc.execute("CREATE SEQUENCE persistent_attempts");
        jdbc.execute("""
            CREATE FUNCTION persistent_failure() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                IF NEW.recipient_id = '%s'::uuid THEN
                    PERFORM nextval('persistent_attempts');
                    RAISE EXCEPTION 'Simulated persistent failure';
                END IF;
                RETURN NEW;
            END $$
            """.formatted(recipient));
        jdbc.execute("CREATE TRIGGER persistent_failure BEFORE INSERT ON notifications "
            + "FOR EACH ROW EXECUTE FUNCTION persistent_failure()");
        try {
            UUID event = UUID.randomUUID();
            assertDeadLetter(record("errand.accepted", event,
                payload(UUID.randomUUID(), recipient, UUID.randomUUID())));
            assertThat(repository.findAll().stream().filter(n -> n.getSourceEventId().equals(event)))
                .isEmpty();
            assertThat(jdbc.queryForObject("SELECT last_value FROM persistent_attempts", Long.class))
                .isEqualTo(3L);
        } finally {
            jdbc.execute("DROP TRIGGER persistent_failure ON notifications");
            jdbc.execute("DROP FUNCTION persistent_failure()");
            jdbc.execute("DROP SEQUENCE persistent_attempts");
        }
    }

    private Notification find(UUID eventId) {
        var result = repository.findAll().stream().filter(n -> n.getSourceEventId().equals(eventId))
            .findFirst();
        assertThat(result).as("notification for event %s", eventId).isPresent();
        return result.orElseThrow();
    }

    private void assertCommitted(String topic, int partition, long offset) throws Exception {
        try (Admin admin = Admin.create(Map.of("bootstrap.servers", KAFKA.getBootstrapServers()))) {
            await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> {
                var committed = admin.listConsumerGroupOffsets("notification-service")
                    .partitionsToOffsetAndMetadata().get(5, TimeUnit.SECONDS)
                    .get(new TopicPartition(topic, partition));
                assertThat(committed).isNotNull();
                assertThat(committed.offset()).isGreaterThan(offset);
            });
        }
    }

    private void assertDeadLetter(ProducerRecord<String, String> original) throws Exception {
        try (var consumer = new KafkaConsumer<String, String>(Map.of(
                ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, KAFKA.getBootstrapServers(),
                ConsumerConfig.GROUP_ID_CONFIG, UUID.randomUUID().toString(),
                ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest",
                ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false),
                new StringDeserializer(), new StringDeserializer())) {
            // A unique key distinguishes this event from other DLT test records.
            var source = new ProducerRecord<String, String>(original.topic(), UUID.randomUUID().toString(),
                original.value());
            original.headers().forEach(source.headers()::add);
            var sent = kafka.send(source).get(10, TimeUnit.SECONDS);
            consumer.subscribe(List.of(original.topic() + ".notification-dlt"));
            await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> {
                var records = consumer.poll(Duration.ofMillis(300));
                assertThat(records).anySatisfy(record -> {
                    assertThat(record.key()).isEqualTo(source.key());
                    assertThat(record.value()).isEqualTo(source.value());
                    assertThat(record.headers().lastHeader("kafka_dlt-exception-fqcn")).isNotNull();
                });
            });
            assertCommitted(source.topic(), sent.getRecordMetadata().partition(),
                sent.getRecordMetadata().offset());
        }
    }

    private ProducerRecord<String, String> record(String topic, UUID event, String body) {
        var record = new ProducerRecord<String, String>(topic, "errand-key", body);
        record.headers().add("eventId", event.toString().getBytes(StandardCharsets.UTF_8));
        return record;
    }

    private String payload(UUID errand, UUID requester, UUID courier) {
        return """
            {"errandId":"%s","requesterId":"%s","courierId":"%s","creditValue":10,
             "unknownFutureField":"ignored"}
            """.formatted(errand, requester, courier);
    }
}
