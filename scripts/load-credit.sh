#!/usr/bin/env bash
# AI-influenced: implemented with AI assistance; see ai/usage-log.md.
#
# Generate credit-service traffic for the observability stack.
#
# Only PUBLIC gateway routes are used. The gateway is default-deny, so the
# credit write endpoints (/api/credits/reservations, .../release, .../transfer)
# are internal: order-service calls them, browsers do not. Creating an order
# therefore produces the reservation traffic server-side, exactly like a real
# user, and the script also reads the two exposed credit routes.
#
# Usage:
#   FOC_TOKEN=<jwt> FOC_USER_ID=<user-uuid> scripts/load-credit.sh
#
# Optional environment variables:
#   BASE_URL     gateway base URL   (default http://localhost:8080)
#   REQUESTS     number of orders   (default 100)
#   CONCURRENCY  parallel workers   (default 8)
#   REWARD_MAX   max reward         (default 40)
#
# Token:
#   TOKEN=$(curl -s -X POST localhost:8080/api/users/login \
#     -H 'Content-Type: application/json' \
#     -d '{"email":"alice@u.nus.edu","password":"Passw0rd!"}' | jq -r .access_token)
#   UID_=$(curl -s localhost:8080/api/users/me -H "Authorization: Bearer $TOKEN" | jq -r .id)
#   FOC_TOKEN=$TOKEN FOC_USER_ID=$UID_ scripts/load-credit.sh
#
# What it exercises:
#   POST /api/orders                    -> accepted / insufficient_credits
#   GET  /api/credits/{id}/balance      -> 200 reads
#   GET  /api/credits/{id}/transactions -> 200 reads
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
TOKEN="${FOC_TOKEN:-}"
USER_ID="${FOC_USER_ID:-}"
REQUESTS="${REQUESTS:-100}"
CONCURRENCY="${CONCURRENCY:-8}"
REWARD_MAX="${REWARD_MAX:-40}"

if [[ -z "$TOKEN" || -z "$USER_ID" ]]; then
  cat >&2 <<'EOF'
error: FOC_TOKEN and FOC_USER_ID must be set.

  TOKEN=$(curl -s -X POST localhost:8080/api/users/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"alice@u.nus.edu","password":"Passw0rd!"}' | jq -r .access_token)
  UID_=$(curl -s localhost:8080/api/users/me -H "Authorization: Bearer $TOKEN" | jq -r .id)
  FOC_TOKEN=$TOKEN FOC_USER_ID=$UID_ scripts/load-credit.sh
EOF
  exit 1
fi

AUTH=(-H "Authorization: Bearer $TOKEN")
RUN_ID="$$-$(date +%s)"
DEADLINE="$(date -u -d '+2 days' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v+2d +%Y-%m-%dT%H:%M:%SZ)"

SUPPLIER_ID="$(curl -sS "${AUTH[@]}" "$BASE_URL/api/suppliers?limit=1" | jq -r '.[0].id // empty')"
if [[ -z "$SUPPLIER_ID" ]]; then
  echo "error: could not read a supplier id from GET /api/suppliers." >&2
  exit 1
fi

TALLY="$(mktemp)"
trap 'rm -f "$TALLY"' EXIT

run_one() {
  local i="$1"
  local reward=$(( (RANDOM % REWARD_MAX) + 1 ))
  local body status
  body="$(printf '{"name":"load-%s-%s","details":"observability load","reward":%d,"deadline":"%s","supplier_id":"%s","pickup_location":"UTown","delivery_location":"PGP"}' \
    "$RUN_ID" "$i" "$reward" "$DEADLINE" "$SUPPLIER_ID")"
  status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/orders" \
    "${AUTH[@]}" -H 'Content-Type: application/json' -d "$body")"
  printf '%s\n' "$status" >> "$TALLY"

  case $(( RANDOM % 4 )) in
    0) curl -sS -o /dev/null "${AUTH[@]}" "$BASE_URL/api/credits/$USER_ID/balance" ;;
    1) curl -sS -o /dev/null "${AUTH[@]}" "$BASE_URL/api/credits/$USER_ID/transactions?limit=10" ;;
  esac
}

echo "generating $REQUESTS orders against $BASE_URL (concurrency $CONCURRENCY)"
for i in $(seq 1 "$REQUESTS"); do
  run_one "$i" &
  if (( i % CONCURRENCY == 0 )); then wait; fi
done
wait

echo "status codes:"
sort "$TALLY" | uniq -c | sed 's/^/  /'
echo "dashboard: Grafana -> Credit Service - Observability"
