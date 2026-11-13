package com.friendoncampus.user.messaging;

import static org.assertj.core.api.Assertions.*;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.annotation.DirtiesContext;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.kafka.KafkaContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;
import com.friendoncampus.user.domain.EmailVerificationAttempt;
import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.domain.UserStatus;
import com.friendoncampus.user.repository.EmailVerificationAttemptRepository;
import com.friendoncampus.user.repository.UserRepository;
import com.friendoncampus.user.service.EmailVerificationService;
import com.friendoncampus.user.support.JwtTestProperties;

/** Isolated real PostgreSQL/Kafka; never uses developer databases or their broker credentials. */
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@SpringBootTest(properties = {
        "app.events.enabled=true", "app.events.security-protocol=PLAINTEXT",
        "app.events.send-timeout-ms=1500", "app.events.retry-delay-ms=100",
        "app.events.initial-delay-ms=3600000", "app.events.poll-interval-ms=3600000"
})
class UserKafkaDeliveryIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");
    @Container static final KafkaContainer KAFKA = new KafkaContainer("apache/kafka:4.3.1")
            .withEnv("KAFKA_HEAP_OPTS", "-Xms256m -Xmx512m");

    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("app.events.bootstrap-servers", KAFKA::getBootstrapServers);
        JwtTestProperties.register(registry);
    }
    @Autowired EmailVerificationService verification;
    @Autowired UserRepository users;
    @Autowired EmailVerificationAttemptRepository attempts;
    @Autowired UserOutboxRepository outbox;
    @Autowired UserOutboxPublisher publisher;
    @Autowired UserEventDispatcher dispatcher;
    @Autowired PasswordEncoder passwords;
    @Autowired JdbcTemplate jdbc;

    @BeforeAll static void topic() throws Exception {
        try (Admin admin = Admin.create(Map.of("bootstrap.servers", KAFKA.getBootstrapServers()))) {
            admin.createTopics(List.of(new NewTopic("user.events", 3, (short) 1)))
                    .all().get(30, TimeUnit.SECONDS);
        }
    }
    @BeforeEach void clearQueue() { outbox.deleteAllInBatch(); }

    private User pending() {
        String unique = UUID.randomUUID().toString().substring(0, 12);
        User user = users.saveAndFlush(User.register(unique + "@u.nus.edu", unique, unique, "test-hash"));
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        EmailVerificationAttempt attempt = EmailVerificationAttempt.issue(user, passwords.encode("123456"), now);
        attempt.markSent(now);
        attempts.saveAndFlush(attempt);
        return user;
    }

    private void assertDelivered(UserOutboxEvent event) {
        Properties properties = new Properties();
        properties.put("bootstrap.servers", KAFKA.getBootstrapServers());
        properties.put("group.id", "user-activation-test-" + UUID.randomUUID());
        properties.put("enable.auto.commit", "false");
        properties.put("auto.offset.reset", "earliest");
        try (KafkaConsumer<String, String> consumer = new KafkaConsumer<>(properties,
                new StringDeserializer(), new StringDeserializer())) {
            consumer.assign(List.of(new TopicPartition("user.events", 0),
                    new TopicPartition("user.events", 1), new TopicPartition("user.events", 2)));
            consumer.seekToBeginning(consumer.assignment());
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30);
            while (System.nanoTime() < deadline) {
                for (var record : consumer.poll(Duration.ofMillis(250))) {
                    if (event.getUserId().toString().equals(record.key())) {
                        assertThat(record.value()).isEqualTo(event.getPayload());
                        return;
                    }
                }
            }
            fail("No activation event delivered for eventId=" + event.getEventId());
        }
    }

    @Test void verifiedUserIsPublishedThroughTheDispatcherToTheRealBroker() {
        User user = pending();
        verification.verify(user.getEmail(), "123456");
        UserOutboxEvent original = outbox.findAll().get(0);
        dispatcher.publishPending();
        assertThat(outbox.findById(original.getEventId()).orElseThrow().getPublishedAt()).isNotNull();
        assertDelivered(original);
        assertThat(publisher.publishNext()).isFalse();
    }

    @Test void futureRetryIsNotClaimedEarly() {
        User user = pending();
        verification.verify(user.getEmail(), "123456");
        jdbc.update("UPDATE user_event_outbox SET next_attempt_at = ?",
                OffsetDateTime.now(ZoneOffset.UTC).plusHours(1));
        assertThat(publisher.publishNext()).isFalse();
        assertThat(outbox.findAll().get(0).getAttemptCount()).isZero();
    }

    @Test void activationSurvivesKafkaOutageAndRecoveryReusesTheStoredEvent() throws Exception {
        User user = pending();
        var docker = DockerClientFactory.instance().client();
        docker.pauseContainerCmd(KAFKA.getContainerId()).exec();
        UserOutboxEvent original;
        try {
            verification.verify(user.getEmail(), "123456");
            assertThat(users.findById(user.getId()).orElseThrow().getStatus()).isEqualTo(UserStatus.ACTIVE);
            original = outbox.findAll().get(0);
            assertThat(publisher.publishNext()).isTrue();
            assertThat(outbox.findById(original.getEventId()).orElseThrow().getPublishedAt()).isNull();
        } finally { docker.unpauseContainerCmd(KAFKA.getContainerId()).exec(); }
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(45);
        while (outbox.findById(original.getEventId()).orElseThrow().getPublishedAt() == null
                && System.nanoTime() < deadline) {
            Thread.sleep(200);
            publisher.publishNext();
        }
        UserOutboxEvent recovered = outbox.findById(original.getEventId()).orElseThrow();
        assertThat(recovered.getPublishedAt()).isNotNull();
        assertThat(recovered.getAttemptCount()).isGreaterThanOrEqualTo(2);
        assertThat(recovered.getPayload()).isEqualTo(original.getPayload());
        assertThat(recovered.getOperationId()).isEqualTo(original.getOperationId());
        assertDelivered(original);
    }
}
