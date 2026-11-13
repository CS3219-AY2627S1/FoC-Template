-- ============================================================
-- Notification Service schema. See ../../../../../DESIGN.md#data-model.
-- Stores only who a notification is for, what happened and whether
-- it was read; no profile data, balances or full event payloads.
-- ============================================================

-- Consumer inbox: one row per Kafka event handled, whether or not it
-- notified anyone. The primary key on event_id makes a redelivered
-- event a no-op.
CREATE TABLE notification_inbox (
    event_id UUID PRIMARY KEY,
    topic VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    -- Order or User UUID (= Kafka key).
    aggregate_id UUID NOT NULL,
    correlation_id UUID NOT NULL,
    -- SHA-256 of the received envelope, to detect an eventId reused
    -- with different content (EVENT_ID_CONFLICT).
    fingerprint VARCHAR(64) NOT NULL,
    outcome VARCHAR(32) NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL,
    -- DUPLICATE_OPERATION: a new eventId for a business operation that
    -- already notified its recipient, so no second notification.
    CONSTRAINT chk_notification_inbox_outcome CHECK (
        outcome IN ('NOTIFIED', 'IGNORED', 'DUPLICATE_OPERATION')
    )
);

-- One row per recipient of a handled event. The message text is not
-- stored; the API builds it from type and params when it is read.
CREATE TABLE notifications (
    id UUID PRIMARY KEY,
    -- User UUID; the only owner of the row.
    recipient_id UUID NOT NULL,
    -- Validated in code, so a new type needs no migration.
    type VARCHAR(48) NOT NULL,
    -- Deep-link target; NULL for account-level notifications.
    order_id UUID,
    -- Template values, for example {"amount": 3}.
    params JSONB NOT NULL DEFAULT '{}',
    -- No foreign key: inbox rows are pruned sooner than notifications.
    source_event_id UUID NOT NULL,
    -- The source business operation, independent of the Kafka event:
    -- Credit operationId; later orderId:sourceSequence for Order.
    business_key VARCHAR(128) NOT NULL,
    -- When the fact happened (event occurredAt); lists sort by it.
    occurred_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    -- NULL = unread.
    read_at TIMESTAMPTZ,
    CONSTRAINT uq_notification_per_event_recipient UNIQUE (source_event_id, recipient_id),
    -- One notification per recipient and type for one business operation,
    -- even if the producer republishes it under a new eventId.
    CONSTRAINT uq_notification_business_key UNIQUE (recipient_id, type, business_key)
);

-- "My notifications, newest first".
CREATE INDEX ix_notifications_recipient_time
    ON notifications (recipient_id, occurred_at DESC);

-- "Unread count" for the bell badge.
CREATE INDEX ix_notifications_recipient_unread
    ON notifications (recipient_id)
    WHERE read_at IS NULL;
