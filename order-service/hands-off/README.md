# Order Service Sprint 1 Sequences 1â€“11 â€” Handoff to Yao Xiang

CHANGE-135 / ADR-045 (Yao Xiang, 2026-10-17) supersedes the earlier overdue
reader: persist deliveryDeadlineAt at courier START plus delivery duration and
deliveredAt at delivery. isOverdue is a nullable timestamp comparison, without
checkpoint queries or a flag-refresh scheduler. Actual delivery freezes lateness;
adminResolutionAt freezes undelivered admin cancellations. Unstarted/unknown
legacy/historical timing stays null. Completion uses those same persisted facts.
V10 adds these timing fields and admin decision/reason/amount/resolution time;
WAIVED and ADDITION_REQUESTED record intent, never subscriber APPLIED. Ordinary
holds still block completion and courier abort; explicit admin cancellation may
resolve held Orders. UI score feedback/callbacks remain deferred. Existing event
payloads/topics/authentication and sibling backends are unchanged. See CHANGE-135.


## Admin cancellation and overdue handoff — CHANGE-134

CHANGE-134 / ADR-044 (Yao Xiang2026-10-16): POST /api/orders/admin/{orderId}/cancel
accepts requesterId, nullable courierId and optional appliedPenalties. Admin-only;
all active/held states -> CANCELLED; locked stored participants, maximum one
addition, no successful reward; refund and optional penalty commit in outbox.
Common adds COURIER_UNRESPONSIVE=3. OrderResponse nullable isOverdue is calculated
from grouped checkpoint timings (actual delivery freezes result). Existing
roles/topics/schedulers unchanged; Report/User integration remains pending.

Report must call GET Order using existing admin/participant authorization;
isOverdue null means unknown. Do not derive lateness from expiresAt or time of
completion. Cancel retries use identical participants/reasons; conflicting
replays409. Success means intent commit; Credit/User effects are asynchronous.

## Current Admin Credit history handoff — CHANGE-133

Nine merge conflicts resolved retaining both branches. Live Admin user profiles
now load GET /api/credits/users/{userId}/transactions?page=1&size=20 through
useApi/gateway with the administrator's Firebase token; Credit verifies ADMIN.
Existing responsive history card/pagination reused; failures show retry while
profile remains visible. Base Compose still uses sample history. Balance005 is
still missing and remains Coming soon. Completed request006 removed from open
peer requests. No global Credit tab per user decision; no sibling backend edits.
Common/Order438 + Credit102 tests and coverage gates pass; frontend212 tests,
build/typecheck pass; lint0 errors/3 existing warnings. Authenticated deployed
browser verification and human review pending. No commit/push or deployment.

## Active involvement handoff - CHANGE-129 / ADR-042

Order provides shared-role GET /api/orders/users/{userId}/active-involvement
and /api/orders/suppliers/{supplierId}/active-involvement, returning the ID and
hasActiveOrders. Five active states/current relationships/held Orders count via
SQL EXISTS; no foreign lookup/name storage/deletion lock.420 backend/129 frontend
checks pass. Providers must call these checks and handle admission/pending races;
FEEDBACK-015 remains open. Current Order UI keeps its layout and shows Deleted
supplier on missing/null successful lookup, unavailable on failure. No User-name
rows exist here. Actual deletion/browser/container rollout unverified.
## Current penalty handoff - CHANGE-128 / ADR-041 (2026-10-14)

Order now queues explicit PenaltyScoreAdditionEvent (+2 abort/+1 overdue) or
PenaltyScoreDeductionEvent (1 successful), including manual/system completion.
Credit completion/refund events unchanged; new accepted-cancellation emission
replaced, legacy stored replay retained. Exact seven-field contract and consumer
requirements: FEEDBACK-014/AsyncAPI. Final403 backend tests and unchanged coverage
gates pass;3 bootstrap tests and both Compose configs pass. No new frontend edit,
peer backend or cloud execution. Before cloud CI/deploy, infrastructure owner
must provision new topics/IAM with configure-order-pubsub.sh for both environments.
User subscriber, ordering and legacy cutover remain incomplete; no full integration claim.

## Effective compact-event amendment — CHANGE-092 / ADR-031 (2026-10-09)

