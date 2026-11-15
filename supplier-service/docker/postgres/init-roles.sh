#!/bin/sh
# AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25. Scope: initialized isolated Supplier migration and runtime PostgreSQL roles for clean Compose databases. Author review: Reviewed and approved by @ron.
set -eu

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${SUPPLIER_DB_MIGRATION_USER:?SUPPLIER_DB_MIGRATION_USER is required}"
: "${SUPPLIER_DB_MIGRATION_PASSWORD:?SUPPLIER_DB_MIGRATION_PASSWORD is required}"
: "${SUPPLIER_DB_USER:?SUPPLIER_DB_USER is required}"
: "${SUPPLIER_DB_PASSWORD:?SUPPLIER_DB_PASSWORD is required}"

validate_role() {
  role=$1
  label=$2
  case "$role" in
    "" | [0-9]* | *[!A-Za-z0-9_]*)
      echo "$label must be a PostgreSQL identifier." >&2
      exit 1
      ;;
  esac
  if [ "${#role}" -gt 63 ]; then
    echo "$label must be at most 63 characters." >&2
    exit 1
  fi
}

validate_role "$SUPPLIER_DB_MIGRATION_USER" SUPPLIER_DB_MIGRATION_USER
validate_role "$SUPPLIER_DB_USER" SUPPLIER_DB_USER

if [ "$POSTGRES_USER" = "$SUPPLIER_DB_MIGRATION_USER" ] || \
  [ "$POSTGRES_USER" = "$SUPPLIER_DB_USER" ] || \
  [ "$SUPPLIER_DB_MIGRATION_USER" = "$SUPPLIER_DB_USER" ]; then
  echo "Supplier bootstrap, migration, and runtime database roles must be distinct." >&2
  exit 1
fi

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=migration_user="$SUPPLIER_DB_MIGRATION_USER" \
  --set=migration_password="$SUPPLIER_DB_MIGRATION_PASSWORD" \
  --set=runtime_user="$SUPPLIER_DB_USER" \
  --set=runtime_password="$SUPPLIER_DB_PASSWORD" <<'SQL'
SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT',
  :'migration_user',
  :'migration_password'
)
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'migration_user')
\gexec

SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT',
  :'runtime_user',
  :'runtime_password'
)
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'runtime_user')
\gexec

SELECT format('ALTER DATABASE %I OWNER TO %I', current_database(), :'migration_user')
\gexec
SELECT format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM PUBLIC', current_database())
\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'migration_user')
\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'runtime_user')
\gexec

SELECT format('ALTER SCHEMA public OWNER TO %I', :'migration_user')
\gexec
REVOKE ALL ON SCHEMA public FROM PUBLIC;
SELECT format('GRANT ALL ON SCHEMA public TO %I', :'migration_user')
\gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'runtime_user')
\gexec
SQL
