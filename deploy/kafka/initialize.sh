#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=lib.sh
source /opt/foc-kafka/lib.sh
require_env KAFKA_ADMIN_PASSWORD
parallelism=${KAFKA_INIT_PARALLELISM:-7}
if ! [[ "$parallelism" =~ ^[1-7]$ ]]; then
  echo 'KAFKA_INIT_PARALLELISM must be between 1 and 7' >&2
  exit 1
fi

bootstrap_servers=${KAFKA_BOOTSTRAP_SERVERS:-kafka:9092}
replication_factor=${KAFKA_REPLICATION_FACTOR:-1}
min_insync_replicas=${KAFKA_MIN_INSYNC_REPLICAS:-1}
if ! [[ "$replication_factor" =~ ^[1-9][0-9]*$ && "$min_insync_replicas" =~ ^[1-9][0-9]*$ ]]; then
  echo 'KAFKA_REPLICATION_FACTOR and KAFKA_MIN_INSYNC_REPLICAS must be positive integers' >&2
  exit 1
fi
if (( min_insync_replicas > replication_factor )); then
  echo 'KAFKA_MIN_INSYNC_REPLICAS cannot exceed KAFKA_REPLICATION_FACTOR' >&2
  exit 1
fi
admin_properties=/tmp/foc-kafka-admin.properties
write_client_properties "$admin_properties" foc_admin "$KAFKA_ADMIN_PASSWORD"

# These commands only create-if-absent, set the same configuration, or add the same ACL.
# A lost admin response/DNS lookup can be retried without another domain effect.
init_command() {
  local attempt
  for attempt in 1 2 3; do
    if kafka_command "$@"; then return 0; fi
    if (( attempt < 3 )); then
      echo "Kafka initialization command unconfirmed; retry $attempt/3" >&2
      sleep 2
    fi
  done
  return 1
}

create_topic() {
  local topic=$1
  local partitions=$2
  local retention_ms=$3

  init_command kafka-topics.sh \
    --bootstrap-server "$bootstrap_servers" \
    --command-config "$admin_properties" \
    --create --if-not-exists \
    --topic "$topic" \
    --partitions "$partitions" \
    --replication-factor "$replication_factor" \
    --config cleanup.policy=delete \
    --config "min.insync.replicas=$min_insync_replicas" \
    --config "retention.ms=$retention_ms"

  init_command kafka-configs.sh \
    --bootstrap-server "$bootstrap_servers" \
    --command-config "$admin_properties" \
    --alter --entity-type topics --entity-name "$topic" \
    --add-config "cleanup.policy=delete,min.insync.replicas=$min_insync_replicas,retention.ms=$retention_ms"
}

add_acl() {
  local principal=$1
  shift
  # Batch only equivalent resource/operation sets. Do not use --producer: it also grants Create.
  init_command kafka-acls.sh \
    --bootstrap-server "$bootstrap_servers" \
    --command-config "$admin_properties" \
    --add --allow-principal "User:$principal" \
    "$@"
}

add_idempotent_write_acl() {
  local principal=$1
  add_acl "$principal" --operation IdempotentWrite --cluster
}

