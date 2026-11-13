CREATE TABLE admin_actions (
    operation_id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES admin_cases(id),
    order_id UUID NOT NULL,
    target_user_id UUID NOT NULL,
    requested_by UUID NOT NULL,
    amount INTEGER NOT NULL CHECK (amount <> 0),
    reason VARCHAR(2000) NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 2000),
    status VARCHAR(16) NOT NULL CHECK (status IN ('PENDING','UNKNOWN','SUCCEEDED','REJECTED')),
    reason_code VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    deadline_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    command_event_id UUID NOT NULL UNIQUE,
    correlation_id UUID NOT NULL,
    terminal_hash VARCHAR(64),
    owner_event_id UUID,
    CHECK ((status IN ('SUCCEEDED','REJECTED')) = (completed_at IS NOT NULL)),
    CHECK ((status IN ('SUCCEEDED','REJECTED')) = (terminal_hash IS NOT NULL)),
    CHECK ((status = 'REJECTED') = (reason_code IS NOT NULL)),
    FOREIGN KEY (case_id,target_user_id) REFERENCES admin_case_participants(case_id,user_id)
);
CREATE INDEX admin_actions_case_idx ON admin_actions(case_id,created_at,operation_id);
CREATE TABLE admin_action_outbox (
    event_id UUID PRIMARY KEY,
    operation_id UUID NOT NULL UNIQUE REFERENCES admin_actions(operation_id),
    target_user_id UUID NOT NULL,
    payload TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    published_at TIMESTAMP WITH TIME ZONE,
    next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL,
    lease_id UUID,
    lease_until TIMESTAMP WITH TIME ZONE,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error VARCHAR(64)
);
CREATE INDEX admin_action_outbox_due_idx ON admin_action_outbox(next_attempt_at);
CREATE TABLE admin_action_inbox (
    event_id UUID PRIMARY KEY,
    operation_id UUID NOT NULL REFERENCES admin_actions(operation_id),
    content_hash VARCHAR(64) NOT NULL,
    received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Bad/conflicting input is retained privately; it never becomes a business rejection.
CREATE TABLE admin_action_quarantine (
    content_hash VARCHAR(64) PRIMARY KEY,
    event_id UUID,
    payload TEXT NOT NULL,
    failure_code VARCHAR(64) NOT NULL,
    received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
