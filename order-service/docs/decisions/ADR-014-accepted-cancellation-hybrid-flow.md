# ADR-014: Accepted cancellation reopens before expiry and publishes after expiry

- Status: Accepted; Order-side flow and hold endpoint contract user-confirmed; Credit implementation pending
- Date: 2026-10-03
- Owner: Order Service
- Related changes: CHANGE-064, CHANGE-070
- Supersedes: Unconditional `ACCEPTED -> ABORTED` plus accepted-cancellation event behavior in CHANGE-055/061/063

## Decision

Only the assigned, User Service-verified courier may cancel an `ACCEPTED` Order. Order Service checks the Order's original `expiresAt` under the row lock.

- Before expiry, Order synchronously requests that Credit hold/reset the existing transaction without refunding it. Only after Credit confirms success does Order clear the courier and transition directly from `ACCEPTED` to `OPEN`, with a checkpoint and command receipt. No accepted-cancellation event is published in this case.
- At or after expiry, Order does not reopen. It transitions to `ABORTED`, clears the courier, commits the checkpoint/receipt and accepted-cancellation event intent atomically, and dispatches after commit through the existing outbox. Credit refunds the transaction and User applies the courier penalty.
- If the deadline passes during the Credit hold call, Order rechecks before exposing `OPEN`; it follows the expired/event path and the event asks Credit to refund the held reservation.

`ACCEPTED -> OPEN` is distinct from reopening `ABORTED -> OPEN`. ADR-001 continues to prohibit the latter. The separate NTH4 repost flow remains unchanged.

Open cancellation publishes one event for Credit to refund. Completion publishes one event for Credit to transfer credits and User to apply overdue penalty or the on-time penalty-score reduction. Order does not await peer subscriber replies.

## Credit dependency

Credit currently has no synchronous hold-for-reopen API. The user finalized the Order contract in FEEDBACK-003: `POST /api/credits/orders/{orderId}/hold-for-reopen`, no request body, `200 OK` only after the transaction is held/reset, with repeated holds idempotent by transaction state. Order uses the local `MockPeerAdapters` implementation in mock mode; the HTTP adapter targets this agreed contract. Live HTTP-peer operation is not verified because the Credit route is still missing, and trusted service authentication must be settled before production use. Peer source remains unchanged.

## Consequences and trade-offs

The synchronous confirmation prevents another courier from seeing an `OPEN` Order before its Credit reservation is safely retained. It adds Credit latency to the cancel request and means a Credit failure leaves the Order assigned and `ACCEPTED`. Because PostgreSQL and Credit do not share a transaction, Credit may hold successfully before a later Order commit failure; the hold operation must be idempotent and operationally reconcilable. Expired cancellation continues through the transactional outbox and is delivered at least once, so Credit and User consumers must deduplicate.

Consumer actions and missing APIs are tracked in `docs/peer-service-api-feedback.md`; no peer service implementation is authorized by this decision.
