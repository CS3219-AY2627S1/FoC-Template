-- AI Assistance Disclosure:
-- Tool: Codex (model: GPT-6), date: 2026-09-28 to 2026-09-29
-- Scope: Writing implementation code — provision PostGIS and migration/runtime roles with separated schema privileges.
-- Author review: Keith confirmed review of all affected changes.
-- Details: ../ai/usage-log.md; ai-20260929-001

-- Run as the database administrator against the supplier database only.
-- Passwords are read from the psql process environment, never committed.
\set ON_ERROR_STOP on
\getenv migration_password SUPPLIER_MIGRATION_PASSWORD
\getenv runtime_password SUPPLIER_RUNTIME_PASSWORD
BEGIN;
CREATE EXTENSION IF NOT EXISTS postgis;
SELECT 'CREATE ROLE supplier_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supplier_migrator') \gexec
SELECT 'CREATE ROLE supplier_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supplier_runtime') \gexec
ALTER ROLE supplier_migrator PASSWORD :'migration_password';
ALTER ROLE supplier_runtime PASSWORD :'runtime_password';
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SELECT format('REVOKE CREATE, TEMPORARY ON DATABASE %I FROM PUBLIC', current_database()) \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO supplier_migrator, supplier_runtime', current_database()) \gexec
GRANT USAGE, CREATE ON SCHEMA public TO supplier_migrator;
GRANT USAGE ON SCHEMA public TO supplier_runtime;
COMMIT;
