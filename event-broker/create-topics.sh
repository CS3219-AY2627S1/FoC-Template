#!/bin/bash
# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-06
# Scope: Boilerplate generation — configure max.message.bytes on the Notification Service DLQ topic, including a topic that already exists (ai-20261106-001).
# Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16 and Kafka 4.1.2, 645 passed; code manually read and verified; manual checks in an isolated Compose run (ai-20261106-001).
# Details: notification-service/ai/usage-log.md; ai-20261106-001
# Create the topics Order Service, Credit Service, and Notification Service use. Safe to run again.

set -euo pipefail

bootstrap="${KAFKA_BOOTSTRAP_SERVERS:-kafka:9092}"
topics=/opt/kafka/bin/kafka-topics.sh

create_topic() {
  local name="$1"
  local partitions="$2"
  shift 2
  "$topics" --bootstrap-server "$bootstrap" --create --if-not-exists \
    --topic "$name" --partitions "$partitions" --replication-factor 1 "$@"
}

create_topic order.events 3 --config retention.ms=-1
create_topic credit.events 3 --config retention.ms=-1
create_topic order-service.credit-events.dlq 1
create_topic credit-service.order-events.dlq 1
create_topic notification-service.order-events.dlq 1

# Must match DLQ_MAX_MESSAGE_BYTES in notification-service/app/worker.py. Applied
# with --alter so that a topic that already exists also gets it.
/opt/kafka/bin/kafka-configs.sh --bootstrap-server "$bootstrap" --alter \
  --entity-type topics --entity-name notification-service.order-events.dlq \
  --add-config max.message.bytes=1100000
