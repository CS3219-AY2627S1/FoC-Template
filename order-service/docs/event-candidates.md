# D1-Supported Event Candidate Registry

## EV-DEC-158 / ADR-055 - Gated actual compensation exchange

Vincent approves actual transport and local tests for the unchanged hybrid
contract, 2026-10-27. EV-7 remains stable. Compensation send/result receive are
opt-in/default off, separately Google-OIDC-authenticated, with durable outbox/
inboxes, exact matching and retained failures. Cloud activation stays separate.

## EV-DEC-156 / ADR-054 - Credit compensation fixture interaction

EV-7 remains the stable Credit-outcome candidate. Vincent approves the hybrid
compensation-first fixture milestone under CHANGE-156: initial synchronous
mutation, durable request/result boundary and frontend polling. No new live broker
channel is enabled; FEEDBACK-017 blocks provider activation. Compare alternatives
and delivery/security/operational costs in ADR-054 and the compensation handoff.
The four current deployed producer channels remain current; this fixture decision
does not renumber EV-1..EV-7 or treat a missing peer consumer as implemented.

## Effective retirement of accepted-cancellation publishing - CHANGE-155 / ADR-053 (2026-10-19)

User approved removing AcceptedOrderCancellationTaskEvent publishing AND legacy replay after inspecting staging: eight legacy rows were PUBLISHED, with no pending/failed rows shown. Preserve published history; this task does not modify any database or GCP resource. Production was not inspected: before rollout, verify no PENDING, IN_PROGRESS or FAILED legacy rows in each target database. Resolve any such rows explicitly before deployment; do not convert them into new score events or mark them PUBLISHED without broker confirmation.

Removed the legacy DTO, publisher/interface, factory/mapper methods, now-unused snapshot DTOs and dispatcher branch. The four current channels remain OpenOrderRefundTaskEvent, OrderCompletionTaskEvent, PenaltyScoreAdditionEvent and PenaltyScoreDeductionEvent. Courier abort still uses synchronous Credit hold/reopen and the existing final addition (plus refund when expired); no lifecycle, hold, penalty policy, idempotency or financial rules change. Historical database rows and immutable migrations remain intact. Other older refund/expiration normalization remains supported.

The retired topic setting is removed from Order config, deployment templates, local Compose/bootstrap, environment examples/staging/production settings, topic provisioning and CI topic checks. These scripts no longer require or create the old topic; they do not delete existing cloud topics or subscriptions. User Service consumes only the new scoring channels. Existing admin-provider authorization requests remain open. AsyncAPI1.3.0 describes four outgoing operations; earlier statements requiring accepted-cancellation replay/configuration are superseded by this amendment.

An unexpected non-published legacy row after deployment is unsupported and follows the existing bounded failure/recovery path, never automatic financial conversion. This is why the pre-deployment backlog check is required. Live User penalty processing, production backlog and cloud deletion are not verified here.

Effective CHANGE-128 / ADR-041: explicit penalty addition/deduction replace new
accepted-cancellation publications, and carry completion penalty decisions
separately from Credit. +2 abort/+1 overdue/-1 successful; seven fields and stable
outbox payload/ID. Legacy abort snapshot replay retained. Numeric mapping is
Order-owned, score mutation User-owned; subscriber pending. Historical candidate
discussions below do not supersede this approved amendment.

## Effective compact-event amendment — CHANGE-092 / ADR-031 (2026-10-09)

Yao Xiang approved the exact seven-field Order-only payload: eventId, eventType, orderId, orderStatus, creditAmount, occurredAt, courierId. This replaces full snapshots and overdue facts ONLY for OpenOrderRefundTaskEvent and OrderCompletionTaskEvent. AcceptedOrderCancellationTaskEvent retains its existing v1 envelope/snapshot. Internal outbox versions and Pub/Sub eventVersion attribute remain (compact schema v2); topic names and DB schema unchanged. Old pending snapshot rows normalize at dispatch from their saved facts, with stable IDs. Lifecycle/outbox scheduling, locks, synchronous Credit assignment/reset and ADR-025 abort behavior remain. Historical v1 descriptions below are superseded for these two bodies. Credit currently requires the old snapshot and overdue; FEEDBACK-009 is INCOMPLETE_OR_INCOMPATIBLE. User completion penalties need an agreed separate overdue source. User approved implementing Order-only and documenting peer work; live integration remains blocked, Sprint [~].


