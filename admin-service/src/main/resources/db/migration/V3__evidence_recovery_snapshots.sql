-- Immutable recovery snapshots and opaque cursor identities. No consumer progress is guessed.
CREATE TABLE admin_evidence_snapshots (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES admin_cases(id),
    order_id UUID NOT NULL,
    committed_sequence BIGINT NOT NULL CHECK (committed_sequence > 0),
    checked_at TIMESTAMP WITH TIME ZONE NOT NULL,
    records TEXT NOT NULL
);
CREATE TABLE admin_evidence_cursors (
    token UUID PRIMARY KEY,
    snapshot_id UUID NOT NULL REFERENCES admin_evidence_snapshots(id),
    record_offset INTEGER NOT NULL CHECK (record_offset > 0),
    page_limit INTEGER NOT NULL CHECK (page_limit BETWEEN 1 AND 100),
    UNIQUE(snapshot_id, record_offset, page_limit)
);
