-- AI Assistance Disclosure:
-- Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-11
-- Scope: Implemented SQL updates for acceptance, cancellation, expiry and event persistence.
-- Author review: I validated correctness and added boundary checks where needed.

BEGIN;

ALTER TABLE order_service.orders
    ADD COLUMN accepted_at timestamptz,
    ADD COLUMN cancelled_at timestamptz,
    ADD COLUMN expired_at timestamptz;

-- Earlier releases only create OPEN orders; retain immutable identity and pickup data.
ALTER TABLE order_service.orders ADD CONSTRAINT orders_assignment CHECK (
    (state IN ('OPEN', 'CANCELLED', 'EXPIRED') AND courier_id IS NULL AND accepted_at IS NULL)
    OR (state IN ('ACCEPTED', 'PICKED_UP', 'DELIVERED', 'COMPLETED', 'FAILED')
        AND courier_id IS NOT NULL AND accepted_at IS NOT NULL)
);
ALTER TABLE order_service.orders ADD CONSTRAINT orders_transition_times CHECK (
    (accepted_at IS NULL OR (accepted_at >= created_at AND accepted_at < acceptance_deadline))
    AND ((state = 'CANCELLED') = (cancelled_at IS NOT NULL))
    AND (cancelled_at IS NULL OR (cancelled_at >= created_at AND cancelled_at < acceptance_deadline))
    AND ((state = 'EXPIRED') = (expired_at IS NOT NULL))
    AND (expired_at IS NULL OR expired_at >= acceptance_deadline)
);
CREATE INDEX orders_expiry_due ON order_service.orders (acceptance_deadline, id)
    WHERE state = 'OPEN';

ALTER TABLE order_service.order_history ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE order_service.order_history ADD CONSTRAINT history_actor CHECK (
    (actor_type = 'USER' AND actor_id IS NOT NULL)
    OR (actor_type = 'SYSTEM' AND actor_id IS NULL)
);

CREATE TABLE order_service.outbox_events (
    event_id uuid PRIMARY KEY,
    event_type text NOT NULL CHECK (event_type IN ('order.cancelled.v1', 'order.expired.v1')),
    order_id uuid NOT NULL UNIQUE REFERENCES order_service.orders(id),
    reservation_id uuid NOT NULL,
    occurred_at timestamptz NOT NULL,
    state text NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING', 'PUBLISHED')),
    publish_attempts integer NOT NULL DEFAULT 0 CHECK (publish_attempts >= 0),
    next_attempt_at timestamptz NOT NULL,
    lease_token uuid,
    lease_until timestamptz,
    published_at timestamptz,
    last_error_code text,
    CHECK ((lease_token IS NULL) = (lease_until IS NULL)),
    CHECK ((state = 'PUBLISHED') = (published_at IS NOT NULL))
);
CREATE INDEX outbox_due ON order_service.outbox_events (next_attempt_at, event_id)
    WHERE state = 'PENDING';
REVOKE ALL ON order_service.outbox_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON order_service.outbox_events TO order_service_app;
GRANT UPDATE (state, publish_attempts, next_attempt_at, lease_token, lease_until,
    published_at, last_error_code) ON order_service.outbox_events TO order_service_app;
GRANT UPDATE (state, courier_id, accepted_at, cancelled_at, expired_at, updated_at)
    ON order_service.orders TO order_service_app;
COMMENT ON TABLE order_service.outbox_events IS
    'Order-owned terminal event intent. PUBLISHED means broker-confirmed, not Credit settled.';

COMMIT;
