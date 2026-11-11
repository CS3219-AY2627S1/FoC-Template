<!--
AI Assistance Disclosure
Tool: Claude Code (Claude Opus 5.5), date: 2026-11-03
Scope: Infrastructure documentation, drafted and edited with Claude Code.
Reviewed by Don Lee
-->

# ADR-0004: Per-service Kafka identity (SCRAM) with ACLs from the event catalog

- **Status:** Accepted
- **Date:** 2026-09-29

## Context

With a plain listener, any pod that can reach Kafka can read or write any
topic. `foc.credit.commands` moves credits, so a buggy or compromised service
publishing to it could transfer money.

## Decision

- Kafka exposes a **TLS listener on 9093 with SCRAM-SHA-512** authentication
  and `simple` authorization.
- Each service that uses Kafka gets a `KafkaUser`. Strimzi generates its
  password Secret, and the chart mounts it as `KAFKA_USERNAME` /
  `KAFKA_PASSWORD`.
- ACLs mirror the canonical event catalog exactly:

  | KafkaUser | Write | Read |
  |---|---|---|
  | `user` | `foc.user.status` | |
  | `credit` | | `foc.user.status`, `foc.credit.commands` |
  | `order` | `foc.order.status`, `foc.credit.commands`, `foc.rating.commands` | `foc.admin.events`, `foc.user.status` |
  | `rating` | `foc.user.rating` | `foc.rating.commands` |
  | `admin` | `foc.admin.events` | |
  | `badges` | | `foc.order.status`, `foc.user.rating`, `foc.admin.events` |

- Consumers also get `Read` on their own consumer group (`<service>-*`).
- `supplier` uses no topics, so it gets no `KafkaUser`.
- `foc.admin.commands` stays in the catalog but nobody writes or reads it:
  order opens escalations over HTTP (`POST /api/v1/admin/internal/conflicts`).
  A future producer or consumer is added by granting it in its `KafkaUser`.

## Consequences

- A service can only publish what the contract says it publishes.
- Changing the event catalog means updating this table and the `KafkaUser`
  YAML in the same PR.
- Local, dev, stg and prod behave identically (same Strimzi config).
