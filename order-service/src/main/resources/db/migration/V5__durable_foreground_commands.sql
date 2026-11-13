-- ADR-033: Order-owned orchestration only; no Credit ledger/balance replica.
CREATE TABLE order_commands (
    command_id varchar(128) PRIMARY KEY,
    actor_id varchar(128) NOT NULL,
    kind varchar(16) NOT NULL CHECK (kind IN ('CREATE', 'ACCEPT', 'ABORT')),
    order_id varchar(36) NOT NULL,
    input_hash varchar(64) NOT NULL,
    payload jsonb NOT NULL,
    status varchar(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED')),
    outcome varchar(16) CHECK (outcome IN ('SUCCESS', 'REJECTED')),
    reason varchar(40) NOT NULL DEFAULT 'PROCESSING',
    message varchar(256) NOT NULL DEFAULT 'Processing your request.',
    attempt_count integer NOT NULL DEFAULT 0,
    generation bigint NOT NULL DEFAULT 0,
    owner varchar(128),
    lease_expires_at timestamptz,
    next_retry_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    possible_effect boolean NOT NULL DEFAULT false,
    result jsonb,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CHECK ((status = 'PENDING' AND outcome IS NULL) OR (status = 'COMPLETED' AND outcome IS NOT NULL)),
    CHECK ((owner IS NULL) = (lease_expires_at IS NULL))
);
CREATE UNIQUE INDEX ux_order_command_pending_target ON order_commands(order_id) WHERE status = 'PENDING';
CREATE INDEX ix_order_command_recovery ON order_commands(next_retry_at) WHERE status = 'PENDING';
CREATE INDEX ix_order_command_actor ON order_commands(actor_id, created_at DESC);
