CREATE TABLE user_sanction_operations (
    operation_id UUID PRIMARY KEY,
    request_hash VARCHAR(64) NOT NULL,
    outcome_event_id UUID NOT NULL UNIQUE,
    target_user_id UUID NOT NULL,
    payload TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE user_sanction_inbox (
    event_id UUID PRIMARY KEY,
    operation_id UUID NOT NULL REFERENCES user_sanction_operations(operation_id),
    content_hash VARCHAR(64) NOT NULL
);
CREATE TABLE user_sanction_outbox (
    event_id UUID PRIMARY KEY,
    operation_id UUID NOT NULL UNIQUE REFERENCES user_sanction_operations(operation_id),
    target_user_id UUID NOT NULL,
    payload TEXT NOT NULL,
    published_at TIMESTAMP WITH TIME ZONE,
    next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lease_id UUID,
    lease_until TIMESTAMP WITH TIME ZONE,
    dispatch_version BIGINT NOT NULL DEFAULT 1,
    attempts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE user_sanction_quarantine (
    content_hash VARCHAR(64) PRIMARY KEY,
    payload TEXT NOT NULL,
    failure_code VARCHAR(64) NOT NULL,
    received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE user_account_audit (
    id UUID PRIMARY KEY,
    actor_id UUID NOT NULL,
    target_user_id UUID NOT NULL,
    operation_id UUID UNIQUE,
    action VARCHAR(32) NOT NULL,
    result VARCHAR(32) NOT NULL,
    reason VARCHAR(2000) NOT NULL,
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX user_sanction_outbox_due_idx ON user_sanction_outbox(next_attempt_at);
