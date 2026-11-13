# CHANGE-053: Publish task event before Order status commit

> Current outbox behavior and Pub/Sub environment/topic configuration are recorded in CHANGE-063/ADR-013 and CHANGE-073/ADR-021. Placeholder topics and publish-before-status below are historical.

> Historical payload note: CHANGE-067/ADR-016 supersedes this record's inclusion of checkpoint history in the event snapshot. The effective payload omits history; completion overdue facts still derive from it internally.

- Date: 2026-10-02
- Developer: Yao Xiang
- Status: User-approved ordering/payload direction; Pub/Sub transport and implementation tracked in CHANGE-054
- Change type: Architecture/specification change
- Related records: CHANGE-051, CHANGE-052, ADR-009

## User-approved behavior

The user directed Order Service to publish the relevant event first. Only when the publisher confirms success may Order Service persist the associated status transition, checkpoint, and command receipt. If publication fails, Order Service must leave the status unchanged and report the dependency failure. Order Service does not wait for Credit or User consumer replies. Topics remain placeholders inside their respective publisher classes for the user to fill later. Only Order Service may be changed; peer consumers are future peer work and are assumed for this Order-side task.

The four requested pairs and sequence methods are:

| Sequence | Interface / class | Method | Consumers (assumed future work) |
|---|---|---|---|
| 5, non-overdue completion | `IOrderCompletionTaskPublisher` / `OrderCompletionTaskPublisher` | `publishOrderCompletionTask` | Credit |
| 6, OPEN cancellation | `IOpenOrderCancellationTaskPublisher` / `OpenOrderCancellationTaskPublisher` | `publishOpenOrderCancellationTask` | Credit |
| 7, ACCEPTED cancellation | `IAcceptedOrderCancellationTaskPublisher` / `AcceptedOrderCancellationTaskPublisher` | `publishAcceptedOrderCancellationTask` | Credit and User |
| 8, overdue completion | `IOverdueOrderCompletionTaskPublisher` / `OverdueOrderCompletionTaskPublisher` | `publishOverdueOrderCompletionTask` | Credit and User |

The proposed `messagingpublisher/interfaces/` package contains `IEventPublisher<T>` and the four event-specific interfaces. Matching publisher classes reside in `messagingpublisher/publisher/`. Each method receives its typed event; the common publisher boundary accepts the topic placeholder and serialized event.

## Event data

Each typed event contains common event metadata (`eventId`, `eventVersion`, `orderVersion`, `occurredAt`, `actorId`) and a complete Order snapshot. The snapshot includes every current `Order` aggregate field: ID, requester/courier IDs, item description, pickup/delivery supplier IDs, offered credits, status, creation/expiry timestamps, delivery time limit, aggregate version, original/reposted Order IDs, the complete repost plan, and checkpoint history including checkpoint IDs/status/times/actor/supplier. The overdue event also carries `overdue` and `overdueAt` facts.

Checkpoint-history lookup was missing and is being added through the repository abstraction. Overdue status/time are event facts derived at completion from accepted/delivered checkpoints and the configured delivery limit; they are not persisted as new Order columns, so this producer change does not require a schema migration.

## Consistency and failure consequence

This user-approved ordering supersedes the outbox-first sequence previously recorded by CHANGE-051/ADR-009 for these four events. Publish-before-save cannot make the external broker and PostgreSQL one atomic transaction. If the broker accepts an event but the subsequent Order database commit fails, a consumer may act on an event while the Order remains in its prior state. The current design does not define a compensation or reconciliation event for that case. Sequence diagrams call out this risk; this change must not be described as atomic Order/event consistency.

Alternatives considered:

- **Transactional outbox:** state and event record commit atomically, then delivery retries independently. This avoids publishing facts for a failed Order commit but contradicts the user's requested publish-before-status order.
- **Publish before Order commit (selected):** a confirmed publish gates the status transition and no peer reply is awaited. This matches the requested sequence but permits orphan events after a database failure.
- **Synchronous peer calls:** wait for service outcomes before changing status. This contradicts the user's direction to proceed without consumer replies and restores the old coupling.

## Remaining implementation blockers

- Pub/Sub transport selection and publisher implementation moved to CHANGE-054.
- The current Order model has no `ABORTED` enum value or accepted-order abort/reopen behavior.
- The current Order transition code still settles/releases synchronously through `CreditServicePort`; it has no publisher calls.
- The full snapshot needs checkpoint-history retrieval; no migration is needed because overdue facts are derived rather than persisted.
- Direct publication before database commit retains the orphan-event failure described above.

No peer-service files are in scope. CHANGE-054 records the code implementation and verification status.

## Verification

- Re-invoked the Order Service workflow and confirmed developer profile, combined handoff, and current branch `order-service/sprint-1/yx-seq1-to-seq11` agree.
- Inspected Order, OrderCheckpoint, RepostPlan, OrderTransitionService, repository interfaces, migration workflow, current Maven dependencies, and relevant architecture records.
- Re-read frontend instructions/configuration and confirmed no frontend changes are in scope.
- Updated the proposed Sequences 5-8 diagrams and publisher class diagram to match publish-before-save and the requested publisher names.
- No Java compilation or tests were run in the documentation-only turn that created CHANGE-053.
