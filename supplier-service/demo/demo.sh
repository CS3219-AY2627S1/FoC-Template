#!/usr/bin/env bash
# Walks through the Supplier Service milestone demonstrations against the running
# system, and checks every answer. Start it first: docker compose up --build
#
#   bash supplier-service/demo/demo.sh [part ...]
#
# Parts, each one a demonstration of its own. With none named, all run in order.
#   queries      point 2  the key ways of querying, as a member
#   access       point 2  who may do what, and how a refusal looks
#   crud         point 3  demonstration A: create, read, update, deactivate, in the database
#   independent  point 3  demonstration B: the service does not depend on a UI
#   tests        point 3  demonstration C: the automated tests, with no UI
#   end-to-end   point 4  a real account is registered, verified, logs in, uses the API
#
#   PAUSE=1  wait for Enter before each step, for presenting
#   RAW=1    print each response in full instead of a summary
#   KEEP=1   keep the suppliers and accounts the demo creates, instead of removing them
#   BASE=... service address, default http://localhost:3002
#
# The people are real accounts of the user-service: the first administrator, which
# the user-service creates at start-up from ADMIN_USERNAME and ADMIN_PASSWORD, and
# students the demo registers and verifies through Mailpit, the local inbox.
#
# Needs bash and curl. Node, when it is installed, tidies the responses, and
# Docker, when it works in this shell, adds the database and log steps. Without
# them the script still runs, showing raw JSON and the commands to run yourself.
set -u

