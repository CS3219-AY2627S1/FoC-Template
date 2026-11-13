CREATE TABLE credit_accounts (
    user_id UUID PRIMARY KEY,
    total_balance BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT credit_accounts_total_nonnegative CHECK (total_balance >= 0)
);