Yao Xiang approved the exact seven-field Order-only payload: eventId, eventType, orderId, orderStatus, creditAmount, occurredAt, courierId. This replaces full snapshots and overdue facts ONLY for OpenOrderRefundTaskEvent and OrderCompletionTaskEvent. AcceptedOrderCancellationTaskEvent retains its existing v1 envelope/snapshot. Internal outbox versions and Pub/Sub eventVersion attribute remain (compact schema v2); topic names and DB schema unchanged. Old pending snapshot rows normalize at dispatch from their saved facts, with stable IDs. Lifecycle/outbox scheduling, locks, synchronous Credit assignment/reset and ADR-025 abort behavior remain. Historical v1 descriptions below are superseded for these two bodies. Credit currently requires the old snapshot and overdue; FEEDBACK-009 is INCOMPLETE_OR_INCOMPATIBLE. User completion penalties need an agreed separate overdue source. User approved implementing Order-only and documenting peer work; live integration remains blocked, Sprint [~].


**Branch:** `sprint-1/seq-1-to-seq-11`
**Repository area:** `order-service/` plus the approved shared `frontend/` vertical slice
**Handoff owner:** Vincent
**Receiving developer:** Yao Xiang
**Sprint:** Sprint 1

This document is a working handoff, not a replacement for the requirements,
architecture diagrams, contracts, or the peer-service feedback record. Read the
authoritative files before changing code.

## Latest implementation handoff

CHANGE-077/ADR-022 adds the shared Requester quarter-hour time picker and sets
expiry to every 15 minutes. CHANGE-078/ADR-023 sets pending-event recovery to
hourly; auto-completion remains every minute and publication still runs
immediately after commit. Application/local/cloud settings are synchronized.
The retry poll may wait nearly an hour after a failure while the service is
running, and Cloud Run scale-to-zero may delay it further.

CHANGE-072/ADR-020 adds Sequence 5 auto-completion after 48 hours from the
`DELIVERED` checkpoint. A configurable Spring scheduler queries and locks only
eligible delivered orders, rechecks under lock, and uses the existing
`OrderCompletionTaskEvent` transactional outbox flow. Requester completion
remains available earlier. The focused Maven run is currently blocked before
tests by Java 21's `Cannot close compiler resources`; see the change and active
work records.

The user-approved CHANGE-071/ADR-019 update replaces separate OPEN cancellation
and expiration events with `OpenOrderRefundTaskEvent` on one shared topic.
Requester cancellation still results in `CANCELLED`; scheduled expiry still
results in `EXPIRED`. Credit consumes one event type and refunds both, using
the Order snapshot status to distinguish them. Pending legacy outbox rows are
translated by the dispatcher with their stable event IDs preserved.

The current accepted-cancellation update is documented in
[CHANGE-064](../changes/CHANGE-064-accepted-cancellation-reopen-or-event.md)
and [ADR-014](../docs/decisions/ADR-014-accepted-cancellation-hybrid-flow.md).
Before expiry, the assigned courier's cancellation waits for Credit to hold the
transaction before reopening the order; at/after expiry, it uses the
Credit-refund/User-penalty event. The older CHANGE-063 handoff below is historical
for this flow and is superseded.

Yao Xiang's 2026-10-03 transactional-outbox implementation summary for Vincent
is in [CHANGE-063-transactional-outbox-to-vincent.md](CHANGE-063-transactional-outbox-to-vincent.md).
It records the completion/cancellation event flow, implementation locations,
102-test verification result, and remaining Pub/Sub consumer and Cloud Run
recovery caveats. CHANGE-063/ADR-013 and the updated diagrams are authoritative.

The original OPEN expiry scheduler update is documented in
[CHANGE-065](../changes/CHANGE-065-scheduled-order-expiration-event.md) and
[ADR-015](../docs/decisions/ADR-015-scheduled-open-order-expiration-event.md).
CHANGE-071/ADR-019 later unified its refund contract with requester cancellation:
both use `OpenOrderRefundTaskEvent` on one topic, while preserving the distinct
`CANCELLED` and `EXPIRED` statuses. Both commit event intent through the outbox;
Credit consumes one event type and refunds/releases. The synchronous Credit
release call was removed.

## 1. Read these sources first

### Order Service workflow and state