This registry preserves D1-supported communication candidates and approved decisions for architecture review. Proposed rows remain proposals; approved rows reflect explicit user decisions and their linked ADR/change records.

## Updated overall design source

The current effective Order contract includes one `OrderCompletionTaskEvent` for every completion with overdue facts, `OpenOrderRefundTaskEvent` for requester cancellation or scheduled expiry of an OPEN order, and `AcceptedOrderCancellationTaskEvent`. Event snapshots contain the resulting Order/repost fields but omit checkpoint history; completion overdue facts are computed internally. Updated overall Sequence 6 uses distinct triggers and resulting statuses (`CANCELLED` or `EXPIRED`) but one event type and topic for the Credit refund. CHANGE-056 records completion unification; CHANGE-063/ADR-013 records atomic state/outbox commit and after-commit dispatch plus recovery cron; CHANGE-064/ADR-014 records the accepted-cancellation split; CHANGE-065/ADR-015 records the original scheduled expiry design, superseded for event type by CHANGE-071/ADR-019; CHANGE-067/ADR-016 records the checkpoint-free event schema. Delivery is at least once and consumers deduplicate by stable event ID. Subscriber actions are documented in FEEDBACK-002.

## Status and ID rules

- `PROPOSED` means the interaction must be analysed and explicitly approved before implementation.
- `APPROVED_SYNCHRONOUS_BOUNDARY` means the communication style is already constrained to synchronous request-response; it does not approve an event.
- Candidate IDs `EV-1` through `EV-7` are stable references and must not be renumbered.
- Architecture decision IDs use the separate `EV-DEC-NNN` namespace.
- Peer-API mismatch decisions use `API-DEC-NNN`; missing/unsuitable dependency feedback uses `FEEDBACK-NNN` in `docs/peer-service-api-feedback.md`.
- Never infer a blank decision. A candidate remains unapproved until an explicit decision is recorded in an ADR or equivalent approved decision record.

## Candidate catalogue

| Candidate ID | D1 source | Possible interaction/event | Consumer | Status | Notes |
|---|---|---|---|---|---|
| EV-1 | F1.4, F1.4.1 | `OrderCreated` | Requester notification component | PROPOSED | Compare synchronous notification with an internal or durable event. |
| EV-2 | NTH2 | `PenaltyRelevantOrderOutcome` | User Service | PROPOSED | Preferred event-driven candidate because penalty evaluation must not block a committed Order outcome; payload carries facts, never a penalty decision. |
| EV-3 | NTH1 | `OrderStatusChanged` or `OrderOutcomeRecorded` | Admin Service | APPROVED_QUERY_FOR_ADMIN_ORDER_LIST | CHANGE-057/ADR-012 approve synchronous paginated Order Service reads for all orders and optional status. This decision does not approve an event or Admin Service implementation. |
| EV-4 | NTH3 | `OrderIncidentReported` | Admin Service | PROPOSED | Requires explicit communication and failure-semantics approval. |
| EV-5 | F4.1.6, F4.1.8, F4.1.10, F4.1.11, F10.1 | Lifecycle trigger | Order Service lifecycle processing | APPROVED_SPRING_SCHEDULED | Spring scheduler handles due OPEN expiry and (CHANGE-072/ADR-020) auto-completes DELIVERED orders at 48 hours. Database cutoff queries and row locks; normal completion event/outbox reused. Cloud Run scale-to-zero limitation remains. |
| EV-6 | NTH4 | `OrderExpiryReached` or `RepostEligible` | Order Service reposting logic | PROPOSED | A broker is not assumed; automatic and manual reposting remain idempotent Order-owned behavior. |
| EV-7 | F7.1, F10.1.4, F11.1.2, F11.2.3 | Credit-related outcome | Credit Service | APPROVED_ORDER_EVENT; ORDER_PRODUCER_IMPLEMENTED | Typed completion and cancellation events plus one shared OPEN-refund event use Pub/Sub and transactional outbox. CHANGE-053/054/063/065/071; peer consumers/live delivery remain unverified. |

`OrderOpened` or real-time courier notification is not currently an approved D1 requirement. Treat it as unsupported unless a specific D1 requirement or later approved amendment establishes the need.

## Required comparison

For each applicable candidate, follow `docs/architecture-review-playbook.md` and compare:

1. Synchronous request-response.
2. Query-based refresh or polling.
3. Internal in-process domain event.
4. Durable broker-based event.

