package com.friendoncampus.notification.messaging;

import static com.friendoncampus.notification.messaging.OrderEvents.json;
import static com.friendoncampus.notification.messaging.OrderEvents.system;
import static com.friendoncampus.notification.messaging.OrderEvents.transition;
import static com.friendoncampus.notification.messaging.OrderEvents.user;
import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
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

import com.friendoncampus.notification.domain.Notification;
import com.friendoncampus.notification.domain.NotificationMessages;
import com.friendoncampus.notification.domain.NotificationType;
import com.friendoncampus.notification.messaging.OrderEvents.Errand;
import com.friendoncampus.notification.reminder.ReminderSender;
import com.friendoncampus.notification.repository.NotificationRepository;

/**
 * Pickup reminders end to end against a real PostgreSQL: lifecycle events arm, move and cancel
 * them, and the sender turns due ones into notifications. The timers are off; tests move a shared
 * clock and run the sender themselves. Requires Docker.
 */
@SpringBootTest(properties = {
        "app.kafka.enabled=false",
        "app.retention.enabled=false",
        "app.reminders.schedule.enabled=false"
})
@Testcontainers
class PickupReminderIntegrationTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    private static final UUID REQUESTER = UUID.fromString("97947588-bb2e-42f2-91ba-9abf8e15a8e7");
    private static final UUID ALICE = UUID.fromString("5b0f3c1e-8a52-4f8e-9d37-2c1b6e4a7f10");
    private static final UUID BOB = UUID.fromString("2d3c4b5a-6978-4f1e-8d2c-3b4a5f6e7d8c");
    /** The errand's pickup deadline: 3:00 pm in Singapore. */
    private static final OffsetDateTime DEADLINE = OffsetDateTime.parse("2026-11-10T07:00:00Z");

    /** A clock every test sets; shared with the application. */
    static final MovableClock CLOCK = new MovableClock();

    @TestConfiguration
    static class TestClock {
        @Bean
        @Primary
        Clock movableClock() {
            return CLOCK;
        }
    }

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @Autowired
    private OrderLifecycleEventHandler handler;

    @Autowired
    private ReminderSender sender;

    @Autowired
    private NotificationRepository notificationRepository;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private TransactionTemplate transactions;

    private Errand errand;
    private long sequence;

    @BeforeEach
    void newErrand() {
        errand = Errand.create(REQUESTER);
        sequence = 0;
        at(DEADLINE.minusHours(2));
    }

    @AfterEach
    void clean() {
        jdbc.update("delete from notifications");
        jdbc.update("delete from notification_inbox");
        jdbc.update("delete from notification_reminders");
        jdbc.update("delete from notification_reminder_progress");
    }

    // ---- helpers ----------------------------------------------------------------------------

    private static void at(OffsetDateTime time) {
        CLOCK.set(time.toInstant());
    }

    private Map<String, Object> event(String action, String from, String to, Map<String, Object> actor,
            UUID previousCourier, UUID courier, OffsetDateTime deadline) {
        return transition(errand, ++sequence, action, from, to, actor, previousCourier, courier, null,
                deadline.toString());
    }

    private Map<String, Object> handle(String action, String from, String to, Map<String, Object> actor,
            UUID previousCourier, UUID courier) {
        return handle(action, from, to, actor, previousCourier, courier, DEADLINE);
    }

    private Map<String, Object> handle(String action, String from, String to, Map<String, Object> actor,
            UUID previousCourier, UUID courier, OffsetDateTime deadline) {
        Map<String, Object> event = event(action, from, to, actor, previousCourier, courier, deadline);
        handler.handle(json(event));
        return event;
    }

    private void opened() {
        handle("SUBMIT", null, "PENDING_CREDIT", user(REQUESTER, "REQUESTER"), null, null);
        handle("OPEN", "PENDING_CREDIT", "OPEN", system(), null, null);
    }

    private void acceptedBy(UUID courier) {
        handle("ACCEPT", "OPEN", "ACCEPTED", user(courier, "COURIER"), null, courier);
    }

    /** Runs the sender at {@code time}; returns the reminder notifications it created. */
    private List<Notification> sendAt(OffsetDateTime time) {
        at(time);
        long before = reminderNotifications().size();
        sender.run();
        List<Notification> all = reminderNotifications();
        return all.subList((int) before, all.size());
    }

    private List<Notification> reminderNotifications() {
        return notificationRepository.findAll().stream()
                .filter(n -> n.getBusinessKey().startsWith("reminder:"))
                .sorted((a, b) -> a.getCreatedAt().compareTo(b.getCreatedAt()))
                .toList();
    }

    private List<String> statuses(NotificationType type) {
        return jdbc.queryForList("select status from notification_reminders where order_id = ? and type = ?"
                + " order by created_at", String.class, errand.orderId(), type.name());
    }

    // ---- requester: still open --------------------------------------------------------------

    @Test
    void anUnacceptedErrandRemindsItsRequesterOnceThirtyMinutesBeforePickup() {
        opened();

        assertThat(sendAt(DEADLINE.minusMinutes(31))).isEmpty();
        List<Notification> sent = sendAt(DEADLINE.minusMinutes(30));
        assertThat(sendAt(DEADLINE.minusMinutes(29))).isEmpty();

        assertThat(sent).singleElement().satisfies(n -> {
            assertThat(n.getRecipientId()).isEqualTo(REQUESTER);
            assertThat(n.getType()).isEqualTo(NotificationType.ORDER_STILL_OPEN);
            assertThat(n.getOrderId()).isEqualTo(errand.orderId());
            assertThat(NotificationMessages.messageFor(n)).isEqualTo("Nobody has accepted \"Buy coffee\" yet, and"
                    + " pickup closes at 3:00 pm. Raising the reward or moving the pickup time later can help a"
                    + " courier take it.");
        });
    }

    @Test
    void acceptingBeforeTheReminderCancelsIt() {
        opened();
        at(DEADLINE.minusMinutes(45));
        acceptedBy(ALICE);

        assertThat(sendAt(DEADLINE.minusMinutes(30))).isEmpty();
        assertThat(statuses(NotificationType.ORDER_STILL_OPEN)).containsExactly("CANCELLED");
    }

    @Test
    void extendingTheDeadlineMovesTheReminderAndItRemindsOnceForTheNewDeadline() {
        opened();
        OffsetDateTime later = DEADLINE.plusHours(1);
        at(DEADLINE.minusMinutes(50));
        handle("EDIT", "OPEN", "OPEN", user(REQUESTER, "REQUESTER"), null, null, later);

        assertThat(sendAt(DEADLINE.minusMinutes(30))).isEmpty();
        assertThat(sendAt(later.minusMinutes(30))).singleElement()
                .satisfies(n -> assertThat(NotificationMessages.messageFor(n)).contains("pickup closes at 4:00 pm."));
        assertThat(statuses(NotificationType.ORDER_STILL_OPEN)).containsExactly("CANCELLED", "SENT");
    }

    @Test
    void extendingAfterTheReminderRemindsAgainForTheNewDeadline() {
        opened();
        assertThat(sendAt(DEADLINE.minusMinutes(30))).hasSize(1);
        OffsetDateTime later = DEADLINE.plusHours(1);
        at(DEADLINE.minusMinutes(20));
        handle("EDIT", "OPEN", "OPEN", user(REQUESTER, "REQUESTER"), null, null, later);

        assertThat(sendAt(later.minusMinutes(30))).hasSize(1);
        assertThat(statuses(NotificationType.ORDER_STILL_OPEN)).containsExactly("SENT", "SENT");
    }

    @Test
    void anEditThatKeepsTheDeadlineKeepsTheSameReminder() {
        opened();
        at(DEADLINE.minusMinutes(50));
        handle("EDIT", "OPEN", "OPEN", user(REQUESTER, "REQUESTER"), null, null, DEADLINE);

        assertThat(statuses(NotificationType.ORDER_STILL_OPEN)).containsExactly("PENDING");
        assertThat(sendAt(DEADLINE.minusMinutes(30))).hasSize(1);
    }

    @Test
    void anErrandPostedLessThanThirtyMinutesBeforePickupGetsNoRequesterReminder() {
        at(DEADLINE.minusMinutes(20));
        opened();

        assertThat(statuses(NotificationType.ORDER_STILL_OPEN)).isEmpty();
        assertThat(sendAt(DEADLINE)).isEmpty();
    }

    // ---- courier: due soon and overdue ------------------------------------------------------

    @Test
    void aCourierWhoNeverPicksUpIsRemindedBeforeAndAtTheDeadline() {
        opened();
        acceptedBy(ALICE);

        List<Notification> soon = sendAt(DEADLINE.minusMinutes(15));
        List<Notification> overdue = sendAt(DEADLINE);
        assertThat(sendAt(DEADLINE.plusMinutes(5))).isEmpty();

        assertThat(soon).singleElement().satisfies(n -> {
            assertThat(n.getRecipientId()).isEqualTo(ALICE);
            assertThat(n.getType()).isEqualTo(NotificationType.PICKUP_DUE_SOON);
            assertThat(NotificationMessages.messageFor(n))
                    .isEqualTo("Pick up \"Buy coffee\" by 3:00 pm, about 15 minutes from now.");
        });
        assertThat(overdue).singleElement().satisfies(n -> {
            assertThat(n.getRecipientId()).isEqualTo(ALICE);
            assertThat(n.getType()).isEqualTo(NotificationType.PICKUP_OVERDUE);
            assertThat(NotificationMessages.messageFor(n)).isEqualTo(
                    "You're past the pickup time for \"Buy coffee\". Pick it up now, or withdraw so it can reopen.");
        });
    }

    @Test
    void pickingUpEarlyCancelsBothCourierReminders() {
        opened();
        acceptedBy(ALICE);
        at(DEADLINE.minusMinutes(20));
        handle("PICK_UP", "ACCEPTED", "PICKED_UP", user(ALICE, "COURIER"), null, ALICE);

        assertThat(sendAt(DEADLINE.minusMinutes(15))).isEmpty();
        assertThat(sendAt(DEADLINE)).isEmpty();
        assertThat(statuses(NotificationType.PICKUP_DUE_SOON)).containsExactly("CANCELLED");
        assertThat(statuses(NotificationType.PICKUP_OVERDUE)).containsExactly("CANCELLED");
    }

    @Test
    void aWithdrawalCancelsTheCourierRemindersAndReArmsTheRequesterReminderIfThereIsTime() {
        opened();
        at(DEADLINE.minusMinutes(90));
        acceptedBy(ALICE);
        at(DEADLINE.minusMinutes(60));
        handle("WITHDRAW", "ACCEPTED", "OPEN", user(ALICE, "COURIER"), ALICE, null);

        assertThat(sendAt(DEADLINE.minusMinutes(30))).singleElement()
                .satisfies(n -> assertThat(n.getType()).isEqualTo(NotificationType.ORDER_STILL_OPEN));
        assertThat(sendAt(DEADLINE.minusMinutes(15))).isEmpty();
        assertThat(statuses(NotificationType.PICKUP_DUE_SOON)).containsExactly("CANCELLED");
        assertThat(statuses(NotificationType.ORDER_STILL_OPEN)).containsExactly("CANCELLED", "SENT");
    }

    @Test
    void aSecondCourierGetsTheirOwnRemindersAfterTheFirstWithdraws() {
        opened();
        at(DEADLINE.minusMinutes(90));
        acceptedBy(ALICE);
        handle("WITHDRAW", "ACCEPTED", "OPEN", user(ALICE, "COURIER"), ALICE, null);
        at(DEADLINE.minusMinutes(25));
        acceptedBy(BOB);

        assertThat(sendAt(DEADLINE.minusMinutes(15))).singleElement()
                .satisfies(n -> assertThat(n.getRecipientId()).isEqualTo(BOB));
    }

    @Test
    void cancellingOrExpiringStopsEveryPendingReminder() {
        opened();
        acceptedBy(ALICE);
        at(DEADLINE.minusMinutes(20));
        handle("CANCEL", "ACCEPTED", "CANCELLED", user(REQUESTER, "REQUESTER"), ALICE, null);

        assertThat(sendAt(DEADLINE.plusMinutes(5))).isEmpty();

        newErrand();
        opened();
        at(DEADLINE.minusMinutes(40));
        handle("EXPIRE", "OPEN", "EXPIRED", system(), null, null);
        assertThat(sendAt(DEADLINE.minusMinutes(30))).isEmpty();
    }

    // ---- delivery guarantees ----------------------------------------------------------------

    @Test
    void aRedeliveredOrOlderEventNeverReArmsACancelledReminder() {
        opened();
        Map<String, Object> accept = event("ACCEPT", "OPEN", "ACCEPTED", user(ALICE, "COURIER"), null, ALICE,
                DEADLINE);
        Map<String, Object> pickup = event("PICK_UP", "ACCEPTED", "PICKED_UP", user(ALICE, "COURIER"), null, ALICE,
                DEADLINE);
        handler.handle(json(accept));
        handler.handle(json(pickup));

        // The ACCEPT replayed under a new eventId (same sourceSequence), as after a producer resend.
        Map<String, Object> replayed = new LinkedHashMap<>(accept);
        replayed.put("eventId", UUID.randomUUID().toString());
        handler.handle(json(replayed));
        handler.handle(json(accept));

        assertThat(sendAt(DEADLINE)).isEmpty();
        assertThat(statuses(NotificationType.PICKUP_OVERDUE)).containsExactly("CANCELLED");
    }

    @Test
    void twoSendersRunningAtOnceSendEachReminderOnce() throws Exception {
        opened();
        acceptedBy(ALICE);
        at(DEADLINE);

        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<ReminderSender.Result>> runs = List.of(
                    pool.submit(() -> { start.await(); return sender.run(); }),
                    pool.submit(() -> { start.await(); return sender.run(); }));
            start.countDown();
            int sent = 0;
            for (Future<ReminderSender.Result> run : runs) {
                sent += run.get(30, TimeUnit.SECONDS).sent();
            }
            assertThat(sent).isEqualTo(2);
        } finally {
            pool.shutdownNow();
        }
        assertThat(reminderNotifications()).extracting(Notification::getType)
                .containsExactlyInAnyOrder(NotificationType.PICKUP_DUE_SOON, NotificationType.PICKUP_OVERDUE);
    }

    @Test
    void aPickupWhileTheSenderHoldsTheReminderStillWinsAndNothingIsSent() throws Exception {
        opened();
        acceptedBy(ALICE);
        at(DEADLINE);

        // A sender has the due reminders locked when the courier picks up: the pickup waits for it,
        // then cancels them, and the next send finds nothing.
        CountDownLatch locked = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<?> sender = pool.submit(() -> transactions.executeWithoutResult(status -> {
                jdbc.queryForList("select id from notification_reminders where status = 'PENDING' for update",
                        UUID.class);
                locked.countDown();
                await(release);
            }));
            assertThat(locked.await(10, TimeUnit.SECONDS)).isTrue();
            Future<?> pickup = pool.submit(
                    () -> handle("PICK_UP", "ACCEPTED", "PICKED_UP", user(ALICE, "COURIER"), null, ALICE));
            release.countDown();
            sender.get(10, TimeUnit.SECONDS);
            pickup.get(10, TimeUnit.SECONDS);
        } finally {
            pool.shutdownNow();
        }

        assertThat(sendAt(DEADLINE)).isEmpty();
        assertThat(statuses(NotificationType.PICKUP_OVERDUE)).containsExactly("CANCELLED");
    }

    private static void await(CountDownLatch latch) {
        try {
            latch.await(10, TimeUnit.SECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }

    @Test
    void aReminderReachedMoreThanThirtyMinutesLateIsDroppedNotSent() {
        opened();
        acceptedBy(ALICE);

        assertThat(sendAt(DEADLINE.plusMinutes(20))).extracting(Notification::getType)
                .containsExactly(NotificationType.PICKUP_OVERDUE);
        assertThat(statuses(NotificationType.PICKUP_DUE_SOON)).containsExactly("MISSED");
        assertThat(statuses(NotificationType.PICKUP_OVERDUE)).containsExactly("SENT");
    }

    @Test
    void aSentReminderIsUnreadAndCountsTowardsTheBell() {
        opened();
        // ORDER_OPENED is already unread; the reminder adds one more.
        long before = notificationRepository.countByRecipientIdAndReadAtIsNull(REQUESTER);
        sendAt(DEADLINE.minusMinutes(30));

        assertThat(notificationRepository.countByRecipientIdAndReadAtIsNull(REQUESTER)).isEqualTo(before + 1);
        assertThat(reminderNotifications()).singleElement().satisfies(n -> assertThat(n.getReadAt()).isNull());
    }

    /** A clock tests can move; reads are thread-safe for the concurrent sender test. */
    static final class MovableClock extends Clock {
        private volatile Instant now = Instant.EPOCH;

        void set(Instant instant) {
            now = instant;
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }

    }
}
