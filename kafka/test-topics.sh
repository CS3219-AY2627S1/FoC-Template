#!/bin/sh
# AI Assistance Disclosure: Claude Code (Claude Opus 5.5), 2026-10-16. Scope: smoke tests for
# the Kafka broker and the three topics, using Kafka's own command-line tools.
# Author review: Reviewed and approved by @phuc
# Additional AI assistance: Claude Code (Claude Opus 5.5), 2026-10-16. Scope: also checks the two
# dead-letter topics. Author review: Reviewed and approved by @phuc
# Additional AI assistance: Claude Code (Claude Opus 5.5), 2026-10-18. Scope: also checks
# credit.results.dlq. Author review: Reviewed and approved by @phuc
#
# Run with: docker compose run --rm kafka-test
#
# The real topics are only inspected, never written to: Credit Service reads them from the
# beginning, so a test message left there would later reach it as an invalid message.
# Sending, ordering and offsets are tested on a temporary topic with the same settings,
# which is deleted at the end.
set -u

BOOTSTRAP_SERVER="${BOOTSTRAP_SERVER:-kafka:9092}"
BIN=/opt/kafka/bin
TOPICS="user.account-status credit.commands credit.results user.account-status.dlq credit.commands.dlq credit.results.dlq"

RUN_ID="$(date +%s)-$$"
TEMP_TOPIC="kafka-test.roundtrip-${RUN_ID}"
TEMP_GROUP="kafka-test-${RUN_ID}"

passed=0
failed=0
pass() { passed=$((passed + 1)); echo "PASS  $1"; }
fail() { failed=$((failed + 1)); echo "FAIL  $1"; [ -n "${2:-}" ] && printf '%s\n' "$2" | sed 's/^/      /'; }

kafka_topics() { "$BIN/kafka-topics.sh" --bootstrap-server "$BOOTSTRAP_SERVER" "$@" 2>/dev/null; }

cleanup() {
  kafka_topics --delete --if-exists --topic "$TEMP_TOPIC" >/dev/null
  "$BIN/kafka-consumer-groups.sh" --bootstrap-server "$BOOTSTRAP_SERVER" --delete --group "$TEMP_GROUP" >/dev/null 2>&1
}
trap cleanup EXIT

# Reads up to $2 messages from the temporary topic as group $1, printing key:value per line
consume() {
  "$BIN/kafka-console-consumer.sh" --bootstrap-server "$BOOTSTRAP_SERVER" \
    --topic "$TEMP_TOPIC" --group "$1" --max-messages "$2" --timeout-ms 20000 \
    --consumer-property auto.offset.reset=earliest \
    --property print.key=true --property key.separator=: 2>/dev/null
}

# Sends key:value lines from stdin to the temporary topic, waiting for acks from all replicas
produce() {
  "$BIN/kafka-console-producer.sh" --bootstrap-server "$BOOTSTRAP_SERVER" --topic "$TEMP_TOPIC" \
    --producer-property acks=all --producer-property enable.idempotence=true \
    --property parse.key=true --property key.separator=: 2>/dev/null
}

echo "== Real topics (read-only) =="

for topic in $TOPICS; do
  desc="$(kafka_topics --describe --topic "$topic")"
  if [ -z "$desc" ]; then
    fail "$topic exists" "not found; run: docker compose up kafka-init"
    continue
  fi
  pass "$topic exists"

  if printf '%s\n' "$desc" | grep -Eq "PartitionCount: 1[[:space:]]"; then
    pass "$topic has 1 partition"
  else
    fail "$topic has 1 partition" "$desc"
  fi
  if printf '%s\n' "$desc" | grep -Eq "ReplicationFactor: 1[[:space:]]"; then
    pass "$topic has replication factor 1"
  else
    fail "$topic has replication factor 1" "$desc"
  fi
  if printf '%s\n' "$desc" | grep -Eq "Partition: 0[[:space:]]+Leader: [0-9]+"; then
    pass "$topic partition 0 has a leader"
  else
    fail "$topic partition 0 has a leader" "$desc"
  fi

  # Fetching the end offset proves a client can read the partition's metadata
  offsets="$("$BIN/kafka-get-offsets.sh" --bootstrap-server "$BOOTSTRAP_SERVER" --topic "$topic" 2>/dev/null)"
  if printf '%s\n' "$offsets" | grep -Eq "^${topic}:0:[0-9]+$"; then
    pass "$topic is readable (end offset ${offsets##*:})"
  else
    fail "$topic is readable" "$offsets"
  fi
done

echo
echo "== Broker settings =="

broker_config="$("$BIN/kafka-configs.sh" --bootstrap-server "$BOOTSTRAP_SERVER" \
  --describe --entity-type brokers --entity-name 1 --all 2>/dev/null)"
if printf '%s\n' "$broker_config" | grep -q "auto.create.topics.enable=false"; then
  pass "automatic topic creation is off"
else
  fail "automatic topic creation is off" "$(printf '%s\n' "$broker_config" | grep auto.create.topics.enable)"
fi

echo
echo "== Send and receive (temporary topic $TEMP_TOPIC) =="

if kafka_topics --create --topic "$TEMP_TOPIC" --partitions 1 --replication-factor 1 >/dev/null; then
  pass "temporary topic created with the same settings"
else
  fail "temporary topic created with the same settings"
  echo
  echo "$passed passed, $failed failed"
  exit 1
fi

# Same key for all three, as for the messages of one order
printf 'order-1:reserve\norder-1:accepted\norder-1:completed\n' | produce
expected="$(printf 'order-1:reserve\norder-1:accepted\norder-1:completed')"
got="$(consume "$TEMP_GROUP" 3)"
if [ "$got" = "$expected" ]; then
  pass "messages arrive with their keys, in the order sent"
else
  fail "messages arrive with their keys, in the order sent" "expected:
$expected
got:
$got"
fi

# The group committed offset 3 when the consumer closed, so it resumes after those messages
printf 'order-2:reserve\n' | produce
got="$(consume "$TEMP_GROUP" 1)"
if [ "$got" = "order-2:reserve" ]; then
  pass "a consumer group resumes from its committed offset (no redelivery)"
else
  fail "a consumer group resumes from its committed offset (no redelivery)" "expected: order-2:reserve
got: $got"
fi

# A new group starts from the beginning (auto.offset.reset=earliest) and sees every message
got="$(consume "${TEMP_GROUP}-fresh" 4 | wc -l | tr -d ' ')"
"$BIN/kafka-consumer-groups.sh" --bootstrap-server "$BOOTSTRAP_SERVER" --delete --group "${TEMP_GROUP}-fresh" >/dev/null 2>&1
if [ "$got" = "4" ]; then
  pass "a new consumer group reads from the beginning"
else
  fail "a new consumer group reads from the beginning" "expected 4 messages, got $got"
fi

echo
echo "$passed passed, $failed failed"
[ "$failed" -eq 0 ]
