# CHANGE-052: Messaging publisher layout and updated sequence diagrams

- Date: 2026-10-02
- Developer: Yao Xiang
- Status: Publisher layout, names, and diagram routing requested; application implementation blocked on event contract and transport decisions
- Change type: Design proposal and developer-workflow update
- Related design source: `../../../Order Service Overall Doc - Updated.pdf`
- Related change: CHANGE-051

## User-approved scope from the current request

The developer explicitly requested an Order Service `messagingpublisher` package with `interfaces/` and `publisher/` subpackages; one interface and matching publisher per event; same-named publish methods; and updated sequence/class diagrams. The requested method names and consumers are:

| Updated sequence | Interface / implementation | Method | Consumers |
|---|---|---|---|
| 5: non-overdue completion | `IOrderCompletionPublisher` / `OrderCompletionPublisher` | `publishOrderCompletionTask` | Credit Service |
| 6: OPEN cancellation | `IOpenOrderCancellationPublisher` / `OpenOrderCancellationPublisher` | `publishOpenOrderCancellationTask` | Credit Service |
| 7: ACCEPTED cancellation | `IAcceptedOrderCancellationPublisher` / `AcceptedOrderCancellationPublisher` | `publishAcceptedOrderCancellationTask` | Credit Service and User Service |
| 8: overdue completion | `IOverdueOrderCompletionPublisher` / `OverdueOrderCompletionPublisher` | `publishOverdueOrderCompletionTask` | Credit Service and User Service |

The Java package path convention is lowercase: `sg.edu.nus.foc.order.messagingpublisher.interfaces` and `sg.edu.nus.foc.order.messagingpublisher.publisher`. Each method is diagrammed with a typed event parameter because it must carry event identity and facts. The user supplied method names, but did not specify parameter types or exact signatures.

Relevant traceability recorded in CHANGE-051: Project D1 F4.1.5-F4.1.11, F7, F10, F11, the F12 amendment, NTH2, and NTH4 where applicable. Sprint 1 requirements currently retain the earlier narrowed sequence scope and must be reconciled with the updated overall sequence numbering before implementation.

## Peer implementation inspection

- Credit Service `CreditController` currently exposes registration facts, balance, reservation, and reservation lookup HTTP operations. No event consumer or completion/cancellation outcome API was found. Its current HTTP API does not implement the requested subscriptions.
- User Service source contains identity/profile HTTP components and no event consumer or penalty-fact subscription was found.
- No peer service source was modified. Consumer contracts, service authentication, deduplication, acknowledgement, and failure semantics require agreement with the peer owners.

## Proposed class and sequence design

- One event-specific interface and one Spring-managed implementation per approved event, each with a matching named method.
- The transactional outbox remains the durable source; a proposed relay invokes the event publisher only after the Order state, checkpoint, and outbox row commit atomically.
- A shared broker fans events to independent subscriptions, as declared by the updated overall design. The concrete broker and producer client remain unresolved.
- Credit owns reservation settlement/release. User receives factual penalty-relevant fields and owns any penalty policy. Order does not assign a penalty.
- Subscribers process at least once, deduplicate by the agreed stable event identity, acknowledge after successful processing, retry independently, and use a dead-letter/recovery path for persistent failures. Exact policies and contracts remain unresolved.
- Sequence 7's same-order reopen requires the original deadline to remain in the future and synchronous Credit eligibility. Ordering relative to asynchronous event processing is not established and must be decided before implementation.
- Sequence 6's updated source also retains an OPEN expiry path; no separate expiry publisher is among the four requested pairs. The expiry consequence is unresolved in this proposal.

Detailed diagrams:

- `sprints/sprint-1/sequence-diagrams/updated-overall/sequence-5-complete-non-overdue.md`
- `sprints/sprint-1/sequence-diagrams/updated-overall/sequence-6-cancel-open-order.md`
- `sprints/sprint-1/sequence-diagrams/updated-overall/sequence-7-cancel-accepted-order.md`
- `sprints/sprint-1/sequence-diagrams/updated-overall/sequence-8-complete-overdue-order.md`
- `sprints/sprint-1/class-diagrams/updated-overall/publisher-class-diagram.md`

## Alternatives and trade-offs

- Synchronous Credit calls preserve immediate settlement/release results but block Order completion/cancellation on Credit availability and conflict with the updated overall design. They remain the existing implementation only.
- In-process Spring events simplify local wiring but cannot deliver to independent services or provide the required durable cross-service retries and dead-letter recovery.
- A durable broker with a transactional outbox matches the updated source and decouples Order outcomes from peer processing, but adds schema evolution, authentication, operations, deduplication, retry, monitoring, and database migration work. This is the documented direction; no broker technology is selected here.

## Decisions still required before application code

1. Confirm whether a common `IEventPublisher` should be a marker/base interface, and confirm the four event-specific interface names.
2. Approve the typed event payload fields, including `eventId`, `eventVersion`, `orderId`, `orderVersion`, actor IDs, `occurredAt`, and event-specific completion/cancellation facts.
3. Select or explicitly defer a concrete broker and define producer authentication, destinations, delivery/acknowledgement, retries, dead-letter recovery, monitoring, and schema compatibility.
4. Agree Credit and User consumer contracts and the same-order reopen ordering with their owners; update `FEEDBACK-001` / `FEEDBACK-002` after provider confirmation.
5. Define whether OPEN expiry emits one of these events or retains a separate approved handling path.
6. Approve the outbox data model/migration, relay concurrency/locking, cleanup, and recovery behavior.

No Java classes, event DTOs, broker dependency, outbox schema/migration, peer consumer, or tests were created in this change. The class/sequence diagrams are design artifacts and do not imply implementation approval for unresolved details.

## Verification

- Read the Order Service workflow, current branch/profile/sprint context, updated source reconciliation, architecture review playbook, peer feedback, and event registry.
- Inspected Credit and User source for existing matching consumers; neither currently provides the requested subscriptions.
- Inspected frontend structure/configuration and repository status; no frontend changes are part of this request.
- Markdown diagrams and package rules were synchronized. Mermaid was not rendered by a Mermaid renderer in this environment.
- Automated tests were not applicable because application source and test files were not changed.
