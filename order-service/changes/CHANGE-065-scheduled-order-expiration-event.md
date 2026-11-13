# CHANGE-065: Spring-scheduled OPEN expiry event

Historical record: CHANGE-071/ADR-019 supersedes the separate `OrderExpirationTaskEvent` and its publisher/topic. The Spring scheduler and `EXPIRED` state/checkpoint transition remain; expiry now emits the shared `OpenOrderRefundTaskEvent` also used for requester cancellation.

- Status: User-approved; implementation in progress
- Date: 2026-10-03
- Scope: Order Service only
- Related decision: ADR-015; EV-DEC-005 and EV-DEC-007
- Supersedes: Sequence 9's synchronous Credit release on expiry

## Approved behavior

Updated overall Sequence 6 presents requester cancellation and scheduled expiration of OPEN orders in the same flow. The requester triggers cancellation; Spring `@Scheduled` discovers due expiration. Cancellation changes the status to `CANCELLED` and writes `OpenOrderCancellationTaskEvent`; expiry changes it to `EXPIRED` and writes `OrderExpirationTaskEvent`. Both persist the resulting Order state, checkpoint, and outbox intent atomically, then dispatch after commit. Per CHANGE-067/ADR-016, neither event serializes checkpoint history. Credit consumes either event and refunds/releases the credit reservation. Order does not call Credit synchronously for expiry or await a consumer response. User Service does not subscribe to these OPEN-order events.

The expiry cron is configurable through `ORDER_EXPIRY_CRON` / `order.lifecycle.expiry-cron`, defaulting to once per minute. Event publication uses a configurable `ORDER_EXPIRATION_TOPIC` with `TODO_TOPIC` as its placeholder. The existing trusted lifecycle API remains as a manual trigger of the same service operation.

## Implementation and verification

- Added typed expiration event DTO, mapper, publisher interface/class, outbox-dispatch routing, lifecycle scheduler, and locked due-order query.
- Removed synchronous Credit `release` from the lifecycle service/port/adapters.
- Updated Sequence 6, Sequence 9 requirements/acceptance, event class diagram, service contracts, peer event-subscription feedback, and event decision/evolution records.
- Verification status: pending Maven execution and review of updated documents.

## Limits

The Credit event consumer remains future peer work and was not edited. Local Pub/Sub topic initialization was not changed. Cloud Run scale-to-zero/request-based CPU does not guarantee the in-process cron runs while idle; deployment reliability remains an operational issue and no billing/deployment setting is included.
