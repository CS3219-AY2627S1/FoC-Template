# Order Service Work Allocation

## Vincent actual compensation integration - 2026-10-27

Vincent authorizes Order/Credit fixes to the agreed compensation workflow, then
approves gated Order transport, Google OIDC receiver and real local tests under
CHANGE-158/ADR-055. Narrow extension of the fixture/read-only boundary below;
no other peer, auto repost, deployment/IAM or unrelated reassignment.

## Vincent compensation fixture extension - 2026-10-26

Vincent confirms feature/vincent-credit-compensation from main and approves
CHANGE-156 / ADR-054: Order-owned compensation-first command journal/outbox/result
inbox and companion existing-pending-UI tests, against explicit contract fixtures.
Safe restoration of the previous assignment is required for ABORT. New live
compensation is disabled until Credit is verified; peer source/cloud read-only.
Existing Yao Xiang lifecycle/hold/penalty ownership and history are preserved.

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


CHANGE-134, Yao Xiang2026-10-16/current penalty-integration: user confirms
active/held admin cancellation, all addition cases/highest only, unresponsive3
and nullable overdue read. Order/common code/tests/docs and optional frontend
type only; no sibling backend, new UI control, cloud or root config change.


CHANGE-133, Yao Xiang/current penalty-integration branch2026-10-15: authorized
merge resolution and existing selected-user Admin history linking only. Credit
read/test verification; no sibling backend source changes or new global tab.

CHANGE-132, Yao Xiang/current branch2026-10-15: user authorizes shared policy
rename/lookup methods and Order adoption first. Common and Order tests/docs;
no sibling implementation, authentication, frontend or deployment changes.

CHANGE-131, Yao Xiang2026-10-15/current branch: user authorizes full D1 NTH
penalty mapping in foc-common plus affected tests/docs. No Report/User backend,
authentication, report-resolution producer or deployment change.

Yao Xiang approves CHANGE-130 / ADR-043 on the current penalty-integration branch,
2026-10-15: shared penalty-only Maven module, Order import/dependency changes and
necessary root build/Compose/CI/staging/convention updates. No auth extraction
or sibling backend implementation changes. Existing127/128/129 work retained.

Yao Xiang approves CHANGE-129 on order-service/penalty-integration,2026-10-14:
Order native active-involvement queries for all3 roles and companion supplier
missing-label correction, with no name storage/layout or sibling backend changes.
Existing127/128 edits remain uncommitted and are not reassigned or discarded.
Yao Xiang approves CHANGE-128 on order-service/penalty-integration,2026-10-14:
Order penalty enum/events/outbox and topic-only shared environment/bootstrap
updates. No sibling backend or cloud execution. Existing completion-hold work retained.

## Yao Xiang completion-hold integration - 2026-10-14

User explicitly identifies Yao Xiang on order-service/penalty-integration and
approves requester-owned placement, persistence, completion/funding guards and
requester UI. CHANGE-127 / ADR-040 record forwarded Firebase authorization and
active-Order coverage; release explicitly deferred. Peer implementations and shared
cloud provisioning are not authorized by this task.

## Yao Xiang Compose Admin selection - 2026-10-13

CHANGE-122 on order-service/admin-dashboard: user explicitly authorizes shared
Compose files and .env.example for Admin UI mock/live selection. Frontend runtime
config/hook/tests and Order docs only; no sibling backend or credential changes.

## Yao Xiang Admin environment refinement - 2026-10-13

CHANGE-119 continues order-service/admin-dashboard under explicit user approval:
shared Admin frontend adapter/UI/tests and Order-owned documentation only.
Matching actual Order/Supplier/role/summary calls outside local; no sibling
backend edits. Missing User/Credit APIs remain placeholders, not assumed ready.

## Yao Xiang Admin UI prototype extension - 2026-10-11

CHANGE-114 is the same user's 2026-10-12 map/layout continuation. Shared frontend
dependencies/map components and optional SupplierForm mode are approved by the
specific map request; normal supplier/backend owner behavior remains unchanged.