1. `order-service/AGENTS.md`
2. `AGENTS.md` at repository root
3. `order-service/docs/ai-project-context.md`
4. `order-service/docs/ai-project-context.toml`
5. `order-service/docs/current-sprint.md`
6. `order-service/docs/project-d1-reference.md`
7. `order-service/docs/architecture-overall.md`
8. `order-service/docs/architecture-order-service.md`
9. `order-service/docs/architecture-evolution.md`
10. `order-service/docs/architecture-review-playbook.md`
11. `order-service/docs/service-contracts.md`
12. `order-service/docs/peer-service-api-feedback.md`
13. `order-service/docs/requirements-traceability.md`
14. `order-service/docs/change-log.md`
15. `order-service/docs/active-work/vincent.md`
16. `order-service/docs/active-work/yao-xiang.md`
17. Every applicable file in `order-service/docs/decisions/`

### Sprint 1 authority

- `order-service/sprints/sprint-1/scope.md`
- `order-service/sprints/sprint-1/requirements.md`
- `order-service/sprints/sprint-1/architecture-context.md`
- `order-service/sprints/sprint-1/contracts.md`
- `order-service/sprints/sprint-1/acceptance-tests.md`
- `order-service/sprints/sprint-1/class-diagrams/README.md`
- `order-service/sprints/sprint-1/sequence-diagrams/README.md`
- Referenced source pack: `Sprint 1/Order Service Sprint 1 Doc.pdf`

### Frontend authority

- `frontend/AGENTS.md`
- `order-service/docs/frontend-integration-workflow.md`
- `order-service/docs/frontend-ui-style-guide.md`
- `frontend/package.json`
- Current routes/components under `frontend/src/app/`,
  `frontend/src/components/orders/`, `frontend/src/hooks/`, and
  `frontend/src/lib/`

## 2. Current branch and ownership context

This is the user-approved combined implementation branch for all Sprint 1
sequences 1â€“11. It contains Yao Xiang's sequence 1â€“6 foundation and Vincent's
sequence 7â€“11 work in one branch. Do not reset or overwrite the other
developer's commits.

The repository workflow still records the historical allocation as Yao Xiang
owning sequences 1â€“6 and Vincent owning sequences 7â€“11. That allocation is
useful for provenance, but this handoff authorizes Yao Xiang to continue the
combined branch after coordinating changes and preserving existing work.

Boundaries remain important:

- Modify Order Service implementation, tests, records, and the approved shared
  frontend slice only.
- Do not modify `user-service/`, `supplier-service/`, `credit-service/`,
  `admin-service/`, or other peer-service source.
- Use `docs/peer-service-api-feedback.md` for missing or unsuitable peer APIs.
- Preserve peer-owned sections in shared Compose, gateway, CI, and environment
  files. Add only Order-specific blocks or comment incompatible peer lines with
  a restoration note.
- Keep small atomic commits with explicit paths and staged `git diff --check`.

## 3. What has already been implemented

### Backend foundation

- Spring Boot 4.1.1 / Java 21 Order Service.
- PostgreSQL persistence with Flyway migrations; Hibernate validates rather
  than silently creating schema.
- `Order` is the lifecycle aggregate root. It owns status, requester/courier
  references, supplier IDs, checkpoints, optimistic version, and two-way repost
  links.
- Command receipts provide command-ID idempotency.
- Repository row locking and expected-version checks protect transitions and
  acceptance races.
- Standard error envelopes, pagination envelopes, OpenAPI bearer metadata, and
  structured local audit logging were added.
- Order Service is configured for PostgreSQL/Cloud SQL and Cloud Run in the
  approved deployment direction; local verification uses PostgreSQL Docker.

### Peer adapter boundary

The application uses ports rather than embedding peer logic in the domain:

- `UserServicePort`: identity, requester role, courier role/eligibility.
- `SupplierServicePort`: supplier-pair validation and supplier lookup.
- `CreditServicePort`: synchronous reservation and hold-for-reopen boundaries. Completion/cancellation/expiry settlement and refunds are handled by Credit's event consumers.
- `OrderOutcomePublisher`: reserved for approved facts; repost event
  publication is deferred for Sprint 1.

`HttpPeerAdapters` forwards the Firebase bearer for real HTTP-peer calls. The
default local `MockPeerAdapters` is deterministic and in-memory; it is not a
production replacement for peer persistence.

