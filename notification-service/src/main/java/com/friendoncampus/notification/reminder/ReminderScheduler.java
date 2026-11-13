package com.friendoncampus.notification.reminder;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.friendoncampus.notification.domain.NotificationType;

/**
 * Brings an errand's reminders in line with {@link ReminderPlan} after one lifecycle event. Called
 * by the lifecycle handler inside its transaction, so reminders change only if the event commits.
 * An event no newer than the last one applied to the errand changes nothing.
 */
@Component
public class ReminderScheduler {

    private static final Logger log = LoggerFactory.getLogger(ReminderScheduler.class);

    private final ReminderRepository repository;

    public ReminderScheduler(ReminderRepository repository) {
        this.repository = repository;
    }

    /** The errand after the event, as {@code OrderTransitioned} reports it. */
    public record ErrandState(UUID orderId, long sourceSequence, String state, UUID requesterId, UUID courierId,
            OffsetDateTime pickupDeadline, String title, UUID eventId) {
    }

    public void apply(ErrandState errand, OffsetDateTime now) {
        if (!repository.advance(errand.orderId(), errand.sourceSequence(), now)) {
            log.info("Kept reminders for orderId={}: sourceSequence={} is not newer than the last one applied",
                    errand.orderId(), errand.sourceSequence());
            return;
        }
        Map<NotificationType, ReminderPlan.Wanted> wanted = ReminderPlan.wanted(errand.state(), errand.requesterId(),
                errand.courierId(), errand.pickupDeadline(), now);
        for (NotificationType type : ReminderPlan.TYPES) {
            ReminderPlan.Wanted want = wanted.get(type);
            int cancelled = repository.cancelPendingExcept(errand.orderId(), type,
                    want == null ? null : want.recipientId(), errand.pickupDeadline(), now);
            boolean armed = want != null && repository.arm(errand.orderId(), want.recipientId(), type,
                    errand.pickupDeadline(), want.dueAt(), errand.title(), errand.eventId(), now);
            if (cancelled > 0 || armed) {
                log.info("Reminders for orderId={} type={} sourceSequence={}: cancelled={} armed={} dueAt={}",
                        errand.orderId(), type, errand.sourceSequence(), cancelled, armed,
                        want == null ? null : want.dueAt());
            }
        }
    }
}
