-- AI Assistance Disclosure:
-- Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
-- Scope: Wrote the migration for the DISPUTED errand state and its constraints; kept records
-- made under the earlier rules valid as legacy history.
-- Author review: I validated correctness and supplied additional boundary checks.

-- N2F3: a reported problem moves an ACCEPTED, PICKED_UP or DELIVERED errand to DISPUTED and
-- remembers the state it came from. Admin Service owns the dispute; Order only stores the
-- errand's state. A withdrawn or rejected dispute returns the errand to that state; an accepted
-- dispute fails it with the reporter's selected reason. Participants no longer fail errands
-- directly, so every FAILED errand carries the deciding administrator and dispute.
--
-- Errands and history made under the earlier rules (participant failures, and administrator
-- failures or completions decided without a held dispute) stay exactly as recorded. They are
-- marked legacy_record and exempt from the new failure rules only; every other constraint still
-- applies, legacy errands are already terminal, and the runtime role cannot change the marker.
BEGIN;

ALTER TABLE order_service.orders
    ADD COLUMN legacy_record boolean NOT NULL DEFAULT false;
UPDATE order_service.orders SET legacy_record = true
    WHERE (state = 'FAILED' AND (decided_by IS NULL OR failure_reason = 'ADMIN_DECISION'))
       OR (decided_by IS NOT NULL AND state <> 'FAILED');
ALTER TABLE order_service.orders
    ADD CONSTRAINT orders_legacy_terminal CHECK (
        NOT legacy_record OR state IN ('FAILED', 'COMPLETED')
    );

ALTER TABLE order_service.order_history
    ADD COLUMN legacy_record boolean NOT NULL DEFAULT false;
UPDATE order_service.order_history SET legacy_record = true
    WHERE new_state = 'FAILED' OR actor_type = 'ADMIN';

ALTER TABLE order_service.orders
    DROP CONSTRAINT orders_state_check,
    ADD CONSTRAINT orders_state_check CHECK (state IN (
        'OPEN', 'ACCEPTED', 'PICKED_UP', 'DELIVERED', 'DISPUTED', 'COMPLETED',
        'CANCELLED', 'EXPIRED', 'FAILED'
    )),
    DROP CONSTRAINT orders_assignment,
    ADD CONSTRAINT orders_assignment CHECK (
        (state IN ('OPEN', 'CANCELLED', 'EXPIRED') AND courier_id IS NULL AND accepted_at IS NULL)
        OR (state IN ('ACCEPTED', 'PICKED_UP', 'DELIVERED', 'DISPUTED', 'COMPLETED', 'FAILED')
            AND courier_id IS NOT NULL AND accepted_at IS NOT NULL)
    );

ALTER TABLE order_service.orders
    ADD COLUMN dispute_id uuid,
    ADD COLUMN disputed_from_state text,
    ADD COLUMN disputed_at timestamptz,
    -- The open dispute and the state to return to exist exactly while the errand is DISPUTED,
    -- and the remembered state must agree with the fulfilment timestamps already recorded.
    ADD CONSTRAINT orders_dispute CHECK (
        (state = 'DISPUTED') = (dispute_id IS NOT NULL)
        AND (dispute_id IS NULL) = (disputed_from_state IS NULL)
        AND (dispute_id IS NULL) = (disputed_at IS NULL)
        AND (disputed_at IS NULL OR disputed_at >= accepted_at)
        AND (state <> 'DISPUTED' OR (
            (disputed_from_state = 'ACCEPTED' AND picked_up_at IS NULL)
            OR (disputed_from_state = 'PICKED_UP' AND picked_up_at IS NOT NULL
                AND delivered_at IS NULL)
            OR (disputed_from_state = 'DELIVERED' AND delivered_at IS NOT NULL)))
    );
GRANT UPDATE (dispute_id, disputed_from_state, disputed_at)
    ON order_service.orders TO order_service_app;

