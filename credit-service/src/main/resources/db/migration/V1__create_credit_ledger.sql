CREATE TABLE credit_accounts (
    user_id UUID PRIMARY KEY,
    available_balance INTEGER NOT NULL DEFAULT 0,
    reserved_balance INTEGER NOT NULL DEFAULT 0,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_credit_account_available_nonnegative CHECK (available_balance >= 0),
    CONSTRAINT chk_credit_account_reserved_nonnegative CHECK (reserved_balance >= 0)
);

CREATE TABLE credit_reservations (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL UNIQUE,
    requester_id UUID NOT NULL REFERENCES credit_accounts(user_id),
    courier_id UUID REFERENCES credit_accounts(user_id),
    amount INTEGER NOT NULL,
    status VARCHAR(24) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_credit_reservation_amount_positive CHECK (amount > 0),
    CONSTRAINT chk_credit_reservation_status CHECK (
        status IN ('ACTIVE', 'RELEASED', 'SETTLED', 'COMPENSATED')
    ),
    CONSTRAINT chk_credit_reservation_distinct_parties CHECK (
        courier_id IS NULL OR requester_id <> courier_id
    )
);

CREATE TABLE credit_operations (
    id UUID PRIMARY KEY,
    operation_type VARCHAR(32) NOT NULL,
    order_id UUID,
    request_hash VARCHAR(64) NOT NULL,
    result_code VARCHAR(48) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_credit_operation_type CHECK (
        operation_type IN ('INITIAL_ALLOCATION', 'RESERVE', 'ADJUST', 'RELEASE', 'SETTLE', 'COMPENSATE')
    )
);

CREATE TABLE credit_ledger_entries (
    id UUID PRIMARY KEY,
    operation_id UUID NOT NULL REFERENCES credit_operations(id),
    account_id UUID NOT NULL REFERENCES credit_accounts(user_id),
    reservation_id UUID REFERENCES credit_reservations(id),
    entry_type VARCHAR(40) NOT NULL,
    available_delta INTEGER NOT NULL,
    reserved_delta INTEGER NOT NULL,
    available_balance_after INTEGER NOT NULL,
    reserved_balance_after INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_ledger_available_after_nonnegative CHECK (available_balance_after >= 0),
    CONSTRAINT chk_ledger_reserved_after_nonnegative CHECK (reserved_balance_after >= 0),
    CONSTRAINT chk_ledger_nonzero_delta CHECK (available_delta <> 0 OR reserved_delta <> 0),
    CONSTRAINT uq_ledger_operation_account_type UNIQUE (operation_id, account_id, entry_type)
);

CREATE INDEX idx_credit_reservations_requester ON credit_reservations (requester_id, updated_at DESC);
CREATE INDEX idx_credit_reservations_courier ON credit_reservations (courier_id, updated_at DESC)
    WHERE courier_id IS NOT NULL;
CREATE INDEX idx_credit_ledger_account_history ON credit_ledger_entries (account_id, created_at DESC, id DESC);
CREATE INDEX idx_credit_operations_order ON credit_operations (order_id, created_at DESC)
    WHERE order_id IS NOT NULL;
