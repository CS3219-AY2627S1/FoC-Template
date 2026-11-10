-- AI Assistance Disclosure:
-- Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-13
-- Scope: Wrote the migration for wallets, reservations, transactions, processed events and
-- event failures.
-- Author review: I validated correctness and supplied additional boundary checks.

-- Wallet balances, one reservation per order, append-only ledger, event inbox and failure log.
BEGIN;

CREATE TABLE credit_service.wallets (
    user_id uuid PRIMARY KEY,                          -- M4F1.1.2: one wallet per user
    available bigint NOT NULL CHECK (available >= 0),  -- M4NFR1.2
    reserved bigint NOT NULL CHECK (reserved >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE credit_service.order_reservations (
    order_id uuid PRIMARY KEY,                -- M4F3.2: at most one reservation per errand
    reservation_id uuid UNIQUE,               -- null only for a CLOSED creation-abort fence
    operation_id uuid NOT NULL,
    requester_id uuid NOT NULL,
    amount integer NOT NULL CHECK (amount > 0),
    state text NOT NULL CHECK (state IN ('RESERVED', 'RELEASED', 'TRANSFERRED', 'CLOSED')),
    courier_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (state = 'CLOSED' OR reservation_id IS NOT NULL),
    CHECK ((state = 'TRANSFERRED') = (courier_id IS NOT NULL)),
    CHECK (courier_id IS NULL OR courier_id <> requester_id)
);

CREATE TABLE credit_service.credit_transactions (
    id uuid PRIMARY KEY,
    type text NOT NULL CHECK (type IN ('ALLOCATION', 'RESERVATION', 'RELEASE', 'TRANSFER')),
    amount integer NOT NULL CHECK (amount > 0),
    wallet_user_id uuid NOT NULL REFERENCES credit_service.wallets(user_id),
    counterparty_user_id uuid REFERENCES credit_service.wallets(user_id),
    order_id uuid,
    reservation_id uuid,
    source_event_id uuid,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CHECK ((type = 'TRANSFER') = (counterparty_user_id IS NOT NULL)),
    CHECK ((type = 'ALLOCATION') = (order_id IS NULL)),
    CHECK (counterparty_user_id IS NULL OR counterparty_user_id <> wallet_user_id)
);
-- M4F1.1.1 / M4F1.1.2: one initial allocation per wallet, however the wallet was created.
CREATE UNIQUE INDEX credit_transactions_one_allocation
    ON credit_service.credit_transactions (wallet_user_id) WHERE type = 'ALLOCATION';
-- M4F4.2 / M4F5.1.1: at most one reservation, release and transfer record per reservation.
CREATE UNIQUE INDEX credit_transactions_one_per_reservation
    ON credit_service.credit_transactions (reservation_id, type) WHERE reservation_id IS NOT NULL;
-- M4F6.2 history pages for the owner (outgoing) and the courier (incoming transfers).
CREATE INDEX credit_transactions_wallet
    ON credit_service.credit_transactions (wallet_user_id, created_at DESC, id DESC);
CREATE INDEX credit_transactions_counterparty
    ON credit_service.credit_transactions (counterparty_user_id, created_at DESC, id DESC)
    WHERE counterparty_user_id IS NOT NULL;

-- M6NFR1.2 / M6NFR2.1: successful processing record per consumed event.
CREATE TABLE credit_service.processed_events (
    event_id uuid PRIMARY KEY,
    event_type text NOT NULL,
    entity_id uuid NOT NULL,
    consumer text NOT NULL DEFAULT 'credit-service',
    outcome text NOT NULL CHECK (outcome IN ('APPLIED', 'NO_CHANGE')),
    attempt integer NOT NULL CHECK (attempt >= 1),
    processed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- M6NFR2.1: failed attempts (retried or dead-lettered). Event fields may be unparseable.
CREATE TABLE credit_service.event_failures (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id uuid,
    event_type text CHECK (event_type IS NULL OR length(event_type) <= 100),
    entity_id uuid,
    consumer text NOT NULL DEFAULT 'credit-service',
    attempt integer NOT NULL CHECK (attempt >= 1),
    error_code text NOT NULL,
    dead_lettered boolean NOT NULL,
    failed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX event_failures_event ON credit_service.event_failures (event_id, failed_at);

REVOKE ALL ON ALL TABLES IN SCHEMA credit_service FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON credit_service.wallets TO credit_service_app;
GRANT UPDATE (available, reserved, updated_at) ON credit_service.wallets TO credit_service_app;
GRANT SELECT, INSERT ON credit_service.order_reservations TO credit_service_app;
GRANT UPDATE (state, courier_id, updated_at)
    ON credit_service.order_reservations TO credit_service_app;
-- M4NFR4.3: the ledger is append-only for the runtime role.
GRANT SELECT, INSERT ON credit_service.credit_transactions TO credit_service_app;
GRANT SELECT, INSERT ON credit_service.processed_events TO credit_service_app;
GRANT SELECT, INSERT ON credit_service.event_failures TO credit_service_app;

COMMENT ON TABLE credit_service.credit_transactions IS
    'Append-only record of every successful allocation, reservation, release and transfer.';
COMMENT ON COLUMN credit_service.order_reservations.state IS
    'RESERVED holds credits; RELEASED/TRANSFERRED are settled; CLOSED fences creation abort.';

COMMIT;