### Frontend vertical slice

The shared Next.js frontend already includes:

- Post Request, Browse Errands, My Requests, and My Errands.
- Accept, start, pickup, deliver, complete, cancel, and repost controls.
- Creation-time automatic repost choice; later configuration of an `OPEN`
  order is rejected.
- Manual repost only for an eligible requester-owned `EXPIRED` order.
- Supplier dropdowns showing supplier names/buildings while submitting IDs.
- Order cards showing human-readable locations and hiding internal Order IDs and
  opaque supplier IDs.
- A unified dashboard with no client-side requester/courier mode switch.
- Firebase-authenticated calls through the gateway, including the hard-refresh
  token gate.
- Credit-balance invalidation after successful order creation, repost,
  cancellation, and completion.

## 4. Approved architecture and behavior decisions

Treat these as the effective decisions for this branch. If new evidence
requires a material change, record it in an architecture-evolution/change
record and obtain approval before changing behavior.

- Order persistence is PostgreSQL. Production direction is one Cloud SQL
  PostgreSQL instance with separate staging and production databases, exposed
  to Cloud Run through the approved public-IP Java Connector approach. Local
  development uses the PostgreSQL container in Compose.
- Credit reservation is synchronous: an order is not created as `OPEN` unless
  the Credit Service (or the explicitly documented local mock) accepts the
  reservation. Credit Service remains the owner of balances and ledger state.
- Completion, OPEN cancellation, expired accepted cancellation, and scheduled
  OPEN expiry publish outcome facts through the transactional outbox. Credit
  owns settlement/refund/release when it consumes those events. The
  accepted-cancellation hold before reopening remains synchronous and is tracked
  in `FEEDBACK-003`; peer consumers remain unverified under `FEEDBACK-002`.
- Repost event publication is deferred for Sprint 1. Do not introduce a
  broker merely to refresh the browser credit summary; the browser uses a
  post-mutation invalidation/refetch of the authoritative Credit endpoint.
- Automatic repost is selected during initial order creation. An `OPEN` order
  cannot be changed later into an automatic-repost plan. Manual repost is
  available only for an eligible requester-owned expired order.
- The frontend uses one unified dashboard. Client-side requester/courier mode
  switching was removed; backend identity and authorization remain
  authoritative.
- The UI follows the staging baseline: Geist Sans, a white/near-black
  monochrome palette, thin neutral borders, restrained shadows, rounded
  panels, Lucide icons, generous whitespace, and responsive layouts. Internal
  UUIDs, supplier IDs, command IDs, versions, and service URLs are hidden
  unless an operational error genuinely needs them.

## 5. Sequence-by-sequence handoff

Read the corresponding Sprint 1 sequence diagrams before modifying a flow.
The following is the current high-level implementation map.

### Sequence 1 â€” create an order

`OrderController` authenticates the request and passes a command to the
creation application service. The service verifies the requester through
`UserServicePort`, validates the pickup/delivery pair through
`SupplierServicePort`, validates the aggregate invariants, reserves credits
through `CreditServicePort`, then persists the `Order`, checkpoint, and command
receipt in PostgreSQL. The frontend sends the Firebase UID as the requester
identity and displays supplier names while retaining IDs internally.

Production gate: replace any mock peer call with the real peer contract and
capture authenticated, error, idempotency, and persistence evidence.

### Sequence 2 â€” view available/open errands

The query controller reads paginated open orders. Supplier references are
resolved through the approved Supplier lookup adapter and rendered as names or
locations. The requesterâ€™s own open orders are filtered from the courier-facing
available list. Order UUIDs remain internal to action links and are not shown
as user-facing labels.

Production gate: verify pagination, authentication, supplier lookup failure
fallbacks, loading/error states, and responsive rendering.

### Sequence 3 â€” accept an order

The command service verifies courier identity/eligibility with User Service,
locks the target row, checks `OPEN`, checks that the actor is not the
requester, checks the expected version, and asks the aggregate to assign the
courier. It persists the assignment, checkpoint, and command receipt.

Production gate: exercise two concurrent acceptors, stale versions, duplicate
command IDs, an unauthorized requester, and a successful courier acceptance.

### Sequences 4â€“6 â€” start, pick up, and deliver

