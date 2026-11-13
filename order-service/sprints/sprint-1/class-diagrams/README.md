# Sprint 1 Class Diagrams

- `updated-overall/admin-order-query-class-diagram.md` (CHANGE-057): admin controller, query service, repository port, persistence adapter, JPA repository, DTO mapper, and role-authority components.

Authoritative sources (relative to the repository root):

- Core FR subset: `../../../Sprint 1/S1 Class Diagram - Order Service.png`.
- Core FRs plus NTH4 extension: `../../../Sprint 1/S1 Class Diagram - Order Service + NTH 4.png`.

Use the NTH4 extension for the current initial slice. It adds `LifecycleTrigger`, `LifecycleProcessingService`, `OrderRepostService`, `RepostPlan`, manual repost query/commands, due-order repository lookup, and repost/status fact publication while preserving the core services and ports. CHANGE-072/ADR-020 also adds `OrderAutoCompletionScheduler` for due delivered Orders; it delegates through lifecycle processing to the existing completion transition and publisher/outbox flow.

The source images remain outside this service repository and are fingerprinted in `docs/project-d1-reference.md`. If their fingerprints change, reread and compare them before coding.

CHANGE-068/ADR-017 adds `CreditServicePort.assignCourier` to the acceptance path: `OrderAssignmentService` validates the locked aggregate, waits for the port response, and only then persists the acceptance checkpoint and Order. CHANGE-069/ADR-018 sends only Order ID and courier ID to Credit. `MockPeerAdapters` provides local behavior; `HttpPeerAdapters` targets the still-missing Credit route documented in FEEDBACK-004. This dependency is a user-approved stub, not a verified provider integration.

See [updated-overall/accept-order-credit-assignment-class-diagram.md](updated-overall/accept-order-credit-assignment-class-diagram.md) for the acceptance application service, minimal Credit request DTO, adapters, Order validation, and persistence boundaries introduced for CHANGE-068/069.

CHANGE-068/ADR-017 adds `CreditServicePort.assignCourier` to the acceptance path: `OrderAssignmentService` validates the locked aggregate, waits for the port response, and only then persists the acceptance checkpoint and Order. CHANGE-069/ADR-018 sends only Order ID and courier ID to Credit. `MockPeerAdapters` provides local behavior; `HttpPeerAdapters` targets the still-missing Credit route documented in FEEDBACK-004. This dependency is a user-approved stub, not a verified provider integration.

## Updated overall-design publisher classes

See [updated-overall/publisher-class-diagram.md](updated-overall/publisher-class-diagram.md) for the event-specific publisher interfaces, matching implementations, outbox repository/relay, and recovery scheduler. Sequence 5 uses one completion event with overdue facts for both consumers. Per CHANGE-067/ADR-016, event snapshots omit checkpoint history while retaining resulting Order/repost fields. CHANGE-053/054/056/063 define event metadata, Google Cloud Pub/Sub, atomic outbox persistence, after-commit dispatch, and at-least-once retry; CHANGE-073/ADR-021 defines the real-cloud dev/prod topic and credential setup.


## Central authorization — CHANGE-079 / ADR-024

See [updated-overall/order-authorization.md](updated-overall/order-authorization.md) for the production token/role annotation boundary and reuse of verified caller facts. This applies across the existing human API flows; locked Order ownership, state and scheduler/system paths remain.
