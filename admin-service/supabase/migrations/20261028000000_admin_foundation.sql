-- AI Assistance Disclosure:
-- Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28
-- Scope: Wrote the migration establishing the Admin schema and runtime role.
-- Author review: I validated correctness and supplied additional boundary checks.

-- Foundation establishes ownership only. Dispute and audit tables and their grants
-- belong to later migrations.
BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'admin_service_app') THEN
        CREATE ROLE admin_service_app NOLOGIN NOINHERIT;
    END IF;
END
$$;

CREATE SCHEMA admin_service;
REVOKE ALL ON SCHEMA admin_service FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA admin_service TO admin_service_app;

COMMIT;
