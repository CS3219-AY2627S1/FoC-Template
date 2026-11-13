# ADR-020: Auto-complete delivered orders after 48 hours

- Status: Accepted by explicit user direction on 2026-10-07; implementation verification pending
- Owner: Order Service
- Related change: CHANGE-072
- Supersedes: The Sprint 1 scope exclusion of 48-hour auto-completion, only

## Context

The Sprint 1 pack deferred 48-hour auto-completion. The user has now directed Order Service to complete an order automatically after it remains `DELIVERED` for at least 48 hours.

## Decision

- Keep requester-confirmed completion available as soon as the order is `DELIVERED`.
- A configurable Spring `@Scheduled` pass queries PostgreSQL for rows whose current status is `DELIVERED` and whose `DELIVERED` checkpoint timestamp is less than or equal to the 48-hour cutoff.
- Select eligible Order rows under a pessimistic no-wait write lock. Before mutation, reload/lock and recheck current status and delivered-checkpoint age. This avoids application-side filtering and serializes automatic completion against requester completion.
- Complete through the same completion transition/outbox behavior: record `COMPLETED`, a lifecycle-actor checkpoint, stable `AUTO_COMPLETE:<orderId>` receipt, and the existing `OrderCompletionTaskEvent` in the same transaction. Derive overdue facts from the same accepted/delivered checkpoint history as requester completion.
- Default the configurable cron to once per minute. Local configuration uses `ORDER_AUTO_COMPLETION_CRON`; no schema or peer-service change is required.

## Consequences

- User and Credit continue to receive exactly the existing completion event and apply their existing policies; automatic completion does not invent an event type or synchronous peer call.
- Row locks and idempotency protect against repeated passes and a requester completing concurrently. A no-wait lock conflict ends that scheduler pass; the next pass retries eligible orders.
- In-process Spring scheduling is not guaranteed while Cloud Run scales to zero or has no request CPU allocation. Reliable wall-clock completion during idle periods would require a later deployment/runtime decision.
- The event actor identifies lifecycle automation as the completion initiator; it is not a requester identity.
