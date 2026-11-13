#!/usr/bin/env bash
# Checks a running Relay from the outside, through the gateway like a browser. Works locally and
# in the cloud.
#
# 1. The gateway is up and protected routes refuse anonymous requests.
# 2. Two new students register, read their code in Mailpit, verify and log in, and each gets a
#    credit account through the broker.
# 3. One errand runs end to end: the first student posts it (credits reserved), the second
#    accepts, picks up and delivers it, the first confirms it, and the reward moves to the courier
#    through the broker. This touches the user, supplier, order and credit service at once.
#
#   deploy/scripts/smoke-test.sh                        local k3d (http://localhost:8081)
#   deploy/scripts/smoke-test.sh https://relay.example  any other address
#   MAILBOX_AUTH=user:pass deploy/scripts/smoke-test.sh https://…   when Mailpit has a password
set -euo pipefail

BASE="${1:-http://localhost:8081}"
BASE="${BASE%/}"
REQUESTER_JAR="$(mktemp)"
COURIER_JAR="$(mktemp)"
trap 'rm -f "$REQUESTER_JAR" "$COURIER_JAR"' EXIT
# expect sends the cookies of whoever JAR points at.
JAR="$REQUESTER_JAR"

REWARD=5
STARTING_CREDITS=50
# The drop-off point of the test errand: COM1, inside the walking map of the supplier-service.
DROP_OFF_LATITUDE=1.2949
DROP_OFF_LONGITUDE=103.7737

failed=0
# expect <label> <expected status> <curl args...>; prints the body to stdout for the caller.
expect() {
  local label="$1" want="$2"
  shift 2
  local body status
  body="$(curl --silent --show-error --cookie "$JAR" --cookie-jar "$JAR" --write-out '\n%{http_code}' "$@")"
  status="${body##*$'\n'}"
  body="${body%$'\n'*}"
  if [ "$status" = "$want" ]; then
    echo "ok    $label ($status)" >&2
  else
    echo "FAIL  $label: expected $want, got $status: $body" >&2
    failed=1
  fi
  printf '%s' "$body"
}

# check <label> <condition result 0/1 as command>: records a failed assertion without stopping.
check() {
  local label="$1"
  shift
  if "$@"; then
    echo "ok    $label" >&2
  else
    echo "FAIL  $label" >&2
    failed=1
  fi
}

finish() {
  if [ "$failed" -eq 0 ]; then
    echo "All checks passed against $BASE" >&2
  else
    echo "Some checks failed against $BASE" >&2
  fi
  exit "$failed"
}

# balance_of <account id>: the balance JSON as JAR's owner sees it, empty when there is none.
balance_of() {
  local answer
  answer="$(curl --silent --cookie "$JAR" --write-out '\n%{http_code}' "$BASE/api/credit/account/$1/balance")"
  [ "${answer##*$'\n'}" = 200 ] && printf '%s' "${answer%$'\n'*}"
  return 0
}

# wait_for_balance <account id> <available> <reserved>: the credit-service applies errand outcomes
# from the broker, so the balance changes a moment after the order-service answered.
wait_for_balance() {
  local account="$1" available="$2" reserved="$3" balance=""
  for _ in $(seq 1 15); do
    balance="$(balance_of "$account")"
    if [ -n "$balance" ] \
      && [ "$(printf '%s' "$balance" | jq -r '.available')" = "$available" ] \
      && [ "$(printf '%s' "$balance" | jq -r '.reserved')" = "$reserved" ]; then
      printf '%s' "$balance"
      return 0
    fi
    sleep 1
  done
  printf '%s' "${balance:-no balance}"
  return 1
}

stamp="$(date +%s)"
mailbox=(--silent --show-error)
[ -n "${MAILBOX_AUTH:-}" ] && mailbox+=(--user "$MAILBOX_AUTH")

