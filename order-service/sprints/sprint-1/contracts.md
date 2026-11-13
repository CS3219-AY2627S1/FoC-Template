# Sprint 1 Contracts

## Effective compact-event amendment — CHANGE-092 / ADR-031 (2026-10-09)

Yao Xiang approved the exact seven-field Order-only payload: eventId, eventType, orderId, orderStatus, creditAmount, occurredAt, courierId. This replaces full snapshots and overdue facts ONLY for OpenOrderRefundTaskEvent and OrderCompletionTaskEvent. AcceptedOrderCancellationTaskEvent retains its existing v1 envelope/snapshot. Internal outbox versions and Pub/Sub eventVersion attribute remain (compact schema v2); topic names and DB schema unchanged. Old pending snapshot rows normalize at dispatch from their saved facts, with stable IDs. Lifecycle/outbox scheduling, locks, synchronous Credit assignment/reset and ADR-025 abort behavior remain. Historical v1 descriptions below are superseded for these two bodies. Credit currently requires the old snapshot and overdue; FEEDBACK-009 is INCOMPLETE_OR_INCOMPATIBLE. User completion penalties need an agreed separate overdue source. User approved implementing Order-only and documenting peer work; live integration remains blocked, Sprint [~].


Only the following logical contract subset applies. Concrete HTTP paths, methods, schemas, and retry schedule remain open questions. CHANGE-053 approves Order snapshots; CHANGE-054 selects Google Cloud Pub/Sub; CHANGE-056 defines the unified completion event; CHANGE-063/ADR-013 approves transactional outbox delivery; CHANGE-065/ADR-015 adds Spring-scheduled OPEN expiry and CHANGE-071/ADR-019 makes it share `OpenOrderRefundTaskEvent` with requester cancellation; CHANGE-067/ADR-016 excludes checkpoint history from event snapshots; CHANGE-068/ADR-017 adds the user-approved Order-side Credit assignment stub before acceptance.

## Consumed contracts

- User: `verifyIdentity(accessContext)` and `getRoleContext(userId)`.
- Supplier: `validateSupplierPair(pickupId, deliveryId)` and `resolveSupplierDetails(supplierIds)`.
- Credit: `reserveCredits(orderId, requesterId, amount)`, `assignCourier(orderId, courierId)`, and `holdForReopen(orderId)`. Assignment and hold are synchronous; the Credit requests contain only the Order ID and, for assignment, courier ID. Order validates its expected version locally; published events retain `orderVersion`. FEEDBACK-003/004 track the absent real Credit endpoints and security agreement.

## Provided contracts for the initial slice

- CHANGE-057 (user-approved Order-side NTH1 support): `GET /api/orders?status={OrderStatus}&page={1-based page}&size={page size}`; status is optional and omitted means all statuses; default page 1/size 20, size capped at 100; admin role required; returns `OrderPageResponse` ordered by creation time descending.

- `confirmCompletion(orderId, actorContext, commandId, expectedVersion)`.
- `cancelOpen(orderId, actorContext, commandId, expectedVersion)`.
- `processExpiry(now, commandId, triggerIdentity)`.
- `processAutoRepost(now, commandId, triggerIdentity)`.
- `configureReposting(originalOrderId, repostConfiguration, actorContext, commandId, expectedVersion)` when required by sequence 10 prerequisites.
- `getManualRepostDraft(originalOrderId, actorContext)`.
- `requestManualRepost(originalOrderId, reviewedDetails, actorContext, commandId, expectedVersion)`.
- `subscribeToOrderOutcomes()` for the typed completion, shared OPEN-refund, and accepted cancellation events. Updated overall Sequence 6 uses `OpenOrderRefundTaskEvent` for both requester-triggered `CANCELLED` and scheduler-triggered `EXPIRED` outcomes; Credit refunds/releases for either based on `order.status`, and User is not involved. `OrderCompletionTaskEvent` is published for every completed order and includes overdue facts for both User and Credit consumers.

The updated publisher pairs and method names are diagrammed in CHANGE-053/056. The serialized event payload includes the current Order fields and repost plan, but not checkpoint history; completion also includes overdue facts. Topic names are placeholders. Credit/User consumer implementations are future work assumed by the user for this Order-side scope, but remain unverified under `FEEDBACK-002`.

## Contract invariants

- Protected calls carry authenticated actor context; lifecycle calls carry trusted trigger identity.
- Command IDs prevent duplicate status changes, checkpoints, reservations, or reposts.
- Stale expected versions produce conflict.
- At most one repost exists per original across automatic and manual paths.
- Reservation rejection or dependency failure cannot produce an `OPEN` repost.
- Credit assignment failure or invalid confirmation cannot produce an `ACCEPTED` Order, checkpoint, or command receipt.
- Failure categories remain distinguishable: validation, unauthorized, not found, conflict, dependency unavailable, reservation rejection.
- Published facts contain event ID/version, order version, actor/time metadata, and the Order fields/repost plan needed by subscribers; checkpoint history is excluded. Completion carries overdue facts derived internally from history.
- For event-driven outcomes including scheduled OPEN expiry, the resulting Order state/checkpoint (and command receipt where applicable) plus event intent commit atomically. Delivery is attempted after commit and retried from the outbox; Pub/Sub failure does not undo the transition. Delivery is at least once and consumers deduplicate stable event IDs.

## Missing details requiring approval before relevant code

- Topic IDs, serialization compatibility policy, and retry schedule.
- Exact request/response DTO fields and validation-error format.
- Authentication propagation/trusted-trigger mechanism.
- Event snapshot mapping does not retrieve checkpoint history; overdue facts are still computed at completion from internally stored checkpoints. Flyway is selected. The existing outbox schema handles the effective typed outcome events, including expiration; no new schema is required.
- Exact operational monitoring/alerting thresholds for repeated outbox delivery failures.
- Topic/subscription names, event versioning, deduplication, retry/dead-letter monitoring, and subscriber authentication.
- PostgreSQL schema, identifier types, timestamps, and version representation.


## CHANGE-079 / ADR-024: Central role annotations (approved 2026-10-08)

Production Firebase validation resolves User Service roles once per request, verifies response identity against JWT subject, and enforces RequireRequesterRole/RequireCourierRole/RequireAdminRole. Order-specific production role mode defaults to HTTP; local anonymous/mock behavior remains. Adapters reuse verified roles/identity, retaining fresh courier eligibility and locked domain ownership/state guards before mutation. Shared reads accept any confirmed requester/courier/admin role; /mine uses its selected mode. Internal lifecycle/scheduler authorization, API bodies, event payloads and schema remain unchanged. See ADR-024 for endpoint policy, inspected peer contracts and positive/negative test obligations.

## Effective personal list extension — CHANGE-094

/api/orders/mine supports optional uppercase OrderStatus query, omitted/empty all; invalid 400; owner/mode/auth and existing one-based page envelope unchanged. Server filters current requester/courier records and immutable ABORTED courier history before paging/counting. Superseded requester originals remain hidden. See docs/service-contracts.md and ADR-032.
