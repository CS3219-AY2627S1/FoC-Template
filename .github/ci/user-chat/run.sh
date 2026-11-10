#!/usr/bin/env bash
# Run from any directory with Bash, Docker Compose, OpenSSL, Node/npm and Python.
set +x
set -euo pipefail
export LC_ALL=C

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_dir=$(cd -- "$script_dir/../../.." && pwd)
state_dir=${USER_CHAT_CI_STATE_DIR:-"$script_dir/secrets"}
artifact_dir=${USER_CHAT_CI_ARTIFACT_DIR:-"$repo_dir/web-client/test-results/user-chat-ci"}
created_state=0

host_path() {
  if command -v cygpath > /dev/null; then cygpath -m -- "$1"; else printf '%s\n' "$1"; fi
}

value() { sed -n "s/^$1=//p" "$state_dir/stack.env"; }

owned_state() {
  if [[ ! -f "$state_dir/owner" ]] || [[ $(cat "$state_dir/owner") != "$repo_dir" ]]; then
    echo "No User + Chat CI state owned by this checkout at $state_dir" >&2
    return 1
  fi
}

compose() {
  owned_state || return
  local project
  project=$(cat "$state_dir/project")
  [[ $project =~ ^foc-user-chat-ci-[a-f0-9]{12}$ ]] || return 1
  MSYS_NO_PATHCONV=1 docker compose --file "$(host_path "$script_dir/compose.yaml")" \
    --env-file "$(host_path "$state_dir/stack.env")" --project-name "$project" "$@"
}

up() {
  if [[ -e "$state_dir" ]]; then
    echo "CI state already exists at $state_dir; run run.sh down before starting again." >&2
    return 1
  fi
  [[ ${USER_CHAT_WEB_PORT:-18880} =~ ^[0-9]+$ && ${USER_CHAT_MAIL_PORT:-18825} =~ ^[0-9]+$ ]]
  umask 077
  mkdir -p -- "$state_dir/keys" "$artifact_dir"
  printf '%s\n' "$repo_dir" > "$state_dir/owner"
  created_state=1
  printf 'foc-user-chat-ci-%s\n' "$(openssl rand -hex 6)" > "$state_dir/project"
  {
    printf 'CI_PROJECT_NAME=%s\n' "$(cat "$state_dir/project")"
    printf 'CI_RUNTIME_DIR=%s\n' "$(host_path "$state_dir")"
    printf 'USER_CHAT_WEB_PORT=%s\n' "${USER_CHAT_WEB_PORT:-18880}"
    printf 'USER_CHAT_MAIL_PORT=%s\n' "${USER_CHAT_MAIL_PORT:-18825}"
    for name in CI_USER_DB_ADMIN_PASSWORD CI_CHAT_DB_ADMIN_PASSWORD CI_USER_DB_PASSWORD \
      CI_CHAT_DB_PASSWORD CI_RABBITMQ_PASSWORD CI_OTP_HMAC_SECRET CI_CHAT_SHARED_SECRET; do
      printf '%s=%s\n' "$name" "$(openssl rand -hex 32)"
    done
  } > "$state_dir/stack.env"
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$state_dir/keys/private.pem" 2> /dev/null
  openssl pkey -in "$state_dir/keys/private.pem" -pubout -out "$state_dir/keys/public.pem" 2> /dev/null
  # Disposable keys are mounted only into the non-root User API. Keep their
  # parent state directory private; the mount itself must be readable by its UID.
  chmod 755 "$state_dir/keys"
  chmod 444 "$state_dir/keys/"*.pem

  compose build user-service chat-service web-client
  compose up --detach --wait --wait-timeout 120 user-db chat-db rabbitmq mailpit
  # Supabase's built-in role names are referenced by Chat's REVOKE statements.
  # Plain PostgreSQL CI needs only these NOLOGIN roles, with no Supabase APIs.
  compose exec -T chat-db psql -X --set ON_ERROR_STOP=1 -U postgres -d chat_ci <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
SQL
  for service in user chat; do
    for migration in "$repo_dir/$service-service/supabase/migrations/"*.sql; do
      echo "Applying $service migration $(basename -- "$migration")"
      compose exec -T "$service-db" psql -X --set ON_ERROR_STOP=1 -U postgres -d "${service}_ci" < "$migration"
    done
  done
  compose exec -T -e "CI_RUNTIME_PASSWORD=$(value CI_USER_DB_PASSWORD)" user-db \
    psql -X --set ON_ERROR_STOP=1 -U postgres -d user_ci <<'SQL'
\getenv runtime_password CI_RUNTIME_PASSWORD
CREATE ROLE user_ci_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'runtime_password';
GRANT user_service_app TO user_ci_runtime;
SQL
  compose exec -T -e "CI_RUNTIME_PASSWORD=$(value CI_CHAT_DB_PASSWORD)" chat-db \
    psql -X --set ON_ERROR_STOP=1 -U postgres -d chat_ci <<'SQL'
\getenv runtime_password CI_RUNTIME_PASSWORD
CREATE ROLE chat_ci_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'runtime_password';
GRANT chat_runtime TO chat_ci_runtime;
SQL
  compose up --detach --wait --wait-timeout 120 user-service user-outbox chat-service chat-outbox web-client
  # Check readiness through the running APIs, including the live subscription.
  compose exec -T chat-service python -c \
    'import json, urllib.request; data=json.load(urllib.request.urlopen("http://127.0.0.1:8003/health/ready", timeout=5)); assert data == {"status": "ready", "delivery": "ready"}, data'
  compose exec -T user-service python -c \
    'import json, urllib.request; data=json.load(urllib.request.urlopen("http://127.0.0.1:8000/.well-known/jwks.json", timeout=5)); assert data["keys"]'
  echo "User + Chat CI stack ready at http://127.0.0.1:$(value USER_CHAT_WEB_PORT)"
}

