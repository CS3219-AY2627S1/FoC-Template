#!/bin/sh
# AI Assistance Disclosure: Claude Code (Claude Opus 5.5), 2026-10-16. Scope: creates the
# migration-owner and app roles on a fresh Credit Service database, following the User
# Service pattern (implementation-proposal.md §4). Reviewed and approved by @phuc
#
# Postgres runs this once, only when the credit-db volume is first created.
# The superuser (POSTGRES_USER) is used only here; no service connects as it.
set -eu

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${CREDIT_DB_MIGRATION_PASSWORD:?CREDIT_DB_MIGRATION_PASSWORD is required}"
: "${CREDIT_DB_APP_PASSWORD:?CREDIT_DB_APP_PASSWORD is required}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=migration_password="$CREDIT_DB_MIGRATION_PASSWORD" \
  --set=app_password="$CREDIT_DB_APP_PASSWORD" <<'SQL'
-- credit_migrator: owns the database and schema, so it creates and changes tables
CREATE ROLE credit_migrator LOGIN PASSWORD :'migration_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
-- credit_app: what the running service uses; gets row access per table in each migration
CREATE ROLE credit_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;

SELECT format('ALTER DATABASE %I OWNER TO credit_migrator', current_database())
\gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database())
\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO credit_app', current_database())
\gexec

ALTER SCHEMA public OWNER TO credit_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO credit_app;
SQL
