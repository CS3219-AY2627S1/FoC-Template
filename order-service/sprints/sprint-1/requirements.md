# Sprint 1 Requirements

## Effective compact-event amendment — CHANGE-092 / ADR-031 (2026-10-09)

Yao Xiang approved the exact seven-field Order-only payload: eventId, eventType, orderId, orderStatus, creditAmount, occurredAt, courierId. This replaces full snapshots and overdue facts ONLY for OpenOrderRefundTaskEvent and OrderCompletionTaskEvent. AcceptedOrderCancellationTaskEvent retains its existing v1 envelope/snapshot. Internal outbox versions and Pub/Sub eventVersion attribute remain (compact schema v2); topic names and DB schema unchanged. Old pending snapshot rows normalize at dispatch from their saved facts, with stable IDs. Lifecycle/outbox scheduling, locks, synchronous Credit assignment/reset and ADR-025 abort behavior remain. Historical v1 descriptions below are superseded for these two bodies. Credit currently requires the old snapshot and overdue; FEEDBACK-009 is INCOMPLETE_OR_INCOMPATIBLE. User completion penalties need an agreed separate overdue source. User approved implementing Order-only and documenting peer work; live integration remains blocked, Sprint [~].


## User-approved addition - CHANGE-057

NTH1 remains owned by Admin Service. To support its future dashboard, Order Service provides an admin-authorized paginated query over its own order data at `GET /api/orders`, with an optional exact `status` filter. Omitting status returns every status. The endpoint returns `OrderPageResponse` using one-based page numbering. No dashboard or Admin Service source is added in this change.

This file narrows implementation planning; Project D1 and ADR-001 remain authoritative.

## Sequence 7 - Confirm completion

- Project D1: F4.1.5; F5.1/F5.1.1; F13/F13.1.1.
- Requester path: authenticated actor is the original requester; order status is `DELIVERED`; expected order version is current. The requester may confirm completion before automatic completion is due.
- Automatic path (CHANGE-072/ADR-020): a Spring scheduler selects orders whose `DELIVERED` checkpoint occurred at or before `now - 48 hours`, then rechecks under a pessimistic row lock before completion. The `DELIVERED -> COMPLETED` transition records a lifecycle-actor checkpoint and idempotent receipt, and atomically stores the same resulting-Order `OrderCompletionTaskEvent` with overdue facts; the event omits checkpoint history.
- Both paths use the same completion-event/outbox behavior and calculate overdue from the accepted/delivered checkpoints and configured delivery limit.
- Delivery: attempt publication immediately after commit; retry due rows through the Spring cron poller. A publish failure leaves the transition committed and the event pending. Delivery is at least once; consumers deduplicate by stable event ID.
- Deferred: Credit settlement policy; Credit's consumer remains future peer work.

## Sequence 8 - Cancel an OPEN order

- Project D1: F4.1.7; F5.1/F5.1.1; F13/F13.1.1.
- Preconditions: authenticated actor is the original requester; order is still `OPEN`; expected version is current.
- Result: replace `OPEN` with `CANCELLED`, save the cancellation checkpoint and receipt, and atomically store the resulting-Order cancellation event in the outbox; the serialized event omits checkpoint history.
- Delivery: attempt immediately after commit and retry due events through cron. Publish failure does not undo the transition; consumers deduplicate at least-once delivery by stable event ID.
- Deferred: Credit Service cancellation policy under F11.

## Updated overall Sequence 7 - Cancel an ACCEPTED order

- Project D1: F4.1.7; updated overall Sequence 7; CHANGE-055 / ADR-010.
- Preconditions: authenticated actor is a courier; the order is `ACCEPTED`; its assigned `courierId` matches the User Service-confirmed actor ID; expected version is current.
- Result: transition to `ABORTED`, clear the courier assignment, and atomically persist the checkpoint, receipt, and resulting-Order cancellation event in the outbox. The serialized event omits checkpoint history. Attempt dispatch after commit. Do not reopen the order in Sprint 1.
- Failure: requester or another courier is forbidden. A Pub/Sub failure leaves the committed transition and event in the outbox for retry.

## Courier lifecycle ownership

- Sequences 3-6: a User Service-verified courier may accept only an unassigned `OPEN` order that they did not request. Start, pickup, delivery, and accepted-order cancellation require the authenticated courier ID to match the order's assigned `courierId`.
- Sequence 3 / CHANGE-068: after validating the locked `OPEN` Order, synchronously ask Credit to associate the reservation with the courier. Persist `ACCEPTED` only after a matching successful confirmation; if Credit fails, leave the Order unchanged. Recheck expiry after the call. The HTTP route is proposed and the mock is Order-local; see FEEDBACK-004.
- Sequence 3 / CHANGE-068: after validating the locked `OPEN` Order, synchronously ask Credit to associate the reservation with the courier. Persist `ACCEPTED` only after a matching successful confirmation; if Credit fails, leave the Order unchanged. Recheck expiry after the call. The HTTP route is proposed and the mock is Order-local; see FEEDBACK-004.
- Sequences 5 and 8 of the updated overall design: only the original requester may confirm completion or cancel an `OPEN` order, respectively.

