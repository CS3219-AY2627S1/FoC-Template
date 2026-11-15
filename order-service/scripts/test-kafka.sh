#!/usr/bin/env bash
# AI Assistance Disclosure: Claude Code (Claude Opus 5.5), 2026-10-18. Scope: runs the Order
# Service tests, including the Kafka integration suite, against a throwaway PostgreSQL and a
# throwaway single-node Kafka broker. Author review: Reviewed and approved by @phuc
# Additional AI assistance: OpenAI Codex, 2026-11-09. Scope: CI reports, readiness and diagnostics. Review: Reviewed and approved by @ron on 2026-11-09.
#
# Usage (from anywhere):  bash order-service/scripts/test-kafka.sh [--keep]
#   --keep   leave both containers running afterwards
#
# The containers get unique names and their own host ports (PG_PORT, default 55434;
# KAFKA_PORT, default 59092), so this runs next to the dev stack without touching it. Topics
# are created with the repository's kafka/create-topics.sh, as in Compose.
set -euo pipefail

cd "$(dirname "$0")/.."
RUN_ID="$$"
PG=order-it-pg-$RUN_ID
KAFKA=order-it-kafka-$RUN_ID
PG_PORT=${PG_PORT:-55434}
KAFKA_PORT=${KAFKA_PORT:-59092}
CONTROLLER_PORT=$((KAFKA_PORT + 1))

KEEP=false
for arg in "$@"; do
  case "$arg" in
    --keep) KEEP=true ;;
    -h|--help) sed -n '3,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)" >&2; exit 1 ;;
  esac
done

finish() {
  status=$?
  if [[ -n "${CI_ARTIFACT_DIR:-}" ]]; then
    docker logs --tail 300 "$KAFKA" 2>&1 | node ../scripts/ci/evidence.mjs redact > "$CI_ARTIFACT_DIR/kafka.log" || true
    docker logs --tail 100 "$PG" 2>&1 | node ../scripts/ci/evidence.mjs redact > "$CI_ARTIFACT_DIR/postgres.log" || true
    if ! node ../scripts/ci/evidence.mjs sanitize "$CI_ARTIFACT_DIR"; then status=1; fi
  fi
  if [[ "$KEEP" == true ]]; then
    echo "Containers left running: $PG $KAFKA (remove with: docker rm -fv $PG $KAFKA)"
  else
    if ! docker rm -fv "$PG" "$KAFKA" >/dev/null 2>&1; then
      echo "Cleanup failed for owned containers $PG $KAFKA" >&2
      status=1
    fi
  fi
  exit $status
}
trap finish EXIT

echo "Starting PostgreSQL ($PG) and Kafka ($KAFKA)..."
docker run -d --name "$PG" -e POSTGRES_PASSWORD=postgres -p "127.0.0.1:$PG_PORT:5432" postgres:17.11-alpine3.24 >/dev/null
# The broker listens and advertises on the same port inside and outside the container, so both
# the tests on the host and the topic script inside the container can reach it
docker run -d --name "$KAFKA" -p "127.0.0.1:$KAFKA_PORT:$KAFKA_PORT" \
  -e KAFKA_NODE_ID=1 \
  -e KAFKA_PROCESS_ROLES=broker,controller \
  -e KAFKA_LISTENERS="PLAINTEXT://:$KAFKA_PORT,CONTROLLER://:$CONTROLLER_PORT" \
  -e KAFKA_ADVERTISED_LISTENERS="PLAINTEXT://localhost:$KAFKA_PORT" \
  -e KAFKA_LISTENER_SECURITY_PROTOCOL_MAP=CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT \
  -e KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER \
  -e KAFKA_CONTROLLER_QUORUM_VOTERS="1@localhost:$CONTROLLER_PORT" \
  -e KAFKA_INTER_BROKER_LISTENER_NAME=PLAINTEXT \
  -e KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1 \
  -e KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR=1 \
  -e KAFKA_TRANSACTION_STATE_LOG_MIN_ISR=1 \
  -e KAFKA_MIN_INSYNC_REPLICAS=1 \
  -e KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS=0 \
  -e KAFKA_AUTO_CREATE_TOPICS_ENABLE=false \
  apache/kafka:3.9.0 >/dev/null

for _ in $(seq 1 60); do
  docker exec "$PG" pg_isready -h localhost -U postgres >/dev/null 2>&1 && break
  sleep 1
done

for _ in $(seq 1 90); do
  docker exec "$KAFKA" /opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server "localhost:$KAFKA_PORT" >/dev/null 2>&1 && break
  sleep 1
done

# Expired readiness loops must fail before running a suite against unready services.
docker exec "$PG" pg_isready -h localhost -U postgres >/dev/null
docker exec "$KAFKA" /opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server "localhost:$KAFKA_PORT" >/dev/null

echo "Creating topics with kafka/create-topics.sh..."
# CRs removed: a Windows checkout has CRLF line endings, which sh rejects
tr -d '\r' < ../kafka/create-topics.sh | docker exec -i -e BOOTSTRAP_SERVER="localhost:$KAFKA_PORT" "$KAFKA" sh -s >/dev/null

echo "Running the tests..."
report_args=(--test-reporter=spec --test-reporter-destination=stdout)
if [[ -n "${CI_ARTIFACT_DIR:-}" ]]; then
  report_args+=(--test-reporter=junit --test-reporter-destination="$CI_ARTIFACT_DIR/tests.xml")
fi
TEST_DATABASE_URL="postgres://postgres:postgres@localhost:$PG_PORT/postgres" \
TEST_KAFKA_BROKERS="localhost:$KAFKA_PORT" \
TEST_KAFKA_CONTAINER="$KAFKA" \
  node --import tsx --test --test-concurrency=1 "${report_args[@]}" "test/**/*.test.ts"
