-- AI Assistance Disclosure:
-- Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-11
-- Scope: Implemented SQL updates for fulfilment/completion fields and integrity checks.
-- Author review: I validated correctness and added boundary checks where needed.

BEGIN;

ALTER TABLE order_service.orders
    ADD COLUMN picked_up_at timestamptz,
    ADD COLUMN delivered_at timestamptz,
    ADD COLUMN completed_at timestamptz,
    ADD COLUMN overdue_at timestamptz;

ALTER TABLE order_service.orders ADD CONSTRAINT orders_fulfilment_times CHECK (
    (picked_up_at IS NULL OR (accepted_at IS NOT NULL AND picked_up_at >= accepted_at))
    AND (delivered_at IS NULL OR (picked_up_at IS NOT NULL AND delivered_at >= picked_up_at))
    AND (completed_at IS NULL OR (delivered_at IS NOT NULL AND completed_at >= delivered_at))
    AND ((state IN ('DELIVERED', 'COMPLETED')) = (delivered_at IS NOT NULL))
    AND ((state = 'COMPLETED') = (completed_at IS NOT NULL))
    AND (state NOT IN ('PICKED_UP', 'DELIVERED', 'COMPLETED') OR picked_up_at IS NOT NULL)
    AND (state NOT IN ('OPEN', 'ACCEPTED', 'CANCELLED', 'EXPIRED') OR picked_up_at IS NULL)
    AND (overdue_at IS NULL OR (overdue_at = delivery_deadline AND accepted_at IS NOT NULL
         AND (delivered_at IS NULL OR delivered_at >= delivery_deadline)))
);
CREATE INDEX orders_overdue_due ON order_service.orders (delivery_deadline, id)
    WHERE state IN ('ACCEPTED', 'PICKED_UP') AND overdue_at IS NULL;
GRANT UPDATE (picked_up_at, delivered_at, completed_at, overdue_at)
    ON order_service.orders TO order_service_app;

ALTER TABLE order_service.outbox_events
    DROP CONSTRAINT outbox_events_event_type_check,
    ADD COLUMN requester_id uuid,
    ADD COLUMN courier_id uuid,
    ADD COLUMN amount integer,
    ADD CONSTRAINT outbox_events_event_type_check CHECK (
        event_type IN ('order.cancelled.v1', 'order.expired.v1', 'order.completed.v1')
    ),
    ADD CONSTRAINT outbox_completion_payload CHECK (
        (event_type = 'order.completed.v1' AND requester_id IS NOT NULL
         AND courier_id IS NOT NULL AND requester_id <> courier_id AND amount IS NOT NULL AND amount > 0)
        OR (event_type <> 'order.completed.v1' AND requester_id IS NULL
            AND courier_id IS NULL AND amount IS NULL)
    );
-- Existing column-scoped publication grants do not permit modifying these identities.
-- order_id stays UNIQUE: one terminal outcome/event per Order, even across retries.
COMMIT;
