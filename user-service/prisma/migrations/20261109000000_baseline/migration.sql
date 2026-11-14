-- AI Assistance Disclosure:
-- Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-09
-- Scope: Baseline migration, a copy of src/db/init.sql as it stood before preferred_lang (every
--        statement is re-runnable, so it is safe on databases built from init.sql).
--        No requirements, architecture, schema, or API decisions were made by the AI tool.
-- Author review:

-- Scope (2026-11-08, Codex, model: GPT-6): Added idempotent application of the existing Stage 18 OTP columns to existing tables.
-- No requirements, architecture, schema, or API decisions were made by the AI tool.
-- Author review:
-- AI Assistance Disclosure:
-- Scope (2026-11-08, Codex, model: GPT-6): Added last_request per the precise delivery location spec.
-- No requirements, architecture, schema, or API decisions were made by the AI tool.
-- Author review:
-- Tool: Claude Code (claude-sonnet-5)
--  2026-09-24: Generated initial implementation as part of Stage 2b
--    Author review: No changes needed.
--  2026-09-25: Stage 5a - added 'pending' to status_enum
--    Author review:
--  2026-09-27: Stage 11 - added active_view_enum and users.active_view
--    Author review:
--  2026-10-21: Stage 14a - added outbox_status_enum and credit_allocation_outbox table for
--    the credit-allocation transactional outbox. No requirements, architecture, schema, or API
--    decisions were made by the AI tool — see instructions.md Stage 14 for the governing decision.
--    Author review:
--  2026-11-04: Stage 18a - added the login-lockout columns on users and the OTP
--    send-escalation columns on users_otps. No requirements, architecture, schema, or API
--    decisions were made by the AI tool — see instructions.md Stage 18 for the governing decision.
--    Author review:
--  2026-11-05: Added the user_bookmarks table for supplier bookmarking (spec
--    docs/superpowers/specs/2026-11-05-supplier-bookmarking-design.md). Tool: Claude Code (model:
--    claude-sonnet-5-5). No requirements, architecture, schema, or API decisions were made by the AI tool.
--    Author review:
--  2026-11-06: Stage 26a - added audit_action_enum, the append-only admin_audit_log table, its
--    indexes, and the triggers that enforce append-only. No requirements, architecture, schema,
--    or API decisions were made by the AI tool — see instructions.md Stage 26 for the governing
--    decision.
--    Author review:

DO $$ BEGIN
  CREATE TYPE status_enum AS ENUM ('pending', 'active', 'suspended');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE role_enum AS ENUM ('user', 'admin', 'super admin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE purpose_enum AS ENUM ('Registration', 'Forgot Password', 'Change Email', 'Change Password', 'Admin Action');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE active_view_enum AS ENUM ('requester', 'courier');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status status_enum NOT NULL DEFAULT 'active',
  role role_enum NOT NULL DEFAULT 'user'
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS active_view active_view_enum NOT NULL DEFAULT 'requester';

-- Stage 18a: login lockout state (NFR1.1). login_lock_level is the escalation level that
-- produced login_locked_until (0 = never locked); the time it was last hit is derived from
-- login_locked_until minus that level's lock length, not stored separately.
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_failed_attempts SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_failure_window_start TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_locked_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_lock_level SMALLINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS users_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  otp_hash CHAR(64) NOT NULL,
  new_email VARCHAR(255),
  purpose purpose_enum NOT NULL,
  attempts_count SMALLINT NOT NULL DEFAULT 0,
  max_attempts SMALLINT NOT NULL DEFAULT 5,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Stage 18c: OTP send-escalation state, carried onto whichever row is latest for its
  -- (user_id, purpose). send_escalation_level is the level that produced send_blocked_until
  -- (0 = never capped); the time it was last hit is derived the same way as the login lock.
  send_escalation_level SMALLINT NOT NULL DEFAULT 0,
  send_blocked_until TIMESTAMPTZ
);

-- AI-generated (edited by <name>).
-- CREATE TABLE IF NOT EXISTS leaves pre-Stage-18 tables unchanged.
ALTER TABLE users_otps ADD COLUMN IF NOT EXISTS send_escalation_level SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE users_otps ADD COLUMN IF NOT EXISTS send_blocked_until TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  CREATE TYPE outbox_status_enum AS ENUM ('pending', 'sent', 'dead');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS credit_allocation_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status outbox_status_enum NOT NULL DEFAULT 'pending',
  attempts SMALLINT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Supplier bookmarking (spec 2026-11-05): one row per (user, supplier). supplier_id is the Supplier
-- Service's id, kept as a plain integer because that table lives in another service.
CREATE TABLE IF NOT EXISTS user_bookmarks (
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  supplier_id INTEGER NOT NULL CHECK (supplier_id > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, supplier_id)
);

DO $$ BEGIN
  CREATE TYPE audit_action_enum AS ENUM (
    'USER_PROMOTE', 'USER_DEMOTE', 'USER_SUSPEND', 'USER_UNSUSPEND', 'EMAIL_UNMASK', 'USER_UNLOCK'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Stage 26a: append-only audit log for high-risk admin actions (NFR3.2.2). actor_id/target_id
-- have no foreign key so that deleting a user never touches audit rows (see the trigger below).
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  actor_id UUID NOT NULL,
  action audit_action_enum NOT NULL,
  target_id UUID NOT NULL,
  before JSONB,
  after JSONB,
  reason TEXT NOT NULL,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_actor_id_idx ON admin_audit_log (actor_id);
CREATE INDEX IF NOT EXISTS admin_audit_log_target_id_idx ON admin_audit_log (target_id);
CREATE INDEX IF NOT EXISTS admin_audit_log_action_idx ON admin_audit_log (action);

CREATE OR REPLACE FUNCTION admin_audit_log_no_update_or_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION admin_audit_log_no_truncate()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS admin_audit_log_no_update_or_delete_trigger ON admin_audit_log;
CREATE TRIGGER admin_audit_log_no_update_or_delete_trigger
  BEFORE UPDATE OR DELETE ON admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION admin_audit_log_no_update_or_delete();

DROP TRIGGER IF EXISTS admin_audit_log_no_truncate_trigger ON admin_audit_log;
CREATE TRIGGER admin_audit_log_no_truncate_trigger
  BEFORE TRUNCATE ON admin_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION admin_audit_log_no_truncate();
CREATE TABLE IF NOT EXISTS last_request (
  user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  last_req_del_loc_id INTEGER CHECK (last_req_del_loc_id > 0),
  last_req_del_loc_details VARCHAR(250) NOT NULL DEFAULT 'Nil'
    CHECK (char_length(last_req_del_loc_details) >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
