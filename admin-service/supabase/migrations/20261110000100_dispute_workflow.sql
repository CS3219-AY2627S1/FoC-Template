-- AI Assistance Disclosure:
-- Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
-- Scope: Wrote the migration for the disputed-errand workflow, its statements and guards; kept
-- disputes made under the earlier rules as legacy records.
-- Author review: I validated correctness and supplied additional boundary checks.

-- N2F3: a dispute now holds its errand in Order's DISPUTED state. The reporter selects the
-- problem; both participants see it and may send private statements to administrators. The
-- reporter may withdraw while the dispute is OPEN; an administrator reviews it and accepts
-- (the errand fails) or rejects it (the errand returns to its earlier state). One dispute may
-- be open per errand.
--
-- Disputes recorded under the earlier rules stay exactly as recorded: they are marked
-- legacy_record, keep their description and RESOLVED status, need no selected problem and never
-- held their errand, so they do not count towards the one-open-dispute rule. Administrators may
-- still close an open legacy dispute; that records a decision only and changes no errand.
BEGIN;

ALTER TABLE admin_service.disputes
    ADD COLUMN legacy_record boolean NOT NULL DEFAULT false;
-- Marking existing rows is not a status change, so the update guard is paused for this step.
ALTER TABLE admin_service.disputes DISABLE TRIGGER disputes_guard_update;
UPDATE admin_service.disputes SET legacy_record = true;
ALTER TABLE admin_service.disputes ENABLE TRIGGER disputes_guard_update;

ALTER TABLE admin_service.disputes
    DROP CONSTRAINT disputes_outcome_on_close,
    DROP COLUMN errand_outcome,
    DROP CONSTRAINT disputes_status_check,
    ADD CONSTRAINT disputes_status_check CHECK (
        status IN ('OPEN', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'WITHDRAWN')
        OR (legacy_record AND status = 'RESOLVED')
    ),
    DROP CONSTRAINT disputes_check,
    ADD CONSTRAINT disputes_closing_reason CHECK (
        (status IN ('ACCEPTED', 'REJECTED', 'WITHDRAWN', 'RESOLVED'))
            = (resolution_reason IS NOT NULL)
    ),
    -- Only a participant's own report can be withdrawn.
    ADD CONSTRAINT disputes_withdrawn_by_reporter CHECK (
        status <> 'WITHDRAWN' OR reporter_role IS NOT NULL
    ),
    -- The selected problem, shown to both participants. Other needs its explanation.
    ADD COLUMN problem text CHECK (problem IN (
        'ITEM_UNAVAILABLE', 'ITEM_DAMAGED', 'UNABLE_TO_PICK_UP', 'UNABLE_TO_DELIVER',
        'PARTICIPANT_UNREACHABLE', 'OTHER'
    )),
    ADD CONSTRAINT disputes_problem_selected CHECK (legacy_record OR problem IS NOT NULL),
    ADD COLUMN problem_details text
        CHECK (char_length(btrim(problem_details)) BETWEEN 1 AND 500),
    ADD CONSTRAINT disputes_other_explained CHECK (
        problem <> 'OTHER' OR problem_details IS NOT NULL
    ),
    -- Administrators keep private case notes and evidence; participants use statements.
    ALTER COLUMN description DROP NOT NULL,
    ADD CONSTRAINT disputes_admin_notes CHECK (
        legacy_record OR (
            (reporter_role IS NULL) = (description IS NOT NULL)
            AND (reporter_role IS NULL OR cardinality(evidence_refs) = 0))
    );

DROP INDEX admin_service.disputes_one_open_report;
CREATE UNIQUE INDEX disputes_one_open_per_errand
    ON admin_service.disputes (order_id)
    WHERE status IN ('OPEN', 'UNDER_REVIEW') AND NOT legacy_record;

