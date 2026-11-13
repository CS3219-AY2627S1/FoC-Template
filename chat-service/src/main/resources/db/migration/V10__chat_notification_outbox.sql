-- User-authored chat messages are published to Notification through a transactional outbox.
-- The payload deliberately contains no message text or attachment metadata.
CREATE TABLE chat_notification_outbox (
    event_id UUID PRIMARY KEY,
    message_id UUID NOT NULL UNIQUE REFERENCES chat_messages(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    order_id UUID NOT NULL,
    recipient_id UUID NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    published_at TIMESTAMPTZ,
    publish_attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL,
    lease_id UUID,
    lease_until TIMESTAMPTZ,
    last_error VARCHAR(500),
    CONSTRAINT chk_chat_notification_attempts CHECK (publish_attempts >= 0)
);

CREATE INDEX ix_chat_notification_outbox_due
    ON chat_notification_outbox (next_attempt_at, created_at)
    WHERE published_at IS NULL;
