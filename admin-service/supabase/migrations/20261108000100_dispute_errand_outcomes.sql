-- AI Assistance Disclosure:
-- Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
-- Scope: Wrote the migration recording errand outcomes on disputes and their history.
-- Author review: I validated correctness and supplied additional boundary checks.

-- N2F3.7: closing a dispute may also decide the errand's outcome through Order. The dispute
-- records which outcome was applied; Order owns the errand change and its credit effect.
BEGIN;

ALTER TABLE admin_service.disputes
    ADD COLUMN errand_outcome text CHECK (errand_outcome IN ('FAILED', 'COMPLETED')),
    ADD CONSTRAINT disputes_outcome_on_close
        CHECK (errand_outcome IS NULL OR status IN ('RESOLVED', 'REJECTED'));
GRANT UPDATE (errand_outcome) ON admin_service.disputes TO admin_service_app;

ALTER TABLE admin_service.dispute_events
    ADD COLUMN errand_outcome text CHECK (errand_outcome IN ('FAILED', 'COMPLETED')),
    ADD CONSTRAINT dispute_events_outcome_on_close
        CHECK (errand_outcome IS NULL OR to_status IN ('RESOLVED', 'REJECTED'));

ALTER TABLE admin_service.audit_log DROP CONSTRAINT audit_log_action_check;
ALTER TABLE admin_service.audit_log ADD CONSTRAINT audit_log_action_check
    CHECK (action IN ('DISPUTE_CREATE', 'DISPUTE_REPORT', 'DISPUTE_TRANSITION', 'ERRAND_DECISION'));

COMMIT;
