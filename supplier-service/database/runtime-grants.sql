-- AI Assistance Disclosure:
-- Tool: Codex (model: GPT-6), date: 2026-09-28 to 2026-09-29
-- Scope: Writing implementation code — grant runtime access for supplier and assignment rows and read access for categories and revision state.
-- Author review: Keith confirmed review of all affected changes.
-- Details: ../ai/usage-log.md; ai-20260929-001

-- Run as supplier_migrator after upgrade head (also after downgrade/re-upgrade).
\set ON_ERROR_STOP on
BEGIN;
GRANT SELECT, INSERT, UPDATE, DELETE ON supplier, supplier_category TO supplier_runtime;
GRANT SELECT ON category, alembic_version TO supplier_runtime;
COMMIT;
