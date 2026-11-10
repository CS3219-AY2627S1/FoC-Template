-- AI Assistance Disclosure:
-- Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28
-- Scope: Wrote the migration for disputes, their status history, the audit log and their
-- guards.
-- Author review: I validated correctness and supplied additional boundary checks.

-- N2F3 / N2NFR3: dispute cases, their append-only status history and the dashboard audit log.
-- order_id is an Order Service identifier only; there is no cross-service foreign key.
BEGIN;

CREATE TABLE admin_service.disputes (
    id uuid PRIMARY KEY,
    order_id uuid NOT NULL,
    description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 2000),
    evidence_refs text[] NOT NULL DEFAULT '{}' CHECK (cardinality(evidence_refs) <= 10),
    status text NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED')),
    resolution_reason text CHECK (length(btrim(resolution_reason)) BETWEEN 1 AND 1000),
    created_by uuid NOT NULL,
    idempotency_key uuid NOT NULL,
    request_hash text NOT NULL,
    version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    -- N2NFR3.3: one dispute per administrator request key.
    UNIQUE (created_by, idempotency_key),
    -- N2F3.3.2: closed disputes always carry their reason; open ones never do.
    CHECK ((status IN ('RESOLVED', 'REJECTED')) = (resolution_reason IS NOT NULL))
);
CREATE INDEX disputes_newest ON admin_service.disputes (created_at DESC, id DESC);
CREATE INDEX disputes_status ON admin_service.disputes (status, created_at DESC, id DESC);
CREATE INDEX disputes_order ON admin_service.disputes (order_id, created_at DESC, id DESC);

CREATE TABLE admin_service.dispute_events (
    dispute_id uuid NOT NULL REFERENCES admin_service.disputes (id),
    sequence integer NOT NULL CHECK (sequence >= 1),
    from_status text CHECK (from_status IN ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED')),
    to_status text NOT NULL CHECK (to_status IN ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED')),
    actor_id uuid NOT NULL,
    reason text,
    occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (dispute_id, sequence)
);

CREATE TABLE admin_service.audit_log (
    id uuid PRIMARY KEY,
    actor_id uuid NOT NULL,
    action text NOT NULL CHECK (action IN ('DISPUTE_CREATE', 'DISPUTE_TRANSITION')),
    target_type text NOT NULL CHECK (target_type IN ('DISPUTE', 'ORDER')),
    target_id uuid NOT NULL,
    outcome text NOT NULL CHECK (outcome IN ('SUCCESS', 'REJECTED')),
    error_code text,
    correlation_id text NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CHECK ((outcome = 'REJECTED') = (error_code IS NOT NULL))
);
CREATE INDEX audit_log_newest ON admin_service.audit_log (occurred_at DESC, id DESC);

-- N2F3.3.1 / N2F3.3.3: the database also refuses invalid moves and changes to recorded facts.
CREATE FUNCTION admin_service.guard_dispute_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.id <> OLD.id OR NEW.order_id <> OLD.order_id
        OR NEW.description <> OLD.description OR NEW.evidence_refs <> OLD.evidence_refs
        OR NEW.created_by <> OLD.created_by OR NEW.idempotency_key <> OLD.idempotency_key
        OR NEW.request_hash <> OLD.request_hash OR NEW.created_at <> OLD.created_at THEN
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

CREATE TRIGGER disputes_guard_update
    BEFORE UPDATE ON admin_service.disputes
    FOR EACH ROW EXECUTE FUNCTION admin_service.guard_dispute_update();

-- N2NFR3.2: history and audit records cannot be edited or removed.
CREATE FUNCTION admin_service.reject_record_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% records are append-only', TG_TABLE_NAME USING ERRCODE = '42501';
END
$$;

CREATE TRIGGER disputes_no_delete
    BEFORE DELETE ON admin_service.disputes
    FOR EACH ROW EXECUTE FUNCTION admin_service.reject_record_change();
CREATE TRIGGER disputes_no_truncate
    BEFORE TRUNCATE ON admin_service.disputes
    FOR EACH STATEMENT EXECUTE FUNCTION admin_service.reject_record_change();
CREATE TRIGGER dispute_events_append_only
    BEFORE UPDATE OR DELETE ON admin_service.dispute_events
    FOR EACH ROW EXECUTE FUNCTION admin_service.reject_record_change();
CREATE TRIGGER dispute_events_no_truncate
    BEFORE TRUNCATE ON admin_service.dispute_events
    FOR EACH STATEMENT EXECUTE FUNCTION admin_service.reject_record_change();
CREATE TRIGGER audit_log_append_only
    BEFORE UPDATE OR DELETE ON admin_service.audit_log
    FOR EACH ROW EXECUTE FUNCTION admin_service.reject_record_change();
CREATE TRIGGER audit_log_no_truncate
    BEFORE TRUNCATE ON admin_service.audit_log
    FOR EACH STATEMENT EXECUTE FUNCTION admin_service.reject_record_change();

REVOKE ALL ON ALL TABLES IN SCHEMA admin_service FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON admin_service.disputes TO admin_service_app;
GRANT UPDATE (status, resolution_reason, version, updated_at)
    ON admin_service.disputes TO admin_service_app;
GRANT SELECT, INSERT ON admin_service.dispute_events TO admin_service_app;
GRANT SELECT, INSERT ON admin_service.audit_log TO admin_service_app;

COMMIT;
