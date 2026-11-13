-- ============================================================
-- Pickup reminders (DESIGN.md "Reminders"). Lifecycle events arm,
-- move and cancel them; a scheduled job turns a due one into a
-- notification. Stores only what the message needs: the errand
-- title and the deadline it reminds about.
-- ============================================================

CREATE TABLE notification_reminders (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL,
    recipient_id UUID NOT NULL,
    -- A NotificationType, validated in code: ORDER_STILL_OPEN,
    -- PICKUP_DUE_SOON or PICKUP_OVERDUE.
    type VARCHAR(48) NOT NULL,
    -- The pickup deadline this reminder is about; moving it cancels this
    -- reminder and arms one for the new deadline.
    pickup_deadline TIMESTAMPTZ NOT NULL,
    due_at TIMESTAMPTZ NOT NULL,
    title VARCHAR(120) NOT NULL,
    status VARCHAR(16) NOT NULL,
    -- The lifecycle event that armed it, for tracing. The notification
    -- it becomes uses the reminder's own id as its source.
    source_event_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    -- When it was sent, cancelled or dropped as too late.
    settled_at TIMESTAMPTZ,
    CONSTRAINT chk_notification_reminders_status CHECK (
        status IN ('PENDING', 'SENT', 'CANCELLED', 'MISSED')
    )
);

-- At most one pending reminder of a type per errand and recipient. A
-- repeated event is also stopped by notification_reminder_progress; a
-- new deadline, courier or reopening cancels the old one first.
CREATE UNIQUE INDEX uq_notification_reminders_pending
    ON notification_reminders (order_id, type, recipient_id)
    WHERE status = 'PENDING';

-- The sender's scan: pending reminders by due time.
CREATE INDEX ix_notification_reminders_due
    ON notification_reminders (due_at)
    WHERE status = 'PENDING';

-- Cancelling or moving an errand's reminders, and "was this deadline
-- already reminded?" before arming.
CREATE INDEX ix_notification_reminders_order
    ON notification_reminders (order_id, type, recipient_id, pickup_deadline);

-- Retention: settled reminders by when they were settled.
CREATE INDEX ix_notification_reminders_settled
    ON notification_reminders (settled_at)
    WHERE settled_at IS NOT NULL;

-- The last lifecycle sequence applied to each errand's reminders, so an
-- older, redelivered or replayed event never re-arms or moves them.
CREATE TABLE notification_reminder_progress (
    order_id UUID PRIMARY KEY,
    source_sequence BIGINT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);
