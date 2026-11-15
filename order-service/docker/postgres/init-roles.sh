#!/bin/sh
# AI Assistance Disclosure: Claude Code (Claude Opus 5.5), 2026-10-16. Scope: creates the two
# least-privilege database roles (migration owner, app) on a fresh Order Service database,
# copied from user-service/docker/postgres/init-roles.sh. Author review: Reviewed and approved by @mattis.
#
# Postgres runs this once, only when the order-db volume is first created.
# The superuser (POSTGRES_USER) is used only here; no service connects as it.
set -eu

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${ORDER_DB_MIGRATION_PASSWORD:?ORDER_DB_MIGRATION_PASSWORD is required}"
: "${ORDER_DB_APP_PASSWORD:?ORDER_DB_APP_PASSWORD is required}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=migration_password="$ORDER_DB_MIGRATION_PASSWORD" \
  --set=app_password="$ORDER_DB_APP_PASSWORD" <<'SQL'
-- order_migrator: owns the database and schema, so it creates and changes tables
CREATE ROLE order_migrator LOGIN PASSWORD :'migration_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
-- order_app: what the running service uses; gets row access per table in each migration
CREATE ROLE order_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;

SELECT format('ALTER DATABASE %I OWNER TO order_migrator', current_database())
\gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database())
\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO order_app', current_database())
\gexec

ALTER SCHEMA public OWNER TO order_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO order_app;
SQL
