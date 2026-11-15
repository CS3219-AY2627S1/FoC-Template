#!/bin/sh
# AI Assistance Disclosure: Claude Code (Claude Opus 5.5), 2026-10-09. Scope: creates the
# author's two least-privilege database roles (migration owner, app) on a fresh User
# Service database. Author review: Reviewed and approved by @t-leongchuan
#
# Postgres runs this once, only when the user-db volume is first created.
# The superuser (POSTGRES_USER) is used only here; no service connects as it.
set -eu

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${USER_DB_MIGRATION_PASSWORD:?USER_DB_MIGRATION_PASSWORD is required}"
: "${USER_DB_APP_PASSWORD:?USER_DB_APP_PASSWORD is required}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=migration_password="$USER_DB_MIGRATION_PASSWORD" \
  --set=app_password="$USER_DB_APP_PASSWORD" <<'SQL'
-- user_migrator: owns the database and schema, so it creates and changes tables
CREATE ROLE user_migrator LOGIN PASSWORD :'migration_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
-- user_app: what the running service uses; gets row access per table in each migration
CREATE ROLE user_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;

SELECT format('ALTER DATABASE %I OWNER TO user_migrator', current_database())
\gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database())
\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO user_app', current_database())
\gexec

ALTER SCHEMA public OWNER TO user_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO user_app;
SQL
