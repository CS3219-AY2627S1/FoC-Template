-- ============================================================
-- Align with docs/integration/event-communication-blueprint.md.
-- ============================================================

-- One correlation ID for the whole order workflow (blueprint
-- "correlationId"). Existing rows reuse their order ID.
ALTER TABLE orders ADD COLUMN correlation_id UUID;
UPDATE orders SET correlation_id = id WHERE correlation_id IS NULL;
ALTER TABLE orders ALTER COLUMN correlation_id SET NOT NULL;

-- Outcome of the latest credit operation, set only by Credit
-- outcome events; it never changes the order's lifecycle state.
ALTER TABLE orders ADD COLUMN credit_status VARCHAR(16);
ALTER TABLE orders ADD CONSTRAINT chk_credit_status CHECK (
    credit_status IS NULL
    OR credit_status IN ('RESERVED', 'RELEASED', 'SETTLED', 'COMPENSATED')
);

-- The credit operation an outbox event requested, so a Credit
-- outcome can be matched to it by operationId.
ALTER TABLE outbox_events ADD COLUMN operation_id UUID;
CREATE UNIQUE INDEX idx_outbox_events_operation
    ON outbox_events (operation_id)
    WHERE operation_id IS NOT NULL;

-- Consumer inbox: one row per Credit event handled. The primary
-- key on event_id makes a redelivered event a no-op.
CREATE TABLE processed_events (
    event_id UUID PRIMARY KEY,
    event_type VARCHAR(64) NOT NULL,
    aggregate_id UUID NOT NULL,
    operation_id UUID,
    -- SHA-256 of the received envelope, to detect an eventId reused
    -- with different content (EVENT_ID_CONFLICT).
    fingerprint VARCHAR(64) NOT NULL,
    outcome VARCHAR(32) NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL
);
