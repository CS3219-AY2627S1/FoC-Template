#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: OpenAI Codex (GPT-5), date: 2026-10-08
# Mode: CI deployment update.
# Scope: Limited Firestore runtime configuration to services that use Firestore.
# Author review: I reviewed for correctness.

# Deploys services at one image tag to one environment on Cloud Run.
#
# Usage: scripts/ci/deploy.sh <staging|production> <image-tag> [service ...]
#   Default services: every deployable service (scripts/ci/list-services.sh).
#
# Per service (all files optional, see docs/ci-cd.md):
#   <service>/deploy/service.conf    bash: HEALTH_PATH, EXTRA_FLAGS=( ... ), INGRESS, VPC_EGRESS, GATEWAY_PATH
#   <service>/deploy/env.yaml        Cloud Run env vars; ${VARS} rendered with envsubst
#   <service>/deploy/pre-deploy.sh   hook run before deploying (e.g. upload seed files)
#
# Network isolation: only the gateway accepts traffic from the internet. Every other service has
# internal ingress, so it can only be reached from the project's VPC (the gateway and services that
# call peers send their traffic through it with Direct VPC egress) and from Pub/Sub push.
#
# Safe rollout: an existing service gets the new revision with no traffic. Cloud Run only marks it
# ready once its HTTP startup probe on HEALTH_PATH passes (the gateway's tagged URL is also checked
# from here, as it is public), and only then does it receive 100% of traffic. If the revision never
# becomes healthy, that service keeps its previous revision and the others still roll out; the
# script exits non-zero at the end, naming what wasn't deployed. After the rollout, every deployed
# service is smoke-tested through the public gateway.
set -euo pipefail

(( BASH_VERSINFO[0] >= 4 )) || { echo "deploy.sh needs bash >= 4 (macOS: brew install bash)" >&2; exit 2; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

ENVIRONMENT=${1:?environment (staging|production) required}
IMAGE_TAG=${2:?image tag required}
shift 2

[[ -f "infra/environments/$ENVIRONMENT.env" ]] || { echo "unknown environment: $ENVIRONMENT" >&2; exit 2; }

set -a
# shellcheck source=SCRIPTDIR/../../infra/gcp/project.env
source infra/gcp/project.env
# shellcheck source=/dev/null
source "infra/environments/$ENVIRONMENT.env"
set +a

REGISTRY="$REGION-docker.pkg.dev/$PROJECT_ID/$AR_REPO"
REVISION_TAG="sha-${IMAGE_TAG:0:7}"

if [[ $# -gt 0 ]]; then
  services=("$@")
else
  mapfile -t services < <(scripts/ci/list-services.sh)
fi

# Cloud Run URLs are deterministic, so every service can be told where the others live
# before they are deployed: SUPPLIER_SERVICE_URL, FRONTEND_URL, ...
service_url() { echo "https://$1-$ENVIRONMENT-$PROJECT_NUMBER.$REGION.run.app"; }
for dir in */; do
  dir=${dir%/}
  [[ -f "$dir/Dockerfile" ]] || continue
  var="$(tr '[:lower:]-' '[:upper:]_' <<<"$dir")_URL"
  export "$var=$(service_url "$dir")"
done

is_backend() { [[ $1 != frontend && $1 != gateway ]]; }

# Path that proves a service answers through the gateway: GATEWAY_PATH from its service.conf, else
# its public OpenAPI document (/api/<name>s/v3/api-docs) for backends, the frontend's health page,
# and the gateway's own health check.
gateway_path() (
  local svc=$1 GATEWAY_PATH=""
  # shellcheck source=/dev/null
  [[ -f "$svc/deploy/service.conf" ]] && source "$svc/deploy/service.conf"
  if [[ -n $GATEWAY_PATH ]]; then
    echo "$GATEWAY_PATH"
  else
    case $svc in
      gateway) echo /gateway/health ;;
      frontend) echo /health ;;
      *) echo "/api/${svc%-service}s/v3/api-docs" ;;
    esac
  fi
)

