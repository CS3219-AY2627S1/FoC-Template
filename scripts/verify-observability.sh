#!/usr/bin/env bash

set -euo pipefail

grafana_url="${GRAFANA_URL:-http://127.0.0.1:3001}"
loki_url="${LOKI_URL:-http://127.0.0.1:3100}"
grafana_user="${GRAFANA_ADMIN_USER:-admin}"
check_interval_seconds="${OBSERVABILITY_CHECK_INTERVAL_SECONDS:-5}"
check_timeout_seconds="${OBSERVABILITY_CHECK_TIMEOUT_SECONDS:-90}"
require_backend_logs="${OBSERVABILITY_REQUIRE_BACKEND_LOGS:-true}"

if [[ -z "${GRAFANA_ADMIN_PASSWORD:-}" ]]; then
  printf 'GRAFANA_ADMIN_PASSWORD must be set\n' >&2
  exit 1
fi

for command_name in curl jq; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf '%s is required\n' "$command_name" >&2
    exit 1
  fi
done

request() {
  curl --fail --silent --show-error --retry 2 --retry-delay 1 "$@"
}

wait_until() {
  local description="$1"
  shift
  local deadline=$(( $(date +%s) + check_timeout_seconds ))

  while ! "$@" >/dev/null 2>&1; do
    if (( $(date +%s) >= deadline )); then
      printf 'FAIL %s\n' "$description" >&2
      exit 1
    fi
    sleep "$check_interval_seconds"
  done

  printf 'PASS %s\n' "$description"
}

check_loki_ready() {
  [[ "$(request "$loki_url/ready")" == "ready" ]]
}

check_grafana_health() {
  local health
  health="$(request "$grafana_url/api/health")"
  jq -e '.database == "ok" and (.version | type == "string")' <<<"$health" >/dev/null
}

grafana_auth=(-u "${grafana_user}:${GRAFANA_ADMIN_PASSWORD}")

check_dashboard() {
  local dashboards
  dashboards="$(request "${grafana_auth[@]}" "$grafana_url/api/search?query=FoC")"
  jq -e 'any(.[]?; .uid == "foc-backend-logs" and .type == "dash-db")' <<<"$dashboards" >/dev/null
}

alert_rules=""
check_alert_rules() {
  local expected_uid
  alert_rules="$(request "${grafana_auth[@]}" "$grafana_url/api/v1/provisioning/alert-rules")"

  for expected_uid in \
    foc-order-worker-heartbeat \
    foc-credit-worker-heartbeat \
    foc-notification-worker-heartbeat \
    foc-backend-delivery-failure \
    foc-backend-readiness-failure \
    foc-backend-relay-failure \
    foc-backend-api-server-error \
    foc-collector-delivery-failure; do
    jq -e --arg expected_uid "$expected_uid" \
      'any(.[]?; .uid == $expected_uid and .provenance == "file")' \
      <<<"$alert_rules" >/dev/null
  done
}

check_loki_labels() {
  local labels
  labels="$(request "$loki_url/loki/api/v1/labels")"

  for expected_label in source service component environment level; do
    jq -e --arg expected_label "$expected_label" \
      '(.data // .) | index($expected_label) != null' <<<"$labels" >/dev/null
  done
}

check_backend_log_ingestion() {
  local end_seconds start_ns end_ns logs
  end_seconds="$(date +%s)"
  start_ns=$(( (end_seconds - 300) * 1000000000 ))
  end_ns=$(( end_seconds * 1000000000 ))
  logs="$(request -G "$loki_url/loki/api/v1/query_range" \
    --data-urlencode 'query={source="foc-backend"}' \
    --data-urlencode "start=${start_ns}" \
    --data-urlencode "end=${end_ns}" \
    --data-urlencode 'limit=1')"
  jq -e '[.data.result[]?.values[]?] | length > 0' <<<"$logs" >/dev/null
}

wait_until "Loki readiness" check_loki_ready
wait_until "Grafana health" check_grafana_health
wait_until "FoC Backend Logs dashboard provisioning" check_dashboard
wait_until "backend alert-rule provisioning" check_alert_rules
wait_until "Loki label provisioning" check_loki_labels

if [[ "$require_backend_logs" == "true" ]]; then
  wait_until "backend log ingestion through Vector" check_backend_log_ingestion
else
  printf 'SKIP backend log ingestion (OBSERVABILITY_REQUIRE_BACKEND_LOGS=%s)\n' "$require_backend_logs"
fi

printf 'Observability smoke test passed\n'
