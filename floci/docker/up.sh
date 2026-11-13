#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6.1 Terra), date: 2026-11-06
# Scope: Generated implementation of local Compose startup and generated AWS service configuration
# Author review: Verified Floci correctly provisions RDS and MSK containers and services use the correct environment variables.

# Secret-bearing commands must not be exposed by inherited shell tracing.
set +x
set -euo pipefail
cd "$(dirname "$0")/../.."
no_cache=0
services=()
for arg in "$@"; do
  case "$arg" in
    --no-cache) no_cache=1 ;;
    *) services+=("$arg") ;;
  esac
done
if (( no_cache )) && [[ "${SKIP_FLOCI_START:-0}" == 1 ]]; then
  echo '--no-cache requires starting Floci; unset SKIP_FLOCI_START.' >&2
  exit 2
fi

if [[ "${SKIP_FLOCI_START:-0}" != 1 ]]; then
  if (( no_cache )); then
    S3_BUCKET=bootstrap KAFKA_BROKERS=bootstrap COGNITO_USER_POOL_ID= COGNITO_CLIENT_ID= COGNITO_ISSUER= COGNITO_JWKS_URI= USER_DATABASE_URL=bootstrap ERRAND_DATABASE_URL=bootstrap CREDIT_DATABASE_URL=bootstrap SUPPLIER_DATABASE_URL=bootstrap SUPPLIER_DATABASE_PORT=7004 SUPPLIER_DATABASE_PASSWORD=bootstrap docker compose --env-file .env.development build --no-cache floci
    S3_BUCKET=bootstrap KAFKA_BROKERS=bootstrap COGNITO_USER_POOL_ID= COGNITO_CLIENT_ID= COGNITO_ISSUER= COGNITO_JWKS_URI= USER_DATABASE_URL=bootstrap ERRAND_DATABASE_URL=bootstrap CREDIT_DATABASE_URL=bootstrap SUPPLIER_DATABASE_URL=bootstrap SUPPLIER_DATABASE_PORT=7004 SUPPLIER_DATABASE_PASSWORD=bootstrap docker compose --env-file .env.development up -d --no-build floci
  else
    S3_BUCKET=bootstrap KAFKA_BROKERS=bootstrap COGNITO_USER_POOL_ID= COGNITO_CLIENT_ID= COGNITO_ISSUER= COGNITO_JWKS_URI= USER_DATABASE_URL=bootstrap ERRAND_DATABASE_URL=bootstrap CREDIT_DATABASE_URL=bootstrap SUPPLIER_DATABASE_URL=bootstrap SUPPLIER_DATABASE_PORT=7004 SUPPLIER_DATABASE_PASSWORD=bootstrap docker compose --env-file .env.development up -d --build floci
  fi
fi
for i in $(seq 1 120); do
  [[ "$(docker inspect relay-floci-1 --format '{{.State.Health.Status}}' 2>/dev/null || true)" == healthy ]] && docker exec relay-floci-1 test -s /app/data/relay-auth.env && docker exec relay-floci-1 test -s /app/data/relay-rds.env && docker exec relay-floci-1 test -s /app/data/relay-msk.env && break
  sleep 3
done
[[ "$(docker inspect relay-floci-1 --format '{{.State.Health.Status}}')" == healthy ]]
docker exec relay-floci-1 test -s /app/data/relay-auth.env
docker exec relay-floci-1 test -s /app/data/relay-rds.env
docker exec relay-floci-1 test -s /app/data/relay-msk.env

s3_bucket="$(docker exec -e AWS_ENDPOINT_URL=http://127.0.0.1:4566 \
  -e AWS_DEFAULT_REGION=us-east-1 -e AWS_ACCESS_KEY_ID=test -e AWS_SECRET_ACCESS_KEY=test \
  relay-floci-1 aws cloudformation describe-stacks --stack-name relay-local-storage \
  --query 'Stacks[0].Outputs[?OutputKey==`BucketName`].OutputValue' --output text)"
[[ -n "$s3_bucket" && "$s3_bucket" != None ]]
auth_output="$(docker exec relay-floci-1 cat /app/data/relay-auth.env)"
pool_id="$(printf '%s\n' "$auth_output" | sed -n 's/^COGNITO_USER_POOL_ID=//p')"
client_id="$(printf '%s\n' "$auth_output" | sed -n 's/^COGNITO_CLIENT_ID=//p')"
[[ -n "$pool_id" && -n "$client_id" ]]
msk_output="$(docker exec relay-floci-1 cat /app/data/relay-msk.env)"
msk_brokers="$(printf '%s\n' "$msk_output" | sed -n 's/^MSK_BROKERS=//p')"
[[ -n "$msk_brokers" ]]
# Floci returns the broker's Docker-network listener. Source processes need
# Redpanda's separately published host listener, whose port is assigned by Docker.
broker_ip="${msk_brokers%%:*}"
broker_container=""
for candidate in $(docker ps --filter name=floci-aws-msk --format '{{.Names}}'); do
  candidate_ip="$(docker inspect "$candidate" --format '{{with index .NetworkSettings.Networks "relay_default"}}{{.IPAddress}}{{end}}')"
  if [[ "$candidate_ip" == "$broker_ip" ]]; then broker_container="$candidate"; break; fi
