CREATE TABLE chat_timeline_snapshots (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL,
    payload TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX chat_timeline_snapshots_expiry ON chat_timeline_snapshots(expires_at);
CREATE TABLE chat_case_closures (
    case_id UUID PRIMARY KEY,
    operation_id UUID NOT NULL UNIQUE,
    prepared_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE chat_operation_evidence (
    operation_id UUID PRIMARY KEY,
    case_id UUID NOT NULL,
    order_id UUID NOT NULL,
    source VARCHAR(64) NOT NULL,
    event_id UUID NOT NULL UNIQUE,
    payload TEXT NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE chat_case_event_inbox (
    event_id UUID PRIMARY KEY,
    source VARCHAR(64) NOT NULL,
    topic VARCHAR(128) NOT NULL,
    aggregate_key UUID NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    payload TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE chat_evidence_failures (
    topic VARCHAR(128) NOT NULL,
    partition_id INTEGER NOT NULL,
    record_offset BIGINT NOT NULL,
    order_id UUID,
    payload TEXT NOT NULL,
    failure_code VARCHAR(64) NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(topic,partition_id,record_offset)
);