# When rolling out Order's private protocol, protect the public boundary first
# and update providers before the Order producer. Other rollout ordering is retained.
ordered=()
order_slice=false
for svc in "${services[@]}"; do [[ $svc != order-service ]] || order_slice=true; done
if $order_slice; then
  for first in gateway user-service supplier-service credit-service; do
    for svc in "${services[@]}"; do [[ $svc != "$first" ]] || ordered+=("$svc"); done
  done
fi
for svc in "${services[@]}"; do
  is_backend "$svc" || continue
  if $order_slice && [[ $svc == user-service || $svc == supplier-service || $svc == credit-service ]]; then continue; fi
  ordered+=("$svc")
done
for svc in frontend gateway; do
  if $order_slice && [[ $svc == gateway ]]; then continue; fi
  for s in "${services[@]}"; do [[ $s == "$svc" ]] && ordered+=("$svc"); done
done

render_env_file() {
  local svc=$1 out=$2
  : >"$out"
  [[ -f "$svc/deploy/env.yaml" ]] && envsubst <"$svc/deploy/env.yaml" >"$out"

  # Standard runtime contract for backend services (AGENTS.md); a service's env.yaml wins.
  if is_backend "$svc"; then
    local -A defaults=(
      [ENVIRONMENT]="$ENVIRONMENT"
      [LOG_LEVEL]="${LOG_LEVEL:-INFO}"
      # JSON logs with a top-level "severity", which Cloud Logging reads as the entry's level (ECS nests
      # it under log.level, so every entry showed as DEFAULT and severity filters didn't work).
      [LOGGING_STRUCTURED_FORMAT_CONSOLE]="logstash"
      [LOGGING_STRUCTURED_JSON_RENAME_LEVEL]="severity"
      [LOGGING_STRUCTURED_JSON_EXCLUDE]="@version,level_value"
      [FIREBASE_AUTH_PROJECT_ID]="$FIREBASE_AUTH_PROJECT_ID"
      [USER_SERVICE_MODE]="$USER_SERVICE_MODE"
      [USER_SERVICE_URL]="${USER_SERVICE_URL:-}"
      [MOCK_ADMIN_EMAILS]="$MOCK_ADMIN_EMAILS"
      [CORS_ORIGINS]="$(service_url gateway)"
    )
    if scripts/ci/list-services.sh --firestore | grep -qx "$svc"; then
      local name=${svc%-service}
      defaults[FIRESTORE_PROJECT_ID]="$FIRESTORE_PROJECT_ID"
      defaults[FIRESTORE_DATABASE_ID]="$name-$ENVIRONMENT"
    fi
    local key
    for key in "${!defaults[@]}"; do
      grep -q "^$key:" "$out" || printf '%s: "%s"\n' "$key" "${defaults[$key]}" >>"$out"
    done
  fi
  [[ -s $out ]] || printf 'ENVIRONMENT: "%s"\n' "$ENVIRONMENT" >"$out"
}

