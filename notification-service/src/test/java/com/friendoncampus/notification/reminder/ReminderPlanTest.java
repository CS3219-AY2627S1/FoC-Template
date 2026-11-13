package com.friendoncampus.notification.reminder;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.friendoncampus.notification.domain.NotificationType;
import com.friendoncampus.notification.reminder.ReminderPlan.Wanted;

/** Which reminders each errand state wants, and the skip-if-already-past rule. */
class ReminderPlanTest {

    private static final UUID REQUESTER = UUID.fromString("97947588-bb2e-42f2-91ba-9abf8e15a8e7");
    private static final UUID COURIER = UUID.fromString("5b0f3c1e-8a52-4f8e-9d37-2c1b6e4a7f10");
    private static final OffsetDateTime DEADLINE = OffsetDateTime.parse("2026-11-10T07:00:00Z");

    @Test
    void anOpenErrandRemindsTheRequesterThirtyMinutesBeforePickup() {
        assertThat(ReminderPlan.wanted("OPEN", REQUESTER, null, DEADLINE, DEADLINE.minusHours(2)))
                .containsOnlyKeys(NotificationType.ORDER_STILL_OPEN)
                .containsEntry(NotificationType.ORDER_STILL_OPEN, new Wanted(REQUESTER, DEADLINE.minusMinutes(30)));
    }

    @Test
    void anAcceptedErrandRemindsTheCourierFifteenMinutesBeforeAndAtTheDeadline() {
        assertThat(ReminderPlan.wanted("ACCEPTED", REQUESTER, COURIER, DEADLINE, DEADLINE.minusHours(1)))
                .containsOnlyKeys(NotificationType.PICKUP_DUE_SOON, NotificationType.PICKUP_OVERDUE)
                .containsEntry(NotificationType.PICKUP_DUE_SOON, new Wanted(COURIER, DEADLINE.minusMinutes(15)))
                .containsEntry(NotificationType.PICKUP_OVERDUE, new Wanted(COURIER, DEADLINE));
    }

    @Test
    void aReminderWhoseTimeHasPassedIsSkippedNotSentAtOnce() {
        assertThat(ReminderPlan.wanted("OPEN", REQUESTER, null, DEADLINE, DEADLINE.minusMinutes(20))).isEmpty();
        assertThat(ReminderPlan.wanted("ACCEPTED", REQUESTER, COURIER, DEADLINE, DEADLINE.minusMinutes(10)))
                .containsOnlyKeys(NotificationType.PICKUP_OVERDUE);
        assertThat(ReminderPlan.wanted("ACCEPTED", REQUESTER, COURIER, DEADLINE, DEADLINE)).isEmpty();
    }

    @Test
    void aReminderExactlyDueNowIsSkipped() {
        assertThat(ReminderPlan.wanted("OPEN", REQUESTER, null, DEADLINE, DEADLINE.minusMinutes(30))).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = { "PENDING_CREDIT", "PICKED_UP", "DELIVERED", "COMPLETED", "CANCELLED", "EXPIRED",
            "RESERVATION_FAILED" })
    void noOtherStateWantsAReminder(String state) {
        assertThat(ReminderPlan.wanted(state, REQUESTER, COURIER, DEADLINE, DEADLINE.minusHours(2))).isEmpty();
    }
}
