CREATE TABLE user_event_outbox (
    event_id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    event_type VARCHAR(40) NOT NULL,
    operation_id UUID NOT NULL UNIQUE,
    correlation_id UUID NOT NULL,
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
    payload TEXT NOT NULL,
    published_at TIMESTAMP WITH TIME ZONE,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_failure VARCHAR(40),
    CONSTRAINT uq_user_activation_event UNIQUE (user_id, event_type),
    CONSTRAINT ck_user_event_type CHECK (event_type = 'UserActivated'),
    CONSTRAINT ck_user_event_attempts CHECK (attempt_count >= 0)
);

CREATE INDEX ix_user_event_outbox_pending
    ON user_event_outbox (published_at, next_attempt_at, occurred_at);
