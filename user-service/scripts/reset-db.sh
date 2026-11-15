#!/usr/bin/env bash
# AI Assistance Disclosure: Claude Code (Claude Opus 5.5), 2026-10-09. Scope: implemented the
# author's reset-script decisions (User Service only, check-and-print .env, ask first with
# --yes to skip, reusable, stop after reset). Author review: Reviewed and approved by @t-leongchuan
#
# Resets your LOCAL User Service database: deletes all accounts, recreates the database
# roles, applies the migrations and starts the User Service again.
# Other services' containers and data are not touched.
#
# Usage (from anywhere in the repo):
#   bash user-service/scripts/reset-db.sh          # asks before deleting
#   bash user-service/scripts/reset-db.sh --yes    # no question
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

YES=false
for arg in "$@"; do
  case "$arg" in
    -y|--yes) YES=true ;;
    -h|--help) sed -n '3,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)" >&2; exit 1 ;;
  esac
done

# 1. Check .env (never modified by this script)
REQUIRED=(JWT_SECRET USER_DB_ADMIN_PASSWORD USER_DB_MIGRATION_PASSWORD USER_DB_APP_PASSWORD)
if [[ ! -f .env ]]; then
  echo "No .env file in $ROOT. Create one first: cp .env.example .env, then fill it in." >&2
  exit 1
fi
missing=()
for name in "${REQUIRED[@]}"; do
  grep -Eq "^${name}=.+" .env || missing+=("$name")
done
if (( ${#missing[@]} > 0 )); then
  echo "Your .env is missing values for these settings (see .env.example for what they mean):" >&2
  for name in "${missing[@]}"; do
    echo "  ${name}=" >&2
  done
  echo "Passwords: letters and digits only, e.g. the output of: openssl rand -hex 16" >&2
  exit 1
fi

# 2. Ask first (default: no)
if [[ "$YES" != true ]]; then
  read -r -p "This deletes your local User Service database (all accounts). Other services are not touched. Continue? [y/N] " answer
  case "$answer" in
    y|Y|yes|YES) ;;
    *) echo "Cancelled. Nothing was changed."; exit 0 ;;
  esac
fi

# 3. Remove the User Service containers and only its database volume
project="$(docker compose config | sed -n 's/^name: //p' | head -n 1)"
docker compose rm --stop --force user-service user-migrate user-db
volume="$(docker volume ls -q \
  --filter "label=com.docker.compose.project=${project}" \
  --filter "label=com.docker.compose.volume=user-db-data")"
if [[ -n "$volume" ]]; then
  docker volume rm "$volume"
fi

# 4. Start again: user-db (fresh roles), then user-migrate, then user-service
if ! docker compose up --build -d user-service; then
  echo "Start-up failed. See: docker compose logs user-db user-migrate user-service" >&2
  exit 1
fi

# The gateway looks up user-service's address when it starts, so restart it if it is running
if [[ -n "$(docker compose ps -q --status running frontend)" ]]; then
  docker compose restart frontend
fi

port="$(sed -n 's/^FRONTEND_PORT=//p' .env | tr -d ' "')"
echo
echo "Done. The User Service database is fresh: only the first administrator from"
echo "BOOTSTRAP_ADMIN_* in .env exists (if set)."
echo "Next: re-create any test users, e.g. at http://localhost:${port:-8080}/register"
echo "If other services aren't running (e.g. after a failed 'docker compose up'),"
echo "start them with: docker compose up -d"
