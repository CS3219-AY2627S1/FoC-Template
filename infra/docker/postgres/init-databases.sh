#!/bin/sh
set -eu

for database in foc_user foc_supplier foc_order foc_credit; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
SELECT format('CREATE DATABASE %I OWNER %I', '${database}', current_user)
WHERE NOT EXISTS (
    SELECT FROM pg_database
    WHERE datname = '${database}'
)
\\gexec
SQL
done