deploy_service() {
  local svc=$1
  local name="$svc-$ENVIRONMENT"
  local image="$REGISTRY/$svc:$IMAGE_TAG"
  local HEALTH_PATH=/actuator/health
  local EXTRA_FLAGS=()
  # Only the gateway is public; services that call other services set VPC_EGRESS=all-traffic.
  local INGRESS=internal VPC_EGRESS=""
  [[ $svc == gateway ]] && INGRESS=all
  # shellcheck source=/dev/null
  [[ -f "$svc/deploy/service.conf" ]] && source "$svc/deploy/service.conf"

  local network=()
  if [[ -n $VPC_EGRESS ]]; then
    network=(--network "$VPC_NETWORK" --subnet "$VPC_SUBNET" --vpc-egress "$VPC_EGRESS")
  fi
  # Cloud Run only marks the revision ready once HEALTH_PATH answers, unless the service sets its own probe.
  local probe=()
  if [[ " ${EXTRA_FLAGS[*]} " != *" --startup-probe="* ]]; then
    probe=(--startup-probe "httpGet.path=$HEALTH_PATH,initialDelaySeconds=5,periodSeconds=5,failureThreshold=24,timeoutSeconds=3")
  fi

  if [[ -x "$svc/deploy/pre-deploy.sh" ]]; then
    ENVIRONMENT=$ENVIRONMENT "$svc/deploy/pre-deploy.sh"
  fi

  local env_file
  env_file=$(mktemp)
  render_env_file "$svc" "$env_file"

  # Never fall back to the project's default identity: it is over-privileged and cannot
  # reach the service's own databases. scripts/ci/check-infra.sh catches this earlier.
  local sa="foc-$svc@$PROJECT_ID.iam.gserviceaccount.com"
  if ! gcloud iam service-accounts describe "$sa" --project "$PROJECT_ID" >/dev/null 2>&1; then
    echo "::error title=Missing runtime identity::$sa does not exist. Ask the CI/CD owner to run infra/gcp/bootstrap.sh."
    return 1
  fi
  local identity=(--service-account "$sa")

  local existing=false rollout=()
  if gcloud run services describe "$name" --project "$PROJECT_ID" --region "$REGION" >/dev/null 2>&1; then
    existing=true
    rollout=(--no-traffic --tag "$REVISION_TAG")
  fi

  gcloud run deploy "$name" \
    --project "$PROJECT_ID" --region "$REGION" --platform managed \
    --image "$image" --port 8080 --allow-unauthenticated --ingress "$INGRESS" \
    --env-vars-file "$env_file" \
    --labels "app=foc,service=$svc,environment=$ENVIRONMENT,commit=${IMAGE_TAG:0:40}" \
    "${identity[@]}" "${rollout[@]}" ${network[@]+"${network[@]}"} ${probe[@]+"${probe[@]}"} \
    "${EXTRA_FLAGS[@]}" --quiet
  rm -f "$env_file"

  # Internal services can't be reached from this runner. `gcloud run deploy` has already waited
  # for the startup probe on HEALTH_PATH, so the new revision is healthy.
  if [[ $INGRESS != all ]]; then
    if $existing; then
      gcloud run services update-traffic "$name" --project "$PROJECT_ID" --region "$REGION" --to-latest --quiet
      gcloud run services update-traffic "$name" --project "$PROJECT_ID" --region "$REGION" --remove-tags "$REVISION_TAG" --quiet
    fi
    echo "$name passed its startup probe on $HEALTH_PATH and is serving $IMAGE_TAG (internal ingress)"
    return 0
  fi

  local url
  if $existing; then
    url=$(gcloud run services describe "$name" --project "$PROJECT_ID" --region "$REGION" --format json |
      jq -r --arg tag "$REVISION_TAG" '.status.traffic[] | select(.tag == $tag) | .url')
  else
    url=$(gcloud run services describe "$name" --project "$PROJECT_ID" --region "$REGION" --format 'value(status.url)')
  fi

  echo "Smoke test: $url$HEALTH_PATH"
  local attempt
  for attempt in $(seq 1 12); do
    if curl -fsS --max-time 10 "$url$HEALTH_PATH" >/dev/null; then
      if $existing; then
        gcloud run services update-traffic "$name" --project "$PROJECT_ID" --region "$REGION" --to-latest --quiet
        gcloud run services update-traffic "$name" --project "$PROJECT_ID" --region "$REGION" --remove-tags "$REVISION_TAG" --quiet
      fi
      echo "$name is healthy and serving $IMAGE_TAG"
      return 0
    fi
    echo "  not healthy yet (attempt $attempt/12)"
    sleep 5
  done

  echo "::error title=Deploy failed::$name did not become healthy; traffic stays on the previous revision."
  return 1
}