ALTER TABLE order_service.orders
    DROP CONSTRAINT orders_fulfilment_times,
    ADD CONSTRAINT orders_fulfilment_times CHECK (
        (picked_up_at IS NULL OR (accepted_at IS NOT NULL AND picked_up_at >= accepted_at))
        AND (delivered_at IS NULL OR (picked_up_at IS NOT NULL AND delivered_at >= picked_up_at))
        AND (completed_at IS NULL OR (delivered_at IS NOT NULL AND completed_at >= delivered_at))
        AND (state NOT IN ('DELIVERED', 'COMPLETED') OR delivered_at IS NOT NULL)
        AND (delivered_at IS NULL OR state IN ('DELIVERED', 'COMPLETED', 'DISPUTED', 'FAILED'))
        AND ((state = 'COMPLETED') = (completed_at IS NOT NULL))
        AND (state NOT IN ('PICKED_UP', 'DELIVERED', 'COMPLETED') OR picked_up_at IS NOT NULL)
        AND (state NOT IN ('OPEN', 'ACCEPTED', 'CANCELLED', 'EXPIRED') OR picked_up_at IS NULL)
        AND (overdue_at IS NULL OR (overdue_at = delivery_deadline AND accepted_at IS NOT NULL
             AND (delivered_at IS NULL OR delivered_at >= delivery_deadline)))
    );

-- Only an accepted dispute fails an errand, so FAILED and an administrator decision coincide.
ALTER TABLE order_service.orders
    DROP CONSTRAINT orders_admin_decision,
    ADD CONSTRAINT orders_admin_decision CHECK (
        legacy_record OR (
            (decided_by IS NULL) = (decision_dispute_id IS NULL)
            AND (state = 'FAILED') = (decided_by IS NOT NULL))
    ),
    DROP CONSTRAINT orders_failure_record,
    ADD CONSTRAINT orders_failure_record CHECK (
        legacy_record
        OR (state = 'FAILED' AND failed_at IS NOT NULL AND failed_by = decided_by
         AND accepted_at IS NOT NULL AND courier_id IS NOT NULL
         AND failed_at >= COALESCE(delivered_at, picked_up_at, accepted_at)
         AND failure_reason IN ('ITEM_UNAVAILABLE', 'ITEM_DAMAGED', 'UNABLE_TO_PICK_UP',
             'UNABLE_TO_DELIVER', 'PARTICIPANT_UNREACHABLE', 'OTHER')
         AND (failure_reason <> 'OTHER' OR failure_details IS NOT NULL)
         AND (failure_details IS NULL OR
             (char_length(btrim(failure_details)) BETWEEN 1 AND 500)))
        OR (state <> 'FAILED' AND failed_at IS NULL AND failed_by IS NULL
            AND failure_reason IS NULL AND failure_details IS NULL)
    );

-- Participants open and withdraw disputes; administrators open, reject and accept them. Every
-- history row that enters or leaves DISPUTED names its dispute, and no other row does.
ALTER TABLE order_service.order_history
    DROP CONSTRAINT history_actor,
    ADD CONSTRAINT history_actor CHECK (
        legacy_record
        OR (actor_type = 'USER' AND actor_id IS NOT NULL AND dispute_id IS NULL
         AND new_state NOT IN ('DISPUTED', 'FAILED')
         AND previous_state IS DISTINCT FROM 'DISPUTED')
        OR (actor_type = 'USER' AND actor_id IS NOT NULL AND dispute_id IS NOT NULL
            AND (new_state = 'DISPUTED'
                 OR (previous_state = 'DISPUTED'
                     AND new_state IN ('ACCEPTED', 'PICKED_UP', 'DELIVERED'))))
        OR (actor_type = 'SYSTEM' AND actor_id IS NULL AND dispute_id IS NULL
            AND new_state NOT IN ('DISPUTED', 'FAILED'))
        OR (actor_type = 'ADMIN' AND actor_id IS NOT NULL AND dispute_id IS NOT NULL
            AND (new_state = 'DISPUTED' OR previous_state = 'DISPUTED'))
    ),
    DROP CONSTRAINT history_failure_record,
    ADD CONSTRAINT history_failure_record CHECK (
        legacy_record
        OR (new_state = 'FAILED' AND actor_type = 'ADMIN' AND previous_state = 'DISPUTED'
         AND failure_reason IN ('ITEM_UNAVAILABLE', 'ITEM_DAMAGED', 'UNABLE_TO_PICK_UP',
             'UNABLE_TO_DELIVER', 'PARTICIPANT_UNREACHABLE', 'OTHER')
         AND (failure_reason <> 'OTHER' OR failure_details IS NOT NULL)
         AND (failure_details IS NULL OR
             (char_length(btrim(failure_details)) BETWEEN 1 AND 500)))
        OR (new_state <> 'FAILED' AND failure_reason IS NULL AND failure_details IS NULL)
    );

-- Restore and replay checks look up the history rows written for one dispute.
CREATE INDEX order_history_dispute ON order_service.order_history (dispute_id)
    WHERE dispute_id IS NOT NULL;

COMMIT;
