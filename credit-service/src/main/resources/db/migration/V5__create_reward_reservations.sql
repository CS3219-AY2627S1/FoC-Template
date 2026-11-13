CREATE TABLE credit_reservations (
    errand_id UUID PRIMARY KEY,
    operation_id UUID NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES credit_accounts(user_id),
    amount BIGINT NOT NULL CHECK (amount > 0),
    state VARCHAR(20) NOT NULL DEFAULT 'RESERVED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    settled_at TIMESTAMPTZ,
    courier_id UUID REFERENCES credit_accounts(user_id),
    CHECK ((state = 'RESERVED') = (settled_at IS NULL)),
    CONSTRAINT credit_reservations_paid_courier CHECK ((state = 'PAID') = (courier_id IS NOT NULL))
);
