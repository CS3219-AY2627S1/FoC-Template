-- ============================================================
-- Order lifecycle: transition history and transactional outbox.
-- Rows are written in the same transaction as the order change.
-- ============================================================

-- One row per state change; used for the history view and for
-- detecting duplicate requests.
CREATE TABLE order_transitions (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders (id),

    action VARCHAR(32) NOT NULL,
    from_state VARCHAR(32),
    to_state VARCHAR(32) NOT NULL,

    -- NULL for system actions (scheduler, Credit replies).
    actor_id UUID,
    actor_role VARCHAR(16) NOT NULL,

    -- Courier assigned at, or cleared by, this transition.
    courier_id UUID,
    reason VARCHAR(64),

    order_version BIGINT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT chk_transition_actor_role CHECK (
        actor_role IN ('REQUESTER', 'COURIER', 'SYSTEM')
    )
);

CREATE INDEX idx_order_transitions_order
    ON order_transitions (order_id, occurred_at, id);

-- Events waiting to be published to Kafka by the outbox relay.
-- Publishing is a later iteration; until then rows stay unpublished.
CREATE TABLE outbox_events (
    id UUID PRIMARY KEY,
    aggregate_id UUID NOT NULL,
    aggregate_version BIGINT NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    topic VARCHAR(128) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    published_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_outbox_events_unpublished
    ON outbox_events (created_at, id)
    WHERE published_at IS NULL;
