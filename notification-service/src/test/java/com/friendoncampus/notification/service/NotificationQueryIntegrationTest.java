package com.friendoncampus.notification.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.data.domain.Page;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import com.friendoncampus.notification.domain.Notification;
import com.friendoncampus.notification.domain.NotificationType;

/** Reading one recipient's notifications from a real PostgreSQL. Requires Docker. */
@SpringBootTest(properties = "app.kafka.enabled=false")
@Testcontainers
class NotificationQueryIntegrationTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    private static final OffsetDateTime BASE = OffsetDateTime.of(2026, 10, 30, 9, 0, 0, 0, ZoneOffset.UTC);

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @Autowired
    private NotificationQueryService queryService;

    @Autowired
    private JdbcTemplate jdbc;

    /** Inserts a row that happened {@code occurredMinutes} and was stored {@code createdMinutes} after BASE. */
    private UUID insert(UUID recipient, int occurredMinutes, int createdMinutes) {
        return insert(recipient, NotificationType.CREDITS_RECEIVED, occurredMinutes, createdMinutes);
    }

    private UUID insert(UUID recipient, NotificationType type, int occurredMinutes, int createdMinutes) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into notifications (id, recipient_id, type, order_id, params, source_event_id, "
                + "business_key, occurred_at, created_at) "
                + "values (?, ?, ?, ?, '{\"amount\":3}'::jsonb, ?, ?, ?, ?)",
                id, recipient, type.name(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID().toString(),
                BASE.plusMinutes(occurredMinutes),
                BASE.plusMinutes(createdMinutes));
        return id;
    }

    @Test
    void listsOnlyTheRecipientsOwnNotificationsNewestFactFirst() {
        UUID recipient = UUID.randomUUID();
        // Stored in the opposite order to when they happened, as after a catch-up.
        UUID oldest = insert(recipient, 0, 30);
        UUID newest = insert(recipient, 20, 10);
        UUID middle = insert(recipient, 10, 20);
        insert(UUID.randomUUID(), 15, 15);

        Page<Notification> page = queryService.listFor(recipient, new NotificationPaging(0, 20));

        assertThat(page.getContent()).extracting(Notification::getId).containsExactly(newest, middle, oldest);
        assertThat(page.getTotalElements()).isEqualTo(3);
    }

    @Test
    void pagesDoNotOverlap() {
        UUID recipient = UUID.randomUUID();
        for (int minute = 0; minute < 5; minute++) {
            insert(recipient, minute, minute);
        }

        Page<Notification> first = queryService.listFor(recipient, new NotificationPaging(0, 2));
        Page<Notification> third = queryService.listFor(recipient, new NotificationPaging(2, 2));

        assertThat(first.getContent()).hasSize(2);
        assertThat(third.getContent()).hasSize(1);
        assertThat(first.getTotalPages()).isEqualTo(3);
        assertThat(first.getContent()).doesNotContainAnyElementsOf(third.getContent());
    }

    @Test
    void aUserWithNoNotificationsGetsAnEmptyPage() {
        Page<Notification> page = queryService.listFor(UUID.randomUUID(), new NotificationPaging(0, 20));

        assertThat(page.getContent()).isEmpty();
        assertThat(page.getTotalElements()).isZero();
    }

    @Test
    void chatMessagesArePushOnlyAndDoNotAffectTheBell() {
        UUID recipient = UUID.randomUUID();
        UUID lifecycle = insert(recipient, NotificationType.ORDER_ACCEPTED, 1, 1);
        UUID chat = insert(recipient, NotificationType.CHAT_MESSAGE_RECEIVED, 2, 2);

        Page<Notification> page = queryService.listFor(recipient, new NotificationPaging(0, 20));
        NotificationQueryService.PushBatch push = queryService.pushFor(recipient, BASE);

        assertThat(page.getContent()).extracting(Notification::getId).containsExactly(lifecycle);
        assertThat(queryService.countUnread(recipient)).isEqualTo(1);
        assertThat(push.items()).extracting(Notification::getId).containsExactly(lifecycle, chat);
    }

    @Test
    void theInitialPushPollBootstrapsWithoutReplayingHistory() {
        UUID recipient = UUID.randomUUID();
        insert(recipient, NotificationType.ORDER_ACCEPTED, 1, 1);

        NotificationQueryService.PushBatch push = queryService.pushFor(recipient, null);

        assertThat(push.items()).isEmpty();
        assertThat(push.cursor()).isNotNull();
    }
}
