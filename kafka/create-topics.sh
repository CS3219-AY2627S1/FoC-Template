#!/bin/sh
# AI Assistance Disclosure: Claude Code (Claude Opus 5.5), 2026-10-16. Scope: creates the three
# Kafka topics named in credit-service/docs/implementation-proposal.md (§5.1, §6.1), with the
# author's partition count (1 each). Author review: Reviewed and approved by @phuc
# Additional AI assistance: Claude Code (Claude Opus 5.5), 2026-10-18. Scope: added
# credit.results.dlq for Order Service. Author review: Reviewed and approved by @phuc
#
# Run by the kafka-init Compose service once the broker is healthy, then it exits.
# Safe to run again: existing topics are left as they are (their partition count is not
# changed; Kafka can only increase it, with kafka-topics.sh --alter).
set -eu

BOOTSTRAP_SERVER="${BOOTSTRAP_SERVER:-kafka:9092}"
TOPICS_BIN=/opt/kafka/bin/kafka-topics.sh

# Single broker in Compose, so replication factor 1 (cannot survive a broker disk loss)
PARTITIONS=1
REPLICATION_FACTOR=1

# topic                 producer -> consumer
#   user.account-status   User Service -> Credit Service, Order Service   (key: account_id)
#   credit.commands       Order Service -> Credit Service                  (key: order_id)
#   credit.results        Credit Service -> Order Service                  (key: order_id)
# Dead-letter topics: messages a consumer could not process, with the reason
#   user.account-status.dlq, credit.commands.dlq   (written by Credit Service)
#   credit.results.dlq                              (written by Order Service)
for topic in user.account-status credit.commands credit.results \
             user.account-status.dlq credit.commands.dlq credit.results.dlq; do
  "$TOPICS_BIN" --bootstrap-server "$BOOTSTRAP_SERVER" --create --if-not-exists \
    --topic "$topic" \
    --partitions "$PARTITIONS" \
    --replication-factor "$REPLICATION_FACTOR"
done

"$TOPICS_BIN" --bootstrap-server "$BOOTSTRAP_SERVER" --describe \
  --topic 'user\.account-status(\.dlq)?|credit\.commands(\.dlq)?|credit\.results(\.dlq)?'
