#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: OpenAI Codex (GPT-5), date: 2026-09-25
# Scope: End-to-end local smoke test for Credit compensation delivery and deduplication.
# Author review: I reviewed the code for correctness.

set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
project=demo-foc-local
emulator=${PUBSUB_EMULATOR_HTTP:-http://127.0.0.1:8085}
request_topic=credit-command-compensation-local-v1
result_subscription=credit-compensation-results-test-local-v1
requester="smoke-requester-$(date +%s)"
order_id="smoke-order-$(date +%s)"
command_id="smoke-command-$(date +%s)"
compensation_id=$(uuidgen | tr '[:upper:]' '[:lower:]')
binding_hash=$(printf 'RESERVE\n%s\n%s\n5' "$requester" "$order_id" | shasum -a 256 | awk '{print $1}')

cd "$root"
docker compose up -d credit-postgres pubsub-emulator credit-service pubsub-init

docker compose exec -T credit-postgres psql \
  -U "${CREDIT_DB_USERNAME:-credit_dev}" -d "${CREDIT_DB_NAME:-credit_service}" \
  -v ON_ERROR_STOP=1 \
  -v requester="$requester" -v order_id="$order_id" -v command_id="$command_id" \
  -v binding_hash="$binding_hash" <<'SQL'
insert into credit_accounts(user_id, total_balance, reserved_balance, created_at, updated_at)
values (:'requester', 50, 5, now(), now());
insert into credit_command_records(command_id, operation, actor_id, order_id, amount,
    payload_hash, highest_generation, outcome, code, created_at, updated_at, completed_at,
    effect_revision, provider_resolution_revision)
values (:'command_id', 'RESERVE', :'requester', :'order_id', 5, :'binding_hash', 1,
    'APPLIED', 'SUCCEEDED', now(), now(), now(), 1, 0);
insert into credit_reservations(order_id, requester_id, amount, status, created_at, updated_at,
    reserve_command_id, mutation_revision, last_mutation_identity)
values (:'order_id', :'requester', 5, 'RESERVED', now(), now(), :'command_id', 1, :'command_id');
SQL

payload=$(jq -cn \
  --arg eventId "$compensation_id" --arg commandId "$command_id" \
  --arg orderId "$order_id" --arg actorId "$requester" \
  '{eventId:$eventId,commandId:$commandId,operation:"RESERVE",orderId:$orderId,
    actorId:$actorId,generation:2,amount:5}')
encoded=$(printf '%s' "$payload" | base64 | tr -d '\n')
publish_body=$(jq -cn --arg data "$encoded" \
  '{messages:[{data:$data,attributes:{eventType:"CreditCompensationRequested",eventVersion:"1"}}]}')

publish() {
  curl -fsS -X POST -H 'Content-Type: application/json' \
    -d "$publish_body" "$emulator/v1/projects/$project/topics/$request_topic:publish" >/dev/null
}

pull_result() {
  local response
  for _ in {1..30}; do
    response=$(curl -fsS -X POST -H 'Content-Type: application/json' \
      -d '{"maxMessages":1}' \
      "$emulator/v1/projects/$project/subscriptions/$result_subscription:pull")
    if [[ $(jq '.receivedMessages | length // 0' <<<"$response") -gt 0 ]]; then
      ack_id=$(jq -r '.receivedMessages[0].ackId' <<<"$response")
      curl -fsS -X POST -H 'Content-Type: application/json' \
        -d "$(jq -cn --arg ack "$ack_id" '{ackIds:[$ack]}')" \
        "$emulator/v1/projects/$project/subscriptions/$result_subscription:acknowledge" >/dev/null
      jq -r '.receivedMessages[0].message.data' <<<"$response" | base64 --decode
      return
    fi
    sleep 1
  done
  echo "Timed out waiting for a compensation result" >&2
  return 1
}

publish
first_result=$(pull_result)
publish
second_result=$(pull_result)

first_event=$(jq -r .eventId <<<"$first_result")
second_event=$(jq -r .eventId <<<"$second_result")
[[ $first_event == "$second_event" ]] || {
  echo "Duplicate request produced a different result event ID" >&2
  exit 1
}

verification=$(docker compose exec -T credit-postgres psql \
  -U "${CREDIT_DB_USERNAME:-credit_dev}" -d "${CREDIT_DB_NAME:-credit_service}" -At \
  -v ON_ERROR_STOP=1 -v requester="$requester" -v command_id="$command_id" <<'SQL'
select a.reserved_balance, count(l.entry_id)
from credit_accounts a
left join credit_ledger l
  on l.origin_type = 'COMMAND_COMPENSATION'
 and l.origin_id = :'command_id'
where a.user_id = :'requester'
group by a.reserved_balance;
SQL
)
IFS='|' read -r reserved reversals <<<"$verification"
[[ $reserved == 0 && $reversals == 1 ]] || {
  echo "Expected reserved_balance=0 and one reversal, got $reserved and $reversals" >&2
  exit 1
}

echo "Credit compensation smoke passed: result $first_event, one financial reversal."
