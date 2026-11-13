package com.friendoncampus.notification.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import java.util.UUID;

import org.junit.jupiter.api.Test;

/** The reminder texts, with the deadline shown in campus time (UTC+8). */
class NotificationMessagesTest {

    private static String message(NotificationType type, String pickupDeadline, String remindedAt) {
        String params = "{\"title\":\"Buy coffee\",\"pickupDeadline\":\"" + pickupDeadline + "\",\"remindedAt\":\""
                + remindedAt + "\"}";
        return NotificationMessages.messageFor(new Notification(UUID.randomUUID(), UUID.randomUUID(), type,
                UUID.randomUUID(), params, UUID.randomUUID(), "reminder:x", OffsetDateTime.now(),
                OffsetDateTime.now()));
    }

    @Test
    void stillOpenNamesTheErrandTheCampusDeadlineAndBothOptions() {
        assertThat(message(NotificationType.ORDER_STILL_OPEN, "2026-11-10T07:00:00Z", "2026-11-10T06:30:00Z"))
                .isEqualTo("Nobody has accepted \"Buy coffee\" yet, and pickup closes at 3:00 pm. Raising the reward"
                        + " or moving the pickup time later can help a courier take it.");
    }

    @Test
    void dueSoonGivesTheCampusDeadline() {
        assertThat(message(NotificationType.PICKUP_DUE_SOON, "2026-11-10T07:00:00Z", "2026-11-10T06:45:00Z"))
                .isEqualTo("Pick up \"Buy coffee\" by 3:00 pm, about 15 minutes from now.");
    }

    @Test
    void overdueOffersPickupOrWithdrawal() {
        assertThat(message(NotificationType.PICKUP_OVERDUE, "2026-11-10T07:00:00Z", "2026-11-10T07:00:00Z"))
                .isEqualTo("You're past the pickup time for \"Buy coffee\". Pick it up now, or withdraw so it can"
                        + " reopen.");
    }

    @Test
    void aDeadlineOnAnotherCampusDayAlsoNamesTheDay() {
        // 00:10 on 11 Nov in Singapore, reminded at 23:40 on 10 Nov.
        assertThat(message(NotificationType.ORDER_STILL_OPEN, "2026-11-10T16:10:00Z", "2026-11-10T15:40:00Z"))
                .contains("pickup closes at 12:10 am on 11 Nov.");
    }
}
