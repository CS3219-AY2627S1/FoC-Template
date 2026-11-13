package com.friendoncampus.notification.reminder;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import com.friendoncampus.notification.domain.NotificationType;

/**
 * {@code notification_reminders} and {@code notification_reminder_progress} (V4). Plain JDBC, like
 * retention: the sender claims due rows with {@code FOR UPDATE SKIP LOCKED}, so instances running at
 * once take different reminders.
 */
@Repository
public class ReminderRepository {

    /** One reminder the sender has claimed. */
    public record DueReminder(UUID id, UUID orderId, UUID recipientId, NotificationType type,
            OffsetDateTime pickupDeadline, OffsetDateTime dueAt, String title, UUID sourceEventId) {
    }

    private final JdbcTemplate jdbc;

    public ReminderRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Applies an errand's event to its reminders only if it is newer than the last one applied, and
     * records it as applied. Locks the errand's progress row, so events for one errand never apply
     * concurrently. False means the event is older or repeated and must change nothing.
     */
    public boolean advance(UUID orderId, long sourceSequence, OffsetDateTime now) {
        return jdbc.update("insert into notification_reminder_progress (order_id, source_sequence, updated_at)"
                + " values (?, ?, ?) on conflict (order_id) do update"
                + " set source_sequence = excluded.source_sequence, updated_at = excluded.updated_at"
                + " where notification_reminder_progress.source_sequence < excluded.source_sequence",
                orderId, sourceSequence, now) == 1;
    }

    /**
     * Cancels the errand's pending reminders of this type unless they are for exactly this recipient
     * and deadline. Pass a null recipient to cancel them all.
     */
    public int cancelPendingExcept(UUID orderId, NotificationType type, UUID keepRecipient,
            OffsetDateTime keepDeadline, OffsetDateTime now) {
        if (keepRecipient == null) {
            return jdbc.update("update notification_reminders set status = 'CANCELLED', settled_at = ?"
                    + " where order_id = ? and type = ? and status = 'PENDING'", now, orderId, type.name());
        }
        return jdbc.update("update notification_reminders set status = 'CANCELLED', settled_at = ?"
                + " where order_id = ? and type = ? and status = 'PENDING'"
                + " and (recipient_id <> ? or pickup_deadline <> ?)",
                now, orderId, type.name(), keepRecipient, keepDeadline);
    }

    /**
     * Arms a reminder unless one of that type is already pending for this errand and recipient (the
     * caller has kept it as the same reminder), or one was already sent or missed for this recipient
     * and deadline: each deadline reminds a recipient at most once. False means nothing was armed.
     */
    public boolean arm(UUID orderId, UUID recipientId, NotificationType type, OffsetDateTime pickupDeadline,
            OffsetDateTime dueAt, String title, UUID sourceEventId, OffsetDateTime now) {
        return jdbc.update("insert into notification_reminders (id, order_id, recipient_id, type, pickup_deadline,"
                + " due_at, title, status, source_event_id, created_at)"
                + " select ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ? where not exists (select 1 from notification_reminders"
                + " where order_id = ? and type = ? and recipient_id = ? and pickup_deadline = ?"
                + " and status in ('SENT', 'MISSED'))"
                + " on conflict (order_id, type, recipient_id) where status = 'PENDING' do nothing",
                UUID.randomUUID(), orderId, recipientId, type.name(), pickupDeadline, dueAt, title, sourceEventId,
                now, orderId, type.name(), recipientId, pickupDeadline) == 1;
    }

    /** Claims up to {@code limit} pending reminders due by {@code now}, locked until the caller commits. */
    public List<DueReminder> claimDue(OffsetDateTime now, int limit) {
        return jdbc.query("select id, order_id, recipient_id, type, pickup_deadline, due_at, title, source_event_id"
                + " from notification_reminders where status = 'PENDING' and due_at <= ?"
                + " order by due_at limit ? for update skip locked", ReminderRepository::due, now, limit);
    }

    /**
     * Settles a claimed reminder as {@code SENT} or {@code MISSED}. Only a still pending row changes,
     * so a reminder cancelled by a lifecycle event after it was claimed is not marked sent.
     */
    public boolean settle(UUID id, String status, OffsetDateTime now) {
        return jdbc.update("update notification_reminders set status = ?, settled_at = ?"
                + " where id = ? and status = 'PENDING'", status, now, id) == 1;
    }

    /** Settled reminders older than {@code cutoff}, one batch; for retention. */
    public int deleteSettledBefore(OffsetDateTime cutoff, int limit) {
        return jdbc.update("delete from notification_reminders where id in (select id from notification_reminders"
                + " where settled_at < ? order by settled_at limit ? for update skip locked)", cutoff, limit);
    }

    /** Progress rows not touched since {@code cutoff} whose errand has nothing pending, one batch. */
    public int deleteIdleProgressBefore(OffsetDateTime cutoff, int limit) {
        return jdbc.update("delete from notification_reminder_progress where order_id in (select p.order_id"
                + " from notification_reminder_progress p where p.updated_at < ? and not exists (select 1"
                + " from notification_reminders r where r.order_id = p.order_id and r.status = 'PENDING')"
                + " order by p.updated_at limit ? for update of p skip locked)", cutoff, limit);
    }

    private static DueReminder due(ResultSet row, int rowNumber) throws SQLException {
        return new DueReminder(row.getObject("id", UUID.class), row.getObject("order_id", UUID.class),
                row.getObject("recipient_id", UUID.class), NotificationType.valueOf(row.getString("type")),
                row.getObject("pickup_deadline", OffsetDateTime.class), row.getObject("due_at", OffsetDateTime.class),
                row.getString("title"), row.getObject("source_event_id", UUID.class));
    }
}
