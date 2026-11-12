#!/bin/sh

# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-10-09 to 2026-10-15
# Scope (AI-24): Generated code, configuration and tests for the specified user event, Kafka setup and outbox changes.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

# Registers (or updates) every connector in /connectors with Kafka Connect, then waits for each to run.
# PUT .../config is idempotent, so this is safe to re-run on every `docker compose up`.
# A connector fails while its service has not yet created the outbox table, so failed ones are restarted.
set -eu

CONNECT_URL="${CONNECT_URL:-http://kafka-connect:8083}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-60}"

echo "Waiting for Kafka Connect at ${CONNECT_URL}"
until curl -sf "${CONNECT_URL}/connectors" > /dev/null; do
  sleep 2
done

for file in /connectors/*.json; do
  name="$(basename "${file}" .json)"
  echo "Registering ${name}"
  curl -sf -X PUT -H "Content-Type: application/json" --data "@${file}" \
    "${CONNECT_URL}/connectors/${name}/config" > /dev/null
done

status=0
for file in /connectors/*.json; do
  name="$(basename "${file}" .json)"
  attempt=1
  while :; do
    state="$(curl -sf "${CONNECT_URL}/connectors/${name}/status" | grep -o '"state":"[A-Z]*"' | sort -u | tr '\n' ' ')"
    case "${state}" in
      *FAILED*) ;;
      *RUNNING*) echo "${name}: RUNNING"; break ;;
    esac
    if [ "${attempt}" -ge "${MAX_ATTEMPTS}" ]; then
      echo "${name}: not running after ${attempt} attempts (${state})" >&2
      status=1
      break
    fi
    curl -sf -X POST "${CONNECT_URL}/connectors/${name}/restart?includeTasks=true&onlyFailed=true" > /dev/null || true
    attempt=$((attempt + 1))
    sleep 5
  done
done

exit "${status}"
