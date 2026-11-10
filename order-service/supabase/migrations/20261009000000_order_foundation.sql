-- AI Assistance Disclosure:
-- Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09
-- Scope: Implemented the Order foundation SQL migration and runtime grants.
-- Author review: I validated correctness and added boundary checks where needed.

-- F0 establishes ownership only. Business tables and their grants belong to F1.
BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'order_service_app') THEN
        CREATE ROLE order_service_app NOLOGIN NOINHERIT;
    END IF;
END
$$;

CREATE SCHEMA order_service;
REVOKE ALL ON SCHEMA order_service FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA order_service TO order_service_app;

COMMIT;
