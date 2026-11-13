CREATE TABLE credit_event_stream_versions (
    aggregate_type VARCHAR(64) NOT NULL,
    aggregate_id UUID NOT NULL,
    latest_version BIGINT NOT NULL DEFAULT -1,
    latest_event_id UUID,
    latest_event_type VARCHAR(80),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (aggregate_type, aggregate_id),
    CONSTRAINT uq_credit_stream_latest_event UNIQUE (latest_event_id),
    CONSTRAINT chk_credit_stream_latest_version CHECK (latest_version >= -1),
    CONSTRAINT chk_credit_stream_latest_event_pair CHECK (
        (latest_event_id IS NULL AND latest_event_type IS NULL AND latest_version = -1)
        OR (latest_event_id IS NOT NULL AND latest_event_type IS NOT NULL AND latest_version >= 0)
    )
);
