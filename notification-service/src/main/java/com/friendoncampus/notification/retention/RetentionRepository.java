package com.friendoncampus.notification.retention;

import java.time.OffsetDateTime;

import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Deletes one batch of expired rows. Each statement picks its rows with {@code FOR UPDATE SKIP
 * LOCKED}, so several instances running at once take different rows instead of waiting on each
 * other; deleting is idempotent, so overlap is harmless.
 */
public class RetentionRepository {

    private final JdbcTemplate jdbc;

    public RetentionRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Read notifications whose {@code read_at} is before {@code cutoff}. */
    public int deleteReadNotificationsBefore(OffsetDateTime cutoff, int limit) {
        return jdbc.update("delete from notifications where id in (select id from notifications"
                + " where read_at < ? order by read_at limit ? for update skip locked)", cutoff, limit);
    }

    /** Any notification, read or not, created before {@code cutoff}. */
    public int deleteNotificationsCreatedBefore(OffsetDateTime cutoff, int limit) {
        return jdbc.update("delete from notifications where id in (select id from notifications"
                + " where created_at < ? order by created_at limit ? for update skip locked)", cutoff, limit);
    }

    /** Inbox receipts processed before {@code cutoff}. */
    public int deleteInboxRowsBefore(OffsetDateTime cutoff, int limit) {
        return jdbc.update("delete from notification_inbox where event_id in (select event_id from notification_inbox"
                + " where processed_at < ? order by processed_at limit ? for update skip locked)", cutoff, limit);
    }
}