## Sequence 9 - Scheduled expiry of an unaccepted OPEN order (updated overall Sequence 6)

- Project D1 baseline: F4.1.8; F10/F10.1/F10.1.1-F10.1.4; NTH4 prerequisite.
- Sprint narrowing: process only due, unaccepted `OPEN` orders; do not process `ABORTED` reopening/expiry in this slice.
- Preconditions: Spring `@Scheduled` trigger using a configurable expiry cron; status `OPEN`; expiry timestamp reached; no courier assigned.
- Result: atomically replace `OPEN` with `EXPIRED`, record one expiry checkpoint, and persist one `OpenOrderRefundTaskEvent` containing resulting Order/repost fields but no checkpoint history. Existing after-commit dispatch publishes it; outbox recovery retries failed delivery.
- Credit consumes the event and refunds/releases the reservation. Order does not synchronously call Credit for expiry. Credit deduplicates by stable `eventId`.
- Repeated scheduler passes do not create duplicate transitions, checkpoints, or events. Concurrent scans lock due orders.
- Requester-triggered OPEN cancellation is shown in the same updated overall Sequence 6, with `CANCELLED` and `OpenOrderRefundTaskEvent`; expiry differs by trigger and status but uses the same event type/topic.

## Sequence 10 - Automatic repost

- Project D1: NTH4; creation validation references F1.1-F1.3.
- Preconditions: original is `EXPIRED`; automatic repost plan enabled and due; no repost exists; current supplier pair is valid/active/distinct; Credit Service confirms a reservation for the new order.
- Result: create exactly one distinct `OPEN` order, link original and repost both ways, mark the plan/original as reposted, and publish a deduplicable repost-created fact when that publication is in the implemented contract.
- Failure: if supplier validation or reservation fails, create no repost and keep the original `EXPIRED`.
- Constraint: initial creation/configuration does not reserve future repost credits.

## Sequence 11 - Manual repost

- Project D1: NTH4; creation validation references F1.1-F1.3.
- Draft: only the original requester may obtain copied item and supplier references from an `EXPIRED` original with no repost. Draft retrieval creates no order and reserves no credits.
- Submit: requester reviews/updates copied details, credit amount, posting/expiry timing, and other approved fields; validate them and current supplier references; reserve credits.
- Result: create exactly one distinct linked `OPEN` order and mark the original as reposted.
- Failure: invalid input, authorization failure, existing repost, invalid supplier pair, or rejected reservation creates no order.

## Cross-cutting requirements

- One valid status at a time (F13).
- Identity/authorization through User Service; no copied authority.
- Order Service stores supplier IDs, not authoritative catalogue details.
- Credit Service owns reservations and all credit policy.
- Idempotent commands/triggers use command IDs; state changes use expected order version.
- Apply Project D1 NFR3 test/coverage rules and NFR4 logging rules from the first implementation.


## CHANGE-077 - Quarter-hour Requester times and scheduler cadence

- USER Requester creation expiry, automatic repost time and manual repost expiry expose local minute choices 00/15/30/45, with defaults rounded up. The existing minimum expiry of 30 minutes remains. Numeric delivery duration is unchanged.
- This is a UI selection/validation rule; API timestamp shapes and existing/direct API arbitrary valid deadlines remain supported. Availability and acceptance enforce the actual expiry time independently of the scheduler.
- Default Spring expiry cron is 0 */15 * * * *; outbox recovery cron is 0 0 * * * * under ADR-023; delivered auto-completion remains 0 * * * * *. Immediate after-commit dispatch remains mandatory.
- Local/cloud configuration must expose the same defaults. Due selection stays in PostgreSQL; no full-table/in-memory filtering. See ADR-022.


## CHANGE-079 / ADR-024: Central role annotations (approved 2026-10-08)

Production Firebase validation resolves User Service roles once per request, verifies response identity against JWT subject, and enforces RequireRequesterRole/RequireCourierRole/RequireAdminRole. Order-specific production role mode defaults to HTTP; local anonymous/mock behavior remains. Adapters reuse verified roles/identity, retaining fresh courier eligibility and locked domain ownership/state guards before mutation. Shared reads accept any confirmed requester/courier/admin role; /mine uses its selected mode. Internal lifecycle/scheduler authorization, API bodies, event payloads and schema remain unchanged. See ADR-024 for endpoint policy, inspected peer contracts and positive/negative test obligations.

## Personal-list UI amendment — CHANGE-094

User-approved F2/F8/F9 refinement: five-second visible authenticated Order reads, My Requests/My Errands All statuses or selected exact status with pagination; filter change resets page 1. F4.1.9/F11 courier accepted action displays Abort errand; endpoint and domain behavior unchanged. NFR2 existing responsive design and NFR3 test-first checks apply.