# new_student <role>: registers, verifies and logs in a student with the cookies in JAR and sets
# student_id. Also waits until the credit-service opened the account, since posting an errand
# reserves credits on it.
new_student() {
  local role="$1"
  local email="smoke-$role-$stamp@u.nus.edu" username="smoke_${role}_$stamp" password="smoke-test-$stamp"

  expect "register the $role $email" 201 --header 'Content-Type: application/json' \
    --data "{\"fullName\":\"Smoke $role\",\"email\":\"$email\",\"username\":\"$username\",\"password\":\"$password\"}" \
    "$BASE/api/user/auth/register" >/dev/null

  # The user-service sends the mail in the background, so give Mailpit a few seconds.
  local code=""
  for _ in $(seq 1 15); do
    code="$(curl "${mailbox[@]}" --get --data-urlencode "query=to:$email" "$BASE/mail/api/v1/search" \
      | jq -r '.messages[0].Snippet // empty' | grep -oE '[0-9]{6}' | head -1 || true)"
    [ -n "$code" ] && break
    sleep 1
  done
  if [ -n "$code" ]; then
    echo "ok    verification code for the $role arrived in Mailpit" >&2
  else
    echo "FAIL  no verification code for $email in Mailpit" >&2
    failed=1
    finish
  fi

  expect "verify the $role" 200 --header 'Content-Type: application/json' \
    --data "{\"email\":\"$email\",\"code\":\"$code\"}" "$BASE/api/user/auth/verify" >/dev/null
  expect "log in the $role" 200 --header 'Content-Type: application/json' \
    --data "{\"identifier\":\"$username\",\"password\":\"$password\"}" "$BASE/api/user/auth/login" >/dev/null
  local me
  me="$(expect "own profile of the $role" 200 "$BASE/api/user/users/me")"
  [ "$(printf '%s' "$me" | jq -r '.username // empty')" = "$username" ] \
    || { echo "FAIL  profile belongs to someone else: $me" >&2; failed=1; }
  student_id="$(printf '%s' "$me" | jq -r '.id // empty')"

  # Verifying the account makes the user-service announce it over the broker, and the
  # credit-service opens a credit account for it. That takes a moment, so ask a few times.
  local balance
  if balance="$(wait_for_balance "$student_id" "$STARTING_CREDITS" 0)"; then
    echo "ok    credit account of the $role opened through the broker: $balance" >&2
  else
    echo "FAIL  no credit account with $STARTING_CREDITS credits for the $role $student_id: $balance" >&2
    failed=1
    finish
  fi
}

# ---- 1. Gateway --------------------------------------------------------------------------------
expect "gateway is up" 200 "$BASE/healthz" >/dev/null
expect "profile needs a session" 401 "$BASE/api/user/users/me" >/dev/null
expect "errands need a session" 401 "$BASE/api/order/orders/open" >/dev/null
expect "internal routes stay closed" 404 --request POST "$BASE/api/user/internal/authorize" >/dev/null

# ---- 2. Two students ---------------------------------------------------------------------------
JAR="$REQUESTER_JAR"
new_student requester
requester_id="$student_id"

JAR="$COURIER_JAR"
new_student courier
courier_id="$student_id"

# ---- 3. One errand from posting to the credit transfer -----------------------------------------
JAR="$REQUESTER_JAR"

# An errand needs a supplier that is open at its needed-by time. Try the next half hour first, so
# the errand is still acceptable while the test runs, then later times for a night run.
supplier_id=""
needed_by=""
suppliers="$(expect "supplier list with the session" 200 "$BASE/api/supplier/suppliers?pageSize=20")"
for minutes in 30 120 360 720 1440; do
  at="$(date -u -d "+$minutes minutes" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v+"$minutes"M +%Y-%m-%dT%H:%M:%SZ)"
  for id in $(printf '%s' "$suppliers" | jq -r '.items[].id'); do
    orderable="$(curl --silent --cookie "$JAR" --get --data-urlencode "at=$at" \
      "$BASE/api/supplier/suppliers/$id/availability" | jq -r '.orderable // false')"
    if [ "$orderable" = true ]; then
      supplier_id="$id"
      needed_by="$at"
      break 2
    fi
  done
