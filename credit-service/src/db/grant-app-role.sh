#!/bin/bash
# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-opus-5), date: 2026-10-16
#  2026-10-16: Week 7/8 catch-up - creates the least-privilege application role and
#    applies grants.sql, implementing NFR8.2.3 (credit-service-context.md §5).
#    Runs inside the postgres image's docker-entrypoint-initdb.d, after 01-init.sql.
#    No requirements, architecture, schema, or API decisions were made by the AI tool.
#    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
set -euo pipefail

# Supplied by compose. The password never appears in a committed file.
: "${CREDIT_APP_USER:?CREDIT_APP_USER must be set for the credit-service app role}"
: "${CREDIT_APP_PASSWORD:?CREDIT_APP_PASSWORD must be set for the credit-service app role}"

# The grant matrix hardcodes the role name `credit_app`; refuse rather than silently
# granting to a role the grants will not match.
if [ "${CREDIT_APP_USER}" != "credit_app" ]; then
  echo "CREDIT_APP_USER must be 'credit_app' (grants.sql grants to that role)" >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}" <<EOSQL
DO \$\$ BEGIN
  CREATE ROLE ${CREDIT_APP_USER} LOGIN PASSWORD '${CREDIT_APP_PASSWORD}';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END \$\$;
EOSQL

# Tables stay owned by POSTGRES_USER; the app role only ever receives grants.
# grants.sql is mounted outside docker-entrypoint-initdb.d on purpose: anything ending
# in .sql in that directory is executed automatically, and it must run after the role
# exists, not in filename order.
psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}" \
  -f /opt/credit-service/grants.sql

echo "credit-service: least-privilege role ${CREDIT_APP_USER} created and granted"
