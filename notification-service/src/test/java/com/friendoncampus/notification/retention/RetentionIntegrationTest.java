package com.friendoncampus.notification.retention;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * The retention policy against a real PostgreSQL with a fixed clock: exact boundaries, batching,
 * and two concurrent runs. The timer is off so only explicit runs delete. Requires Docker.
 */
@SpringBootTest(properties = {"app.kafka.enabled=false", "app.retention.schedule.enabled=false",
        "app.retention.batch-size=2"})
@Testcontainers
class RetentionIntegrationTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    static final Instant NOW = Instant.parse("2026-11-08T12:00:00Z");
    static final OffsetDateTime NOW_UTC = OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC);

    @TestConfiguration
    static class FixedClock {
        @Bean
        @Primary
        Clock fixedClock() {
            return Clock.fixed(NOW, ZoneOffset.UTC);
        }
    }

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @Autowired
    private RetentionRepository repository;

    @Autowired
    private RetentionProperties properties;

    @Autowired
    private TransactionTemplate transactions;

    @Autowired
    private RetentionService retention;

    @Autowired
    private JdbcTemplate jdbc;

    @BeforeEach
    void empty() {
        jdbc.update("delete from notifications");
        jdbc.update("delete from notification_inbox");
    }

    private UUID notification(OffsetDateTime createdAt, OffsetDateTime readAt) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into notifications (id, recipient_id, type, order_id, params, source_event_id, "
                + "business_key, occurred_at, created_at, read_at) "
                + "values (?, ?, 'CREDITS_RECEIVED', null, '{\"amount\":3}'::jsonb, ?, ?, ?, ?, ?)",
                id, UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID().toString(), createdAt, createdAt,
                readAt);
        return id;
    }

    private UUID inbox(OffsetDateTime processedAt) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into notification_inbox (event_id, topic, event_type, aggregate_id, correlation_id, "
                + "fingerprint, outcome, processed_at) values (?, 'credit.events', 'CreditSettled', ?, ?, ?, "
                + "'NOTIFIED', ?)", id, UUID.randomUUID(), UUID.randomUUID(), "f".repeat(64), processedAt);
        return id;
    }

    private boolean notificationExists(UUID id) {
        return jdbc.queryForObject("select count(*) from notifications where id = ?", Integer.class, id) == 1;
    }

    private boolean inboxExists(UUID id) {
        return jdbc.queryForObject("select count(*) from notification_inbox where event_id = ?", Integer.class, id)
                == 1;
    }

    private static OffsetDateTime ago(Duration duration) {
        return NOW_UTC.minus(duration);
    }

    @Test
    void theDefaultsAreTheApprovedPolicy() {
        assertThat(properties.readNotifications()).isEqualTo(Duration.ofDays(30));
        assertThat(properties.allNotifications()).isEqualTo(Duration.ofDays(90));
        assertThat(properties.inbox()).isEqualTo(Duration.ofDays(30));
    }

    @Test
    void readNotificationsGoThirtyDaysAfterTheyWereRead() {
        OffsetDateTime created = ago(Duration.ofDays(60));
        UUID readExactlyThirtyDaysAgo = notification(created, ago(Duration.ofDays(30)));
        UUID readJustOverThirtyDaysAgo = notification(created, ago(Duration.ofDays(30).plusSeconds(1)));
        UUID readYesterday = notification(created, ago(Duration.ofDays(1)));
        UUID unread = notification(created, null);

        RetentionService.Result result = retention.run();

        assertThat(notificationExists(readExactlyThirtyDaysAgo)).isTrue();
        assertThat(notificationExists(readJustOverThirtyDaysAgo)).isFalse();
        assertThat(notificationExists(readYesterday)).isTrue();
        assertThat(notificationExists(unread)).isTrue();
        assertThat(result.readNotifications()).isEqualTo(1);
    }

    @Test
    void everyNotificationGoesNinetyDaysAfterItWasCreated() {
        UUID unreadAtNinetyDays = notification(ago(Duration.ofDays(90)), null);
        UUID unreadJustOver = notification(ago(Duration.ofDays(90).plusSeconds(1)), null);
        // Read recently, so the 30-day rule keeps it; the 90-day rule still applies.
        UUID readRecentlyButOld = notification(ago(Duration.ofDays(91)), ago(Duration.ofDays(1)));

        RetentionService.Result result = retention.run();

        assertThat(notificationExists(unreadAtNinetyDays)).isTrue();
        assertThat(notificationExists(unreadJustOver)).isFalse();
        assertThat(notificationExists(readRecentlyButOld)).isFalse();
        assertThat(result.oldNotifications()).isEqualTo(2);
    }

    @Test
    void inboxRowsGoAfterThirtyDaysAndNotSooner() {
        UUID atThirtyDays = inbox(ago(Duration.ofDays(30)));
        UUID justOver = inbox(ago(Duration.ofDays(30).plusSeconds(1)));
        UUID recent = inbox(ago(Duration.ofDays(29)));

        RetentionService.Result result = retention.run();

        assertThat(inboxExists(atThirtyDays)).isTrue();
        assertThat(inboxExists(justOver)).isFalse();
        assertThat(inboxExists(recent)).isTrue();
        assertThat(result.inboxRows()).isEqualTo(1);
    }

    @Test
    void largerBacklogsAreDeletedInSeveralBatches() {
        for (int i = 0; i < 5; i++) {
            notification(ago(Duration.ofDays(100 + i)), null);
            inbox(ago(Duration.ofDays(40 + i)));
        }
        UUID keep = notification(ago(Duration.ofDays(1)), null);

        RetentionService.Result result = retention.run();

        assertThat(result.oldNotifications()).isEqualTo(5);
        assertThat(result.inboxRows()).isEqualTo(5);
        assertThat(jdbc.queryForObject("select count(*) from notifications", Integer.class)).isEqualTo(1);
        assertThat(notificationExists(keep)).isTrue();
        assertThat(jdbc.queryForObject("select count(*) from notification_inbox", Integer.class)).isZero();
    }

    @Test
    void concurrentRunsDeleteEachRowOnceWithoutErrors() throws Exception {
        for (int i = 0; i < 40; i++) {
            notification(ago(Duration.ofDays(100)), null);
        }
        UUID keep = notification(ago(Duration.ofDays(1)), null);
        CountDownLatch start = new CountDownLatch(1);
        Callable<RetentionService.Result> run = () -> {
            start.await();
            return retention.run();
        };
        ExecutorService pool = Executors.newFixedThreadPool(4);
        int deleted = 0;
        try {
            List<Future<RetentionService.Result>> runs = List.of(pool.submit(run), pool.submit(run),
                    pool.submit(run), pool.submit(run));
            start.countDown();
            for (Future<RetentionService.Result> result : runs) {
                deleted += result.get().oldNotifications();
            }
        } finally {
            pool.shutdownNow();
        }

        assertThat(deleted).isEqualTo(40);
        assertThat(jdbc.queryForObject("select count(*) from notifications", Integer.class)).isEqualTo(1);
        assertThat(notificationExists(keep)).isTrue();
    }

    @Test
    void aLockedRowIsSkippedNotWaitedFor() {
        UUID locked = notification(ago(Duration.ofDays(100)), null);
        UUID free = notification(ago(Duration.ofDays(100)), null);

        // Hold a lock on one row while another transaction runs a batch.
        transactions.executeWithoutResult(outer -> {
            jdbc.queryForObject("select id from notifications where id = ? for update", UUID.class, locked);
            Thread other = new Thread(() -> transactions.executeWithoutResult(
                    inner -> repository.deleteNotificationsCreatedBefore(ago(Duration.ofDays(90)), 10)));
            other.start();
            try {
                other.join(Duration.ofSeconds(10).toMillis());
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            }
            assertThat(other.isAlive()).as("the batch must not wait on the locked row").isFalse();
        });

        assertThat(notificationExists(free)).isFalse();
        assertThat(notificationExists(locked)).isTrue();
    }
}
