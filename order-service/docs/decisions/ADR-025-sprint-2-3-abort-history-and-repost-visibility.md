# ADR-025: Current orders, courier attempts and repost visibility

- Date/approver: 2026-10-08 / Vincent; explicit follow-up approvals recorded in CHANGE-081/082.
- Status: Approved Order design, implemented and locally tested; peer/cloud integration incomplete.
- Scope: `sprint-2-3`, Order-owned parts and approved shared Order frontend slice only.

## Decision

Keep one current Order with a database `row_id` UUID primary key and unique stable business `id`. References in APIs, checkpoints, receipts and outbox continue using business IDs. Each ACCEPTED-only courier abort creates an immutable `OrderCourierAttempt` with its own UUID and the same business Order ID. Do not create two independently actionable live orders with the same business ID.

Validate caller/ownership/version under the Order lock, synchronously reset Credit's assignment via the approved bodyless `hold-for-reopen` call, then recheck the deadline. Save the attempt, ABORTED checkpoint and current OPEN/EXPIRED checkpoint in the same transaction as Order, receipt and outbox. EVERY abort queues `AcceptedOrderCancellationTaskEvent` for User penalties. EXPIRED additionally queues `OpenOrderRefundTaskEvent` for Credit. OPEN has no refund event. The event actor identifies the aborting courier after current assignment becomes null.

Reposting reserves under a new business ID before retaining/linking the original EXPIRED row and new OPEN row. Requester pagination/count excludes only successfully linked expired originals; courier history remains available. Replays still verify requester identity and original linkage. No stored refund intent is deleted by a repost.

Existing minute-based 48-hour auto-completion and shared completion event remain; use latest accepted/delivered checkpoints for deadlines after repeated attempts. Domain rules do not call peers or brokers; application services orchestrate ports.

## Supersession and consequences

For this workstream, supersedes ADR-001's no-reopening restriction and ADR-014's no-penalty-before-expiry / current ABORTED-after-expiry behavior. Original PDFs/old ADRs are preserved. F11.2's ABORTED history is retained, but current requester-visible state resolves immediately to OPEN/EXPIRED. F10.1.3 is overridden only for successfully reposted expired originals, not every expired order.

V3 preserves business IDs/FKs, replaces the primary key, adds attempt snapshots, permits repeated status checkpoints and backfills legacy ABORTED rows where a courier is recoverable. Legacy before-expiry aborts without checkpoints cannot be reconstructed. Courier responses add nullable `attemptId`; history is read-only and separately keyed in UI. No event field/topic rename and no peer backend/schema change.

Credit and Order cannot share a database transaction. Timeout or later Order rollback after a successful reset requires reconciliation and peer-owned stale-retry protection; the approved minimal request does not include Order version. HTTP fails closed; missing APIs are only mocked in explicit local mock mode. Outbox durability proves intent, not consumer success. Coordinate legacy ABORTED cancellation-event refund handling before rollout to avoid double refunds.

## Verification and production gate

CHANGE-082 records actual tests, fresh coverage, migration upgrade/rollback and frontend results. Real assignment/reset providers, refund/penalty/settlement consumers, trusted automated-repost credentials, authenticated browser acceptance and deployed scheduling remain unverified. No Sprint 2/3 completion is claimed.
