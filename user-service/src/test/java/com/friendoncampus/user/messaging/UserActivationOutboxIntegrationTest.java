package com.friendoncampus.user.messaging;

import static org.assertj.core.api.Assertions.*;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import com.friendoncampus.user.domain.EmailVerificationAttempt;
import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.domain.UserStatus;
import com.friendoncampus.user.repository.EmailVerificationAttemptRepository;
import com.friendoncampus.user.repository.UserRepository;
import com.friendoncampus.user.service.AdminLifecycleService;
import com.friendoncampus.user.service.EmailVerificationService;
import com.friendoncampus.user.service.InvalidEmailVerificationCodeException;
import com.friendoncampus.user.support.JwtTestProperties;
import tools.jackson.databind.ObjectMapper;

@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@SpringBootTest(properties = "app.events.enabled=false")
class UserActivationOutboxIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");
    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        JwtTestProperties.register(registry);
    }
    @Autowired EmailVerificationService verification;
    @Autowired UserRepository users;
    @Autowired EmailVerificationAttemptRepository attempts;
    @Autowired UserOutboxRepository outbox;
    @Autowired UserActivationEvents events;
    @Autowired AdminLifecycleService lifecycle;
    @Autowired PasswordEncoder passwords;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;

    @BeforeEach void clearOutbox() { outbox.deleteAllInBatch(); }

    private User pending() {
        String unique = UUID.randomUUID().toString().substring(0, 12);
        User user = users.saveAndFlush(User.register(unique + "@u.nus.edu", unique, unique, "test-hash"));
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        EmailVerificationAttempt attempt = EmailVerificationAttempt.issue(user, passwords.encode("123456"), now);
        attempt.markSent(now);
        attempts.saveAndFlush(attempt);
        return user;
    }

    @Test void activationAndCompleteVersionOneEnvelopeCommitTogetherWithoutKafka() throws Exception {
        User user = pending();
        verification.verify(user.getEmail(), "123456");
        assertThat(users.findById(user.getId()).orElseThrow().getStatus()).isEqualTo(UserStatus.ACTIVE);
        UserOutboxEvent event = outbox.findAll().get(0);
        var body = json.readTree(event.getPayload());
        assertThat(body.path("eventType").asText()).isEqualTo("UserActivated");
        assertThat(body.path("eventVersion").asInt()).isEqualTo(1);
        assertThat(body.path("aggregateType").asText()).isEqualTo("User");
        assertThat(body.path("aggregateId").asText()).isEqualTo(user.getId().toString());
        assertThat(body.path("aggregateVersion").asInt()).isEqualTo(1);
        assertThat(body.path("producer").asText()).isEqualTo("user-service");
        assertThat(body.path("eventId").asText()).isEqualTo(event.getEventId().toString());
        assertThat(body.path("correlationId").asText()).isEqualTo(event.getCorrelationId().toString());
        assertThat(body.path("causationId").isNull()).isTrue();
        assertThat(body.path("data").path("operationId").asText()).isEqualTo(event.getOperationId().toString());
        assertThat(body.path("data").path("userId").asText()).isEqualTo(user.getId().toString());
        assertThat(body.path("data").path("activatedAt").asText()).isEqualTo(body.path("occurredAt").asText());
        assertThat(event.getPayload()).doesNotContain(user.getEmail(), "123456", "test-hash");
        assertThat(event.getPublishedAt()).isNull();
        assertThatThrownBy(() -> verification.verify(user.getEmail(), "123456"))
                .isInstanceOf(InvalidEmailVerificationCodeException.class);
        assertThat(outbox.count()).isEqualTo(1);
    }

    @Test void invalidAndExpiredVerificationCreateNoEvents() {
        User user = pending();
        assertThatThrownBy(() -> verification.verify(user.getEmail(), "000000"))
                .isInstanceOf(InvalidEmailVerificationCodeException.class);
        assertThat(outbox.count()).isZero();
        assertThat(users.findById(user.getId()).orElseThrow().getStatus()).isEqualTo(UserStatus.UNVERIFIED);
        jdbc.update("UPDATE email_verification_attempts SET expires_at = ? WHERE user_id = ?",
                OffsetDateTime.now(ZoneOffset.UTC).minusHours(1), user.getId());
        assertThatThrownBy(() -> verification.verify(user.getEmail(), "123456"))
                .isInstanceOf(InvalidEmailVerificationCodeException.class);
        assertThat(outbox.count()).isZero();
    }

    @Test void transactionRollbackLeavesNeitherAnActivationNorAnEvent() {
        User user = pending();
        assertThatThrownBy(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            verification.verify(user.getEmail(), "123456");
            throw new IllegalStateException("Force rollback after writing the event");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(users.findById(user.getId()).orElseThrow().getStatus()).isEqualTo(UserStatus.UNVERIFIED);
        assertThat(outbox.count()).isZero();
        verification.verify(user.getEmail(), "123456");
        assertThat(outbox.count()).isEqualTo(1);
    }

    @Test void outboxWriteFailureRollsBackAccountAndCodeUse() {
        User user = pending();
        // Deliberately reserve the unique activation slot to force the later INSERT to fail.
        new TransactionTemplate(transactionManager).executeWithoutResult(status ->
                events.record(user.getId(), OffsetDateTime.now(ZoneOffset.UTC)));
        UUID originalEventId = outbox.findAll().get(0).getEventId();
        assertThatThrownBy(() -> verification.verify(user.getEmail(), "123456")).isInstanceOf(RuntimeException.class);
        assertThat(users.findById(user.getId()).orElseThrow().getStatus()).isEqualTo(UserStatus.UNVERIFIED);
        assertThat(attempts.findFirstByUser_IdAndSentAtIsNotNullAndUsedAtIsNullAndInvalidatedAtIsNullOrderByCreatedAtDesc(
                user.getId())).isPresent();
        assertThat(outbox.findAll()).extracting(UserOutboxEvent::getEventId).containsExactly(originalEventId);
    }

    @Test void concurrentVerificationProducesOneActivationEvent() throws Exception {
        User user = pending();
        CountDownLatch start = new CountDownLatch(1);
        Callable<Boolean> verify = () -> {
            start.await();
            try { verification.verify(user.getEmail(), "123456"); return true; }
            catch (InvalidEmailVerificationCodeException expected) { return false; }
        };
        var pool = Executors.newFixedThreadPool(2);
        try {
            var one = pool.submit(verify);
            var two = pool.submit(verify);
            start.countDown();
            assertThat(one.get(30, TimeUnit.SECONDS) ^ two.get(30, TimeUnit.SECONDS)).isTrue();
            assertThat(outbox.count()).isEqualTo(1);
        } finally { pool.shutdownNow(); }
    }

    @Test void anotherPublisherSkipsTheClaimedRowAndCanClaimItAfterRollback() throws Exception {
        User user = pending();
        verification.verify(user.getEmail(), "123456");
        CountDownLatch claimed = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        var pool = Executors.newSingleThreadExecutor();
        try {
            var first = pool.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                assertThat(outbox.lockNextReady(OffsetDateTime.now(ZoneOffset.UTC))).isPresent();
                claimed.countDown();
                try { assertThat(release.await(10, TimeUnit.SECONDS)).isTrue(); }
                catch (InterruptedException exception) { Thread.currentThread().interrupt(); throw new IllegalStateException(exception); }
                status.setRollbackOnly();
            }));
            assertThat(claimed.await(10, TimeUnit.SECONDS)).isTrue();
            new TransactionTemplate(transactionManager).executeWithoutResult(status ->
                    assertThat(outbox.lockNextReady(OffsetDateTime.now(ZoneOffset.UTC))).isEmpty());
            release.countDown();
            first.get(10, TimeUnit.SECONDS);
            new TransactionTemplate(transactionManager).executeWithoutResult(status ->
                    assertThat(outbox.lockNextReady(OffsetDateTime.now(ZoneOffset.UTC))).isPresent());
        } finally { release.countDown(); pool.shutdownNow(); }
    }

    @Test void administratorReactivationDoesNotAllocateANewActivationEvent() {
        User user = pending();
        verification.verify(user.getEmail(), "123456");
        UUID originalEventId = outbox.findAll().get(0).getEventId();
        String name = UUID.randomUUID().toString().substring(0, 12);
        User admin = User.bootstrapAdmin(name + "@u.nus.edu", name, name, "test-hash");
        admin.activate();
        users.saveAndFlush(admin);
        lifecycle.ban(admin.getId(), user.getId());
        lifecycle.reactivate(admin.getId(), user.getId(), "Reviewed appeal");
        assertThat(outbox.findAll()).extracting(UserOutboxEvent::getEventId).containsExactly(originalEventId);
    }

    @Test void alreadyActiveAccountsAreNotBackfilledAndRecordingRequiresATransaction() {
        User user = pending();
        user.activate();
        users.saveAndFlush(user);
        assertThatThrownBy(() -> verification.verify(user.getEmail(), "123456"))
                .isInstanceOf(InvalidEmailVerificationCodeException.class);
        assertThat(outbox.count()).isZero();
        assertThatThrownBy(() -> events.record(user.getId(), OffsetDateTime.now(ZoneOffset.UTC)))
                .isInstanceOf(org.springframework.transaction.IllegalTransactionStateException.class);
    }
}