CHANGE-113 is the user's UI-only continuation: dedicated Order/Supplier pages
and upward action placement. Same developer/branch; no backend write expansion.

The same user explicitly authorizes CHANGE-112 presentation/navigation and
Order-owned mock history refinements. Existing Profile history presentation may
be shared while its current-user data loader/authorization remain unchanged.

Yao Xiang explicitly confirms order-service/admin-dashboard and requests the
complete mock Admin UI in CHANGE-111, including coordinated shared shell,
navigation and admin-mode provider changes. Only frontend and Order Service
implementation are authorized; peers remain read-only. Vincent's recovery and
other shared feature behavior must be preserved. No schema/cloud changes.

Vincent authorizes CHANGE-110 on2026-10-11: narrow shared command-hook polling
race fix/tests/records under his existing recovery allocation. No peer/backend,
API/schema/config changes; no ownership reassignment. Source386f58f verified.

Vincent authorizes CHANGE-109 on2026-10-11: one narrow shared profile frontend
compatibility repair afterc2fe90c, existing User/Firebase APIs only. No backend,
AuthProvider, Order recovery, schema or shared infrastructure change/reassignment.

Vincent approves CHANGE-108 / ADR-038 on 2026-10-11: owner-safe command display
projection and shared frontend discovery/card recovery, tests and records.
This extends his existing Order/frontend recovery slice only; peers read-only.

Vincent approves CHANGE-106 / ADR-037 on 2026-10-11: durable manual repost,
V8 original/candidate separation, backend/companion frontend/tests and records.
This supersedes manual-only deferral, not automatic/delegated credentials.
Peer source, cloud and shared deployment files remain read-only.

## Vincent live Credit recovery extension — 2026-10-11

Vincent explicitly authorizes CHANGE-104 / ADR-035 on sprint-2-3-credit-service-concurrency-update-event-payload: Order HTTP gateway, capability activation, bounded peer timeouts, actual Credit/PostgreSQL tests, frontend regression and handoff/configuration. Peer source stays read-only. This continues Vincent's ADR-033 slice; it neither reassigns Yao Xiang's work nor approves delegated credentials.

## Vincent scheduler orchestration extension - 2026-10-10

Vincent confirms `sprint-2-3-credit-service-concurrency-update-event-payload`
and approves CHANGE-102: one every-minute scheduler executes command recovery,
OPEN expiry, then 48-hour DELIVERED completion. Preserve transactions, row locks,
pending guards and the live HTTP recovery gate. Narrow Order-only extension;
no reassignment of peer/frontend implementation. CHANGE-101 documents JWT signing
locally in the existing excluded learning folder.

## Current Vincent implementation extension — 2026-10-10

Vincent explicitly approves CREATE/ACCEPT/CANCEL_ACCEPTED recovery across Order
and companion frontend on sprint-2-3-credit-service-concurrency, including the
shared foundation/schema/interface refinements in ADR-033. Stub-only milestone;
no peer edits, live recovery or repost recovery. Historical allocations remain.

## Current concurrency verification branch (2026-10-09)

Vincent additionally approves the fifth pair, courier acceptance versus requester
OPEN cancellation, in CHANGE-093: same isolated PostgreSQL harness and both
winner orderings. Order test-only scope and all peer/recovery boundaries retained.

Vincent explicitly authorizes Order-only real PostgreSQL race tests on
`sprint-2-3-credit-service-concurrency` (CHANGE-092): two acceptances,
cancellation/expiry, acceptance/expiry and manual/automatic completion.
Preserve existing lifecycle/deadline rules; peer calls are test doubles.
Cross-service recovery is deferred. No peer/source/schema/UI design changes.

## One-time approved Credit security exception (2026-10-09)

Vincent explicitly authorizes CHANGE-090 on sprint-2-3-credit: isolate Credit's
Pub/Sub push authentication converter and add its regression tests, plus an
interference handoff. This supersedes the documentation-only restriction solely
for those two Credit source/test paths. Annablee retains Credit ownership; no
business logic, contract, schema, other peer, cloud/IAM or blanket edit approval.

