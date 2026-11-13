-- ============================================================
-- Indexes for the retention job (DESIGN.md "Decisions": read
-- notifications 30 days after reading, all notifications 90 days
-- after they were created, inbox rows after at least 30 days).
-- ============================================================

CREATE INDEX ix_notifications_read_at
    ON notifications (read_at)
    WHERE read_at IS NOT NULL;

CREATE INDEX ix_notifications_created_at
    ON notifications (created_at);

CREATE INDEX ix_notification_inbox_processed_at
    ON notification_inbox (processed_at);