Analyse coupling, response time, consistency, reliability, duplicates, ordering, retry/dead-letter recovery, idempotency, schema versioning, debugging/testing complexity, infrastructure/operations, security/privacy, whether the interaction blocks the operation, and whether D1 requires it.

## Decision worksheet

Do not fill the Decision column without explicit user approval.

| Decision ID | Candidate | Interaction | Initial position | Alternatives | Decision |
|---|---|---|---|---|---|
| EV-DEC-001 | EV-1 | `OrderCreated` requester notification | Awaiting analysis and approval | Synchronous / internal event / durable event | |
| EV-DEC-002 | EV-2 | Penalty-relevant facts to User Service | Non-blocking event candidate | Synchronous / internal event / durable event | |
| EV-DEC-003 | EV-3 | Admin monitoring facts | User-approved synchronous query for paginated order listing | Query/polling / synchronous / event | APPROVED: `GET /api/orders`, paged and optionally filtered by status, admin-only; CHANGE-057/ADR-012, user, 2026-10-02. No dashboard or event implementation. |
| EV-DEC-004 | EV-4 | Incident report to Admin Service | Awaiting analysis and approval | Synchronous / event | |
| EV-DEC-005 | EV-5 | OPEN order expiry trigger | User-approved Spring `@Scheduled` cron scans due unassigned OPEN orders; state/checkpoint/shared refund event intent commit atomically and outbox dispatches after commit | External scheduler / on-demand lifecycle endpoint / Spring scheduler | APPROVED: Spring scheduler and configurable cron remain. CHANGE-071/ADR-019 supersedes the separate expiration event; scheduled expiry emits `OpenOrderRefundTaskEvent` on the shared OPEN-refund topic, 2026-10-06. |
| EV-DEC-006 | EV-6 | Expiry/reposting trigger | Internal mechanism preferred for analysis; broker not assumed | Timer/direct invocation / polling / internal event / broker | |
| EV-DEC-007 | EV-7 | Credit-related outcomes | User-approved typed events with transactional outbox | Typed task publishers / synchronous / hybrid | CHANGE-053/054/063/065/071; Pub/Sub and post-commit outbox dispatch selected; requester cancellation and scheduled OPEN expiry share `OpenOrderRefundTaskEvent` and topic |
| API-DEC-001 | N/A | Applicable peer-service API mismatch | Awaiting mismatch discovery | Order-side adapter / provider API change / reject | |

Allowed user responses include approve synchronous communication, approve an internal event, approve a durable broker event, approve query/polling, approve a hybrid, reject, request more analysis, or request a peer-service API change.

## Recording an approved event decision

Use the existing ADR system. Create `docs/decisions/event-driven-decisions.md` only if no suitable record exists. Use the stable decision ID, not the candidate ID, as the decision record identifier.

```markdown
## Event Decision: EV-DEC-001

- Candidate ID:
- Feature:
- Event or interaction:
- D1 reference:
- Producer:
- Consumers:
- Sprint or milestone:
- Status: PROPOSED
- Chosen communication style:
- Approved by:
- Date:
- Related diagrams:
- Related contracts:

### Problem being solved
### Why this is required by D1
### Alternatives considered
### Trade-offs
### Approved decision
### Event payload
### Delivery guarantee
### Ordering requirements
### Idempotency strategy
### Retry and failure handling
### Dead-letter or recovery behavior
### Security and privacy considerations
### Required documentation updates
### Required test updates
```

Do not implement a decision whose status is `PROPOSED`. If a durable broker is approved, explicitly decide transactional publication/outbox needs, event versioning, idempotent consumers, retries, dead-letter recovery, monitoring, schema compatibility, security/privacy, and contract tests before implementation.

### EV-DEC-008 — Existing outcome streams, compact bodies

Approved by Yao Xiang 2026-10-09, CHANGE-092/ADR-031. Existing completion/refund durable broker decisions retained; no new interaction/candidate ID. Synchronous completion/refund would couple Order finalization to consumers; polling would need an outcome API; in-process-only events cannot durably reach peer services. Continue existing outbox + after-commit internal signal + Pub/Sub at-least-once delivery. Body minimization reduces disclosure/coupling but removes User overdue facts and breaks current Credit parsing; blocked integration FEEDBACK-009 until coordinated migration. Other retry/authentication decisions remain paused as documented.