# Independent resources can be initialized concurrently. Wait for every child and fail
# the initializer if any operation failed; dependent services must never see partial success.
wait_all() {
  local failed=0
  local pid
  for pid in "$@"; do
    wait "$pid" || failed=1
  done
  return "$failed"
}
limit_jobs() {
  if (( ${#pids[@]} >= parallelism )); then
    wait_all "${pids[@]}"
    pids=()
  fi
}

pids=()
for topic in user.events order.events credit.events order.lifecycle.events chat.events admin.credit.commands credit.admin.events admin.user.commands user.admin.events admin.events admin.dispute.commands order.dispute.commands order.dispute.events chat.dispute.events credit.dispute.events; do
  create_topic "$topic" 3 604800000 &
  pids+=("$!")
  limit_jobs
done
wait_all "${pids[@]}"

pids=()
for topic in user.events.DLT order.events.DLT credit.events.DLT order.lifecycle.events.DLT chat.events.DLT admin.credit.commands.DLT credit.admin.events.DLT admin.user.commands.DLT user.admin.events.DLT; do
  create_topic "$topic" 1 2592000000 &
  pids+=("$!")
  limit_jobs
done
wait_all "${pids[@]}"

# The administrator must remain able to reconcile topics and ACLs after MSK is switched from its
# one-time bootstrap configuration to allow.everyone.if.no.acl.found=false.
add_acl foc_admin --operation All --cluster
add_acl foc_admin --operation All --topic '*'
add_acl foc_admin --operation All --group '*'
add_acl foc_admin --operation All --transactional-id '*'

# User Service publishes activation facts.
{
add_acl user_service --operation Write --operation Describe --topic user.events
add_idempotent_write_acl user_service
} &
pids=("$!")
limit_jobs

# Order Service publishes lifecycle facts and consumes Credit outcomes.
{
add_acl order_service --operation Write --operation Describe --topic order.events --topic credit.events.DLT \
  --topic order.lifecycle.events
add_acl order_service --operation Read --operation Describe --topic credit.events
add_acl order_service --operation Read --group order-service
add_idempotent_write_acl order_service
} &
pids+=("$!")
limit_jobs

# Chat consumes Order lifecycle facts using its own projection group.
{
add_acl chat_service --operation Read --operation Describe --topic order.lifecycle.events
add_acl chat_service --operation Write --operation Describe --topic chat.events
add_acl chat_service --operation Read --group chat-service-lifecycle
add_idempotent_write_acl chat_service
} &
pids+=("$!")
limit_jobs

# Credit Service consumes User/Order facts and publishes outcomes.
{
add_acl credit_service --operation Read --operation Describe --topic user.events --topic order.events
add_acl credit_service --operation Read --group credit-service
add_acl credit_service --operation Write --operation Describe \
  --topic credit.events --topic user.events.DLT --topic order.events.DLT
add_idempotent_write_acl credit_service
} &
pids+=("$!")
limit_jobs

# Notification Service consumes Credit outcomes and Order lifecycle facts; it publishes only dead
# letters. Order owns order.lifecycle.events; Notification and Chat consume it independently.
{
add_acl notification_service --operation Read --operation Describe \
  --topic credit.events --topic order.lifecycle.events --topic chat.events
add_acl notification_service --operation Read --group notification-service
add_acl notification_service --operation Write --operation Describe \
  --topic credit.events.DLT --topic order.lifecycle.events.DLT --topic chat.events.DLT
add_idempotent_write_acl notification_service
} &
pids+=("$!")
limit_jobs

# Administrative corrections use a separate owner consumer and outcome stream.
{
add_acl admin_service --operation Write --operation Describe --topic admin.credit.commands --topic credit.admin.events.DLT
add_acl admin_service --operation Read --operation Describe --topic credit.admin.events
add_acl admin_service --operation Read --group admin-service-credit
add_idempotent_write_acl admin_service
add_acl credit_service --operation Read --operation Describe --topic admin.credit.commands
add_acl credit_service --operation Read --group credit-service-admin
add_acl credit_service --operation Write --operation Describe --topic credit.admin.events --topic admin.credit.commands.DLT
} &
pids+=("$!")
limit_jobs

# User owns ban decisions and outcome replay; Admin only requests/tracks.
{
add_acl admin_service --operation Write --operation Describe --topic admin.user.commands --topic user.admin.events.DLT
add_acl admin_service --operation Read --operation Describe --topic user.admin.events
add_acl admin_service --operation Read --group admin-service-user
add_acl user_service --operation Read --operation Describe --topic admin.user.commands
add_acl user_service --operation Read --group user-service-admin
add_acl user_service --operation Write --operation Describe --topic user.admin.events --topic admin.user.commands.DLT
} &
pids+=("$!")
limit_jobs

# Stored lifecycle facts only. A stable transaction identity fences obsolete relay processes.
add_acl admin_service --operation Write --operation Describe --topic admin.events
add_acl admin_service --operation Write --operation Describe --transactional-id admin-case-events- --resource-pattern-type prefixed

# Chat retains original case facts and owner outcomes in an independent read-committed inbox.
add_acl chat_service --operation Read --operation Describe --topic admin.events --topic credit.admin.events --topic user.admin.events
add_acl chat_service --operation Read --group chat-service-timeline

# Durable dispute coordination: only the owning service may publish its commands/outcomes.
add_acl admin_service --operation Write --operation Describe --topic admin.dispute.commands
add_acl admin_service --operation Read --operation Describe --topic order.dispute.events --topic chat.dispute.events
add_acl order_service --operation Read --operation Describe --topic admin.dispute.commands --topic chat.dispute.events --topic credit.dispute.events
add_acl order_service --operation Write --operation Describe --topic order.dispute.commands --topic order.dispute.events
add_acl chat_service --operation Read --operation Describe --topic admin.dispute.commands --topic order.dispute.events
add_acl chat_service --operation Write --operation Describe --topic chat.dispute.events
add_acl credit_service --operation Read --operation Describe --topic order.dispute.commands
add_acl credit_service --operation Write --operation Describe --topic credit.dispute.events
for pair in admin_service:admin-service order_service:order-service chat_service:chat-service credit_service:credit-service; do
  add_acl "${pair%%:*}" --operation Read --group "${pair##*:}-disputes"
  add_idempotent_write_acl "${pair%%:*}"
done
add_acl kafka_ui --operation Read --operation Describe --operation DescribeConfigs --topic admin.dispute.commands --topic order.dispute.commands --topic order.dispute.events --topic chat.dispute.events --topic credit.dispute.events
add_acl kafka_ui --operation Describe --group admin-service-disputes --group order-service-disputes --group chat-service-disputes --group credit-service-disputes

# Kafka UI can inspect this local cluster but cannot mutate topics, data or business offsets.
{
add_acl kafka_ui --operation Read --operation Describe --operation DescribeConfigs \
  --topic user.events --topic order.events --topic order.lifecycle.events --topic credit.events --topic chat.events \
  --topic user.events.DLT --topic order.events.DLT --topic credit.events.DLT \
  --topic order.lifecycle.events --topic order.lifecycle.events.DLT --topic chat.events.DLT \
  --topic admin.credit.commands --topic credit.admin.events \
  --topic admin.credit.commands.DLT --topic credit.admin.events.DLT \
  --topic admin.user.commands --topic user.admin.events --topic admin.user.commands.DLT --topic user.admin.events.DLT --topic admin.events
add_acl kafka_ui --operation Describe --operation DescribeConfigs --cluster
# Kafbat discovers consumer groups before it knows their names, including Amazon MSK's internal
# canary groups. Describe on the wildcard group allows that inventory only; kafka_ui still has Read
# solely on its own kafka-ui-browser* groups and therefore cannot join or reset business groups.
add_acl kafka_ui --operation Describe --group '*'
add_acl kafka_ui --operation Read --operation Describe --group kafka-ui-browser --resource-pattern-type prefixed
} &
pids+=("$!")
limit_jobs
wait_all "${pids[@]}"

echo "Kafka topics and ACLs are initialized. Re-running this initializer is safe."