The transition service verifies the assigned courier, expected version, and
current status before asking the aggregate to move `ACCEPTED -> IN_PROGRESS`,
`IN_PROGRESS -> PICKED_UP`, and `PICKED_UP -> DELIVERED`. Each transition
persists the new immutable aggregate state, checkpoint, and receipt.

Production gate: verify the assigned-courier rule, illegal status transitions,
stale versions, duplicate commands, and the authenticated UI action path.

### Sequence 7 â€” complete

The requester-authenticated completion path requires `DELIVERED`, then commits
`COMPLETED`, checkpoint, receipt, and `OrderCompletionTaskEvent` atomically.
After commit, the outbox attempts Pub/Sub delivery. Credit settles/transfers and
User applies overdue/on-time score policy when they consume the event; the Order
request does not wait for their responses. Consumer implementation remains
unverified under `FEEDBACK-002`.

### Sequence 8 â€” cancel

The requester-authenticated cancellation path requires an eligible `OPEN`
order, then commits `CANCELLED`, checkpoint, receipt, and
`OpenOrderRefundTaskEvent` atomically. Credit refunds/releases after
consuming the event; Order does not call Credit synchronously.

### Sequence 9 â€” expire

The configurable Spring `@Scheduled` job selects due `OPEN` orders whose
`courierId IS NULL`. One transaction persists each `EXPIRED` state, checkpoint,
and full-snapshot `OpenOrderRefundTaskEvent`; after commit, the existing outbox
dispatcher publishes it on the same topic used for requester cancellation.
Credit refunds/releases when it consumes the event.
The trusted internal lifecycle endpoint remains available as an on-demand
trigger of the same operation. Keep the explicit unassigned predicate; an
accepted order must never be expired by this query. Cloud Run's current
scale-to-zero/request-based CPU configuration does not guarantee this cron runs
while idle.

### Sequence 10 â€” automatic repost

Lifecycle processing selects an eligible expired order whose creation-time
repost plan is enabled and due, confirms no linked repost already exists,
validates the supplier pair, reserves the future repost credits, creates one
linked `OPEN` repost, and records the link/receipt. A failed validation or
reservation must not create the repost.

### Sequence 11 â€” manual repost

The requester first receives a draft for an eligible expired order. Draft
creation has no persistence, credit, or supplier side effects. On explicit
submit, the service re-verifies requester ownership/version, validates the
selected supplier pair, reserves credits, creates one linked `OPEN` repost,
and records the command. The UI should expose this only when the order is
expired and eligible; it must not be an edit path for an active order.

## 6. Current integration modes and reported status

### Real HTTP-peer smoke profile

Use the separate override when validating the real User, Supplier, and Credit
reservation calls:

```bash
docker compose -f compose.yaml -f compose.http-peers.yaml up -d --build --force-recreate
```

Vincent reports that sequences 1â€“6 were exercised against the real local HTTP
peers. Treat that as handoff evidence to reproduce, not as a new `[x]` claim
until the requests, logs, and test results are captured on this branch.

### Deterministic mock profile

Use the default stack for local testing of sequences 7â€“11 while Credit outcome
event consumers are missing:

```bash
docker compose up -d --build --force-recreate
```

The mock supports reservation, settlement test calls, and synchronous hold for
reopen. Refund/release event handling is owned by the future Credit consumers;
local event publication does not update mock Credit balances and is not evidence
that the real Credit ledger was updated.

### Honest branch status

- Sequences 1â€“6: implementation exists; Vincent reports successful real HTTP
  local testing, pending reproducible evidence and full completion-gate review.
- Sequences 7â€“11: implementation and local mock behavior exist; Credit/User
  outcome-event consumers and Credit hold-for-reopen integration are not verified.
- Overall Sprint 1 status remains `[~]`, not `[x]`, until peer contracts,
  automated tests, browser flows, Docker runtime evidence, and traceability
  are all complete.

## 7. Peer-service contracts and `FEEDBACK-002` / `FEEDBACK-003`

Read `order-service/docs/peer-service-api-feedback.md` before changing an
adapter. It records the implemented User/Supplier/Credit HTTP contracts,
future Credit/User event consumers (`FEEDBACK-002`), and the agreed Credit
hold-for-reopen contract (`FEEDBACK-003`), whose provider endpoint is missing.
Do not edit peer-service source or silently alter the agreed provider contract.

