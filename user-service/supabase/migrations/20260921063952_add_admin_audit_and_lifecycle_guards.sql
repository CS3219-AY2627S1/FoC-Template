-- AI Assistance Disclosure:
-- Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-21
-- Scope: Wrote the migration for administrator audit records and lifecycle guards.
-- Author review: I validated correctness and added boundary checks where needed.

-- Phase 5 adds the immutable administrator-lifecycle evidence store. The
-- application role can read and append records but cannot alter history.

BEGIN;

CREATE TABLE user_service.admin_audit_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id uuid NOT NULL REFERENCES user_service.users (id) ON DELETE RESTRICT,
    target_user_id uuid NOT NULL REFERENCES user_service.users (id) ON DELETE RESTRICT,
    action varchar(64) NOT NULL,
    outcome varchar(32) NOT NULL,
    role_before user_service.system_role,
    role_after user_service.system_role,
    correlation_id varchar(128) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT admin_audit_entries_action_known CHECK (
        action IN ('SUPER_ADMIN_BOOTSTRAPPED', 'SYSTEM_ROLE_CHANGED')
    ),
    CONSTRAINT admin_audit_entries_outcome_known CHECK (outcome IN ('SUCCESS'))
);

CREATE INDEX admin_audit_entries_actor_created_idx
ON user_service.admin_audit_entries (actor_id, created_at DESC);

CREATE INDEX admin_audit_entries_target_created_idx
ON user_service.admin_audit_entries (target_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION user_service.reject_admin_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'admin audit entries are immutable'
        USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER admin_audit_entries_reject_update
BEFORE UPDATE ON user_service.admin_audit_entries
FOR EACH ROW
EXECUTE FUNCTION user_service.reject_admin_audit_mutation();

CREATE TRIGGER admin_audit_entries_reject_delete
BEFORE DELETE ON user_service.admin_audit_entries
FOR EACH ROW
EXECUTE FUNCTION user_service.reject_admin_audit_mutation();

REVOKE ALL PRIVILEGES ON TABLE user_service.admin_audit_entries FROM user_service_app;
GRANT SELECT, INSERT ON TABLE user_service.admin_audit_entries TO user_service_app;

COMMIT;
