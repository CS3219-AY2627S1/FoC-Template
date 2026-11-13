# Sprint 1 Architecture Context

## Effective compact-event amendment — CHANGE-092 / ADR-031 (2026-10-09)

Yao Xiang approved the exact seven-field Order-only payload: eventId, eventType, orderId, orderStatus, creditAmount, occurredAt, courierId. This replaces full snapshots and overdue facts ONLY for OpenOrderRefundTaskEvent and OrderCompletionTaskEvent. AcceptedOrderCancellationTaskEvent retains its existing v1 envelope/snapshot. Internal outbox versions and Pub/Sub eventVersion attribute remain (compact schema v2); topic names and DB schema unchanged. Old pending snapshot rows normalize at dispatch from their saved facts, with stable IDs. Lifecycle/outbox scheduling, locks, synchronous Credit assignment/reset and ADR-025 abort behavior remain. Historical v1 descriptions below are superseded for these two bodies. Credit currently requires the old snapshot and overdue; FEEDBACK-009 is INCOMPLETE_OR_INCOMPATIBLE. User completion penalties need an agreed separate overdue source. User approved implementing Order-only and documenting peer work; live integration remains blocked, Sprint [~].


Authoritative diagram (relative to the repository root): `../../../Sprint 1/S1 Class Diagram - Order Service + NTH 4.png`.

## Components relevant to sequences 7-11

- `OrderCommandInterface` exposes `confirmCompletion`, `cancelOpen`, `configureReposting`, and `requestManualRepost`.
- `OrderQueryInterface` exposes `getManualRepostDraft`.
- `LifecycleTrigger` exposes `processExpiry` and `processAutoRepost`.
- `OrderCommandFacade` delegates status and repost commands.
- `OrderTransitionService` performs completion, cancellation, and expiry transitions.
- Under CHANGE-072/ADR-020, `OrderAutoCompletionScheduler` triggers `LifecycleProcessingService.autoCompleteDue`; `OrderTransitionService` rechecks and performs the same completion transition/outbox flow after the delivered checkpoint reaches 48 hours.
- `OrderRepostService` configures plans, checks eligibility, and creates one repost.
- `OrderQueryService` produces the manual repost draft.
- `LifecycleProcessingService` finds due orders and runs expiry/auto-repost processing.
- `Order` is the aggregate root and owns status and two-way repost links.
- `RepostPlan` is owned by the original order and contains repost credit/timing configuration plus reposted state.

## Outbound ports

- `OrderRepository`: load/save orders and find due originals.
- `UserServicePort`: verify requester/actor identity and role context.
- `SupplierServicePort`: validate supplier pairs and resolve current details.
- `CreditServicePort`: reserve credits before an order/repost becomes `OPEN`; synchronously hold/reset the existing transaction before an unexpired accepted order transitions directly back to `OPEN`. Completion and cancellation/expiration consequences belong to typed event subscriptions in the updated overall design.
- Typed event publisher ports cover order completion (with `overdue` and `overdueAt` facts), shared OPEN-order refund, and accepted-order cancellation. CHANGE-052/053/054 establish layout, Order snapshots, and Google Cloud Pub/Sub; CHANGE-056 unifies completion delivery to both User and Credit; CHANGE-063/ADR-013 establishes an atomic transactional outbox with immediate after-commit dispatch and cron recovery; CHANGE-065/ADR-015 adds the Spring-scheduled OPEN expiry scan; CHANGE-071/ADR-019 makes expiry and requester cancellation use one `OpenOrderRefundTaskEvent`/topic, distinguished by resulting status; CHANGE-067/ADR-016 excludes checkpoint history from published snapshots while preserving internal overdue calculation. Peer consumers remain future work and are not verified in this Order-only milestone.

The updated overall design source changes Sequences 5-8. `CHANGE-051` records the comparison. CHANGE-065/ADR-015 documents that Sequence 6 combines requester-triggered OPEN cancellation and scheduler-triggered OPEN expiry with distinct events; Credit refunds for either. CHANGE-064/ADR-014 further specifies accepted-cancellation branches: unexpired cancellation waits for synchronous Credit hold then transitions `ACCEPTED -> OPEN`; expired cancellation transitions to `ABORTED` and publishes for Credit refund and User penalty. ADR-001 continues to prohibit `ABORTED -> OPEN`. Sequence 5 publishes one completion event with overdue facts for User and Credit; the overdue-only Sequence 8 event flow is superseded by CHANGE-056. CHANGE-055/ADR-010 require the assigned courier to cancel; requester-only ownership remains for open cancellation and completion.

Names represent approved logical responsibilities, not mandated Java packages or framework annotations. Concrete code structure must be proposed at the pre-coding gate after the project build is approved.
