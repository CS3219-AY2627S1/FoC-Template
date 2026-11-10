-- AI Assistance Disclosure:
-- Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09
-- Scope: Implemented SQL definitions and integrity checks for Order creation and history.
-- Author review: I validated correctness and added boundary checks where needed.

BEGIN;

CREATE TABLE order_service.creation_operations (
    id uuid PRIMARY KEY,
    order_id uuid NOT NULL UNIQUE,
    requester_id uuid NOT NULL,
    key_hash varchar(64) NOT NULL,
    request_hash varchar(64) NOT NULL,
    payload jsonb NOT NULL,
    supplier_snapshot jsonb NOT NULL,
    stage text NOT NULL CHECK (stage IN (
        'VALIDATED', 'RESERVATION_UNKNOWN', 'READY_TO_FINALIZE',
        'SUCCEEDED', 'ABORTING', 'ABORTED'
    )),
    reservation_id uuid,
    error_code text,
    created_at timestamptz NOT NULL,
    acceptance_deadline timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    lease_token uuid,
    lease_until timestamptz,
    next_attempt_at timestamptz NOT NULL,
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    UNIQUE (requester_id, key_hash),
    CHECK ((lease_token IS NULL) = (lease_until IS NULL)),
    CHECK (stage <> 'SUCCEEDED' OR reservation_id IS NOT NULL)
);

CREATE TABLE order_service.orders (
    id uuid PRIMARY KEY,
    requester_id uuid NOT NULL,
    courier_id uuid,
    supplier_id uuid NOT NULL,
    supplier_snapshot jsonb NOT NULL,
    item_description text NOT NULL CHECK (length(btrim(item_description)) BETWEEN 1 AND 1000),
    delivery_location text NOT NULL CHECK (length(btrim(delivery_location)) BETWEEN 1 AND 300),
    reward integer NOT NULL CHECK (reward > 0),
    state text NOT NULL CHECK (state IN (
        'OPEN', 'ACCEPTED', 'PICKED_UP', 'DELIVERED', 'COMPLETED',
        'CANCELLED', 'EXPIRED', 'FAILED'
    )),
    reservation_id uuid NOT NULL UNIQUE,
    acceptance_deadline timestamptz NOT NULL,
    delivery_deadline timestamptz NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    CHECK (courier_id IS NULL OR requester_id <> courier_id),
    CHECK (acceptance_deadline > created_at),
    CHECK (delivery_deadline > acceptance_deadline)
);

CREATE TABLE order_service.order_history (
    order_id uuid NOT NULL REFERENCES order_service.orders(id),
    sequence integer NOT NULL CHECK (sequence > 0),
    previous_state text,
    new_state text NOT NULL,
    actor_id uuid NOT NULL,
    actor_type text NOT NULL CHECK (actor_type IN ('USER', 'SYSTEM')),
    occurred_at timestamptz NOT NULL,
    PRIMARY KEY (order_id, sequence)
);

CREATE INDEX orders_available ON order_service.orders (created_at DESC, id DESC)
    INCLUDE (acceptance_deadline, supplier_id) WHERE state = 'OPEN';
CREATE INDEX orders_requester ON order_service.orders (requester_id, created_at DESC, id DESC);
CREATE INDEX orders_courier ON order_service.orders (courier_id, created_at DESC, id DESC)
    WHERE courier_id IS NOT NULL;
CREATE INDEX creation_recovery ON order_service.creation_operations (next_attempt_at)
    WHERE stage NOT IN ('SUCCEEDED', 'ABORTED');

REVOKE ALL ON ALL TABLES IN SCHEMA order_service FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON order_service.creation_operations TO order_service_app;
GRANT SELECT, INSERT ON order_service.orders, order_service.order_history TO order_service_app;
COMMENT ON TABLE order_service.creation_operations IS
    'Durable creation/recovery intent; no user tokens, wallet balances or cross-service FK.';

COMMIT;
