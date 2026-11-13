CREATE TABLE chat_evidence_records (
    event_id UUID PRIMARY KEY,
    source VARCHAR(64) NOT NULL,
    stream VARCHAR(128) NOT NULL,
    aggregate_id UUID NOT NULL,
    source_sequence BIGINT NOT NULL,
    order_id UUID NOT NULL,
    action VARCHAR(80) NOT NULL,
    actor_user_id UUID,
    occurred_at TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL,
    data JSONB NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    CONSTRAINT chk_chat_evidence_sequence CHECK (source_sequence >= 0),
    CONSTRAINT uq_chat_evidence_stream_sequence UNIQUE(source, stream, aggregate_id, source_sequence)
);

CREATE INDEX ix_chat_evidence_order
    ON chat_evidence_records(order_id, occurred_at, source, source_sequence);

CREATE TABLE chat_projection_checkpoints (
    source VARCHAR(64) NOT NULL,
    stream VARCHAR(128) NOT NULL,
    aggregate_id UUID NOT NULL,
    committed_sequence BIGINT NOT NULL,
    checked_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY(source, stream, aggregate_id),
    CONSTRAINT chk_chat_checkpoint_sequence CHECK (committed_sequence >= 0)
);

CREATE TABLE chat_case_conversation_requests (
    case_id UUID NOT NULL,
    idempotency_key UUID NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    conversation_id UUID NOT NULL REFERENCES chat_conversations(id),
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY(case_id, idempotency_key)
);
