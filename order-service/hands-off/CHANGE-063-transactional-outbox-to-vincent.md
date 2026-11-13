# Order Service Handoff to Vincent: Transactional Event Delivery

- **Prepared by:** Yao Xiang (Developer 1)
- **For:** Vincent (Developer 2)
- **Date:** 2026-10-03
- **Branch:** `order-service/sprint-1/yx-seq1-to-seq11`
- **Change:** [CHANGE-063](../changes/CHANGE-063-transactional-outbox.md)
- **Decision:** [ADR-013](../docs/decisions/ADR-013-transactional-outbox.md)

> **Superseded for accepted-cancellation behavior:** [CHANGE-064](../changes/CHANGE-064-accepted-cancellation-reopen-or-event.md) / [ADR-014](../docs/decisions/ADR-014-accepted-cancellation-hybrid-flow.md) now require synchronous Credit hold then direct `ACCEPTED -> OPEN` before expiry, and the cancellation event only at/after expiry. The following handoff records the original CHANGE-063 milestone; use CHANGE-064 and the updated Sequence 7 for current behavior.

> **Current OPEN-refund event contract:** CHANGE-071/ADR-019 replaces the separate OPEN-cancellation and scheduled-expiration event names with `OpenOrderRefundTaskEvent` on one topic. Requester cancellation still results in `CANCELLED`; scheduler expiry still results in `EXPIRED`. Credit consumes one event type and refunds/releases either transaction using the resulting Order status to distinguish them.

## What is implemented

Completion and cancellation outcome events now use a transactional outbox. For each supported transition, Order Service writes the resulting Order, checkpoint, command receipt, and serialized resulting-Order event into PostgreSQL in the same transaction. Per CHANGE-067/ADR-016, the event omits checkpoint history; a database rollback still removes both the state change and its event intent.

After commit, an `AFTER_COMMIT` listener immediately asks the dispatcher to publish the event through its matching typed publisher. The listener runs before the transactional service call returns, so the HTTP request waits for the publish attempt and Pub/Sub acknowledgment (or recorded failure), but never for a Credit or User consumer reply. A publish failure does not reverse the committed Order transition; it is logged and the outbox row is retried.

The Spring cron scheduler is a recovery path for pending events and expired leases. Dispatch claims rows with PostgreSQL `FOR UPDATE SKIP LOCKED` and a two-minute lease. Each failed attempt records bounded exponential retry timing up to five minutes, but the current hourly recovery poll may delay the next retry beyond that timestamp. Stable event IDs are derived from event type and command ID. Delivery is at least once: consumers must deduplicate because a process can fail after Pub/Sub accepts a message but before Order Service records it as published.

The implemented event cases are:

- **Completion:** every successful completion emits one `OrderCompletionTaskEvent`, whether on time or overdue. It carries resulting Order/repost fields plus `overdue` and `overdueAt` facts, but not checkpoint history. Credit and User consumers are assumed future work.
- **OPEN refund (historical at CHANGE-063):** requester cancellation originally emitted `OpenOrderCancellationTaskEvent`; under current CHANGE-071, both it and scheduled expiry emit `OpenOrderRefundTaskEvent` and use the shared Credit topic.
- **Accepted-order cancellation at CHANGE-063 time:** the assigned courier transitioned the order to `ABORTED` and emitted `AcceptedOrderCancellationTaskEvent`; this rule is superseded by CHANGE-064.

No separate overdue-completion event exists. Existing HTTP endpoint contracts are unchanged. Expiry/repost events and peer consumer implementations are outside this change.

## Main implementation locations

- Transition orchestration and event snapshot creation: `src/main/java/sg/edu/nus/foc/order/application/OrderTransitionService.java` and `OrderTaskEventFactory.java`.
- Outbox lifecycle and scheduling: `OrderOutboxDispatchRequested.java`, `OrderOutboxAfterCommitListener.java`, `OrderOutboxDispatcher.java`, and `OrderOutboxScheduler.java` under `application/`.
- Persistence boundary: `domain/OrderEventOutbox.java`, `domain/OutboxState.java`, `domain/repository/OrderEventOutboxRepository.java`, `infrastructure/OrderEventOutboxPersistenceAdapter.java`, and `JpaOrderEventOutboxRepository.java`.
- Schema: `src/main/resources/db/migration/V2__create_order_event_outbox.sql`. Flyway applies V2 at service startup; Hibernate validates the resulting schema.
- Configuration: `order.messaging.outbox.recovery-cron` originally defaulted to once per minute; CHANGE-077/ADR-022 set recovery to every five minutes and CHANGE-078/ADR-023 supersedes that with hourly recovery. Immediate after-commit dispatch remains. Batch size defaults to 50.
- Design diagrams: `sprints/sprint-1/sequence-diagrams/updated-overall/sequence-5-complete-order.md`, `sequence-6-cancel-open-order.md`, `sequence-7-cancel-accepted-order.md`, and `sprints/sprint-1/class-diagrams/updated-overall/publisher-class-diagram.md`.

## Verification completed

The full Order Service command passed:

```text
mvn -B -ntp '-Dmaven.repo.local=target/m2-repository' verify
Tests run: 102, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
All JaCoCo line and branch coverage checks met.
```

Testcontainers/PostgreSQL checks covered fresh Flyway migration, upgrade from V1 to V2, Hibernate schema validation, lease-based row claims, persisted retry/published states, and atomic rollback of the Order and outbox intent. `git diff --check` passed.

This verifies the Order-side code and persistence behavior. It does not verify live Pub/Sub delivery to Credit or User consumers, because those consumer implementations were not changed or exercised here.

## Follow-up and operating caveats

1. Review CHANGE-063, ADR-013, and the updated Sequence 5–7/class diagrams before changing event contracts or ordering.
2. Keep consumer work in the owning peer services. Consumers should deduplicate using `eventId`; do not treat Pub/Sub delivery as exactly once.
3. Cloud Run currently uses minimum instances zero and request-based CPU. Its in-process cron is not guaranteed to run while idle. Reliable idle-time recovery needs a separate approved runtime/billing choice or an external scheduler trigger; no deployment billing setting was changed here.
4. Published outbox rows are retained for operational history, and this change adds no cleanup policy. Monitor table growth and decide retention/cleanup separately.
5. The repository has pre-existing pending changes from earlier work. This handoff does not imply they were all created by CHANGE-063; inspect `git status` and stage only reviewed paths. No commit was created for this change.

## Current source of truth

Use `changes/CHANGE-063-transactional-outbox.md`, `docs/decisions/ADR-013-transactional-outbox.md`, `docs/architecture-evolution.md`, `docs/requirements-traceability.md`, and the linked diagrams for the durable specification. This handoff summarizes the implementation for Vincent and does not replace those records.