ALTER TABLE admin_service.dispute_events
    DROP CONSTRAINT dispute_events_outcome_on_close,
    DROP COLUMN errand_outcome,
    DROP CONSTRAINT dispute_events_from_status_check,
    ADD CONSTRAINT dispute_events_from_status_check CHECK (from_status IN (
        'OPEN', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'RESOLVED'
    )),
    DROP CONSTRAINT dispute_events_to_status_check,
    ADD CONSTRAINT dispute_events_to_status_check CHECK (to_status IN (
        'OPEN', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'RESOLVED'
    )),
    ADD CONSTRAINT dispute_events_closing_reason CHECK (
        to_status NOT IN ('ACCEPTED', 'REJECTED', 'WITHDRAWN', 'RESOLVED') OR reason IS NOT NULL
    );

CREATE OR REPLACE FUNCTION admin_service.guard_dispute_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.id <> OLD.id OR NEW.order_id <> OLD.order_id
        OR NEW.description IS DISTINCT FROM OLD.description
        OR NEW.evidence_refs <> OLD.evidence_refs
        OR NEW.created_by <> OLD.created_by OR NEW.idempotency_key <> OLD.idempotency_key
        OR NEW.request_hash <> OLD.request_hash OR NEW.created_at <> OLD.created_at
        OR NEW.reporter_role IS DISTINCT FROM OLD.reporter_role
        OR NEW.problem IS DISTINCT FROM OLD.problem
        OR NEW.problem_details IS DISTINCT FROM OLD.problem_details
        OR NEW.legacy_record <> OLD.legacy_record THEN
        RAISE EXCEPTION 'recorded dispute fields are immutable' USING ERRCODE = '23514';
    END IF;
    IF NOT ((OLD.status = 'OPEN' AND NEW.status IN ('UNDER_REVIEW', 'WITHDRAWN'))
        OR (OLD.status = 'UNDER_REVIEW' AND NEW.status IN ('ACCEPTED', 'REJECTED'))) THEN
        RAISE EXCEPTION 'invalid dispute status transition' USING ERRCODE = '23514';
    END IF;
    IF NEW.version <> OLD.version + 1 THEN
        RAISE EXCEPTION 'dispute version must advance by one' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$$;

-- What each participant tells administrators. Only the author and administrators read it.
CREATE TABLE admin_service.dispute_statements (
    id uuid PRIMARY KEY,
    dispute_id uuid NOT NULL REFERENCES admin_service.disputes (id),
    author_id uuid NOT NULL,
    author_role text NOT NULL CHECK (author_role IN ('REQUESTER', 'COURIER')),
    body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
    idempotency_key uuid NOT NULL,
    request_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (author_id, idempotency_key)
);
CREATE INDEX dispute_statements_dispute
    ON admin_service.dispute_statements (dispute_id, created_at, id);

-- Statements are accepted only while the dispute is open. The share lock makes a statement
-- and a concurrent decision serialize, so none lands after the dispute closes.
CREATE FUNCTION admin_service.guard_dispute_statement() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    current_status text;
BEGIN
    SELECT status INTO current_status FROM admin_service.disputes
        WHERE id = NEW.dispute_id FOR SHARE;
    IF current_status IS NULL OR current_status NOT IN ('OPEN', 'UNDER_REVIEW') THEN
        RAISE EXCEPTION 'statements require an open dispute' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER dispute_statements_open_only
    BEFORE INSERT ON admin_service.dispute_statements
    FOR EACH ROW EXECUTE FUNCTION admin_service.guard_dispute_statement();
CREATE TRIGGER dispute_statements_append_only
    BEFORE UPDATE OR DELETE ON admin_service.dispute_statements
    FOR EACH ROW EXECUTE FUNCTION admin_service.reject_record_change();
CREATE TRIGGER dispute_statements_no_truncate
    BEFORE TRUNCATE ON admin_service.dispute_statements
    FOR EACH STATEMENT EXECUTE FUNCTION admin_service.reject_record_change();

REVOKE ALL ON admin_service.dispute_statements FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON admin_service.dispute_statements TO admin_service_app;

ALTER TABLE admin_service.audit_log DROP CONSTRAINT audit_log_action_check;
ALTER TABLE admin_service.audit_log ADD CONSTRAINT audit_log_action_check CHECK (action IN (
    'DISPUTE_CREATE', 'DISPUTE_REPORT', 'DISPUTE_TRANSITION', 'DISPUTE_WITHDRAW',
    'DISPUTE_STATEMENT', 'ERRAND_DECISION'
));

COMMIT;
