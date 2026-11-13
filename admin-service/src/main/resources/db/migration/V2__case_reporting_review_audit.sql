ALTER TABLE admin_cases ADD COLUMN created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE admin_cases ADD COLUMN correlation_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE admin_cases ADD COLUMN source_sequence BIGINT NOT NULL DEFAULT 0 CHECK (source_sequence >= 0);

CREATE TABLE admin_statements (
    case_id UUID NOT NULL REFERENCES admin_cases(id),
    reporter_id UUID NOT NULL,
    description VARCHAR(2000) NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 2000),
    submitted_at TIMESTAMP WITH TIME ZONE NOT NULL,
    eligibility_revision TEXT NOT NULL,
    PRIMARY KEY (case_id, reporter_id),
    FOREIGN KEY (case_id, reporter_id) REFERENCES admin_case_participants(case_id, user_id)
);
CREATE TABLE admin_mutation_receipts (
    idempotency_key UUID PRIMARY KEY,
    actor_id UUID NOT NULL,
    route TEXT NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    response_status INTEGER NOT NULL,
    response_body TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE admin_case_audit (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES admin_cases(id),
    case_revision BIGINT NOT NULL,
    actor_id UUID NOT NULL,
    action VARCHAR(32) NOT NULL,
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
    UNIQUE (case_id, case_revision)
);
CREATE TABLE admin_case_outbox (
    event_id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES admin_cases(id),
    source_sequence BIGINT NOT NULL CHECK (source_sequence > 0),
    event_type VARCHAR(32) NOT NULL,
    topic VARCHAR(64) NOT NULL,
    payload TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    published_at TIMESTAMP WITH TIME ZONE,
    UNIQUE (case_id, source_sequence)
);
CREATE INDEX admin_cases_queue_idx ON admin_cases(state, created_at DESC, id);
CREATE INDEX admin_case_outbox_pending_idx ON admin_case_outbox(created_at) WHERE published_at IS NULL;
