#!/usr/bin/env bash
set -euo pipefail

: "${PUBLIC_URL:?PUBLIC_URL is required, for example https://example.cloudfront.net}"
base=${PUBLIC_URL%/}

retry() {
  local url=$1 expected=${2:-200}
  local code attempt
  for attempt in $(seq 1 6); do
    code=$(curl --silent --show-error --connect-timeout 3 --max-time 10 \
      --output /dev/null --write-out '%{http_code}' "$url" || true)
    [[ $code == "$expected" ]] && return 0
    echo "Attempt $attempt/6: expected HTTP $expected from $url, received ${code:-no response}." >&2
    sleep 5
  done
  echo "Expected HTTP $expected from $url, received ${code:-no response}." >&2
  return 1
}

retry "$base/" 200
retry "$base/actuator/health" 200
retry "$base/api/suppliers?page=0&size=1" 200
retry "$base/.well-known/jwks.json" 200
retry "$base/api/users/me" 401
retry "$base/api/admin/suppliers" 401
retry "$base/api/chat/preferences" 401
retry "$base/notifications" 200
retry "$base/api/notifications/me/unread-count" 401

verify_spread() {
  local app=$1 node zone
  local -a nodes=()

  mapfile -t nodes < <(
    kubectl -n foc-staging get pods -l "app=$app" -o json |
      jq -r '.items[] |
        select(.status.phase == "Running") |
        select(any(.status.conditions[]?; .type == "Ready" and .status == "True")) |
        .spec.nodeName' |
      sort -u
  )

  if (( ${#nodes[@]} < 2 )); then
    echo "$app has Ready replicas on only ${#nodes[@]} worker node(s); expected at least 2." >&2
    kubectl -n foc-staging get pods -l "app=$app" -o wide >&2
    return 1
  fi

  local -a zones=()
  for node in "${nodes[@]}"; do
    zone=$(kubectl get node "$node" -o jsonpath='{.metadata.labels.topology\.kubernetes\.io/zone}')
    zones+=("$zone")
  done

  mapfile -t zones < <(printf '%s\n' "${zones[@]}" | sort -u)
  if (( ${#zones[@]} < 2 )); then
    echo "$app has Ready replicas in only ${#zones[@]} Availability Zone(s); expected at least 2." >&2
    kubectl -n foc-staging get pods -l "app=$app" -o wide >&2
    return 1
  fi

  echo "$app has Ready replicas across ${#nodes[@]} nodes and ${#zones[@]} Availability Zones."
}

for app in gateway user-service supplier-service order-service credit-service admin-service \
  chat-service notification-service; do
  verify_spread "$app"
done

echo "Cloud smoke checks passed at $base"
