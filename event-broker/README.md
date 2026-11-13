<!--
AI Assistance Disclosure:
Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-06
Scope: Refactoring and documentation improvements — document the Notification Service DLQ topic's max.message.bytes limit (ai-20261106-001).
Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16 and Kafka 4.1.2, 645 passed; code manually read and verified; manual checks in an isolated Compose run (ai-20261106-001).
Details: notification-service/ai/usage-log.md; ai-20261106-001
-->

# Event broker

## AI Use Summary (Event broker, Ewen Low)

- **Tool:** Cursor agent. The model identifier was not recorded in the chat
  history.
- **Dates:** 2026-10-19 to 2026-11-10 (UTC+8).
- **Affected files:** `event-broker/compose.yaml`,
  `event-broker/create-topics.sh` and `event-broker/README.md`, plus the
  broker's `include:` line in the root `compose.yaml` and the
  `event-broker/**` path filter in `.github/workflows/compose.yml`.
- **Author review:** Ewen committed and merged the work
  ([PR #27](https://github.com/AY2627S1-CS3219-P8/FoC/pull/27)). No other
  review is recorded.
- **Missing evidence:** model identifier. No file-header attributions or
  `ai/usage-log.md` entries exist yet for these files.

### Prompt 1 (2026-10-19 17:13)

```text
if you were to change the current order service architecture to align with the lecture slides, what will you do?
```

### Key response 1

> I'd make four changes, in priority order. [...] switch to a replayable,
> partitioned log, stop the producer from knowing its consumers, carry more
> data in events, and replace the synchronous Supplier check with a local copy.
> [...] Use Kafka (or Redpanda, which is Kafka-compatible and lighter in
> Compose). [...] One topic per producer [...] Key every message by
> `order_id` [...] Long or unlimited retention on `order.events`.

Scope: Learning support. The AI compared the RabbitMQ implementation with
the lecture's event-log model and proposed moving to Kafka. No file changed.

### Prompt 2 (2026-10-19 17:45, followed by plan approval at 17:54)

```text
implement order service and event broker

- do not implement notification service or credit service, or user/supplier service
- only make changes to order service, and event broker
- create a new directory "event broker" alongside the service directories and implement any code related to event broker there
- make minimal changes and do not over engineer, make sure the code is cleanly seperated by context
```

```text
Kafka event broker for Order Service

Implement the plan as specified, it is attached for your reference. Do NOT edit the plan file itself.

To-do's from the plan have already been created. Do not create them again. Mark them as in_progress as you work, starting with the first one. Don't stop until you have completed all the to-dos.
```

### Key response 2

> **Event broker.** `event-broker/` runs a single Kafka node at `kafka:9092`
> and a one-shot job that creates the topics. `order.events` and
> `credit.events` have 3 partitions and are kept indefinitely.
> `order-service.credit-events.dlq` holds credit messages the worker cannot
> apply.

Scope:
- `event-broker/compose.yaml`: Writing implementation code and boilerplate
  generation. The AI wrote the single-node KRaft Kafka service, its volume,
  its healthcheck and the one-shot `kafka-topics` job.
- `event-broker/create-topics.sh`: Writing implementation code. The AI wrote
  the idempotent topic-creation script.
- `event-broker/README.md`: Refactoring and documentation improvements. The
  AI wrote the first README.
- Root `compose.yaml` and `.github/workflows/compose.yml`: Boilerplate
  generation. The AI added the `include:` line and the CI path filter.

Verification (run by the AI against the running stack): events were
published with `order_id` keys. Orders created while Kafka was stopped were
published after it restarted. A consumer group started later read from the
beginning. A malformed message went to the DLQ topic without blocking the
next message.

### Prompt 3 (2026-10-19 18:19)

```text
in PR 24, split it into 2 stacked PRs, one for order service only, one for event broker
```

### Key response 3

> [PR 27: feat: add Kafka event broker] [...] contains the `event-broker/`
> folder, the `include:` line in the root `compose.yaml`, and the
> `event-broker/**` path filter for Compose CI. [...] I checked that the two
> stacked commits together match the old PR 24 head exactly, so no code
> changed.

Scope: Boilerplate generation. The AI did the git and PR work that moved the
broker files into PR #27. File contents did not change.

### Prompt 4 (2026-10-22 12:05)

```text
resolve the PR24 conflicts. do not merge
```

### Key response 4

> **Resolved on `event-broker`:** I merged `main` into it and kept both
> sides. The workflow triggers on the Supplier paths (from `main`) and on
> `event-broker/**` [...] `compose-validation` passes on PR #27.

Scope: Debugging assistance. The AI resolved the merge conflict in
`.github/workflows/compose.yml` on the `event-broker` branch.

### Prompt 5 (2026-10-22 15:06)

```text
Live demo: Order Service + Kafka broker

Implement the plan as specified, it is attached for your reference. Do NOT edit the plan file itself.

To-do's from the plan have already been created. Do not create them again. Mark them as in_progress as you work, starting with the first one. Don't stop until you have completed all the to-dos.
```

### Key response 5

Summary (not a quotation): while merging the Credit Service branch into the
demo branch, the AI resolved merge conflicts in
`event-broker/create-topics.sh` and `event-broker/README.md`. It kept the
Credit Service DLQ topic and the 7-day DLQ retention from that branch.
Later Notification Service work reworded this README and added its DLQ topic.

Scope: Debugging assistance and documentation improvements in
`event-broker/create-topics.sh` and `event-broker/README.md` (merge-conflict
resolution).

### Prompts 6 to 10 (learning support, no file changed)

```text
answer in 1 line each

- whats alembic
- how does kafka work here
- is notification service built
- were any services apart from event broker/order service modified
```

```text
why choose kafka? 1 line
```

```text
is kafka in its own container
```

```text
how does the DLQ work
```

```text
once service is back up what happens?
```

### Key responses 6 to 10

> Kafka is the broker: the worker publishes order events to `order.events`
> and consumes credit events from `credit.events`, while the API only writes
> the order and its event into Postgres.

> Kafka keeps every event in a durable log that can be replayed (retention
> is set to never delete), keeps each order's events in order by keying them
> on `order_id`, and lets both Credit and Notification read the same
> `order.events` stream independently at their own pace [...]

> Yes, Kafka runs in its own container. It's defined in
> `event-broker/compose.yaml`, and the root `compose.yaml` pulls that file in
> with `include:` [...]

> There are two dead-letter queues (DLQs), one in each service. [...] **the
> consumer only commits a Kafka offset after the message has either been
> applied to the database or been confirmed written to the DLQ.**

Scope: Learning support. These exchanges explained how Kafka, the broker
container and the DLQs work.

## Overview

One Kafka node for the Compose network. It listens at `kafka:9092` and does not publish a host port. Topics are created by the `kafka-topics` job. The broker does not create topics on its own.

## Topics

| Topic | Partitions | Retention | Key | Producer |
| --- | --- | --- | --- | --- |
| `order.events` | 3 | forever | `order_id` | Order Service |
| `credit.events` | 3 | forever | `order_id` | Credit Service |
| `order-service.credit-events.dlq` | 1 | broker default (7 days) | copied from the failed record | Order Service, for credit messages it cannot apply |
| `credit-service.order-events.dlq` | 1 | broker default (7 days) | copied from the failed record | Credit Service, for order messages it cannot apply |
| `notification-service.order-events.dlq` | 1 | broker default (7 days) | copied from the failed record | Notification Service, for order messages it cannot apply |

`notification-service.order-events.dlq` has `max.message.bytes=1100000`, above the broker's default, so that a record `order.events` accepted still fits with the diagnostic headers. `create-topics.sh` also applies this to a topic that already exists.

A record for one order always lands on the same partition, so that order's events stay in order. Different orders can be on different partitions.

## Inspect

From the repo root, after `docker compose up kafka kafka-topics`:

```bash
docker compose exec kafka /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server kafka:9092 --describe

docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server kafka:9092 --topic order.events --from-beginning \
  --property print.key=true --property print.headers=true
```

## A new consumer

Subscribe with a new `group.id`. `auto.offset.reset=earliest` reads the topic from offset 0, including events published before the consumer existed. Each group keeps its own offset, so one consumer does not affect another.
