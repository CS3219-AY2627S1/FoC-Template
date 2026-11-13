CREATE TABLE admin_resolution_preparations (
    operation_id UUID PRIMARY KEY,
    case_id UUID NOT NULL UNIQUE REFERENCES admin_cases(id),
    actor_id UUID NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    resolution VARCHAR(2000) NOT NULL,
    case_revision BIGINT NOT NULL,
    explanations TEXT NOT NULL,
    prepared_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE admin_cases ADD COLUMN closure_operation_id UUID REFERENCES admin_resolution_preparations(operation_id);
