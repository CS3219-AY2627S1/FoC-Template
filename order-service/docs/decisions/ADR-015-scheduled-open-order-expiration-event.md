# ADR-015: Spring-scheduled OPEN-order expiration event

- Status: Spring scheduling accepted and remains effective; separate expiration event choice superseded by ADR-019; production scheduling verification pending
- Date: 2026-10-03
- Owner: Order Service
- Related change: CHANGE-065
- Related event decision: EV-DEC-005 / EV-DEC-007
- Supersedes: Synchronous Credit release during Sequence 9 expiry

## Later event-contract decision

ADR-019 / CHANGE-071, approved by the user on 2026-10-06, supersedes only the separate `OrderExpirationTaskEvent` and publisher/topic contract below. The Spring scheduler, expiry status/checkpoint transition, transactional outbox, after-commit dispatch, and Credit refund responsibility remain effective. Scheduler expiry now emits `OpenOrderRefundTaskEvent`, the same event used for requester cancellation; `order.status` is `EXPIRED` for scheduled expiry and `CANCELLED` for requester cancellation. This ADR's original decision and rationale are retained as historical record.

## Context

Updated overall Sequence 6 contains both requester-triggered cancellation of an OPEN order and scheduled expiry of an unassigned OPEN order. They share the resulting event-driven Credit refund flow, while the trigger, resulting Order status, and event type differ. The former Sequence 9 implementation synchronously called Credit to release funds while transitioning to `EXPIRED`.

## Decision

Use Spring `@Scheduled` with configurable cron (`order.lifecycle.expiry-cron`, original default once per minute; cadence superseded by ADR-022 to every 15 minutes) to find OPEN, unassigned orders whose expiry time has been reached. In one Order database transaction, change each to `EXPIRED`, persist an expiry checkpoint, and enqueue an `OrderExpirationTaskEvent` with the resulting Order/repost fields but no checkpoint history. The existing after-commit listener dispatches through `IOrderExpirationTaskPublisher` / `OrderExpirationTaskPublisher`; the separate outbox recovery scheduler retries pending deliveries. Credit consumes the event and refunds/releases the reservation. Order Service does not make a synchronous Credit release request or await the consumer.

Requester-triggered cancellation remains in the same Sequence 6 and publishes `OpenOrderCancellationTaskEvent` with `CANCELLED`. Credit consumes both events; no User subscriber is involved in either OPEN-order outcome.

## Consequences and trade-offs

- PostgreSQL row locks serialize concurrent expiry scans so only one process transitions each still-OPEN row and writes its checkpoint/event.
- At-least-once Pub/Sub delivery requires Credit to durably deduplicate by `eventId` and retry/ack according to its subscription contract.
- Async refund can race with a later automatic repost reservation; if reservation is rejected before refund processing, the original remains EXPIRED and a later repost attempt can retry.
- The Order Service topic defaults to `TODO_TOPIC`; local emulator setup must create/configure the topic before testing publication.
- Current Cloud Run uses minimum instances zero and request-based CPU. Spring in-process scheduling is not guaranteed while the service is idle. Reliable expiry therefore requires either an always-running scheduler-capable instance or a future approved external trigger/deployment configuration. This user-directed code design does not make that production runtime guarantee.
- No Credit/User source, shared Compose, topic initialization, Cloud Run billing, or database schema is changed in this Order-only implementation.

## Synchronization

Update Sequence 6, Sequence 9 requirements/acceptance tests, publisher class diagram, service and peer contracts, event registry, traceability, change/evolution records, and Order event tests. Retain the existing trusted lifecycle endpoint for manual/on-demand invocation; it shares the same idempotent transition service.
