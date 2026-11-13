package com.friendoncampus.notification.reminder;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.support.TransactionTemplate;

import com.friendoncampus.notification.domain.Notification;
import com.friendoncampus.notification.reminder.ReminderRepository.DueReminder;
import com.friendoncampus.notification.repository.NotificationRepository;

import tools.jackson.databind.json.JsonMapper;

/**
 * Turns due reminders into notifications. Each batch is one transaction: the claimed rows stay
 * locked until the notifications are stored and the rows marked {@code SENT}, so a reminder becomes
 * exactly one notification even with several instances running.
 */
public class ReminderSender {

    private static final Logger log = LoggerFactory.getLogger(ReminderSender.class);

    private final ReminderRepository reminders;
    private final NotificationRepository notifications;
    private final ReminderProperties properties;
    private final TransactionTemplate transactions;
    private final java.time.Clock clock;
    private final JsonMapper jsonMapper = JsonMapper.builder().build();

    public ReminderSender(ReminderRepository reminders, NotificationRepository notifications,
            ReminderProperties properties, TransactionTemplate transactions, java.time.Clock clock) {
        this.reminders = reminders;
        this.notifications = notifications;
        this.properties = properties;
        this.transactions = transactions;
        this.clock = clock;
    }

    /** How many reminders one run sent, and dropped as too late. */
    public record Result(int sent, int missed) {
    }

    public Result run() {
        OffsetDateTime now = OffsetDateTime.now(clock);
        int sent = 0;
        int missed = 0;
        Result batch;
        do {
            batch = transactions.execute(status -> sendBatch(now));
            sent += batch.sent();
            missed += batch.missed();
        } while (batch.sent() + batch.missed() == properties.batchSize());
        if (sent > 0 || missed > 0) {
            log.info("Reminder run sent={} missed={}", sent, missed);
        }
        return new Result(sent, missed);
    }

    private Result sendBatch(OffsetDateTime now) {
        List<DueReminder> due = reminders.claimDue(now, properties.batchSize());
        int sent = 0;
        int missed = 0;
        for (DueReminder reminder : due) {
            Duration late = Duration.between(reminder.dueAt(), now);
            if (late.compareTo(properties.maxLateness()) > 0) {
                reminders.settle(reminder.id(), "MISSED", now);
                log.warn("Missed reminder reminderId={} orderId={} type={} dueAt={} lateBy={}", reminder.id(),
                        reminder.orderId(), reminder.type(), reminder.dueAt(), late);
                missed++;
                continue;
            }
            Map<String, Object> params = new LinkedHashMap<>();
            params.put("title", reminder.title());
            params.put("pickupDeadline", reminder.pickupDeadline().toString());
            params.put("remindedAt", now.toString());
            // A reminder is its own source: one ACCEPT arms two courier reminders, and
            // (source_event_id, recipient_id) is unique. The business key stops a second send.
            notifications.save(new Notification(UUID.randomUUID(), reminder.recipientId(), reminder.type(),
                    reminder.orderId(), jsonMapper.writeValueAsString(params), reminder.id(),
                    "reminder:" + reminder.id(), now, now));
            reminders.settle(reminder.id(), "SENT", now);
            log.info("Sent reminder reminderId={} orderId={} type={} recipientId={} dueAt={}", reminder.id(),
                    reminder.orderId(), reminder.type(), reminder.recipientId(), reminder.dueAt());
            sent++;
        }
        return new Result(sent, missed);
    }
}
