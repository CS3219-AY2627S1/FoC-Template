#!/usr/bin/env bash
# AI Assistance Disclosure: Claude Code (Claude Opus 5.5), 2026-10-16. Scope: curl walkthrough of
# the Order Service lifecycle for the D3 demo (stub tokens, stub Credit). Author review: Reviewed and approved by @mattis.
# Additional AI assistance: Claude Code (Claude Opus 5.5), 2026-10-16. Scope: step 11 now checks
# that all five credit event types were sent and the stub logged no contract violation. Author review: Reviewed and approved by @mattis.
# Additional AI assistance: Claude Code (Claude Opus 5.5), 2026-10-18. Scope: real User Service logins and a
# real supplier instead of stub tokens and a fixed supplier id. Author review: Reviewed and approved by @mattis.
# Additional AI assistance: Claude Code (Claude Opus 5.5), 2026-10-18. Scope: run against the real Credit Service:
# dropped the reservation-timeout step and the stub-only checks. Author review: Reviewed and approved by @mattis.
#
# Usage:  docker compose up -d --build && bash order-service/scripts/demo.sh
# Reads ALLOWED_EMAIL_DOMAIN and BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_PASSWORD from the shell or $ROOT/.env.
# Needs curl and jq. BASE is the gateway. Expects the real Credit Service (CREDIT_MODE=kafka, the compose default).
# Exits non-zero at the first step whose HTTP status or state differs from what is expected.
set -euo pipefail

BASE=${BASE:-http://localhost:8080/api/v1}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)

for tool in curl jq; do
  command -v "$tool" >/dev/null || { echo "$tool is required" >&2; exit 2; }
done

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# A setting from the shell, else from $ROOT/.env (read, never sourced)
setting() {
  local value=${!1-}
  [[ -n "$value" ]] || value=$(grep -E "^$1=" "$ROOT/.env" 2>/dev/null | tail -n 1 | cut -d= -f2-)
  [[ -n "$value" ]] || { echo "$1 is not set in the shell or $ROOT/.env" >&2; exit 2; }
  printf '%s' "$value"
}

# login IDENTIFIER PASSWORD  ->  prints an access token
login() {
  local status
  status=$(curl -sS -o "$WORK/login" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
    -d "$(jq -nc --arg i "$1" --arg p "$2" '{identifier: $i, password: $p}')" "$BASE/auth/login")
  [[ "$status" == 200 ]] || { echo "FAIL: login as $1 gave HTTP $status: $(cat "$WORK/login")" >&2; exit 1; }
  jq -er .accessToken "$WORK/login"
}

# Real accounts: A requests, B and C are couriers (registered fresh each run), D is the bootstrap administrator
DOMAIN=$(setting ALLOWED_EMAIL_DOMAIN)
RUN=$(date +%s)
PASSWORD=DemoPassword1
for who in a b c; do
  user="demo_${who}_$RUN"
  status=$(curl -sS -o "$WORK/register" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
    -d "$(jq -nc --arg u "$user" --arg e "$user@$DOMAIN" --arg p "$PASSWORD" '{username: $u, email: $e, password: $p}')" \
    "$BASE/auth/register")
  [[ "$status" == 201 ]] || { echo "FAIL: registering $user gave HTTP $status: $(cat "$WORK/register")" >&2; exit 1; }
done
TOKEN_A=$(login "demo_a_$RUN" "$PASSWORD")
TOKEN_B=$(login "demo_b_$RUN" "$PASSWORD")
TOKEN_C=$(login "demo_c_$RUN" "$PASSWORD")
TOKEN_D=$(login "$(setting BOOTSTRAP_ADMIN_USERNAME)" "$(setting BOOTSTRAP_ADMIN_PASSWORD)")

# The first active supplier in the Supplier Service
SUPPLIER=$(curl -sS -H "Authorization: Bearer $TOKEN_A" "$BASE/suppliers?size=1" | jq -r '.items[0].id // empty')
[[ -n "$SUPPLIER" ]] || { echo "FAIL: the Supplier Service has no active supplier" >&2; exit 1; }
echo "Logged in demo_{a,b,c}_$RUN and the administrator; supplier $SUPPLIER"

# UTC timestamp N hours from now (GNU date, then BSD date)
in_hours() {
  date -u -d "+$1 hours" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v+"$1"H +%Y-%m-%dT%H:%M:%SZ
}

# call METHOD PATH TOKEN [JSON]  ->  sets STATUS and BODY
call() {
  local method=$1 path=$2 token=$3 data=${4-}
  local args=(-sS -X "$method" -H "Authorization: Bearer $token" -o "$WORK/body" -w '%{http_code}')
  [[ -n "$data" ]] && args+=(-H 'Content-Type: application/json' -d "$data")
  STATUS=$(curl "${args[@]}" "$BASE$path")
  BODY=$(cat "$WORK/body")
}

fail() { echo "FAIL: $*" >&2; exit 1; }

# expect STATUS: stop unless the last call returned the expected status
expect() {
  [[ "$STATUS" == "$1" ]] || fail "expected HTTP $1 but got $STATUS: $BODY"
}

heading() { printf '\n== %s\n' "$*"; }
show() { echo "HTTP $STATUS  $(jq -c "$1" <<<"$BODY")"; }

create_body() {
  jq -nc --arg s "$SUPPLIER" --argjson amount "$1" \
    --arg l "$(in_hours 1)" --arg p "$(in_hours 2)" --arg d "$(in_hours 3)" \
    '{supplierId:$s, items:[{name:"Iced latte",quantity:2}], dropoffLocation:"COM1 level 2",
      notes:"Demo errand", creditAmount:$amount, listingDeadline:$l, pickupDeadline:$p, deliveryDeadline:$d}'
}

