# ADR-013: Transactional outbox for Order outcome events

- Status: Accepted by the user's explicit approval; implemented and verified
- Date: 2026-10-03
- Owner: Order Service
- Related change: CHANGE-063
- Supersedes: Publish-before-status ordering in CHANGE-053 / ADR-009 for completion and cancellation events

## Decision

Order Service commits each outcome transition and its event record atomically. For completion, OPEN cancellation, and accepted-order cancellation, the same database transaction writes the post-transition Order, its checkpoint, the command receipt, and a serialized outbox event containing the resulting Order snapshot.

An `AFTER_COMMIT` listener attempts immediate publication through the existing event-specific publisher. This callback runs before the transactional service call returns, so the HTTP request waits for the publish attempt/Pub/Sub acknowledgment or recorded failure; it does not wait for peer consumer replies. A Spring cron recovery job scans and claims due rows to recover from process failure or Pub/Sub outages. Publication happens outside the Order transaction. After Pub/Sub confirms a message, the row is marked published. On failure, the row remains durable and receives bounded exponential retry scheduling. A dispatch error must not make an already-committed transition appear to have rolled back to the caller.

Rows are claimed with PostgreSQL row locks and expiring leases. The delivery guarantee is at least once, not exactly once. Stable event IDs are preserved across retries; consumers must deduplicate. No peer service is changed or awaited. Event payload shape is governed by ADR-016 and omits checkpoint history even though the checkpoint row is committed in the same transaction.

## Rationale and trade-offs

This removes the publish-success/database-failure gap of publish-first ordering and ensures a committed transition cannot lose its event intent. It adds a database table, migration, relay, retry state, and operational visibility needs. A crash after Pub/Sub accepts but before the published marker commits can cause redelivery, so consumers need durable idempotency. The post-commit fast path minimizes latency; the scheduler provides recovery when that attempt or process fails.

The scheduler cannot guarantee recovery on the current Cloud Run configuration (minimum instances zero and request-based CPU). Changing minimum instances or CPU billing can incur ongoing cost and is outside this approval; deployment reliability remains an operational decision.

## Scope

Order Service only. Existing topics, event types, resulting Order snapshots, and publisher interfaces remain in use. ADR-016 specifies that event snapshots omit checkpoint history. This decision does not add peer consumers, topic/subscription configuration, a dead-letter topic, or Cloud Run billing changes. Flyway remains the selected schema migration tool.

## Scheduler DB selection and independent outbox dispatch — CHANGE-096 (2026-10-10)

The active lifecycle paths retain CHANGE-093: DB-filtered IDs, separate REQUIRES_NEW expiry/completion workers, fresh NOWAIT locks and outside-proxy catch. Outbox recovery now selects bounded eligible event IDs in SQL (due PENDING or expired IN_PROGRESS lease), then individually claims/rechecks with SKIP LOCKED. Claim, markPublished and scheduleRetry use separate REQUIRES_NEW transactions; enqueue remains REQUIRED with Order/checkpoint/receipt. Dispatcher catches each event's claim/commit/retry-write errors, logs its ID and continues later events. A failed retry write leaves the committed lease recoverable after expiry. Neither scheduler nor batch coordinator is transactional. Pub/Sub publication stays outside DB transactions and is irreversible; stable-ID deduplication remains required. Legacy claimDue is retained for compatibility, unused by the active scheduler. No cadence, schema, event body, peer, frontend or paused repost change.