done
[[ -n "$broker_container" ]] || { echo "Could not find Floci MSK broker at $broker_ip" >&2; exit 1; }
host_port="$(docker port "$broker_container" 9093/tcp | head -1 | sed 's/.*://')"
[[ "$host_port" =~ ^[0-9]+$ ]] || { echo "Floci MSK host listener is not published" >&2; exit 1; }
msk_brokers_host="localhost:$host_port"
printf 'Floci MSK endpoints: source processes=%s, Compose=%s\n' "$msk_brokers_host" "$msk_brokers"
msk_brokers="${msk_brokers//localhost:/host.docker.internal:}"
rds_output="$(docker exec relay-floci-1 cat /app/data/relay-rds.env)"
rds_value() { printf '%s\n' "$rds_output" | sed -n "s/^$1=//p"; }
user_port="$(rds_value USER_DATABASE_PORT)"
user_password="$(rds_value USER_DATABASE_PASSWORD)"
errand_port="$(rds_value ERRAND_DATABASE_PORT)"
errand_password="$(rds_value ERRAND_DATABASE_PASSWORD)"
credit_port="$(rds_value CREDIT_DATABASE_PORT)"
credit_password="$(rds_value CREDIT_DATABASE_PASSWORD)"
supplier_port="$(rds_value SUPPLIER_DATABASE_PORT)"
supplier_password="$(rds_value SUPPLIER_DATABASE_PASSWORD)"
for port in "$user_port" "$errand_port" "$credit_port" "$supplier_port"; do
  [[ "$port" =~ ^[0-9]+$ ]]
done
for password in "$user_password" "$errand_password" "$credit_password" "$supplier_password"; do
  [[ -n "$password" ]]
done
printf 'COGNITO_USER_POOL_ID=%s\nCOGNITO_CLIENT_ID=%s\nCOGNITO_ISSUER=http://localhost:4566/%s\nCOGNITO_JWKS_URI=http://floci:4566/%s/.well-known/jwks.json\nUSER_DATABASE_URL=postgresql://relay:%s@floci:%s/relay?schema=public\nERRAND_DATABASE_URL=postgresql://relay:%s@floci:%s/relayerrand?schema=public\nCREDIT_DATABASE_URL=postgresql://relay:%s@floci:%s/relay?schema=public\nSUPPLIER_DATABASE_URL=postgresql://relay:%s@floci:%s/relay\nSUPPLIER_DATABASE_PORT=%s\nSUPPLIER_DATABASE_PASSWORD=%s\nUSER_DATABASE_URL_HOST=postgresql://relay:%s@localhost:%s/relay?schema=public\nERRAND_DATABASE_URL_HOST=postgresql://relay:%s@localhost:%s/relayerrand?schema=public\nCREDIT_DATABASE_URL_HOST=postgresql://relay:%s@localhost:%s/relay?schema=public\nSUPPLIER_DATABASE_URL_HOST=postgresql://relay:%s@localhost:%s/relay\n' \
  "$pool_id" "$client_id" "$pool_id" "$pool_id" \
  "$user_password" "$user_port" "$errand_password" "$errand_port" \
  "$credit_password" "$credit_port" "$supplier_password" "$supplier_port" \
  "$supplier_port" "$supplier_password" \
  "$user_password" "$user_port" "$errand_password" "$errand_port" \
  "$credit_password" "$credit_port" "$supplier_password" "$supplier_port" >floci/docker/.generated.env
printf 'KAFKA_BROKERS=%s\nKAFKA_BROKERS_HOST=%s\n' "$msk_brokers" "$msk_brokers_host" >>floci/docker/.generated.env
printf 'S3_BUCKET=%s\n' "$s3_bucket" >>floci/docker/.generated.env

compose_env=(--env-file .env.development)
if [[ -f .env ]]; then
  compose_env=(--env-file .env "${compose_env[@]}")
fi
compose_env+=(--env-file floci/docker/.generated.env)
compose_up=(up -d)
if (( no_cache )); then compose_up+=(--no-build); fi
# Bash 3.2 treats an empty array as unset under nounset; expand only when nonempty.
if (( ${#services[@]} > 0 )); then compose_up+=("${services[@]}"); fi
if (( no_cache )); then
  # Floci was built before generating these endpoints. Rebuild application
  # images separately so Compose does not recreate Floci with stale endpoints.
  app_build_services=(kafka-init host supplier-frontend user-frontend errand-frontend credit-frontend supplier-schema supplier-api user-api user-event-publisher errand-event-publisher user-auth-api errand-api credit-api credit-estimation-api errand-notification)
  docker compose "${compose_env[@]}" build --no-cache "${app_build_services[@]}"
else
  docker compose "${compose_env[@]}" build kafka-init
fi
docker compose "${compose_env[@]}" "${compose_up[@]}"
if (( ${#services[@]} == 0 )); then
  docker compose "${compose_env[@]}" up -d --no-deps --force-recreate --wait --wait-timeout 90 host
fi