## Credit integration review branch (2026-10-09)

Vincent explicitly requests the Order-side feedback review on `sprint-2-3-credit`
(CHANGE-087), after integrating Credit in `09e04a0`. Scope: inspect peer source,
update Order dependency/context records, no Credit/User/Supplier source or cloud
changes. This does not approve a new architecture or reassign a peer's ownership.
Prior `sprint-2-3` implementation allocation below remains historical context.

## Current Sprint 2-3 workstream (2026-10-08)

Vincent (Developer 2) is assigned the Order-owned Sprint 2-3 work on `sprint-2-3`,
explicitly authorized by the user in CHANGE-081. Source: Project D1 and the local
`Order Service Overall Doc.pdf`. Scope includes the requested lifecycle/history,
repost and completion work; it does not authorize sibling-service implementation.
The one-current-Order plus immutable courier-attempt design, synchronous reset,
V3 migration and requester repost visibility are approved and implemented in
CHANGE-082 / ADR-025. Local test/coverage gates pass, but real providers/consumers,
browser and cloud gates remain; status is `[~]`, not Sprint completion.
The approved shared frontend slice touches only My Errands/My Requests and Order
helpers/tests; no auth/layout/peer feature edits. This allocation does not reassign Yao Xiang's historical work or
grant blanket ownership of shared frontend/configuration files.

## Historical Sprint 1 allocation

| Developer | Developer number | Assigned scope | Branch |
|---|---|---|---|
| Yao Xiang | Developer 1 | Order Service sequence diagrams/features 1-6 | `sprint-1/seq-1-to-6` |
| Vincent | Developer 2 | Order Service sequence diagrams/features 7-11 | `sprint-1/seq-7-to-11` |

## Collaboration rules

- Both developers follow the same Project D1, architecture, contracts, diagrams, specification-driven workflow, and TDD rules.
- Yao Xiang owns sequence diagrams/features 1-6.
- Vincent owns sequence diagrams/features 7-11.
- A developer must not modify the other developer's assigned implementation without agreement.
- Shared contract, architecture, requirement, domain-model, test-fixture, interface, or database changes must be discussed and recorded before implementation.
- Each developer must work on the correct Git branch.
- Each developer must update only their own active-work file.

## Shared frontend allocation

- `../frontend/` is a shared top-level Next.js application; no developer has blanket ownership of it.
- When an approved Order Service feature requires frontend work, feature ownership follows the sequence allocation above, but the developer must recheck frontend Git state and all relevant active-work records before editing.
- Shared API clients, authentication, permissions, layouts, navigation, runtime configuration, and design-system components require coordination and recorded agreement before modification.
- A developer must not alter another developer's frontend feature or overwrite unrelated frontend work without agreement.
- No frontend files are currently allocated or recorded as in progress by this Order Service workflow. Recheck this on every coding turn.

## Feature status values

- `[ ]` Not started.
- `[~]` In progress.
- `[!]` Blocked.
- `[x]` Completed and verified through the non-negotiable completion gate in `AGENTS.md`.

This file records shared team allocation only. The ignored `docs/local/developer-profile.md` identifies the current developer in a local workspace.

## Current Yao Xiang UI/query scope extension — 2026-10-09

The user explicitly assigns CHANGE-094 on order-service/sprint-1/yx-sprint-2-and-3: existing Order frontend My Requests/My Errands status filters, abort wording and Order-only five-second polling, with optional status support in the Order-owned personal query. Initial frontend diff is clean; preserve Vincent history/repost logic and all peer/auth/shared layout/client source. Only feature components/hooks are affected; no blanket shared ownership.

## Narrow scheduler reliability extension — 2026-10-10

Yao Xiang explicitly requests DB-selected and transactionally independent scheduled items on order-service/sprint-1/yx-sprint-2-and-3. CHANGE-096 covers Order lifecycle verification and active outbox selection/per-event transaction/error isolation only. No reassignment of Vincent/peer work, paused background repost retries, frontend or shared configuration.