done
if [ -z "$supplier_id" ]; then
  echo "FAIL  no supplier on the first page is open within the next 24 hours" >&2
  failed=1
  finish
fi
echo "ok    supplier $supplier_id is open at $needed_by" >&2

errand="$(expect "requester posts an errand" 201 --header 'Content-Type: application/json' \
  --data "{\"supplierId\":\"$supplier_id\",\"deliveryLocation\":\"COM1 Level 2 smoke test\",\"deliveryLatitude\":$DROP_OFF_LATITUDE,\"deliveryLongitude\":$DROP_OFF_LONGITUDE,\"neededByTime\":\"$needed_by\",\"itemLines\":[\"1x smoke test item\"],\"creditReward\":$REWARD}" \
  "$BASE/api/order/orders")"
errand_id="$(printf '%s' "$errand" | jq -r '.data.id // empty')"
if [ -z "$errand_id" ]; then
  echo "FAIL  the order-service returned no errand: $errand" >&2
  failed=1
  finish
fi
check "the new errand is Open" test "$(printf '%s' "$errand" | jq -r '.data.status')" = Open

# The reservation happens inside the request, so the balance is already reduced.
if balance="$(wait_for_balance "$requester_id" $((STARTING_CREDITS - REWARD)) "$REWARD")"; then
  echo "ok    $REWARD credits of the requester are reserved: $balance" >&2
else
  echo "FAIL  the requester's credits were not reserved: $balance" >&2
  failed=1
fi

expect "requester cannot accept the own errand" 403 --request POST \
  "$BASE/api/order/orders/$errand_id/accept" >/dev/null

JAR="$COURIER_JAR"
open_list="$(expect "courier lists the open errands" 200 "$BASE/api/order/orders/open")"
check "the new errand is in the open list" \
  test "$(printf '%s' "$open_list" | jq --argjson id "$errand_id" '[.data[] | select(.id == $id)] | length')" = 1
expect "courier accepts the errand" 200 --request POST "$BASE/api/order/orders/$errand_id/accept" >/dev/null
expect "a second acceptance is refused" 409 --request POST "$BASE/api/order/orders/$errand_id/accept" >/dev/null
expect "courier cannot complete it" 409 --request PATCH --header 'Content-Type: application/json' \
  --data '{"status":"Completed"}' "$BASE/api/order/orders/$errand_id/status" >/dev/null
expect "courier picks it up" 200 --request PATCH --header 'Content-Type: application/json' \
  --data '{"status":"PickedUp"}' "$BASE/api/order/orders/$errand_id/status" >/dev/null
expect "courier delivers it" 200 --request PATCH --header 'Content-Type: application/json' \
  --data '{"status":"Delivered"}' "$BASE/api/order/orders/$errand_id/status" >/dev/null

JAR="$REQUESTER_JAR"
expect "requester confirms it" 200 --request PATCH --header 'Content-Type: application/json' \
  --data '{"status":"Completed"}' "$BASE/api/order/orders/$errand_id/status" >/dev/null

mine="$(expect "requester lists the own errands" 200 "$BASE/api/order/orders/mine")"
history="$(printf '%s' "$mine" | jq -r --argjson id "$errand_id" \
  '.data[] | select(.id == $id) | [.transitions[].to_status] | join(" ")')"
check "every step is recorded: $history" \
  test "$history" = "Open Accepted PickedUp Delivered Completed"

# Completed goes to the credit-service as an event, which moves the reservation to the courier.
if balance="$(wait_for_balance "$requester_id" $((STARTING_CREDITS - REWARD)) 0)"; then
  echo "ok    the requester paid the reward: $balance" >&2
else
  echo "FAIL  the requester's reservation was not transferred: $balance" >&2
  failed=1
fi
JAR="$COURIER_JAR"
if balance="$(wait_for_balance "$courier_id" $((STARTING_CREDITS + REWARD)) 0)"; then
  echo "ok    the courier received the reward through the broker: $balance" >&2
else
  echo "FAIL  the courier did not receive the reward: $balance" >&2
  failed=1
fi

finish
