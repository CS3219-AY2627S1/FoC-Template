-- AI Assistance Disclosure:
-- Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-29
-- Scope: Wrote the migration for participant reporter roles and one open report per
-- participant.
-- Author review: I validated correctness and supplied additional boundary checks.

-- N2F3.2: errand participants report disputes; administrators handle them as before.
BEGIN;

-- NULL for administrator-recorded disputes; otherwise the reporter's role on the errand.
-- created_by is then the reporting participant.
ALTER TABLE admin_service.disputes
    ADD COLUMN reporter_role text CHECK (reporter_role IN ('REQUESTER', 'COURIER'));

-- A participant may have only one open report about the same errand.
CREATE UNIQUE INDEX disputes_one_open_report
    ON admin_service.disputes (order_id, created_by)
    WHERE reporter_role IS NOT NULL AND status IN ('OPEN', 'UNDER_REVIEW');
CREATE INDEX disputes_reporter
    ON admin_service.disputes (created_by, created_at DESC, id DESC)
    WHERE reporter_role IS NOT NULL;

ALTER TABLE admin_service.audit_log DROP CONSTRAINT audit_log_action_check;
ALTER TABLE admin_service.audit_log ADD CONSTRAINT audit_log_action_check
    CHECK (action IN ('DISPUTE_CREATE', 'DISPUTE_REPORT', 'DISPUTE_TRANSITION'));

-- The reporter's role is a recorded fact like the description.
CREATE OR REPLACE FUNCTION admin_service.guard_dispute_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.id <> OLD.id OR NEW.order_id <> OLD.order_id
        OR NEW.description <> OLD.description OR NEW.evidence_refs <> OLD.evidence_refs
        OR NEW.created_by <> OLD.created_by OR NEW.idempotency_key <> OLD.idempotency_key
        OR NEW.request_hash <> OLD.request_hash OR NEW.created_at <> OLD.created_at
        OR NEW.reporter_role IS DISTINCT FROM OLD.reporter_role THEN
        RAISE EXCEPTION 'recorded dispute fields are immutable' USING ERRCODE = '23514';
    END IF;
    IF NOT ((OLD.status = 'OPEN' AND NEW.status = 'UNDER_REVIEW')
        OR (OLD.status = 'UNDER_REVIEW' AND NEW.status IN ('RESOLVED', 'REJECTED'))) THEN
        RAISE EXCEPTION 'invalid dispute status transition' USING ERRCODE = '23514';
    END IF;
    IF NEW.version <> OLD.version + 1 THEN
        RAISE EXCEPTION 'dispute version must advance by one' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$$;

COMMIT;