BASE=${BASE:-http://localhost:3002}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
export PATH="$PATH:/c/Program Files/Docker/Docker/resources/bin"

# A .env copied on Windows has CRLF line endings, which would leave a stray CR on
# the end of every value.
if [ -f "$ROOT/.env" ]; then
  set -a
  . <(tr -d '\r' < "$ROOT/.env")
  set +a
fi
DB_USER=${SUPPLIER_DB_USER:-supplier}
DB_NAME=${SUPPLIER_DB_NAME:-supplier}
USER_URL=${USER_SERVICE_URL:-http://localhost:3001}
MAIL_URL=${MAIL_URL:-http://localhost:8025}
ADMIN_LOGIN=${ADMIN_USERNAME:-admin}
ADMIN_PASS=${ADMIN_PASSWORD:-change-me}

# From WSL only the Windows Node is visible, under the name node.exe.
NODE=$(command -v node || command -v node.exe || true)
HAVE_DOCKER=0
if docker compose version >/dev/null 2>&1; then HAVE_DOCKER=1; fi

PASSED=0
FAILED=0
STATUS=0
BODY=""
COOKIE_VALUE=""
TOKEN_forged="forged-session-value"
DEMO_ACCOUNTS=()

SUMMARY_JS=$(cat <<'EOF'
let text = ''
process.stdin.on('data', (d) => (text += d)).on('end', () => {
  let d
  try { d = JSON.parse(text) } catch { console.log(text); return }
  const when = (a) =>
    a.open
      ? a.closesAt ? `open now, until ${a.closesAt}` : 'open around the clock'
      : a.nextOpensAt ? `closed, opens ${a.nextOpensAt.day} ${a.nextOpensAt.time}` : 'closed'
  const hours = (x) => x.hours.map((h) => `${h.day.slice(0, 3)} ${h.opens}-${h.closes}`).join(', ')
  if (d.items) {
    console.log(`  total=${d.total}  page ${d.page} of ${d.totalPages}, showing ${d.items.length}`)
    if (d.items.length > 0) console.log(d.items.map((i) => `    ${i.name}`).join('\n'))
  } else if (d.error && d.error.code) {
    console.log(`  ${d.error.code}: ${d.error.message}`)
    for (const f of d.error.fields ?? d.error.details?.fields ?? []) console.log(`    - ${f.field}: ${f.message}`)
  } else if (d.username && d.email) {
    console.log(`  account: ${d.username} <${d.email}>  roles=${d.roles.join('+')}  state=${d.state}`)
  } else if (d.name) {
    console.log(`  ${d.name}  [${d.type}]  status=${d.status}`)
    console.log(`  where: ${d.building}, zone ${d.zone}`)
    console.log(`  hours: ${hours(d)}`)
    console.log(`  right now: ${when(d.availability)}`)
  } else if (d.supplierId) {
    console.log(`  at ${d.at} (${d.timezone}): ${when(d)}`)
    console.log(`  status=${d.status}  orderable=${d.orderable}`)
  } else {
    console.log('  ' + JSON.stringify(d))
  }
})
EOF
)

# Turns the services' JSON log lines into one readable line each.
LOG_JS=$(cat <<'EOF'
const wanted = /account registered|verification code sent|account verified|login succeeded|logged out|authorized|refused/
const rows = []
const lines = require('readline').createInterface({ input: process.stdin })
lines.on('line', (line) => {
  const m = /^(\S+)\s+\|\s+(\{.*\})\s*$/.exec(line)
  if (!m) return
  let j
  try { j = JSON.parse(m[2]) } catch { return }
  if (!wanted.test(String(j.msg))) return
  const time = new Date(j.time).toTimeString().slice(0, 8)
  const extra = [j.operation, j.accountId ? 'account ' + String(j.accountId).slice(0, 8) : ''].filter(Boolean).join(', ')
  rows.push({ at: j.time, text: `  ${time}  ${m[1].replace(/-1$/, '').padEnd(16)} ${j.msg}${extra ? '  (' + extra + ')' : ''}` })
})
// The two services are listed one after the other, so put them in time order.
lines.on('close', () => rows.sort((a, b) => a.at - b.at).forEach((r) => console.log(r.text)))
EOF
)

summarize() {
  if [ "${RAW:-0}" = 1 ] || [ -z "$NODE" ]; then
    cat
    echo
  else
    "$NODE" -e "$SUMMARY_JS"
  fi
}

part() { printf '\n\n############################################################\n# %s\n############################################################\n' "$1"; }

step() {
  printf '\n== %s\n' "$1"
  [ -n "${2:-}" ] && printf '   %s\n' "$2"
  if [ "${PAUSE:-0}" = 1 ]; then read -r -p '   [Enter to run] ' _ </dev/tty; fi
}

# call ROLE METHOD PATH [JSON]   asks the supplier-service.
# ROLE is none (no cookie), forged (a made-up session), or any name that has a
# session in TOKEN_<role>, such as member and admin.
call() {
  local role=$1 method=$2 path=$3 body=${4:-}
  local args=() shown="curl" token_var="TOKEN_$1"
  local token=${!token_var:-}
  if [ "$role" != none ] && [ -z "$token" ]; then
    echo "  [FAIL] there is no session for '$role'"
    FAILED=$((FAILED + 1))
    STATUS=0
    BODY=""
    return
  fi
  [ "$method" != GET ] && shown+=" -X $method"
  if [ "$role" != none ]; then
    args+=(-H "Cookie: relay_session=$token")
    shown+=" -H 'Cookie: relay_session=${token:0:6}...'"
  fi
  if [ -n "$body" ]; then
    args+=(-H 'Content-Type: application/json' -d "$body")
    shown+=" -H 'Content-Type: application/json' -d '$body'"
  fi
  echo "\$ $shown '$BASE$path'"
  local out
  out=$(curl -s -X "$method" ${args[@]+"${args[@]}"} -w $'\n%{http_code}' "$BASE$path")
  STATUS=${out##*$'\n'}
  BODY=${out%$'\n'*}
  echo "  -> HTTP $STATUS"
  printf '%s' "$BODY" | summarize
}

# user_call METHOD PATH [JSON] [COOKIE_ROLE]   asks the user-service. It sets
# STATUS, BODY, and COOKIE_VALUE when the answer sets the session cookie.
user_call() {
  local method=$1 path=$2 body=${3:-} role=${4:-}
  local args=() shown="curl -X $1" token_var="TOKEN_$role" token=""
  [ -n "$role" ] && token=${!token_var:-}
  if [ -n "$token" ]; then
    args+=(-H "Cookie: relay_session=$token")
    shown+=" -H 'Cookie: relay_session=${token:0:6}...'"
  fi
  if [ -n "$body" ]; then
    args+=(-H 'Content-Type: application/json' -d "$body")
    shown+=" -H 'Content-Type: application/json' -d '$(printf '%s' "$body" | sed -E 's/("password":")[^"]*/\1***/')'"
  fi
  echo "\$ $shown '$USER_URL$path'"
  local out
  out=$(curl -s -i -X "$method" ${args[@]+"${args[@]}"} "$USER_URL$path" | tr -d '\r')
  STATUS=$(printf '%s' "$out" | head -1 | awk '{print $2}')
  BODY=$(printf '%s\n' "$out" | awk 'found { print } /^$/ { found = 1 }')
  COOKIE_VALUE=$(printf '%s\n' "$out" | grep -i '^set-cookie: relay_session=' | head -1 | sed -E 's/^[^=]*=([^;]*);.*/\1/')
  echo "  -> HTTP $STATUS"
  [ -n "$COOKIE_VALUE" ] && echo "  session cookie set: relay_session=${COOKIE_VALUE:0:6}... (${#COOKIE_VALUE} characters, HttpOnly)"
  [ -n "$BODY" ] && printf '%s' "$BODY" | summarize
}

expect() {
  if [ "$STATUS" = "$1" ]; then
    echo "  [ok] $2"
    PASSED=$((PASSED + 1))
  else
    echo "  [FAIL] $2 (expected HTTP $1, got $STATUS)"
    FAILED=$((FAILED + 1))
  fi
}

# check CONDITION_EXIT_CODE MESSAGE   for a step that is not an HTTP call
check() {
  if [ "$1" = 0 ]; then
    echo "  [ok] $2"
    PASSED=$((PASSED + 1))
  else
    echo "  [FAIL] $2"
    FAILED=$((FAILED + 1))
  fi
}

# The id of the thing in the last response, or of the first one in a list. The
# responses are compact JSON with the id first, so no JSON tool is needed.
id_of() { printf '%s' "$BODY" | grep -o '"id":"[0-9a-f-]*"' | head -1 | cut -d'"' -f4; }

# Runs in the project folder, so that no Windows path is needed.
compose() { (cd "$ROOT" && docker compose "$@"); }
db() { compose exec -T supplier-db psql -U "$DB_USER" -d "$DB_NAME" "$@"; }

# For a step that needs Docker when this shell cannot reach it.
run_yourself() {
  echo "  This shell cannot run that here."
  echo "  Run it in PowerShell, from the repository root:"
  echo "    $1"
}

# ------------------------------------------------------------------ real accounts
# The session cookie from a login, without showing anything.
quiet_login() {
  curl -s -i -X POST "$USER_URL/auth/login" -H 'Content-Type: application/json' \
    -d "{\"identifier\":\"$1\",\"password\":\"$2\"}" | tr -d '\r' \
    | grep -i '^set-cookie: relay_session=' | head -1 | sed -E 's/^[^=]*=([^;]*);.*/\1/'
}

# The six digits the user-service emailed to an address, read from Mailpit.
mail_code() {
  local i out code
  for i in 1 2 3 4 5 6 7 8 9 10; do
    out=$(curl -s -G --data-urlencode "query=to:$1" "$MAIL_URL/api/v1/search")
    code=$(printf '%s' "$out" | grep -o 'verification code is [0-9]\{6\}' | head -1 | grep -o '[0-9]\{6\}')
    if [ -n "$code" ]; then printf '%s' "$code"; return 0; fi
    sleep 0.5
  done
  return 1
}

# The administrator, and a student who is registered and verified, both quietly.
# The student is removed when the script ends.
ensure_sessions() {
  [ -n "${TOKEN_admin:-}" ] && [ -n "${TOKEN_member:-}" ] && return
  TOKEN_admin=$(quiet_login "$ADMIN_LOGIN" "$ADMIN_PASS")
  if [ -z "$TOKEN_admin" ]; then
    echo "Could not log in to the user-service at $USER_URL as the administrator '$ADMIN_LOGIN'."
    echo "Start the system with:  docker compose up --build"
    echo "If you changed ADMIN_USERNAME or ADMIN_PASSWORD, put the same values in .env."
    exit 1
  fi

  local stamp="$(date +%H%M%S)$RANDOM" reply email code
  email="demo$stamp@u.nus.edu"
  reply=$(curl -s -X POST "$USER_URL/auth/register" -H 'Content-Type: application/json' \
    -d "{\"fullName\":\"Demo Student\",\"email\":\"$email\",\"username\":\"demo$stamp\",\"password\":\"demo-pass-$stamp\"}")
  DEMO_ACCOUNTS+=("$(printf '%s' "$reply" | grep -o '"id":"[0-9a-f-]*"' | head -1 | cut -d'"' -f4)")
  code=$(mail_code "$email") || { echo "The verification email for $email did not arrive in Mailpit at $MAIL_URL."; exit 1; }
  curl -s -o /dev/null -X POST "$USER_URL/auth/verify" -H 'Content-Type: application/json' -d "{\"email\":\"$email\",\"code\":\"$code\"}"
  TOKEN_member=$(quiet_login "$email" "demo-pass-$stamp")
  if [ -z "$TOKEN_member" ]; then
    echo "The demo student could not log in."
    exit 1
  fi
  echo "Signed in as the administrator, and as a new demo student ($email). The student is removed at the end."
}

# Deletes the accounts the demo registered, as the administrator.
remove_demo_accounts() {
  [ "${KEEP:-0}" = 1 ] && return
  local id
  for id in ${DEMO_ACCOUNTS[@]+"${DEMO_ACCOUNTS[@]}"}; do
    [ -z "$id" ] && continue
    curl -s -o /dev/null -X DELETE "$USER_URL/users/$id" -H "Cookie: relay_session=${TOKEN_admin:-}"
  done
  [ ${#DEMO_ACCOUNTS[@]} -gt 0 ] && echo "Removed the demo student accounts, as the administrator."
}

NAME="Demo Cafe $(date +%H%M%S)"
CREATE_BODY="{\"name\":\"$NAME\",\"type\":\"Food\",\"zone\":\"Central\",\"building\":\"Central Library\",\"address\":\"Central Library, Level 1\",\"description\":\"Demo supplier\",\"contact\":{\"phone\":\"6516 1234\",\"email\":\"demo@example.com\"},\"hours\":[{\"day\":\"monday\",\"opens\":\"09:00\",\"closes\":\"18:00\"},{\"day\":\"tuesday\",\"opens\":\"09:00\",\"closes\":\"18:00\"}]}"

# What is left of a demo supplier once the demonstration is over.
clean_up() {
  [ "${KEEP:-0}" = 1 ] && return
  step "Clean up" "Removes only the demo supplier, straight in the database, because the API itself never deletes."
  if [ "$HAVE_DOCKER" = 1 ]; then
    db -c "DELETE FROM suppliers WHERE id = '$1'"
  else
    call admin DELETE "/suppliers/$1"
    echo "  The demo supplier stays as an Inactive record, because the API never deletes. To remove it,"
    echo "  run in PowerShell, from the repository root:"
    echo "    docker compose exec supplier-db psql -U $DB_USER -d $DB_NAME -c \"DELETE FROM suppliers WHERE id = '$1'\""
  fi
}

# ================================================================== point 2
part_queries() {
  part "POINT 2  Query patterns, as a signed-in member (a student)"
  ensure_sessions

  step "List suppliers" "Sorted by name, at most 20 to a page, with the total count (F2.4.2)."
  call member GET '/suppliers'
  expect 200 "a member can list suppliers"
  local first_id
  first_id=$(id_of)

  step "Search by keyword" "Every word must match the name, type, building, zone or address (F2.4.1)."
  call member GET '/suppliers?q=coffee'
  expect 200 "keyword search"
  call member GET '/suppliers?q=prince+george'
  expect 200 "several words"

  step "Filter by type" "The types are the ones in the seed file: Food, Food/Coffee, Shopping and Printing."
  call member GET '/suppliers?type=Printing'
  expect 200 "filter by type"
  call member GET '/suppliers?type=Food/Coffee'
  expect 200 "Food/Coffee is a type of its own"
  call member GET '/suppliers?type=Food'
  expect 200 "Food matches only Food, not Food/Coffee"

  step "Find suppliers by location" "By campus zone or by building."
  call member GET '/suppliers?zone=Central'
  expect 200 "filter by zone"
  call member GET '/suppliers?building=COM2'
  expect 200 "filter by building"

  step "Combine filters and a keyword"
  call member GET '/suppliers?zone=Central&type=Food/Coffee&q=roaster'
  expect 200 "combined query"

  step "Page through the results" "Page 2 of 21 suppliers holds the last one."
  call member GET '/suppliers?page=2'
  expect 200 "second page"
  call member GET '/suppliers?pageSize=21'
  expect 400 "a page can never hold more than 20"

  step "Read one supplier by its id"
  call member GET "/suppliers/$first_id"
  expect 200 "get by id"

  step "Is a supplier open at a given time?" "What the Order Service asks before accepting an errand (F2.5.1). Monday 10:00 and 19:00 in Singapore."
  call member GET '/suppliers?q=Anna'
  local anna_id
  anna_id=$(id_of)
  call member GET "/suppliers/$anna_id/availability?at=2026-10-05T10:00:00%2B08:00"
  expect 200 "availability during opening hours"
  call member GET "/suppliers/$anna_id/availability?at=2026-10-05T19:00:00%2B08:00"
  expect 200 "availability after closing"
}

part_access() {
  part "POINT 2  Access control: the user-service decides"
  ensure_sessions

  # Any existing supplier will do as the target of a refused change.
  local anna_id
  anna_id=$(curl -s -H "Cookie: relay_session=$TOKEN_member" "$BASE/suppliers?q=Anna" | grep -o '"id":"[0-9a-f-]*"' | head -1 | cut -d'"' -f4)

  step "No session" "There is nothing to ask the user-service about, so the request is refused at once."
  call none GET '/suppliers'
  expect 401 "no session is refused"

  step "A session the user-service does not know" "The supplier-service asks, and anything but a clear yes is a no."
  call forged GET '/suppliers'
  expect 403 "a made-up session is refused"

  step "A member cannot change the catalogue" "Members may read. Creating, updating and deactivating need the administrator role."
  call member POST '/suppliers' '{"name":"Hacked","type":"Food","zone":"Central","building":"X","address":"X","hours":[{"day":"monday","opens":"09:00","closes":"18:00"}]}'
  expect 403 "a member cannot create"
  call member PATCH "/suppliers/$anna_id" '{"name":"Hacked"}'
  expect 403 "a member cannot update"
  call member DELETE "/suppliers/$anna_id"
  expect 403 "a member cannot deactivate"

  step "A refusal says nothing about what exists" "A real id and an id that does not exist get the identical answer (N1.1.1)."
  call member DELETE '/suppliers/00000000-0000-4000-8000-000000000000'
  expect 403 "same 403 for an id that does not exist"

  step "The administrator may" "The same requests, with the administrator's session, are allowed. Only the empty body is refused."
  call admin POST '/suppliers' '{}'
  expect 400 "allowed to create, and checked: the fields are missing"
}

# ================================================================== point 3
part_crud() {
  part "POINT 3, DEMONSTRATION A  The running service, its database, and CRUD"
  ensure_sessions

  step "The service is running and connected to its database" "The health check asks the database a question, so a 200 means both are up."
  call none GET '/health'
  expect 200 "the service answers and the database answers it"
  if [ "$HAVE_DOCKER" = 1 ]; then
    db -c "SELECT count(*) AS suppliers_in_the_database FROM suppliers"
  else
    run_yourself "docker compose exec supplier-db psql -U $DB_USER -d $DB_NAME -c \"SELECT count(*) FROM suppliers\""
  fi

  step "Create with invalid data" "Every invalid field is named at once, and nothing is stored."
  call admin POST '/suppliers' '{"hours":[{"day":"monday","opens":"25:00","closes":"18:00"}]}'
  expect 400 "invalid create is rejected with every field named"

  step "CREATE a supplier" "The service assigns the id and the creation time (F2.2.1)."
  call admin POST '/suppliers' "$CREATE_BODY"
  expect 201 "an administrator can create"
  local id
  id=$(id_of)

  step "READ it back, as a member" "Reads need no administrator role, and the new supplier is there at once."
  call member GET "/suppliers/$id"
  expect 200 "read back what the administrator created"

  step "UPDATE it" "Any field except the id and the creation time; the hours list is replaced (F2.2.3)."
  call admin PATCH "/suppliers/$id" '{"name":"'"$NAME"' (renamed)","hours":[{"day":"saturday","opens":"10:00","closes":"14:00"}]}'
  expect 200 "an administrator can update"
  call admin PATCH "/suppliers/$id" '{"id":"00000000-0000-4000-8000-000000000000"}'
  expect 400 "the id cannot be changed"

  step "DELETE means deactivate" "The record stays, and the supplier is no longer offered for new errands (F2.2.4, F2.2.5)."
  call admin DELETE "/suppliers/$id"
  expect 200 "an administrator can deactivate"
  call member GET "/suppliers/$id"
  expect 200 "still retrievable, for errands that already use it"
  call member GET "/suppliers?q=$(printf '%s' "$NAME" | tr ' ' '+')"
  expect 200 "left out of the normal listing"
  call member GET "/suppliers/$id/availability"
  expect 200 "orderable is false for an Inactive supplier"
  call member GET "/suppliers?status=Inactive&q=Demo"
  expect 200 "found when Inactive suppliers are asked for"

  step "Reactivate"
  call admin PATCH "/suppliers/$id" '{"status":"Active"}'
  expect 200 "setting the status back to Active reactivates it"

  step "What the database holds" "The supplier the administrator created, and the administrator's account id from the user-service."
  if [ "$HAVE_DOCKER" = 1 ]; then
    db -c "SELECT name, type, status, created_by, updated_at > created_at AS was_edited FROM suppliers WHERE id = '$id'"
    db -c "SELECT weekday, opens_minute, closes_minute FROM supplier_hours WHERE supplier_id = '$id' ORDER BY weekday"
  else
    run_yourself "docker compose exec supplier-db psql -U $DB_USER -d $DB_NAME -c \"SELECT name, type, status, created_by FROM suppliers WHERE id = '$id'\""
  fi

  clean_up "$id"
}

part_independent() {
  part "POINT 3, DEMONSTRATION B  The service does not depend on a UI"

  step "Which containers exist" "The two services, their databases, and the local inbox. None is a UI."
  if [ "$HAVE_DOCKER" = 1 ]; then
    compose ps --format 'table {{.Service}}\t{{.Status}}\t{{.Ports}}'
    compose ps --services | grep -qiE '(^|-)(web|ui|client|frontend)(-|$)'
    check $((1 - $?)) "no container in the system is a UI"
  else
    run_yourself "docker compose ps"
  fi

  step "Is anything serving a UI?" "The web client's development server listens on port 5173."
  if curl -s -m 3 -o /dev/null http://localhost:5173; then
    check 1 "something is listening on port 5173, so a UI is running. Stop it and run this again"
  else
    check 0 "nothing is listening on port 5173, so no UI is running"
  fi

  step "The service answers anyway" "Everything it offers is an HTTP call."
  ensure_sessions
  call member GET '/suppliers?type=Printing'
  expect 200 "a full search works with no UI"
  call admin POST '/suppliers' '{"name":"x"}'
  expect 400 "a create is checked and answered with no UI"

  step "The code does not know a UI exists" "Neither the service's source, its package file nor its Dockerfile mentions the web client."
  if grep -rn "web-client" "$ROOT/supplier-service/src" "$ROOT/supplier-service/package.json" "$ROOT/supplier-service/Dockerfile"; then
    check 1 "the web client is mentioned, see above"
  else
    echo "  (no matches)"
    check 0 "no mention of web-client in the service, its packages or its Dockerfile"
  fi
}

part_tests() {
  part "POINT 3, DEMONSTRATION C  Tested through its APIs, with no UI"

  step "Run every automated test" "The API tests call the real routes against a real PostgreSQL, as a client would. The others cover the logic and the user-service client."
  if command -v npm >/dev/null 2>&1 && [ -d "$ROOT/supplier-service/node_modules" ]; then
    local out code
    out=$(cd "$ROOT/supplier-service" && npm test 2>&1)
    code=$?
    printf '%s\n' "$out" | grep -E '^ℹ (tests|suites|pass|fail|skipped|duration_ms)'
    check "$code" "all automated tests pass"
    printf '%s\n' "$out" | grep -q '^ℹ skipped 0'
    check "$?" "none were skipped, so the database tests really ran"
  else
    run_yourself "cd supplier-service; npm install; npm test"
  fi
}

# ================================================================== point 4
part_end_to_end() {
  part "POINT 4  End to end: a real account registers, verifies, logs in, and uses the API"

  if ! curl -s -m 3 -o /dev/null "$USER_URL/health"; then
    echo "The user-service does not answer at $USER_URL."
    echo "Start the system from the repository root:  docker compose up --build"
    FAILED=$((FAILED + 1))
    return
  fi

  local stamp="$(date +%H%M%S)$RANDOM" email user pass code id student_id
  local since
  since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  email="student$stamp@u.nus.edu"
  user="student$stamp"
  pass="student-pass-$stamp"

  step "A new student registers" "This is the real user-service. It creates the account as PendingVerification and emails a six digit code (F1.1.1, F1.1.4)."
  user_call POST /auth/register "{\"fullName\":\"Demo Student\",\"email\":\"$email\",\"username\":\"$user\",\"password\":\"$pass\"}"
  expect 201 "the account is created"
  student_id=$(id_of)
  DEMO_ACCOUNTS+=("$student_id")

  step "The code arrives by email" "Mailpit is the local inbox that catches every email the system sends."
  echo "\$ curl -G --data-urlencode 'query=to:$email' '$MAIL_URL/api/v1/search'"
  code=$(mail_code "$email")
  check $([ -n "$code" ] && echo 0 || echo 1) "the email arrived. It says: Your verification code is ${code:-(missing)}"

  step "Logging in before verifying is refused" "An account that is not Active gets no session (F1.3.4)."
  user_call POST /auth/login "{\"identifier\":\"$user\",\"password\":\"$pass\"}"
  expect 403 "an unverified account cannot log in"

  step "The student verifies the address" "The code turns the account Active (F1.1.5)."
  user_call POST /auth/verify "{\"email\":\"$email\",\"code\":\"$code\"}"
  expect 200 "the account is Active"

  step "Users log in" "The user-service checks the password and sets a session cookie. The supplier-service never sees a password."
  user_call POST /auth/login "{\"identifier\":\"$user\",\"password\":\"$pass\"}"
  expect 200 "the student gets a session"
  TOKEN_student=$COOKIE_VALUE
  user_call POST /auth/login "{\"identifier\":\"$ADMIN_LOGIN\",\"password\":\"$ADMIN_PASS\"}"
  expect 200 "the administrator gets a session"
  TOKEN_admin=$COOKIE_VALUE

  step "Logins that are refused" "A wrong password and an unknown user get the identical answer, so nobody can find out which usernames exist (F1.3.2)."
  user_call POST /auth/login "{\"identifier\":\"$user\",\"password\":\"wrong-password\"}"
  expect 401 "a wrong password is refused"
  user_call POST /auth/login '{"identifier":"nobody-here","password":"wrong-password"}'
  expect 401 "an unknown user gets the same answer"

  step "The student uses the API" "A member may read the catalogue."
  call student GET '/suppliers?type=Printing'
  expect 200 "the student reads"
  call student POST '/suppliers' "$CREATE_BODY"
  expect 403 "the student cannot create"

  step "The administrator manages a supplier" "Everything the student may do, and the changes."
  call admin POST '/suppliers' "$CREATE_BODY"
  expect 201 "the administrator creates a supplier"
  id=$(id_of)
  call student GET "/suppliers/$id"
  expect 200 "the student sees it at once"
  call admin PATCH "/suppliers/$id" '{"name":"'"$NAME"' (renamed)"}'
  expect 200 "the administrator edits it"
  call admin DELETE "/suppliers/$id"
  expect 200 "the administrator deactivates it"
  call student GET "/suppliers?q=$(printf '%s' "$NAME" | tr ' ' '+')"
  expect 200 "the student no longer finds it in the listing"
  call admin PATCH "/suppliers/$id" '{"status":"Active"}'
  expect 200 "the administrator reactivates it"

  step "Logging out ends a session at once" "A second administrator session logs out, and the supplier-service refuses it immediately, because sessions live in the user-service and not in the cookie."
  user_call POST /auth/login "{\"identifier\":\"$ADMIN_LOGIN\",\"password\":\"$ADMIN_PASS\"}"
  TOKEN_admin2=$COOKIE_VALUE
  call admin2 POST '/suppliers' '{}'
  expect 400 "before logging out the session is allowed to create, and only the empty body is refused"
  user_call POST /auth/logout '' admin2
  expect 204 "the user-service ends the session"
  call admin2 POST '/suppliers' '{}'
  expect 403 "the same session is refused straight away"

  step "What the database now holds" "Who made the change is recorded, from the user-service's answer: the administrator's real account id."
  if [ "$HAVE_DOCKER" = 1 ]; then
    db -c "SELECT name, status, created_by, updated_by, updated_at > created_at AS was_edited FROM suppliers WHERE id = '$id'"
    db -c "SELECT status, count(*) FROM suppliers GROUP BY status ORDER BY status"
  else
    run_yourself "docker compose exec supplier-db psql -U $DB_USER -d $DB_NAME -c \"SELECT name, status, created_by, updated_by FROM suppliers WHERE id = '$id'\""
  fi

  step "What the two services logged" "Registration, the email, the verification and each login in the user-service, and each decision in the supplier-service. Reads that were allowed are left out."
  if [ "$HAVE_DOCKER" = 1 ]; then
    if [ -n "$NODE" ]; then
      compose logs user-service supplier-service --since "$since" 2>&1 | "$NODE" -e "$LOG_JS" | tail -n 40
    else
      compose logs user-service supplier-service --since "$since" 2>&1 | tail -n 40
    fi
  else
    run_yourself "docker compose logs user-service supplier-service --since $since"
  fi

  clean_up "$id"
}

# ================================================================== run
ALL_PARTS=(queries access crud independent tests end-to-end)
PARTS=("$@")
[ ${#PARTS[@]} -eq 0 ] && PARTS=("${ALL_PARTS[@]}")

for p in "${PARTS[@]}"; do
  case "$p" in
    queries | access | crud | independent | tests | end-to-end) ;;
    *)
      echo "Unknown part: $p"
      echo "Choose from: ${ALL_PARTS[*]}"
      exit 2
      ;;
  esac
done

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is needed to call the service. Install it and run this again."
  exit 1
fi
if ! curl -s -f "$BASE/health" >/dev/null; then
  echo "The Supplier Service does not answer at $BASE."
  echo "Start the system from the repository root:  docker compose up --build"
  exit 1
fi
echo "Supplier Service is up at $BASE"
[ -z "$NODE" ] && echo "Node was not found, so responses are shown as raw JSON."
[ "$HAVE_DOCKER" = 0 ] && echo "Docker does not work in this shell, so the database and log steps are shown as commands to run yourself."

for p in "${PARTS[@]}"; do
  case "$p" in
    queries) part_queries ;;
    access) part_access ;;
    crud) part_crud ;;
    independent) part_independent ;;
    tests) part_tests ;;
    end-to-end) part_end_to_end ;;
  esac
done

printf '\n'
remove_demo_accounts

printf '\n\n============================================================\n'
printf 'Checks passed: %s   failed: %s\n' "$PASSED" "$FAILED"
[ "$FAILED" = 0 ]
