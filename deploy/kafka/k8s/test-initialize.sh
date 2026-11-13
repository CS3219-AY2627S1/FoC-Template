#!/usr/bin/env bash
set -euo pipefail
# Only run inside the disposable Docker invocation documented beside this test.
if [ "${KAFKA_INITIALIZER_TEST_ONLY:-}" != true ]; then
  echo 'Set KAFKA_INITIALIZER_TEST_ONLY=true in a disposable test container, never a live broker.' >&2
  exit 1
fi
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
export TEST_WORK="$work"
cat > "$work/cli" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
if [ "${TEST_FAIL_ALWAYS:-false}" = true ]; then exit 1; fi
if [ ! -e "$TEST_WORK/failed-once" ]; then touch "$TEST_WORK/failed-once"; exit 1; fi
mkdir "$TEST_WORK/active" || { echo 'Unexpected concurrent CLI with parallelism=1' >&2; exit 1; }
trap 'rmdir "$TEST_WORK/active"' EXIT
{
  printf '%s' "$0"
  printf ' %s' "$@"
  printf '\n'
} >> "$TEST_WORK/calls"
sleep .01
MOCK
chmod +x "$work/cli"
for name in kafka-topics.sh kafka-configs.sh kafka-acls.sh; do ln -s "$work/cli" "$work/$name"; done
export KAFKA_BIN_DIR="$work" KAFKA_ADMIN_PASSWORD=test-only KAFKA_INIT_PARALLELISM=1
bash /opt/foc-kafka/initialize.sh > "$work/log" 2>&1
grep -q 'retry 1/3' "$work/log"
grep -q 'Kafka topics and ACLs are initialized' "$work/log"
grep -Fq -- '--operation Describe --group *' "$work/calls"
if grep -Eq -- '--operation Read( --operation [A-Za-z]+)* --group \*$' "$work/calls"; then
  echo 'Kafka UI must not receive wildcard group Read permission' >&2
  exit 1
fi
test "$(wc -l < "$work/calls")" -gt 40
for topic in admin.dispute.commands order.dispute.commands order.dispute.events chat.dispute.events credit.dispute.events; do
  grep -q -- "--topic $topic" "$TEST_WORK/calls"
done
for group in admin-service-disputes order-service-disputes chat-service-disputes credit-service-disputes; do
  grep -q -- "--group $group" "$TEST_WORK/calls"
done
grep -q -- '--allow-principal User:admin_service --operation Write --operation Describe --topic admin.dispute.commands' "$TEST_WORK/calls"
export TEST_FAIL_ALWAYS=true
if bash /opt/foc-kafka/initialize.sh > "$work/failure-log" 2>&1; then echo 'Failure was incorrectly accepted' >&2; exit 1; fi
if KAFKA_INIT_PARALLELISM=0 bash /opt/foc-kafka/initialize.sh > /dev/null 2>&1; then exit 1; fi
echo 'PASS test-only CLI mocks: serial limit, recoverable retry, exhausted failure and invalid configuration.'