# One service failing doesn't hold back the others: it keeps its previous revision, the rest still
# roll out, and the script fails at the end. The exception is Order, which must not run ahead of the
# gateway and the providers deployed before it (see the ordering above).
order_prerequisites=" gateway user-service supplier-service credit-service "
deployed=()
not_deployed=()
for svc in "${ordered[@]}"; do
  if [[ $svc == order-service ]]; then
    blocked=()
    for prev in ${not_deployed[@]+"${not_deployed[@]}"}; do
      [[ $order_prerequisites != *" $prev "* ]] || blocked+=("$prev")
    done
    if [[ ${#blocked[@]} -gt 0 ]]; then
      echo "::error title=Deploy skipped::$svc-$ENVIRONMENT was not deployed because ${blocked[*]} failed; it keeps its previous revision."
      not_deployed+=("$svc")
      continue
    fi
  fi

  echo "::group::Deploy $svc-$ENVIRONMENT ($REGISTRY/$svc:$IMAGE_TAG)"
  # A subshell, so a failing step ends this service only. Bash ignores errexit inside a function
  # called from a condition (`if deploy_service`, `deploy_service ||`), so check $? afterwards instead.
  set +e
  (set -e; deploy_service "$svc")
  status=$?
  set -e
  echo "::endgroup::"
  if [[ $status -eq 0 ]]; then
    deployed+=("$svc")
  else
    echo "::error title=Deploy failed::$svc-$ENVIRONMENT was not deployed; traffic stays on the previous revision."
    not_deployed+=("$svc")
    # The failed revision would keep its rollout tag; drop it so failed revisions don't pile up in
    # the traffic list. Best effort: the tag doesn't exist if the deploy failed before creating one.
    gcloud run services update-traffic "$svc-$ENVIRONMENT" --project "$PROJECT_ID" --region "$REGION" \
      --remove-tags "$REVISION_TAG" --quiet >/dev/null 2>&1 || true
  fi
done

# Every deployed service must answer through the public gateway, the only way in from outside.
gateway_url=$(service_url gateway)
smoke_failed=()
if [[ ${#deployed[@]} -gt 0 ]]; then
  echo "::group::Smoke test through $gateway_url"
  for svc in "${deployed[@]}"; do
    path=$(gateway_path "$svc")
    # Retries cover cold starts: one request through the gateway may wake two instances.
    if curl -fsS --max-time 60 --retry 5 --retry-all-errors --retry-delay 5 -o /dev/null "$gateway_url$path"; then
      echo "  ✓ $svc: $path"
    else
      echo "  ✗ $svc: $path"
      smoke_failed+=("$svc")
    fi
  done
  echo "::endgroup::"
fi
[[ -n ${GITHUB_OUTPUT:-} ]] && echo "url=$gateway_url" >>"$GITHUB_OUTPUT"

if [[ ${#smoke_failed[@]} -gt 0 ]]; then
  echo "::error title=Smoke test failed::Not reachable through the gateway: ${smoke_failed[*]}. See docs/ci-cd.md \"Rollback\"."
  exit 1
fi

# Record what each environment runs, so production can promote exactly what staging tested. A service
# that wasn't deployed keeps the tag of the revision still serving.
for svc in ${deployed[@]+"${deployed[@]}"}; do
  gcloud artifacts docker tags add "$REGISTRY/$svc:$IMAGE_TAG" "$REGISTRY/$svc:$ENVIRONMENT" --quiet
done

echo "Deployed ${#deployed[@]} of ${#ordered[@]} service(s) to $ENVIRONMENT at $IMAGE_TAG: $gateway_url"
if [[ ${#not_deployed[@]} -gt 0 ]]; then
  echo "::error title=Partly deployed::Not deployed (previous revision still serving): ${not_deployed[*]}. Fix it and re-run the job."
  exit 1
fi
exit 0
