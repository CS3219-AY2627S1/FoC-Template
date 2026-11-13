ALTER TABLE credit_operations DROP CONSTRAINT chk_credit_operation_type;
ALTER TABLE credit_operations ADD CONSTRAINT chk_credit_operation_type CHECK (
    operation_type IN ('INITIAL_ALLOCATION', 'RESERVE', 'ADJUST', 'RELEASE', 'SETTLE', 'COMPENSATE', 'ADMIN_CORRECTION')
);
CREATE TABLE credit_admin_operations (
    operation_id UUID PRIMARY KEY REFERENCES credit_operations(id),
    request_hash VARCHAR(64) NOT NULL,
    outcome_event_id UUID NOT NULL UNIQUE,
    target_user_id UUID NOT NULL,
    case_id UUID NOT NULL,
    order_id UUID NOT NULL,
    requested_by UUID NOT NULL,
    reason VARCHAR(2000) NOT NULL,
    payload TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE credit_admin_inbox (
    event_id UUID PRIMARY KEY,
    operation_id UUID NOT NULL REFERENCES credit_admin_operations(operation_id),
    content_hash VARCHAR(64) NOT NULL
);
CREATE TABLE credit_admin_outbox (
    event_id UUID PRIMARY KEY,
    operation_id UUID NOT NULL UNIQUE REFERENCES credit_admin_operations(operation_id),
    target_user_id UUID NOT NULL,
    payload TEXT NOT NULL,
    published_at TIMESTAMPTZ,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lease_id UUID,
    lease_until TIMESTAMPTZ,
    dispatch_version BIGINT NOT NULL DEFAULT 1,
    attempts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE credit_admin_quarantine (
    content_hash VARCHAR(64) PRIMARY KEY,
    payload TEXT NOT NULL,
    failure_code VARCHAR(64) NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX credit_admin_outbox_due_idx ON credit_admin_outbox(next_attempt_at);
