# ADR-010: Order transition ownership authorization

- Status: Accepted
- Date: 2026-10-02
- Owner: Order Service
- Approved by: User, explicit instruction on 2026-10-02
- Related change: CHANGE-055

## Context

Order transition commands must enforce both the caller's User Service-confirmed role/identity and ownership of the specific order. The updated overall Sequence 7 event flow had been documented with the requester as the accepted-cancellation actor, and the aggregate checked requester ownership for that transition.

## Decision

- `accept`: only a User Service-verified courier may accept; the courier cannot be the requester, and `courierId` must still be null on the `OPEN` order.
- `start`, `markPickedUp`, and `markDelivered`: only the assigned courier may advance the order.
- `cancelAccepted`: only the assigned courier may request the accepted-cancellation transition from `ACCEPTED` to `ABORTED`; clear the assignment in the same transaction that records the resulting event in the outbox.
- `cancelOpen` and `confirmCompletion`: only the original requester may cancel their `OPEN` order or complete their `DELIVERED` order.
- Verify requester/courier role before returning a command-receipt replay. Existing order ownership guards remain authoritative when a transition is applied.
- User Service remains authoritative for caller identity and courier eligibility; Order Service remains authoritative for transition state and per-order assignment.

## Consequences

The application layer passes the provider-confirmed identity into the domain. The aggregate enforces order ownership and assignment, protecting the transition even when a request body supplies another actor ID. An assigned `OPEN` order cannot be overwritten by a later acceptance. Under CHANGE-064/ADR-014, only the assigned courier may cancel an accepted order. If unexpired, Order waits for synchronous Credit hold confirmation and transitions directly to `OPEN`; if expired, it transitions to `ABORTED` and commits accepted-cancellation event intent for Credit refund and User penalty. This does not reopen an already `ABORTED` order.

No schema, event schema, endpoint shape, peer service, or frontend change is required. Sprint 1 still does not reopen an `ABORTED` order.
