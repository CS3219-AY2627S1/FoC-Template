# ADR-019: One refund event for OPEN cancellation and expiry

> Payload supersession (2026-10-09): CHANGE-092 / ADR-031 replaces only refund/completion JSON bodies with exactly seven fields. Order/version metadata remains internal; completion overdue facts are no longer sent. Accepted-cancellation schema is unchanged. FEEDBACK-009 blocks current peer integration. Earlier rationale below is preserved history.

- Status: Accepted by explicit user direction; Order-side implementation in progress; Credit consumer pending
- Date: 2026-10-06
- Owner: Order Service
- Related change: CHANGE-071
- Supersedes: The separate `OrderExpirationTaskEvent` choice in ADR-015; Spring scheduling and expiry state changes remain effective

## Context

Requester-triggered cancellation and Spring-scheduled expiry of an unassigned OPEN Order both require Credit to refund/release the same reservation. Maintaining separate event types and topics duplicates the subscriber action. The resulting Order statuses remain different and are present in the full event snapshot.

## Decision

Publish one `OpenOrderRefundTaskEvent` on the shared OPEN-refund topic for both outcomes:

- Requester cancellation records `CANCELLED` and emits the event from the transactional outbox.
- Scheduled expiry records `EXPIRED` and emits the same event from the transactional outbox.
- Credit subscribes once and refunds/releases the transaction using `orderId`. It may use `order.status` to distinguish why the refund was requested. User Service is not involved.
- Keep the Spring expiry scheduler, row selection, checkpoint, outbox atomicity, after-commit dispatch, and recovery cron unchanged. Order does not synchronously call Credit for either refund outcome.

The event retains the current common envelope and resulting Order/repost snapshot, with no checkpoint history. Its `eventType` is `OpenOrderRefundTaskEvent`; event version remains 1. The production topic remains a placeholder until configured. The local Compose emulator uses `open-order-refund-v1`.

The dispatcher continues to recognize already-persisted legacy `OpenOrderCancellationTaskEvent` and `OrderExpirationTaskEvent` outbox rows, deserialize their compatible payloads into the new event shape, normalize `eventType`, and publish them through the shared refund publisher while preserving `eventId`. New transitions create only `OpenOrderRefundTaskEvent` rows.

## Consequences and trade-offs

- Credit needs one subscription/topic and one refund action for these OPEN outcomes; the Order snapshot's status distinguishes `CANCELLED` from `EXPIRED`.
- This changes the event type/topic contract before peer consumers were implemented. Credit owners must use the new type/topic; peer source remains outside Order Service scope.
- Existing pending outbox rows are not stranded during rollout because the Order dispatcher routes both legacy types to the new publisher. Already-published messages cannot be recalled.
- No database schema migration is required; event names and payloads remain stored in the existing text outbox fields.
- At-least-once delivery and Credit-side durable deduplication by `eventId` remain required. Cloud Run scale-to-zero scheduling limitations from ADR-015 remain.
