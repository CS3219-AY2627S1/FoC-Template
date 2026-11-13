# ADR-002: Split Courier Outcome Contracts by Outcome

Date: 2026-09-25

Status: Accepted

Approved by: User-provided team conversation and explicit approval to update the workflow

## Context

The logical User Service contract used one `acceptCourierOutcomeFact` operation with an `outcomeType` discriminator and a generic `facts` property bag. The team identified that the discriminator controls receiver behavior and makes the contract less explicit. The purpose of the `facts` bag was also unclear.

The current overall class diagram uses the related generic names `submitCourierOutcomeFlag()` and `publishCourierOutcomeFlag()`.

## Decision

1. Replace the generic User Service operation with:
   - `acceptCourierCompleted(eventId, orderId, courierId, occurredAt, orderVersion)`
   - `acceptCourierOverdue(eventId, orderId, courierId, occurredAt, orderVersion)`
   - `acceptCourierAborted(eventId, orderId, courierId, occurredAt, orderVersion)`
2. Do not pass an `outcomeType` discriminator.
3. Do not pass an open-ended `facts` property bag.
4. Preserve `eventId` and `orderVersion` for deduplication and ordering, plus the stable order/courier identifiers and occurrence time.
5. Treat completion and overdue as independent notifications: one completed order may also produce an overdue notification.
6. User Service remains the sole owner of penalty calculation and policy.

## Consequences

- Order Service outbound ports and adapters must expose explicit operations for the three courier outcomes.
- User Service inbound contracts must provide matching explicit operations.
- Contract tests must verify routing by operation rather than by an outcome enum or flag.
- Adding another courier outcome requires an explicit contract change rather than adding another discriminator value.
- The generic operation names in the current overall class diagram are superseded until the diagram and overall design pack are regenerated from an editable source.
- Sprint 1 sequences 7-11 remain unchanged because courier outcome publication is deferred from that implementation slice.
