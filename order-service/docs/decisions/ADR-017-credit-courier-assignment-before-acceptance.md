# ADR-017: Record the courier on Credit before Order acceptance

- Status: User-approved Order-side contract stub; real Credit API pending
- Date: 2026-10-06
- Owner: Order Service
- Related change: CHANGE-068
- Related peer feedback: FEEDBACK-004

## Decision

When a courier accepts an eligible `OPEN` Order, Order Service first validates the locked Order and then synchronously asks Credit Service to associate the reservation with that courier. Order waits for an explicit successful confirmation and validates the response before persisting `ACCEPTED`, its checkpoint, and command receipt. Credit failure or an invalid response leaves the Order unchanged. Order rechecks expiry after the network call so an expired Order is not accepted.

The local mock adapter implements the contract for the default mock-peer Compose profile. The HTTP adapter targets the proposed Credit route documented in FEEDBACK-004. This is an Order-side stub, not a live or verified Credit integration. Credit source is unchanged.

## Consequences

- Credit knows the intended payee before Order completion; its future completion-event consumer must verify the event courier against the reservation.
- The synchronous call adds Credit availability and latency to acceptance and keeps the Order transaction/row lock open while Credit responds.
- Credit may record an assignment before Order's database transaction completes. The real endpoint must define idempotent retry and recovery for that split failure window.
- Credit's existing user-authenticated reservation endpoint does not settle the trusted Order-to-Credit authentication question for courier assignment.
- After FEEDBACK-003 hold/reset, the previous assignment must be cleared so a new courier can be assigned.

The proposed route, DTOs, response, security questions, and provider verification requirements remain in FEEDBACK-004. Do not mark that peer dependency verified until Order inspects the actual Credit implementation and tests.

The Credit request shape is clarified by ADR-018/CHANGE-069: assignment carries Order ID in the path and courier ID in the body; hold/reset carries only Order ID in the path. Credit resolves requester and amount from its own transaction. Order retains its local stale-version and ownership validation.
