<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
Scope: Documented the shared Kafka broker and topic setup, and the topic smoke tests.
Author review: Reviewed and approved by @phuc
-->

# Kafka

One Kafka broker (KRaft mode, no ZooKeeper) shared by the services, defined in the root
`compose.yaml` as `kafka`. The one-off `kafka-init` service runs
[create-topics.sh](create-topics.sh) once the broker is healthy, then exits.

## Topics

| Topic | Producer | Consumer groups | Key | Partitions | Replication |
|---|---|---|---|---|---|
| `user.account-status` | User Service | `credit-service`, `order-service` | `account_id` | 1 | 1 |
| `credit.commands` | Order Service | `credit-service` | `order_id` | 1 | 1 |
| `credit.results` | Credit Service | `order-service` | `order_id` | 1 | 1 |
| `user.account-status.dlq` | Credit Service | (people / tools) | `account_id` | 1 | 1 |
| `credit.commands.dlq` | Credit Service | (people / tools) | `order_id` | 1 | 1 |

The two `.dlq` topics hold messages Credit Service could not process: invalid messages at once,
and messages that failed 5 times in a row. Each is JSON with `source_topic`, `source_partition`,
`source_offset`, `original_key`, `original_value`, `reason`, `attempts` and `failed_at`.

Message fields are in
[credit-service/docs/implementation-proposal.md](../credit-service/docs/implementation-proposal.md)
§5.2 and §6.2.

- With 1 partition, each topic is read in one total order, and only one consumer per group
  reads it at a time. Raising the count later is possible (`kafka-topics.sh --alter`) but
  changes which partition each key goes to.
- Replication factor 1 is enough for development but cannot survive losing the broker's disk.
- Topics are created only by `kafka-init`: `KAFKA_AUTO_CREATE_TOPICS_ENABLE` is `false`, so a
  typo in a topic name fails instead of creating a new topic.
- Retention uses the broker default (7 days).
- The broker is reachable only inside the Compose network, at `kafka:9092`.

## Tests

```sh
docker compose run --rm kafka-test
```

[test-topics.sh](test-topics.sh) uses Kafka's own command-line tools, so it needs no client
library. It exits non-zero if any check fails.

| Checked on | What |
|---|---|
| The five real topics | Exists, 1 partition, replication factor 1, partition 0 has a leader, end offset readable |
| The broker | Automatic topic creation is off |
| A temporary topic with the same settings | Keyed messages arrive in the order sent; a consumer group resumes from its committed offset; a new group reads from the beginning |

The real topics are never written to. Credit Service reads them from the beginning, so a test
message left there would later reach it as an invalid message. The temporary topic and its
consumer groups are deleted at the end of the run.

## Commands

```sh
docker compose up -d kafka-init                 # starts kafka, creates the topics
docker compose logs kafka-init                  # shows the topic descriptions
docker compose exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka:9092 --list
```

Read a topic from the start (Ctrl+C to stop):

```sh
docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server kafka:9092 --topic credit.results --from-beginning --property print.key=true
```
