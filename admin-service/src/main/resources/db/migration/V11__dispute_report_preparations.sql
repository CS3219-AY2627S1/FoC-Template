CREATE TABLE admin_report_preparations (
    operation_id UUID PRIMARY KEY,
    actor_id UUID NOT NULL,
    order_id UUID NOT NULL,
    case_id UUID NOT NULL,
    request_hash TEXT NOT NULL,
    description VARCHAR(2000) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE admin_resolution_preparations ADD COLUMN credit_disposition VARCHAR(32) NOT NULL DEFAULT 'KEEP_EXISTING';