test_live() {
  owned_state || return
  mkdir -p -- "$artifact_dir"
  (
    cd -- "$repo_dir/web-client"
    CHAT_LIVE_E2E=1 E2E_BASE_URL="http://127.0.0.1:$(value USER_CHAT_WEB_PORT)" \
      CHAT_LIVE_MAILPIT_URL="http://127.0.0.1:$(value USER_CHAT_MAIL_PORT)" \
      PLAYWRIGHT_JUNIT_OUTPUT_FILE="$(host_path "$artifact_dir/junit.xml")" \
      npx playwright test tests/e2e/messages-live.spec.ts --workers=1 --retries=0 \
        --reporter=line,junit --output="$(host_path "$artifact_dir/browser")"
  )
  # An accidentally disabled/renamed test must never make the integration gate green.
  python - "$artifact_dir/junit.xml" <<'PY'
import sys
import xml.etree.ElementTree as ET

suites = list(ET.parse(sys.argv[1]).getroot().iter("testsuite"))
counts = {key: sum(int(s.get(key, "0")) for s in suites) for key in ("tests", "skipped", "failures", "errors")}
if counts != {"tests": 1, "skipped": 0, "failures": 0, "errors": 0}:
    raise SystemExit(f"Expected one executed, passing User + Chat acceptance test: {counts}")
print("Real User + Chat acceptance ran and passed; no skipped cases.")
PY
}

logs() {
  owned_state || return
  mkdir -p -- "$artifact_dir"
  compose ps --all > "$artifact_dir/containers.txt" || return
  compose logs --no-color --tail 200 user-service user-outbox chat-service chat-outbox web-client \
    > "$artifact_dir/services.log" 2>&1
}

down() {
  [[ -e "$state_dir" ]] || return 0
  owned_state || return
  compose down --volumes --remove-orphans --timeout 10 || return
  local project
  project=$(cat "$state_dir/project")
  MSYS_NO_PATHCONV=1 docker image rm "$project-user" "$project-chat" "$project-web" > /dev/null 2>&1 || true
  # Delete only known generated files under the state directory we just verified.
  rm -f -- "$state_dir/keys/private.pem" "$state_dir/keys/public.pem" \
    "$state_dir/stack.env" "$state_dir/owner" "$state_dir/project"
  rmdir -- "$state_dir/keys" "$state_dir"
}

finish() {
  local status=$?
  trap - EXIT
  if [[ $created_state == 1 ]]; then
    logs || true
    down || { [[ $status -ne 0 ]] || status=1; }
  fi
  exit "$status"
}

case ${1:-all} in
  all) trap finish EXIT; up; test_live ;;
  up) up ;;
  test) test_live ;;
  logs) logs ;;
  down) down ;;
  *) echo "Usage: bash run.sh [all|up|test|logs|down]" >&2; exit 2 ;;
esac
