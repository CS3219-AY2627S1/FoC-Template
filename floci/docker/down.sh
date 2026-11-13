#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6.1 Terra), date: 2026-11-06
# Scope: Generated implementation of local Compose teardown and Floci sidecar cleanup
# Author review: Verified that all containers, including RDS and MSK containers created by Floci, are removed.

set -euo pipefail
cd "$(dirname "$0")/../.."
source floci/common/cleanup.sh

# Stop application and optional UI containers, then remove Floci's RDS
# sidecars before Compose removes their shared network.
remove_floci_sidecars relay_default
compose_env=(--env-file .env.development)
if [[ -f .env ]]; then compose_env=(--env-file .env "${compose_env[@]}"); fi
if [[ -s floci/docker/.generated.env ]]; then
  compose_env+=(--env-file floci/docker/.generated.env)
else
  export S3_BUCKET=bootstrap KAFKA_BROKERS=bootstrap
  export USER_DATABASE_URL=bootstrap ERRAND_DATABASE_URL=bootstrap
  export CREDIT_DATABASE_URL=bootstrap SUPPLIER_DATABASE_URL=bootstrap
  export SUPPLIER_DATABASE_PORT=7004 SUPPLIER_DATABASE_PASSWORD=bootstrap
  export COGNITO_USER_POOL_ID=bootstrap COGNITO_CLIENT_ID=bootstrap
  export COGNITO_ISSUER=bootstrap COGNITO_JWKS_URI=bootstrap
fi
docker compose "${compose_env[@]}" --profile ui down --volumes --remove-orphans
rm -f floci/docker/.generated.env
printf 'Local Compose environment removed.\n'