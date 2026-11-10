-- AI Assistance Disclosure:
-- Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
-- Scope: Wrote the migration for administrator errand decisions and their constraints.
-- Author review: I validated correctness and supplied additional boundary checks.

-- N2F3.7: an administrator deciding a dispute may fail an ACCEPTED, PICKED_UP or DELIVERED
-- errand, or complete a DELIVERED one. The decision reuses the existing terminal path, so the
-- state change, history entry and Credit release/transfer intent still commit together.
BEGIN;

ALTER TABLE order_service.orders
    ADD COLUMN decided_by uuid,
    ADD COLUMN decision_dispute_id uuid,
    ADD CONSTRAINT orders_admin_decision CHECK (
        (decided_by IS NULL) = (decision_dispute_id IS NULL)
        AND (decided_by IS NULL OR state IN ('FAILED', 'COMPLETED'))
    );
GRANT UPDATE (decided_by, decision_dispute_id) ON order_service.orders TO order_service_app;

-- A delivered errand may now end FAILED, but only by an administrator's decision.
ALTER TABLE order_service.orders
    DROP CONSTRAINT orders_fulfilment_times,
    ADD CONSTRAINT orders_fulfilment_times CHECK (
        (picked_up_at IS NULL OR (accepted_at IS NOT NULL AND picked_up_at >= accepted_at))
        AND (delivered_at IS NULL OR (picked_up_at IS NOT NULL AND delivered_at >= picked_up_at))
        AND (completed_at IS NULL OR (delivered_at IS NOT NULL AND completed_at >= delivered_at))
        AND (state NOT IN ('DELIVERED', 'COMPLETED') OR delivered_at IS NOT NULL)
        AND (delivered_at IS NULL OR state IN ('DELIVERED', 'COMPLETED')
             OR (state = 'FAILED' AND decided_by IS NOT NULL))
        AND ((state = 'COMPLETED') = (completed_at IS NOT NULL))
        AND (state NOT IN ('PICKED_UP', 'DELIVERED', 'COMPLETED') OR picked_up_at IS NOT NULL)
        AND (state NOT IN ('OPEN', 'ACCEPTED', 'CANCELLED', 'EXPIRED') OR picked_up_at IS NULL)
        AND (overdue_at IS NULL OR (overdue_at = delivery_deadline AND accepted_at IS NOT NULL
             AND (delivered_at IS NULL OR delivered_at >= delivery_deadline)))
    );

-- Participants keep their own reasons; an administrator's failure is always ADMIN_DECISION
-- with the decision reason as its details, and is recorded against the deciding administrator.
ALTER TABLE order_service.orders
    DROP CONSTRAINT orders_failure_record,
    ADD CONSTRAINT orders_failure_record CHECK (
        (state = 'FAILED' AND failed_at IS NOT NULL AND failed_by IS NOT NULL
         AND failure_reason IS NOT NULL AND accepted_at IS NOT NULL AND courier_id IS NOT NULL
         AND failed_at >= COALESCE(delivered_at, picked_up_at, accepted_at)
         AND (failure_details IS NULL OR
             (char_length(btrim(failure_details)) BETWEEN 1 AND 500))
         AND (
             (decided_by IS NULL AND failed_by IN (requester_id, courier_id)
              AND failure_reason IN ('ITEM_UNAVAILABLE', 'ITEM_DAMAGED', 'UNABLE_TO_PICK_UP',
                  'UNABLE_TO_DELIVER', 'PARTICIPANT_UNREACHABLE', 'OTHER')
              AND (failure_reason <> 'OTHER' OR failure_details IS NOT NULL))
             OR (decided_by IS NOT NULL AND failed_by = decided_by
                 AND failure_reason = 'ADMIN_DECISION' AND failure_details IS NOT NULL)))
        OR (state <> 'FAILED' AND failed_at IS NULL AND failed_by IS NULL
            AND failure_reason IS NULL AND failure_details IS NULL)
    );

ALTER TABLE order_service.order_history
    ADD COLUMN dispute_id uuid,
    DROP CONSTRAINT order_history_actor_type_check,
    ADD CONSTRAINT order_history_actor_type_check
        CHECK (actor_type IN ('USER', 'SYSTEM', 'ADMIN')),
    DROP CONSTRAINT history_actor,
    ADD CONSTRAINT history_actor CHECK (
        (actor_type = 'USER' AND actor_id IS NOT NULL AND dispute_id IS NULL)
        OR (actor_type = 'SYSTEM' AND actor_id IS NULL AND dispute_id IS NULL)
        OR (actor_type = 'ADMIN' AND actor_id IS NOT NULL AND dispute_id IS NOT NULL
            AND new_state IN ('FAILED', 'COMPLETED'))
    ),
    DROP CONSTRAINT history_failure_record,
    ADD CONSTRAINT history_failure_record CHECK (
        (new_state = 'FAILED' AND actor_id IS NOT NULL AND failure_reason IS NOT NULL
         AND (failure_details IS NULL OR
             (char_length(btrim(failure_details)) BETWEEN 1 AND 500))
         AND (
             (actor_type = 'USER' AND previous_state IN ('ACCEPTED', 'PICKED_UP')
              AND failure_reason IN ('ITEM_UNAVAILABLE', 'ITEM_DAMAGED', 'UNABLE_TO_PICK_UP',
                  'UNABLE_TO_DELIVER', 'PARTICIPANT_UNREACHABLE', 'OTHER')
              AND (failure_reason <> 'OTHER' OR failure_details IS NOT NULL))
             OR (actor_type = 'ADMIN' AND previous_state IN ('ACCEPTED', 'PICKED_UP', 'DELIVERED')
                 AND failure_reason = 'ADMIN_DECISION' AND failure_details IS NOT NULL)))
        OR (new_state <> 'FAILED' AND failure_reason IS NULL AND failure_details IS NULL)
    );

COMMIT;