The synchronous outcome endpoint proposals formerly listed here are superseded
by the typed Pub/Sub events in FEEDBACK-002. Credit must consume
`OrderCompletionTaskEvent` (settle/transfer), `OpenOrderRefundTaskEvent`
(refund/release after requester cancellation or scheduled OPEN expiry), and
`AcceptedOrderCancellationTaskEvent` (refund/release after expired accepted
cancellation). Every consumer must deduplicate by `eventId`.
Only reservation and the hold/reset operation before an unexpired accepted
order reopens remain synchronous. The latter's final, bodyless endpoint contract
is recorded in FEEDBACK-003. Credit consumer implementation and live outcome processing remain
unverified; no Credit Service source is changed in this Order-only work. The
Credit hold-for-reopen API is missing; its contract is agreed, but Credit must
implement the endpoint and agree trusted service authentication/recovery before
the HTTP-peer integration can be treated as supported.

## 8. UI polishing direction

Polish the existing vertical slice without changing approved behavior:

- Hide order UUIDs, supplier IDs, command IDs, optimistic versions, raw peer
  URLs, and stack traces from normal cards and forms.
- Keep human-readable supplier/location names, status, expiry, credits, and
  actionable errors.
- Keep the creation-time automatic-repost choice visible only while creating;
  after creation show its state as read-only. Show the manual Repost action
  only for an eligible expired order.
- Reuse AppShell, existing semantic tokens, shadcn/Base UI primitives, and
  Lucide icons. Do not introduce a second visual system.
- Verify keyboard focus, labels, disabled/loading states, error recovery,
  empty states, and widths from 320px through desktop.

## 9. Test and verification plan

Run the deterministic checks from the repository root and record exact output.

### Backend

```bash
cd order-service
./mvnw -B -ntp clean verify
```

Keep the JaCoCo gate at the configured 80% line and branch thresholds. Cover
domain transitions, controller authorization and error envelopes, PostgreSQL/
Flyway persistence, peer adapter contracts, stale-version/concurrency races,
command idempotency, expiryâ€™s explicit `courierId IS NULL` selection, and
automatic/manual repost failure atomicity.

### Frontend

```bash
cd frontend
npm test -- --run
npm run typecheck
npm run lint
npm run build
```

Add RTL/Vitest coverage for auth readiness, creation-time repost choice,
supplier-name rendering, self-order filtering, completion/cancel/repost
actions, credit invalidation, and error/loading/empty states.

### UI and integration walkthrough

With a valid Firebase-emulator account, test every sequence in the browser:
create, list, accept, start, pickup, deliver, complete, cancel, expire,
automatic repost, and manual repost. Capture the relevant request/response,
status, and UI result. Test hard refreshes so protected calls wait for a bearer
token. Use the HTTP-peer profile for real User/Supplier/Credit reservation
checks and the default mock profile for the temporary Credit outcome flows.

### Runtime evidence

Record `docker compose ps`, service logs for failures, and any gateway/network
responses. Do not claim authenticated browser or Docker verification from
static source inspection alone.

## 10. Completion gate

Do not change sequence markers to `[x]` merely because classes or pages exist.
For each sequence, require the mapped requirement/diagram, passing relevant
automated tests, authenticated UI evidence, correct peer contract behavior,
error/idempotency/concurrency checks, and traceability/change-log updates.

Sequences 7-9 and dependent repost paths remain production-incomplete until
the required Credit/User event consumers and Credit hold-for-reopen API are
agreed, implemented by their owners, and verified end to end. A temporary
`[~]` status is acceptable only while `FEEDBACK-002` and `FEEDBACK-003`
remain tracked and the mock boundary is explicit.

## 11. Git discipline

Keep commits small and focused, for example: backend behavior/tests, frontend
behavior/tests, handoff/docs, and verification records. Stage explicit paths,
run `git diff --check` and `git diff --cached --check`, and inspect `git status`
before committing. Never stage the two existing untracked learning files
unless Vincent explicitly requests that policy change.

## 12. Developer and local workflow files

The workflow currently uses `docs/local/developer-profile.md` and
`docs/active-work/*.md` to rehydrate identity, ownership, blockers, and the
next action on every relevant turn. The same branch does not make those files
safe to delete: removing them would erase workflow state and make future AI
turns ambiguous. They are therefore retained in this handoff.

