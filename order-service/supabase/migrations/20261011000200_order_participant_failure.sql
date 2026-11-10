-- AI Assistance Disclosure:
-- Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11
-- Scope: Implemented SQL updates for participant failure records and integrity checks.
-- Author review: I validated correctness and added boundary checks where needed.

BEGIN;

ALTER TABLE order_service.orders
    ADD COLUMN failed_at timestamptz,
    ADD COLUMN failed_by uuid,
    ADD COLUMN failure_reason text,
    ADD COLUMN failure_details text,
    ADD CONSTRAINT orders_failure_record CHECK (
        (state = 'FAILED' AND failed_at IS NOT NULL AND failed_by IS NOT NULL
         AND failure_reason IS NOT NULL AND accepted_at IS NOT NULL
         AND courier_id IS NOT NULL AND failed_by IN (requester_id, courier_id)
         AND failed_at >= COALESCE(picked_up_at, accepted_at)
         AND failure_reason IN ('ITEM_UNAVAILABLE', 'ITEM_DAMAGED', 'UNABLE_TO_PICK_UP',
             'UNABLE_TO_DELIVER', 'PARTICIPANT_UNREACHABLE', 'OTHER')
         AND (failure_details IS NULL OR
             (char_length(btrim(failure_details)) BETWEEN 1 AND 500))
         AND (failure_reason <> 'OTHER' OR failure_details IS NOT NULL))
        OR (state <> 'FAILED' AND failed_at IS NULL AND failed_by IS NULL
            AND failure_reason IS NULL AND failure_details IS NULL)
    );
GRANT UPDATE (failed_at, failed_by, failure_reason, failure_details)
    ON order_service.orders TO order_service_app;

ALTER TABLE order_service.order_history
    ADD COLUMN failure_reason text,
    ADD COLUMN failure_details text,
    ADD CONSTRAINT history_failure_record CHECK (
        (new_state = 'FAILED' AND previous_state IS NOT NULL
         AND previous_state IN ('ACCEPTED', 'PICKED_UP')
         AND actor_type = 'USER' AND actor_id IS NOT NULL AND failure_reason IS NOT NULL
         AND failure_reason IN ('ITEM_UNAVAILABLE', 'ITEM_DAMAGED', 'UNABLE_TO_PICK_UP',
             'UNABLE_TO_DELIVER', 'PARTICIPANT_UNREACHABLE', 'OTHER')
         AND (failure_details IS NULL OR
             (char_length(btrim(failure_details)) BETWEEN 1 AND 500))
         AND (failure_reason <> 'OTHER' OR failure_details IS NOT NULL))
        OR (new_state <> 'FAILED' AND failure_reason IS NULL AND failure_details IS NULL)
    );

ALTER TABLE order_service.outbox_events
    DROP CONSTRAINT outbox_events_event_type_check,
    ADD CONSTRAINT outbox_events_event_type_check CHECK (
        event_type IN ('order.cancelled.v1', 'order.expired.v1', 'order.completed.v1', 'order.failed.v1')
    );
-- FAILED uses the existing release payload: no reason/details or inferred fault sent to Credit.
-- The existing UNIQUE order_id permits only one terminal outcome/event per errand.
COMMIT;
