package com.friendoncampus.notification.reminder;

import java.time.Clock;
import java.time.OffsetDateTime;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.support.TransactionTemplate;

import com.friendoncampus.notification.repository.NotificationRepository;

/**
 * The reminder sender and its pruning, on timers. {@code NOTIFICATION_REMINDERS_ENABLED=false} sends
 * nothing; lifecycle events still keep the reminder table current, so turning it back on sends what
 * is still due.
 */
@Configuration
@EnableScheduling
@EnableConfigurationProperties(ReminderProperties.class)
@ConditionalOnProperty(name = "app.reminders.enabled", havingValue = "true", matchIfMissing = true)
public class ReminderConfiguration {

    @Bean
    ReminderSender reminderSender(ReminderRepository reminders, NotificationRepository notifications,
            ReminderProperties properties, TransactionTemplate transactions, Clock clock) {
        return new ReminderSender(reminders, notifications, properties, transactions, clock);
    }

    /** The timers; {@code app.reminders.schedule.enabled=false} keeps the beans but never runs them. */
    @Bean
    @ConditionalOnProperty(name = "app.reminders.schedule.enabled", havingValue = "true", matchIfMissing = true)
    ReminderSchedule reminderSchedule(ReminderSender sender, ReminderRepository reminders,
            ReminderProperties properties, TransactionTemplate transactions, Clock clock) {
        return new ReminderSchedule(sender, reminders, properties, transactions, clock);
    }

    static class ReminderSchedule {

        private static final Logger log = LoggerFactory.getLogger(ReminderSchedule.class);

        private final ReminderSender sender;
        private final ReminderRepository reminders;
        private final ReminderProperties properties;
        private final TransactionTemplate transactions;
        private final Clock clock;

        ReminderSchedule(ReminderSender sender, ReminderRepository reminders, ReminderProperties properties,
                TransactionTemplate transactions, Clock clock) {
            this.sender = sender;
            this.reminders = reminders;
            this.properties = properties;
            this.transactions = transactions;
            this.clock = clock;
        }

        @Scheduled(initialDelayString = "${app.reminders.initial-delay-ms:30000}",
                fixedDelayString = "${app.reminders.interval-ms:60000}")
        void send() {
            sender.run();
        }

        /** Settled reminders and idle progress rows older than the retention period. */
        @Scheduled(initialDelayString = "${app.reminders.prune-initial-delay-ms:90000}",
                fixedDelayString = "${app.reminders.prune-interval-ms:3600000}")
        void prune() {
            OffsetDateTime cutoff = OffsetDateTime.now(clock).minus(properties.retention());
            int reminderRows = 0;
            int progressRows = 0;
            int deleted;
            do {
                deleted = transactions.execute(status -> reminders.deleteSettledBefore(cutoff, properties.batchSize()));
                reminderRows += deleted;
            } while (deleted == properties.batchSize());
            do {
                deleted = transactions.execute(
                        status -> reminders.deleteIdleProgressBefore(cutoff, properties.batchSize()));
                progressRows += deleted;
            } while (deleted == properties.batchSize());
            if (reminderRows > 0 || progressRows > 0) {
                log.info("Reminder pruning deleted reminders={} progressRows={}", reminderRows, progressRows);
            }
        }
    }
}