If the team wants shared-branch identity instead, make that a separate,
approved workflow change: define a replacement identity mechanism, update the
ignore/index policy, migrate active-work state, and have all developers agree
before untracking anything. No developer/local file was deleted or untracked
as part of this handoff.

## 13. Immediate next actions for Yao Xiang

1. Read the source-of-truth files in Section 1 and inspect the current branch;
   do not reset or recreate the existing foundation.
2. Reproduce the reported sequences 1â€“6 HTTP-peer smoke run and capture the
   exact Docker, gateway, peer, and UI evidence.
3. Run the backend and frontend commands in Section 9; fix regressions with
   tests first and preserve the 80% JaCoCo gate.
4. Coordinate with the Credit owner using `FEEDBACK-003` to implement the
   agreed hold-for-reopen endpoint and settle authentication/recovery; coordinate Credit/User event consumers through
   `FEEDBACK-002`. Keep the local mock until the real integrations are available
   and verified.
5. Polish the UI using Section 8, especially hiding technical identifiers and
   keeping repost controls creation-time/expired-only as specified.
6. Verify sequences 7â€“11 first with the deterministic mock, then repeat the
   relevant flows with real Credit once the peer API is live.
7. Update requirements traceability, active-work records, change records,
   change-log, and AI usage disclosure with exact results. Only then propose
   changing `[~]` to `[x]` for each independently verified sequence.

This handoff is complete when the receiving developer can reproduce the
current branch, identify every mock/real boundary, communicate the open Credit
contract, and continue toward production-level Sprint 1 verification without
changing peer-owned source.


## CHANGE-079 authorization handoff

Human command APIs now declare requester/courier/admin role annotations; shared reads accept any recognized role. Production role lookup defaults to real User Service via ORDER_USER_SERVICE_MODE=http, independently of the shared mock mode. Before deployment, ensure admin users have stored admin roles and USER_SERVICE_URL is valid. Local !prod anonymous/mock behavior and system scheduler paths remain. The adapter reuses verified JWT subject/roles and retains fresh courier eligibility and locked ownership guards. See ADR-024 and the shared authorization diagrams. Verification results are recorded in CHANGE-079.

CHANGE-093: lifecycle jobs select due IDs and process each through a separate NOWAIT-locking transaction. Catching occurs outside the worker/proxy, including commit failures; later orders continue. Outbox atomicity and minute lifecycle / 15-minute recovery settings remain. Verify real PostgreSQL skipped tests when Docker is available; see CHANGE-093 for evidence.

## CHANGE-094 handoff

Yao Xiang requested Order-only5-second polling, Abort errand wording and personal status filters. Reuse mine endpoint with optional status; DB content/count match including courier ABORTED history and requester repost visibility. Both pages default all and reset page 1; existing primitives/auth/clients reused.58 frontend and219 backend tests pass;24DBtests skip without Docker.8 isolated browser scenarios pass at 320-1920; normal frontend build blocked by Google Fonts. Run isolated PostgreSQL filters and real authenticated UI before integrated completion; no peer/retry/schema/event change.

## Shared penalty module handoff - CHANGE-130 / ADR-043
CourierPenaltyCase moved to foc-common/common.penalty; +2/+1/-1 unchanged. Run root wrapper -pl order-service -am verify. Root-context Order Docker/Compose/CI/staging bundles common; production promotes the same image. No auth/peer backend migration. User event consumer remains pending; no cloud publication/deployment.

CHANGE-131: shared D1 enum now has6 cases (2,1,1,4,4,10 positive amounts). New3 report misconduct reasons require admin confirmation; not emitted by existing Order flows. No schema/topic change. Future User/Report integration must implement highest effective penalty and theft permanent suspension; mapping alone does neither.

CHANGE-132: current common type PenaltySystemPolicy (old Java name CourierPenaltyCase removed). getSuccessfulDeliveryReward returns SUCCESSFUL_DELIVERY; getCourierPenaltyCases returns immutable3 report reasons excluding original3; getFullPenaltyPolicy immutableall6. Order imports migrated and completion/direction uses reward helper. No event wire/state/build/auth/peer change.
