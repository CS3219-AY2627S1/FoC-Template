CREATE TABLE credit_dispute_receipts (
    operation_id UUID PRIMARY KEY,
    case_id UUID NOT NULL,
    order_id UUID NOT NULL,
    actor_id UUID NOT NULL,
    requester_id UUID NOT NULL,
    courier_id UUID,
    disposition VARCHAR(32) NOT NULL,
    response_body TEXT NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(case_id,order_id)
);
