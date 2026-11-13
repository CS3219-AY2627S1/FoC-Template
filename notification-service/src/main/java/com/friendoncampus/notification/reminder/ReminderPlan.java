package com.friendoncampus.notification.reminder;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.EnumMap;
import java.util.Map;
import java.util.UUID;

import com.friendoncampus.notification.domain.NotificationType;

/**
 * Which reminders an errand should have after one lifecycle event (DESIGN.md "Reminders"). Pure: it
 * reads only the errand's state after the event, so applying it again or after a missed event gives
 * the same answer.
 *
 * <ul>
 * <li>OPEN with no courier: the requester, 30 minutes before pickup.</li>
 * <li>ACCEPTED: the courier, 15 minutes before and at the pickup deadline.</li>
 * <li>Any other state: none.</li>
 * </ul>
 *
 * A reminder whose time has already passed when it would be armed is skipped, not sent at once.
 */
public final class ReminderPlan {

    public static final Duration REQUESTER_LEAD = Duration.ofMinutes(30);
    public static final Duration COURIER_LEAD = Duration.ofMinutes(15);

    /** Every reminder type, so a state that wants none of a type cancels it. */
    public static final NotificationType[] TYPES = {
            NotificationType.ORDER_STILL_OPEN, NotificationType.PICKUP_DUE_SOON, NotificationType.PICKUP_OVERDUE };

    /** One reminder the errand should have. */
    public record Wanted(UUID recipientId, OffsetDateTime dueAt) {
    }

    private ReminderPlan() {
    }

    /**
     * The reminders this errand should have, by type; a type that is absent should have none. Times
     * are compared with {@code now}, when the event is handled.
     */
    public static Map<NotificationType, Wanted> wanted(String state, UUID requesterId, UUID courierId,
            OffsetDateTime pickupDeadline, OffsetDateTime now) {
        Map<NotificationType, Wanted> wanted = new EnumMap<>(NotificationType.class);
        if ("OPEN".equals(state) && courierId == null) {
            add(wanted, NotificationType.ORDER_STILL_OPEN, requesterId, pickupDeadline.minus(REQUESTER_LEAD), now);
        } else if ("ACCEPTED".equals(state) && courierId != null) {
            add(wanted, NotificationType.PICKUP_DUE_SOON, courierId, pickupDeadline.minus(COURIER_LEAD), now);
            add(wanted, NotificationType.PICKUP_OVERDUE, courierId, pickupDeadline, now);
        }
        return wanted;
    }

    private static void add(Map<NotificationType, Wanted> wanted, NotificationType type, UUID recipientId,
            OffsetDateTime dueAt, OffsetDateTime now) {
        if (dueAt.isAfter(now)) {
            wanted.put(type, new Wanted(recipientId, dueAt));
        }
    }
}