# create_errand AMOUNT -> sets ID
create_errand() {
  call POST /errands "$TOKEN_A" "$(create_body "$1")"
  expect 202
  ID=$(jq -r .id <<<"$BODY")
}

# wait_state TOKEN ID STATE TRIES: poll once a second until the errand reaches STATE
wait_state() {
  local token=$1 id=$2 want=$3 tries=$4 state=""
  for ((i = 0; i < tries; i++)); do
    call GET "/errands/$id" "$token"
    state=$(jq -r .state <<<"$BODY")
    [[ "$state" == "$want" ]] && return 0
    sleep 1
  done
  fail "errand $id is $state, expected $want after $tries s"
}

# act TOKEN ID ACTION [JSON]
act() { call POST "/errands/$2/$3" "$1" "${4-}"; }

heading "1. A creates an errand (202, PENDING_RESERVATION)"
create_errand 20
E1=$ID
show '{id, state, creditAmount, requesterId, supplierName}'
[[ $(jq -r .state <<<"$BODY") == PENDING_RESERVATION ]] || fail "unexpected state"

heading "2. Credit reserves, the errand becomes OPEN"
wait_state "$TOKEN_A" "$E1" OPEN 20
expect 200
show '{id, state}'

heading "3. A tries to accept their own errand (403)"
act "$TOKEN_A" "$E1" accept
expect 403
show '.'

heading "4. B and C accept at the same time (one 200, one 409)"
act_bg() { # TOKEN FILE: writes "<status>" to FILE.status and the body to FILE.body
  curl -sS -X POST -H "Authorization: Bearer $1" -o "$2.body" -w '%{http_code}' "$BASE/errands/$E1/accept" >"$2.status"
}
act_bg "$TOKEN_B" "$WORK/b" &
act_bg "$TOKEN_C" "$WORK/c" &
wait
SB=$(cat "$WORK/b.status") SC=$(cat "$WORK/c.status")
echo "B: HTTP $SB  $(jq -c '{state, courierId, error}' "$WORK/b.body")"
echo "C: HTTP $SC  $(jq -c '{state, courierId, error}' "$WORK/c.body")"
if [[ "$SB" == 200 && "$SC" == 409 ]]; then WINNER=$TOKEN_B
elif [[ "$SB" == 409 && "$SC" == 200 ]]; then WINNER=$TOKEN_C
else fail "expected one 200 and one 409, got B=$SB C=$SC"; fi

heading "5. The winner picks up and delivers (200, 200)"
act "$WINNER" "$E1" pickup
expect 200
show '{state, courierId}'
act "$WINNER" "$E1" deliver
expect 200
show '{state, confirmDeadline}'

heading "6. A confirms twice (200 COMPLETED, then 409 INVALID_STATE)"
act "$TOKEN_A" "$E1" confirm
expect 200
show '{state}'
act "$TOKEN_A" "$E1" confirm
expect 409
show '{error, currentState}'

heading "7. History of the first errand"
call GET "/errands/$E1" "$TOKEN_A"
expect 200
jq -r '.history[] | "\(.at)  \(.fromState // "-") -> \(.toState)  \(.action)  by \(.actorType)"' <<<"$BODY"

heading "8. Amount 150 is more than A has left: RESERVATION_REJECTED (INSUFFICIENT_CREDIT)"
create_errand 150
E2=$ID
wait_state "$TOKEN_A" "$E2" RESERVATION_REJECTED 20
expect 200
show '{id, state, rejectionReason}'

heading "9. A creates a third errand and cancels it (200 CANCELLED)"
create_errand 30
E3=$ID
wait_state "$TOKEN_A" "$E3" OPEN 20
act "$TOKEN_A" "$E3" cancel
expect 200
show '{id, state}'

heading "10. Fourth errand: delivered, A rejects (DISPUTED), D resolves for the requester (FAILED)"
create_errand 40
E4=$ID
wait_state "$TOKEN_A" "$E4" OPEN 20
act "$TOKEN_B" "$E4" accept; expect 200
act "$TOKEN_B" "$E4" pickup; expect 200
act "$TOKEN_B" "$E4" deliver; expect 200
act "$TOKEN_A" "$E4" reject '{"reason":"Wrong drink"}'
expect 200
show '{id, state}'
call POST "/admin/errands/$E4/resolve" "$TOKEN_D" '{"outcome":"REQUESTER","reason":"Wrong item delivered"}'
expect 200
show '{id, state}'

heading "11. Outbox: every credit message and whether it was published"
OUTBOX_SQL="select event_type, payload->>'order_id' as order_id, published_at is not null as published from outbox order by created_at"
for ((i = 0; i < 20; i++)); do
  PENDING=$(docker compose -f "$ROOT/compose.yaml" exec -T order-db psql -U order_bootstrap -d orders -Atc \
    "select count(*) from outbox where published_at is null")
  [[ "$PENDING" == 0 ]] && break
  sleep 1
done
docker compose -f "$ROOT/compose.yaml" exec -T order-db psql -U order_bootstrap -d orders -c "$OUTBOX_SQL"
[[ "$PENDING" == 0 ]] || fail "$PENDING outbox rows are still unpublished"

for type in ReserveRequested OrderCompleted OrderCancelled OrderFailed; do
  N=$(docker compose -f "$ROOT/compose.yaml" exec -T order-db psql -U order_bootstrap -d orders -Atc \
    "select count(*) from outbox where event_type = '$type' and published_at is not null")
  [[ "$N" -ge 1 ]] || fail "no published $type event in the outbox"
done
echo "All four event types were published."

printf '\nDemo passed: every step returned the expected status.\n'
