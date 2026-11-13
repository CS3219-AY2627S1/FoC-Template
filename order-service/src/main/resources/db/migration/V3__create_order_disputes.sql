CREATE TABLE order_disputes (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL UNIQUE REFERENCES errands(id),
    reporter_id UUID NOT NULL,
    complaint VARCHAR(2000) NOT NULL,
    status VARCHAR(24) NOT NULL,
    decision VARCHAR(24),
    explanation VARCHAR(2000),
    admin_id UUID,
    created_at TIMESTAMPTZ NOT NULL,
    decided_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    settlement_operation_id UUID UNIQUE,
    settlement_outcome VARCHAR(64)
);
CREATE INDEX order_disputes_created_idx ON order_disputes (created_at DESC, id DESC);
