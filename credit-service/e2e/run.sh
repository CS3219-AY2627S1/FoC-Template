#!/usr/bin/env bash
# AI Assistance Disclosure: Claude Code (Claude Opus 5.5), 2026-10-16. Scope: runs the Credit
# Service end-to-end test in its own throwaway Compose stack. Author review: Reviewed and approved by @phuc
# Additional AI assistance: OpenAI Codex, 2026-11-09. Scope: isolated CI project, reports and diagnostics. Review: Reviewed and approved by @ron on 2026-11-09.
#
# Usage (from anywhere in the repo):  bash credit-service/e2e/run.sh
#   --keep   leave the stack running afterwards (inspect with the printed commands)
#
# Starts Kafka, credit-db and credit-service under the project name foc-credit-e2e, sends
# messages to the real topics as User Service and Order Service would, and checks the replies,
# the DLQs and the database. Your dev stack and its data are not touched.
set -euo pipefail

cd "$(dirname "$0")"
PROJECT="${CI_COMPOSE_PROJECT:-foc-credit-e2e}"
compose_files=(-f compose.yaml)
if [[ -n "${CI_COMPOSE_OVERRIDE:-}" ]]; then compose_files+=(-f "$CI_COMPOSE_OVERRIDE"); fi
compose() { docker compose -p "$PROJECT" "${compose_files[@]}" "$@"; }

KEEP=false
for arg in "$@"; do
  case "$arg" in
    --keep) KEEP=true ;;
    -h|--help) sed -n '3,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)" >&2; exit 1 ;;
  esac
done

finish() {
  status=$?
  if [[ -n "${CI_ARTIFACT_DIR:-}" ]]; then
    compose logs --no-color --tail 300 2>&1 | node ../../scripts/ci/evidence.mjs redact > "$CI_ARTIFACT_DIR/compose.log" || true
    compose ps -a 2>&1 | node ../../scripts/ci/evidence.mjs redact > "$CI_ARTIFACT_DIR/compose-status.log" || true
    if ! node ../../scripts/ci/evidence.mjs sanitize "$CI_ARTIFACT_DIR"; then status=1; fi
  fi
  if [[ $status -ne 0 ]]; then
    echo
    echo "---- credit-service logs ----"
    compose logs --no-color --tail 80 credit-service || true
  fi
  if [[ "$KEEP" == true ]]; then
    echo
    echo "Stack left running. Inspect:  docker compose -p $PROJECT -f credit-service/e2e/compose.yaml logs credit-service"
    echo "Remove it:                    docker compose -p $PROJECT -f credit-service/e2e/compose.yaml down -v"
  else
    if ! compose down -v --remove-orphans >/dev/null 2>&1; then
      echo "Cleanup failed for owned Compose project $PROJECT" >&2
      status=1
    fi
  fi
  exit $status
}
trap finish EXIT

# Fresh start, in case a previous run was interrupted
compose down -v --remove-orphans >/dev/null 2>&1 || true

echo "Building images and starting the test stack..."
compose build --quiet credit-migrate e2e
compose up -d --wait credit-service

echo "Running the end-to-end test..."
if [[ -n "${CI_ARTIFACT_DIR:-}" ]]; then
  compose run --rm --user "$(id -u):$(id -g)" --volume "$CI_ARTIFACT_DIR:/reports" e2e \
    node --import tsx --test --test-concurrency=1 \
    --test-reporter=spec --test-reporter-destination=stdout \
    --test-reporter=junit --test-reporter-destination=/reports/tests.xml e2e/credit-flow.test.ts
else
  compose run --rm e2e
fi
