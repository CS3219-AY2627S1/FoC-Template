package com.friendoncampus.notification.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicLong;

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
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import com.friendoncampus.notification.domain.Notification;

/** Marking read and counting unread against a real PostgreSQL. Requires Docker. */
@SpringBootTest(properties = "app.kafka.enabled=false")
@Testcontainers
class NotificationReadStateIntegrationTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    static final Instant NOW = Instant.parse("2026-10-30T10:00:00Z");

    /** Advances one second on every read, so an overwritten read time would be visible. */
    static final class TickingClock extends Clock {
        private final AtomicLong seconds = new AtomicLong();

        @Override
        public Instant instant() {
            return NOW.plusSeconds(seconds.getAndIncrement());
        }

        @Override
        public ZoneOffset getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            throw new UnsupportedOperationException();
        }
    }

    @TestConfiguration
    static class TestClock {
        @Bean
        @Primary
        Clock tickingClock() {
            return new TickingClock();
        }
    }

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @Autowired
    private NotificationReadStateService readStateService;

    @Autowired
    private NotificationQueryService queryService;

    @Autowired
    private JdbcTemplate jdbc;

    private UUID insert(UUID recipient, OffsetDateTime readAt) {
        UUID id = UUID.randomUUID();
        OffsetDateTime at = OffsetDateTime.of(2026, 10, 30, 9, 0, 0, 0, ZoneOffset.UTC);
        jdbc.update("insert into notifications (id, recipient_id, type, order_id, params, source_event_id, "
                + "business_key, occurred_at, created_at, read_at) "
                + "values (?, ?, 'CREDITS_RECEIVED', ?, '{\"amount\":3}'::jsonb, ?, ?, ?, ?, ?)",
                id, recipient, UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID().toString(), at, at, readAt);
        return id;
    }

    private Instant storedReadAt(UUID id) {
        Timestamp readAt = jdbc.queryForObject("select read_at from notifications where id = ?", Timestamp.class, id);
        return readAt == null ? null : readAt.toInstant();
    }

    @Test
    void markingReadSetsReadAtOnceAndKeepsIt() {
        UUID recipient = UUID.randomUUID();
        UUID id = insert(recipient, null);

        Notification first = readStateService.markRead(recipient, id);
        Instant readAt = storedReadAt(id);

        assertThat(readAt).isNotNull();
        assertThat(first.getReadAt().toInstant()).isEqualTo(readAt);

        Notification again = readStateService.markRead(recipient, id);

        assertThat(again.getReadAt().toInstant()).isEqualTo(readAt);
        assertThat(storedReadAt(id)).isEqualTo(readAt);
    }

    @Test
    void anotherUsersOrAMissingNotificationIsNotFoundAndUnchanged() {
        UUID owner = UUID.randomUUID();
        UUID id = insert(owner, null);

        assertThatThrownBy(() -> readStateService.markRead(UUID.randomUUID(), id))
                .isInstanceOf(NotificationNotFoundException.class);
        assertThatThrownBy(() -> readStateService.markRead(owner, UUID.randomUUID()))
                .isInstanceOf(NotificationNotFoundException.class);

        assertThat(storedReadAt(id)).isNull();
    }

    @Test
    void concurrentMarksAllReturnTheFirstReadAt() throws Exception {
        UUID recipient = UUID.randomUUID();
        UUID id = insert(recipient, null);
        CountDownLatch start = new CountDownLatch(1);
        Callable<OffsetDateTime> mark = () -> {
            start.await();
            return readStateService.markRead(recipient, id).getReadAt();
        };
        ExecutorService pool = Executors.newFixedThreadPool(4);
        try {
            List<Future<OffsetDateTime>> results = List.of(pool.submit(mark), pool.submit(mark), pool.submit(mark),
                    pool.submit(mark));
            start.countDown();
            Instant first = results.get(0).get().toInstant();
            for (Future<OffsetDateTime> result : results) {
                assertThat(result.get().toInstant()).isEqualTo(first);
            }
            assertThat(storedReadAt(id)).isEqualTo(first);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void theUnreadCountIsOnlyTheRecipientsUnreadNotifications() {
        UUID recipient = UUID.randomUUID();
        UUID unread = insert(recipient, null);
        insert(recipient, null);
        insert(recipient, OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC));
        insert(UUID.randomUUID(), null);

        assertThat(queryService.countUnread(recipient)).isEqualTo(2);

        readStateService.markRead(recipient, unread);

        assertThat(queryService.countUnread(recipient)).isEqualTo(1);
        assertThat(queryService.countUnread(UUID.randomUUID())).isZero();
    }
}
