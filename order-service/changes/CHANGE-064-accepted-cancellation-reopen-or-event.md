# CHANGE-064: Accepted cancellation reopens before expiry, publishes after expiry

Current OPEN-order event note: CHANGE-071/ADR-019 later replaces the requester-cancellation event named below with `OpenOrderRefundTaskEvent`, shared with scheduled OPEN expiry. This does not change the accepted-cancellation split documented in this change.

- Status: User-approved; Order-side implementation and verification complete; peer dependency remains open
- Date: 2026-10-03
- Scope: Order Service only; shared frontend action behavior may be updated as part of the approved vertical slice. No peer-service source changes.
- Related decision: ADR-014
- Supersedes: The accepted-cancellation branch in CHANGE-055/061/063 and the prior unconditional `ABORTED` + event behavior.

## Approved behavior

Only the User Service-verified courier whose ID matches the accepted Order's `courierId` may cancel it. Under the Order row lock, Order Service checks the authoritative `expiresAt` before acting.

- **Not expired:** synchronously call Credit Service `holdForReopen`. Credit must confirm that the existing reservation/transaction is held for the same Order and amount without refunding it. Only after success does Order change `ACCEPTED` directly to `OPEN`, clear `courierId`, save an `OPEN` checkpoint and command receipt, and return. It does not publish `AcceptedOrderCancellationTaskEvent`; the original order remains eligible for another courier until its existing expiry. If Credit fails, no Order transition/checkpoint/receipt is committed.
- **Expired:** do not call the hold operation and do not reopen. Change `ACCEPTED` to `ABORTED`, clear `courierId`, save the checkpoint and command receipt, and persist `AcceptedOrderCancellationTaskEvent` in the transactional outbox. After commit, publish it. Credit refunds the reservation; User applies the courier's cancellation penalty.
- If the Order expires while the synchronous Credit hold is in flight, recheck the deadline before reopening. If it has expired, use the expired branch and publish the cancellation event so Credit can refund the held transaction.

Open cancellation remains event-driven: `OpenOrderCancellationTaskEvent` tells Credit to refund the reservation; no User consumer is required. Completion remains event-driven: `OrderCompletionTaskEvent` tells Credit to transfer the reserved credits to the courier and tells User to apply the overdue penalty or the existing on-time score reduction.

The direct transition is `ACCEPTED -> OPEN`; this does not authorize `ABORTED -> OPEN`, so ADR-001's separate ban on reopening an already-aborted order remains effective. Repost behavior remains separate.

## Required Credit API and local mock

Credit's inspected API has no hold/reset operation. Order Service adds the operation to `CreditServicePort` and its existing in-memory `MockPeerAdapters` for the default local mock profile. The HTTP adapter targets the proposed provider contract below; the call remains unavailable in real HTTP-peer mode until Credit Service implements it. No Credit Service code is changed.

Proposed operation for peer-owner agreement:

- `POST /api/credits/orders/{orderId}/hold-for-reopen`
- Request: `commandId`, `requesterId`, `courierId`, `amount`, `expectedOrderVersion`.

The request fields above record the original proposal. CHANGE-069/ADR-018 supersedes that payload shape: the effective hold/reset request uses Order ID in the path and no body. Order still validates the command, courier ownership, and version locally.
- Success: synchronous `200` confirmation including the Order/command identity and held transaction state.
- Semantics: idempotently retain the existing reservation and mark/reset it as held for reopening; do not refund or transfer funds. Accept an already-held matching reservation for subsequent accepted/reopen cycles.
- Failure: reject mismatched/missing reservation, amount, Order, stale/conflicting command, or unauthorized call. Order Service must leave the Order `ACCEPTED` and not expose it as `OPEN` unless success is confirmed.
- Authorization: Credit and Order owners must agree a trusted Order-to-Credit authentication mechanism before production use. Do not treat caller-supplied IDs as authentication.

The mock hold is idempotent by command ID and keeps the credits reserved. A committed Credit hold followed by an Order database commit failure is a cross-service failure window; the hold operation must remain safely retryable/reconcilable. The API is explicitly a missing peer dependency, not a verified production integration.

## Subscriber responsibilities

| Event | Subscriber | Required action |
|---|---|---|
| `OpenOrderCancellationTaskEvent` | Credit Service | Refund/release the reserved transaction for the requester-cancelled OPEN Order. |
| `AcceptedOrderCancellationTaskEvent` (published only when `occurredAt >= order.expiresAt`) | Credit Service | Refund/release the reservation; deduplicate by `eventId`. |
| `AcceptedOrderCancellationTaskEvent` (published only when `occurredAt >= order.expiresAt`) | User Service | Apply the configured cancellation penalty to `actorId`/assigned courier; deduplicate by `eventId`. |
| `OrderCompletionTaskEvent` | Credit Service | Transfer/settle the reserved credits to the courier exactly once at the business level. |
| `OrderCompletionTaskEvent` | User Service | If `overdue`, apply the existing overdue penalty; otherwise apply the established reduction to the courier's penalty score. |

All broker delivery remains at least once; subscribers own durable idempotency, retry, acknowledgment, and dead-letter/recovery behavior. Consumer code is future peer work.

## Verification plan and completion state

- Domain tests cover assigned-courier authorization, the expiry boundary, `ACCEPTED -> OPEN`, and `ACCEPTED -> ABORTED`.
- Application tests cover Credit-before-OPEN ordering, hold failure preventing Order writes, expired event/outbox behavior without a hold call, and event snapshot facts.
- Mock Credit tests prove a hold does not refund or release credits and remains idempotent; HTTP adapter tests verify the proposed request path/payload.
- Frontend tests cover removing both reopened `OPEN` and aborted errands from the courier's assigned list and state-appropriate success feedback.
- `mvn -B -ntp '-Dmaven.repo.local=target/m2-repository' verify`: passed, 107 tests with zero failures/errors/skips; JaCoCo line and branch gates passed. The focused cancellation/adapter/application suite passed 39 tests before the final HTTP-202 assertion was added; the final full run includes that assertion.
- Frontend targeted Vitest: 2 files, 11 tests passed. `npm run typecheck` passed; ESLint passed for all four modified UI/helper/test files.
- `git diff --check` is recorded after the final review.
- Live Credit endpoint, event-consumer integration, Pub/Sub delivery, and authenticated browser verification remain pending peer implementation/runtime.
