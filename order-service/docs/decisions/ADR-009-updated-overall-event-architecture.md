# ADR-009: Updated overall event architecture source

> Current Pub/Sub project/topic/authentication configuration is recorded in CHANGE-073/ADR-021; older topic-placeholder and local-emulator notes below are historical.

- Status: Partially superseded by CHANGE-056/ADR-011 and CHANGE-063/ADR-013; Pub/Sub and event contracts remain effective; live broker delivery pending
- Date: 2026-10-02
- Owner: Order Service

CHANGE-071/ADR-019 supersedes the separate OPEN-cancellation event reference in this historical record: requester cancellation and scheduled expiry now use one `OpenOrderRefundTaskEvent` on a shared topic. Accepted-order cancellation and completion contracts are unchanged.
- Related change: CHANGE-051
- Source: `../../../Order Service Overall Doc - Updated.pdf`

## Decision

The updated overall design source informed Order Service Sequences 5-8. CHANGE-053 historically selected publish-before-status behavior. CHANGE-063/ADR-013 supersedes that ordering for completion and cancellation with a transactional outbox and post-commit dispatch. CHANGE-056/ADR-011 supersedes the original completion-event split. Pub/Sub and event contracts remain effective. Credit reservation before `OPEN` remains synchronous. CHANGE-064/ADR-014 now requires synchronous Credit hold/reset before an unexpired accepted cancellation transitions directly `ACCEPTED -> OPEN`; expired cancellation publishes the refund/penalty event. `ABORTED -> OPEN` remains prohibited.

The original four declared event types were:

- `OpenOrderCancellationTaskEvent` to Credit.
- `AcceptedOrderCancellationTaskEvent` to Credit and User.
- `OrderCompletionTaskEvent` to Credit.
- `OverdueOrderCompletionTaskEvent` to Credit and User.

CHANGE-056 replaces the last two completion routes with one `OrderCompletionTaskEvent` published for every completion to Credit and User. Its `overdue` and `overdueAt` fields let consumers select the applicable policy.

Events carry `eventId`, `eventVersion`, `orderId`, `orderVersion`, actor IDs, `occurredAt`, event-specific facts, and the complete Order snapshot requested by the user. Topic values are placeholders to be filled in each publisher. Peer consumers are future work and are assumed for the Order-side publisher scope; no peer code is changed.

## Scope of this decision

The user has approved the Order-side publisher names, full Order event payload, topic placeholders, and the assumption that peer consumers will be implemented later. CHANGE-054 selects Google Cloud Pub/Sub for the Order producer. CHANGE-063 replaces publish-before-status with atomic PostgreSQL persistence of Order state and outbox intent. No peer-service source is authorized for modification. Pub/Sub delivery is at least once; a crash after broker acceptance can result in a duplicate.

The effective snapshot is refined by CHANGE-067/ADR-016: it omits checkpoint history while retaining the current Order/repost fields and event-specific facts. Completion overdue facts continue to be derived internally from checkpoints.

## Superseded assumptions

CHANGE-032's synchronous completion/cancellation Credit boundary and the previous Sprint 1 wording that deferred same-order accepted reopening remain preserved as historical records. They no longer describe the current overall design, but they continue to describe the current unmodified implementation until the implementation gate is passed.

## Affected artifacts

`docs/project-d1-reference.md`, `docs/ai-project-context.md`, `docs/ai-project-context.toml`, `docs/architecture-order-service.md`, `docs/architecture-overall.md`, `docs/service-contracts.md`, `docs/event-candidates.md`, `docs/requirements-traceability.md`, Sprint 1 architecture/contract/sequence records, `docs/peer-service-api-feedback.md`, and `changes/CHANGE-051-overall-design-update-comparison.md`.
