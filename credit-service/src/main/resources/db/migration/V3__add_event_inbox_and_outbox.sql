CREATE TABLE credit_inbox_events (
    event_id UUID PRIMARY KEY,
    event_type VARCHAR(80) NOT NULL,
    event_version INTEGER NOT NULL,
    aggregate_type VARCHAR(64) NOT NULL,
    aggregate_id UUID NOT NULL,
    aggregate_version BIGINT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    producer VARCHAR(64) NOT NULL,
    correlation_id UUID NOT NULL,
    causation_id UUID,
    actor_json TEXT NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_error VARCHAR(1000),
    received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_credit_inbox_event_version CHECK (event_version > 0),
    CONSTRAINT chk_credit_inbox_aggregate_version CHECK (aggregate_version >= 0),
    CONSTRAINT chk_credit_inbox_status CHECK (status IN ('RECEIVED', 'FAILED', 'PROCESSED')),
    CONSTRAINT chk_credit_inbox_attempt_count CHECK (attempt_count >= 0),
    CONSTRAINT chk_credit_inbox_actor_not_blank CHECK (length(btrim(actor_json)) > 0),
    CONSTRAINT chk_credit_inbox_processed_at CHECK (
        (status = 'PROCESSED' AND processed_at IS NOT NULL)
        OR (status <> 'PROCESSED' AND processed_at IS NULL)
    )
);

CREATE INDEX idx_credit_inbox_recovery
    ON credit_inbox_events (status, updated_at, event_id)
    WHERE status IN ('RECEIVED', 'FAILED');

CREATE TABLE credit_outbox_events (
    event_id UUID PRIMARY KEY,
    event_type VARCHAR(80) NOT NULL,
    event_version INTEGER NOT NULL,
    aggregate_type VARCHAR(64) NOT NULL,
    aggregate_id UUID NOT NULL,
    aggregate_version BIGINT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    producer VARCHAR(64) NOT NULL,
    correlation_id UUID NOT NULL,
    causation_id UUID,
    actor_json TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    publish_attempts INTEGER NOT NULL DEFAULT 0,
    last_error VARCHAR(1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_credit_outbox_event_version CHECK (event_version > 0),
    CONSTRAINT chk_credit_outbox_aggregate_version CHECK (aggregate_version >= 0),
    CONSTRAINT chk_credit_outbox_publish_attempts CHECK (publish_attempts >= 0),
    CONSTRAINT chk_credit_outbox_actor_not_blank CHECK (length(btrim(actor_json)) > 0),
    CONSTRAINT chk_credit_outbox_payload_not_blank CHECK (length(btrim(payload_json)) > 0)
);

CREATE INDEX idx_credit_outbox_pending
    ON credit_outbox_events (created_at, event_id)
    WHERE published_at IS NULL;
