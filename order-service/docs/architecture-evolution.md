

## Effective retirement of accepted-cancellation publishing - CHANGE-155 / ADR-053 (2026-10-19)

User approved removing AcceptedOrderCancellationTaskEvent publishing AND legacy replay after inspecting staging: eight legacy rows were PUBLISHED, with no pending/failed rows shown. Preserve published history; this task does not modify any database or GCP resource. Production was not inspected: before rollout, verify no PENDING, IN_PROGRESS or FAILED legacy rows in each target database. Resolve any such rows explicitly before deployment; do not convert them into new score events or mark them PUBLISHED without broker confirmation.

Removed the legacy DTO, publisher/interface, factory/mapper methods, now-unused snapshot DTOs and dispatcher branch. The four current channels remain OpenOrderRefundTaskEvent, OrderCompletionTaskEvent, PenaltyScoreAdditionEvent and PenaltyScoreDeductionEvent. Courier abort still uses synchronous Credit hold/reopen and the existing final addition (plus refund when expired); no lifecycle, hold, penalty policy, idempotency or financial rules change. Historical database rows and immutable migrations remain intact. Other older refund/expiration normalization remains supported.

The retired topic setting is removed from Order config, deployment templates, local Compose/bootstrap, environment examples/staging/production settings, topic provisioning and CI topic checks. These scripts no longer require or create the old topic; they do not delete existing cloud topics or subscriptions. User Service consumes only the new scoring channels. Existing admin-provider authorization requests remain open. AsyncAPI1.3.0 describes four outgoing operations; earlier statements requiring accepted-cancellation replay/configuration are superseded by this amendment.

An unexpected non-published legacy row after deployment is unsupported and follows the existing bounded failure/recovery path, never automatic financial conversion. This is why the pre-deployment backlog check is required. Live User penalty processing, production backlog and cloud deletion are not verified here.


## Effective delivered-report review amendment — CHANGE-141 / ADR-048 (2026-10-18)

Approved Yao Xiang: new requester reports require own DELIVERED order; one damage/wrong-location category. Reports have AWAITING_COURIER_RESPONSE, READY_FOR_REVIEW and one RESOLVED final status. Courier response window is eight hours; server owns deadlines. Report Service is MISSING: the Report UI is a local-only isolated demo; HTTP-peer/staging/production show Coming soon and never fetch sample reports. Existing real Order financial actions remain separate from resolving a report.

Order stores deliveryOverdue at actual delivery, comparing deliveredAt against stored START plus duration deadline. isOverdue remains null before delivery or if historical timing is unknown; no runtime status refresh or new overdue scheduler. Admin waiver only before completion on DELIVERED late orders preserves the true lateness and saves actor/time/reason. Normal waived-late completion funds the courier but emits neither overdue addition nor successful-delivery reward. Explicit admin-selected penalties remain separate.

AdminOrderController adds PUT /api/orders/admin/{orderId}/completion-holds/{reportId}/release (no body) and POST /api/orders/admin/{orderId}/overdue-waiver ({reason}). Both verify admin role, use the verified principal, NOWAIT locked Order and the pending-command guard; all local writes are transactional. Release retains its report binding/audit and any other active holds. It may follow admin cancellation/completion and emits no funding event. Report Service must durably retry its release intent using forwarded admin Firebase authorization; no browser-only live orchestration exists. See FEEDBACK-015. V12 backfills only known delivery facts and adds waiver/release audit fields and an active-hold index; V1–V11 remain immutable.

Frontend uses existing theme/components, compact toolbar, darker selected rows and no redundant selection count. Normal/admin Reports poll every five seconds while visible; sample ownership, deadline and evidence checks are server-side in the gated prototype, which has no production identity authority or financial effects.

# Order Service Architecture Evolution

## CHANGE-158 / ADR-055 - Gated actual compensation transport

Vincent explicitly approves the real publisher, separate Google OIDC result
receiver, strictly local emulator gate and actual integration tests, 2026-10-27.
This extends the fixture milestone without changing message schemas or deployed
settings/default retry. Credit application integration is locally verified:
Order/common596 and Credit126 tests/gates pass, real compensation11/legacy16.
Cloud IAM/OIDC/subscription/direct-call review remains gated. No new financial
rules, schema or automatic repost approval.

## CHANGE-156 / ADR-054 - Compensation-first contract-fixture milestone

Architecture change approved by Vincent2026-10-26 for an opt-in fixture policy:
hybrid initial HTTP effect and durable compensation/result exchange, rather than
replaying forward after uncertainty. SUCCESS means the final local commit, not
function return. A command-locked compensation decision revokes older ownership;
only a validated Credit result closes FULLY_COMPENSATED. Safe ABORT restoration
is required from Credit; current provider cannot supply it. Live remains disabled.

Design refinement: compensation before Order creation cannot satisfy V2's outbox
Order FK. V15 adds a distinct command FK/reference check and preserves the Order
FK for every existing lifecycle event. It does not create phantom Orders or
remove financial relationship checks. Earlier migrations/history stay intact.
See ADR-054, CHANGE-156 and FEEDBACK-017 for design/data/class/sequence/test chain.

## Compact calendar toolbar — CHANGE-139

CHANGE-139, user-directed2026-10-17: Admin Orders toolbar is a compact41px desktop table-top row, with existing RefreshCwIcon-only refresh and two native calendar-icon date fields (DD/MM/YYYY to DD/MM/YYYY), no visible Created-from label. Wrap on mobile; keep existing Order-ID/status search and financial dialogs/navigation. Creation-date bounds are local calendar days converted to explicit instants (start inclusive, day after end exclusive). Refresh retains filters and clears stale selection. Additive admin list filters execute in SQL before sorting/count/pagination; samples filter only isolated fixtures. No schema/financial/event/peer/config change. See changes/CHANGE-139-compact-admin-toolbar-date-filter.md.


## Current admin resolution UI — CHANGE-138

CHANGE-138 / ADR-047 (Yao Xiang,2026-10-17): Admin Orders now support single-row selection, shaded state, a top Cancel/Complete action bar and shared full-detail actions. The dialog requires an explicit penalty/no-penalty choice and a preset/custom explanation. Backend policy discovery supplies amounts; only the highest addition is selected. Optional resolutionReason is normalized, persisted atomically in V11 and bound into new receipts; absent/null preserves legacy fingerprints. OrderResponse exposes saved admin decision/time/explanation. Existing auth, active-state/held override, participant locks, credit/penalty events and ordinary hold guards remain. Mock mode mutates sample memory only; live mode calls existing protected endpoints without fallback. No sibling backend, root config or cloud change.


## CHANGE-137 / ADR-046: Admin completion resolution

CHANGE-137 / ADR-046, approved Yao Xiang2026-10-17: AdminOrderController adds
POST /api/orders/admin/{orderId}/complete. Assigned ACCEPTED/IN_PROGRESS/PICKED_UP/
DELIVERED may become COMPLETED, including held Orders. Stored participant IDs must
match. Publish existing Credit completion event plus at most one highest selected
penalty addition; null/empty means WAIVED, no automatic overdue penalty or reward.
Locked atomic decision/checkpoint/receipt/outbox and bound ADMIN_COMPLETE replay;
hold history and actual timing preserved, no fabricated delivery. Ordinary hold
guards remain. Reuses V10 columns/topics; no migration, UI, peer or cloud change.
HTTP200 confirms local intents, not Credit settlement or User score application.

AdminOrderCompletionService owns the transaction; Order.completeByAdmin validates
assigned active state/participants and records the admin decision via the same
private invariants as admin cancellation. Generic AdminOrderExceptionHandler
replaces cancellation-only naming and keeps old cancellation409 text. Explicit
penalty selection suppresses both normal scoring paths. See diagrams/admin-order-completion.mmd.


## CHANGE-135 / ADR-045: Persisted START deadline and resolution decision

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

The earlier CHANGE-134 grouped reader is removed. V10 upgrades V9 additively;
no applied migration/event is rewritten. SQL selects due unheld DELIVERED IDs
using stored timestamps, then each job rechecks under its own locked transaction.


## CHANGE-134 / ADR-044: Admin resolution and overdue read

CHANGE-134 / ADR-044 (Yao Xiang2026-10-16): POST /api/orders/admin/{orderId}/cancel
accepts requesterId, nullable courierId and optional appliedPenalties. Admin-only;
all active/held states -> CANCELLED; locked stored participants, maximum one
addition, no successful reward; refund and optional penalty commit in outbox.
Common adds COURIER_UNRESPONSIVE=3. OrderResponse nullable isOverdue is calculated
from grouped checkpoint timings (actual delivery freezes result). Existing
roles/topics/schedulers unchanged; Report/User integration remains pending.

No database table/column or topic changes. New controller/request DTO, dedicated
transaction service, existing domain cancellation guard and receipt/outbox;
read-only timing projection/repository/query and batched MapStruct enrichment.
No frontend mutation controls or peer implementation selected.


## CHANGE-133: existing Admin provider integration,2026-10-15

Approved existing-profile-only Credit history integration follows ADR-039.
AdminApi live adapter selects Credit selected-user history via gateway/useApi;
existing profile loader remains independent. No new service, table, state/event
contract, global tab or authorization bypass. Nine conflicts retain both branches.


## CHANGE-132 shared policy API refinement

User-approved 2026-10-15 rename to PenaltySystemPolicy and static reward/report
subset/full policy lookups. Common retains selection/data; Order adopts the
new Java type and uses reward lookup in completion/event direction. Lists are
immutable, report subset excludes the original3 exactly. Same six wire names,
amounts, event IDs and state logic. ADR-043 amended; no new peer integration,
database/HTTP/event schema or deployment decision.


## CHANGE-131 D1 penalty mapping completeness

User-approved policy-data extension of ADR-041/043, 2026-10-15. Add wrong location4,
mishandling/damage4 and deliberate retention/theft10 from D1 NTH2 PDF38-39 to the
existing shared enum. Values/reasons for automatic Order flows stay unchanged;
no new event producer, JSON/schema, API, state or service integration. Full D1
highest-effective-penalty and suspension enforcement remain future User/Report
logic, including permanent suspension for theft. No invented scores needed.

## CHANGE-130 / ADR-043 shared penalty Maven policy

Approved architecture/build refinement by Yao Xiang2026-10-15. Move the ADR-041
enum to a plain shared JAR; root reactor/Order Docker/CI compile the same source.
Alternatives: separate Git repository or published artifact add operations;
copied enums drift. User selects ordinary monorepo module. Existing policy and
wire/state/schema/security/UI are unchanged. No sibling migration or cloud action.

## CHANGE-129 / ADR-042 shared involvement and missing reference labels

Approved2026-10-14 by Yao Xiang: change initial admin-only idea to shared-role
boolean reads. Native EXISTS checks active current relationships, including
report-held Orders; terminal/history excluded. No query fetch-all or row locking.
Future peer callbacks still missing; snapshot race and pending obligations
explicitly excluded from deletion authorization. Preserve ID-only Order data.
Existing supplier lookup completes empty/null/omitted results with Deleted
supplier, keeping unavailable labels for failures and preserving card layout.
## CHANGE-128 / ADR-041 explicit courier penalty decisions

User approved2026-10-14: +2 accepted cancellation, +1 overdue delivery, -1
successful delivery; explicit seven-field add/deduct events. Replace new
accepted-cancellation publication and retain stored legacy replay/Credit events.
Outbox rows commit with lifecycle state/receipt and dispatch after commit.
Stable identity also binds recipient/reason to distinguish abort and completion.
User approves topic-only shared configuration; no sibling backend/cloud writes.
Single typed mapper input replaces several nullable inputs; coverage gate unchanged.

## CHANGE-127 / ADR-040 requester report holds

Approved 2026-10-14 by Yao Xiang: requester Firebase/role/owner authorization,
active Orders, atomic per-report placement and boolean; no status or event
change. SQL due filters and locked rechecks preserve independent lifecycle
transactions. Funding guards precede Credit/outbox effects; UI explains holds.
Deterministic tests expose/fix assigned-ID JPA merge rebinding across different
Order locks with insert-only SQL, and stale-version messaging with owner then
hold-before-version. Additive V9; release/Report integration deferred.
## Compose-selected Admin providers - CHANGE-122

Explicit user-approved material refinement: environment alone cannot distinguish
local sample UI from local HTTP integration UI. Add request-time public provider
mode, pin base mock/override live, retain cloud live-only guard and disable demo
controllers in HTTP override. Reuse119 adapter/capabilities and existing backend
security. No peer API or data-model/schema change; browser-safe configuration
adds one enum field. ADR-039 reflects the effective selection predicate.

## Environment-selected Admin providers - CHANGE-119

Explicit user-approved refinement to ADR-039: retain local emulator mock
prototype and enable only matching real APIs outside local. Runtime adapter
selection/capabilities centralize unfinished-feature gates; User/Credit absence
is explicit rather than errors or synthetic data. Preserve layout, local backend
conditions, backend authorization and existing contracts. Actual User summary
supports UID navigation; private full profile/directory and User actions/Credit
cross-user queries remain blocked. No backend/schema/infra change.

## Corrected presentation interpretation - CHANGE-116

User clarifies an internal field swap rather than resized cards. Supersede only
115's full-width/three-column/description-span choice; restore ordinary card/grid
sizes with description last and requester-first ordering. Remove unused shared
grid options. No model/sequence/provider/API change; preserve all supplier edits.

## Admin layout clarification - CHANGE-115

User-approved implementation detail in ADR-039: use fixed field order and optional
grid spans for metadata/credit/description and requester/courier rows; remove only
list map and move supplier status out of actions. Existing components/sequences/
data models/providers/contracts unchanged. Remove only the obsolete supplier-list
map dependency from ADR-039's class diagram; no diagram redesign required.

## Admin maps and detail grouping - CHANGE-114

User-approved material UI/integration refinement within ADR-039. Introduces
client-only Leaflet maps and an anonymous public address-provider adapter;
service operations remain mocked through the gateway. Maps/address state share
numeric coordinates and existing SupplierInput. Normal SupplierForm remains
without maps unless opted in. Group Order facts without dropping unknown fields;
related names navigate, IDs copy separately. No persistence/peer/auth/event change.
Public provider limits/manual fallback and external-vs-mock boundary documented.

## Dedicated Admin detail navigation - CHANGE-113

Approved follow-up within ADR-039: replace Order/Supplier detail modals with
dedicated routes and move existing User/Supplier actions upward. Classification:
presentation/routing refinement; use existing exact-ID mock queries, not new
provider APIs. Preserve read-only Orders and all confirmation/error guards.
No data model, security, event, backend or infrastructure behavior change.

## Approved Admin design refinement - CHANGE-112

2026-10-11, Yao Xiang explicitly requests full user profiles/history, direct
related-record navigation, consistent supplier status and aligned controls.
Classification: material presentation/component refinement within ADR-039's
approved local mock scope. Share only the transaction presenter: sharing its
normal current-user loader would show the admin's history instead of the
selected user's. Selected records load independently of list page membership.
Mock transaction DTO/page and missing ADMIN-API-006 are documented; no schema,
real peer, auth or infrastructure change. Diagrams updated in ADR-039.

## User-approved mock milestone - CHANGE-111 / ADR-039

2026-10-11, Yao Xiang confirms order-service/admin-dashboard and authorizes shared
admin navigation and Order-owned sample APIs. This supersedes the previous
no-dashboard boundary only for the local prototype. Other services and real
integration stay read-only/pending. No migration or event decision changes.
Implementation refinement: local Compose uses prod security, so profile alone
is unsuitable. The flag/local-environment/Firebase-emulator gate preserves auth
and excludes cloud. ADR-039/CHANGE-111 preserve the rejected profile-only option.

## Implementation detail - CHANGE-110 command submission polling

Vincent explicitly authorizes the fix on2026-10-11. Browser intent persistence
precedes POST, but previously enabled an immediate status GET before server
registration. Existing submitting state pauses individual polling; active-ref
guard protects stale callbacks. After POST settles, terminal outcomes clear
normally; pending/uncertain responses resume existing five-second polling and
same frozen-key recovery. No new endpoint, status, role, peer, data model or
architecture boundary; ADR-033/035/037/038 stay effective. Fixed delays and
pretending404 means PENDING were not selected. Eight RED tests then GREEN;
source/test386f58f, final124 frontend tests/typecheck/build pass. Live rollout/
browser/strict gates remain[~].

## Implementation detail - CHANGE-109 profile merge compatibility

2026-10-11, Vincent authorizes narrow frontend repair afterc2fe90c. New edit page
depended on reverted profile context. Adapt to current identity-only AuthProvider
with account-keyed page-local loading and existing authenticated User GET/PUT/me.
Verified Firebase email is saved with email-only PUT after fresh token; report
success only after matching saved response. Existing Edit navigation restored;
stale reads/account continuations guarded. No new contract, ownership, roles,
Order sequence/model or ADR. Do not restore older main wholesale. Source d7f72a8;
116 tests/typecheck/build pass, lint0errors; live/browser/mobile/strict gates[~].

## ARCH-EVO-044 — Pending commands attached to live cards (CHANGE-108)

APPROVED by Vincent 2026-10-11, "Yes I agree proceed"; ADR-038 supersedes local-only
card restoration. Historical proposal: ADR-033/035/037 local intent plus separate
server-discovery panel. Vincent requests recovered accept/abort on proper cards,
creation/repost as detail summaries. Actual command response lacks pending fields;
normal GET cannot always authorize a pending courier after deadline. Recommend an
owner-only safe display projection and shared discovery binding; no general read
permission relaxation or Credit contract change. Detailed additive response/access
approval received. Alternatives/tests/scope: changes/CHANGE-108-pending-order-card-recovery-proposal.md.
Implemented source9f2e054/942b790,373 backend/103 frontend tests pass. Conditional
browser cleanup before terminal refresh protects newer actions; history never
mounts live command hook. Browser/rollout/strict gates[~]. Order/frontend only,
no Credit/general read/schema changes. Verification: CHANGE-108.

## ARCH-EVO-043 — Retire unused expiry HTTP trigger (CHANGE-107)

2026-10-11, Vincent explicitly approves removal from controller/docs/Swagger.
Classification: API-contract retirement, not expiry/financial behavior change.
Supersedes only ADR-036's optional local expiry HTTP trigger; retain history and
all repost routes. Direct minute recovery -> expiry -> completion remains.
Options: keep an unused local operator shortcut, or remove it and rely on the
existing scheduler (selected). No frontend/runtime script caller was found;
loss is only that optional shortcut. Tests/docs/contract synchronization and
verification are CHANGE-107. Status APPROVED, implemented; 40 focused tests pass,
OpenAPI/routing removal verified. Deployed runtime/overall Sprint not verified.

ARCH-EVO-042: Vincent explicitly approves ADR-037 / CHANGE-106 on 2026-10-11.
Architecture/persistence/API extension: REPOST guards original and reserves a
stable distinct candidate. Atomic link/result, original failure persistence,
initial30min/frozen expiry, pending UI and existing compensation apply. Options
and diagrams are ADR-037. Source2c021b6;367 backend/90 frontend automated tests
pass; consuming rollout blocked by Docker engine500, human/strict gates pending.
Automatic/delegation remains deferred.

## ARCH-EVO-041 — Local emulator/review hardening (CHANGE-105 / ADR-036)

Vincent approves on 2026-10-11: local-only emulator transport plus narrow Credit
push-auth exception; cloud Order min1/always-CPU; durable legacy mutation routing;
bounded asynchronous outbox and retained FAILED/redrive. Classification:
approved architecture/security/persistence refinement; not a financial policy
change. Alternatives/trade-offs and exact approvals are ADR-036.
V6 retains failed events; V7 binds receipt replay. Existing wire schemas, minimal
Credit bodies, ownership, command leases and deadlines remain. Old local
ADC/tunnel configuration is superseded, not deleted from historical decisions.
Automatic repost/delegated credentials and User penalty consumers remain deferred.
Source/test/migration/deployment evidence and remaining gates: CHANGE-105.

## ARCH-EVO-040 — Actual HTTP Credit command integration (CHANGE-104)

Vincent explicitly approves ADR-035 on 2026-10-11. Classification: architecture
refinement within ADR-033's command protocol. Credit 497a8f9 supplies the former
missing provider operations; HttpCreditCommandGateway replaces the HTTP hard
gate. Minimal bodies, leases, unresolved guards, deadlines and authorization
ownership remain. Historical lookup precedes replay; missing compensation
binding first replays the same immutable action, then compensates/fences it.
No 404-only inference or fresh retry key. Selected over retaining the mock gate;
no peer rewrite, stored token or service credentials. Network timeouts bound
calls; tokenless HTTP recovery asks for user Continue. Evidence and full gate
limits: CHANGE-104. Existing schemas and Pub/Sub contracts remain unchanged.

## CHANGE-103: Existing Pub/Sub represented in AsyncAPI

2026-10-10, Vincent explicitly requests AsyncAPI documentation. Classification:
implementation/documentation detail, not a new architecture or wire-contract
decision. ADR-013/021/025/026/031/034 remain authoritative. Document three current
send operations and actual schemas; preserve historical descriptions, existing
feedback/live gates and Sprint `[~]`. No new broker, consumer, transport, runtime
schema registry, REST operation or persistence change. Validation proves document
structure/source parity only; no new ADR or event-candidate decision is implied.

## ARCH-EVO-039: Recovery-first merged minute orchestration

Vincent approves ADR-034 / CHANGE-102 on 2026-10-10 on the confirmed
`sprint-2-3-credit-service-concurrency-update-event-payload` branch. Approved
design refinement: replace ADR-033's independent recovery timer with the shared
minute job, sequential recovery -> expiry -> 48-hour completion. Preserve
independent phase/item failures, transactions, locks, pending guards, leases and
HTTP hard gate. Outbox/automatic repost/peer/data/UI/deployment unchanged.
Original ADR-026/033 history retained. Implemented in `10fd76d`; 28 focused and
301 full backend tests pass, no skips; 95.60% line / 81.95% branch coverage.
Real PostgreSQL / stub Credit only; workflow-format/live gates remain open.

## ARCH-EVO-038: Approved durable foreground Credit-command stub slice

Vincent approves ADR-033 / CHANGE-100 on 2026-10-10: durable two-state command/
lease recovery for CREATE, ACCEPT and CANCEL_ACCEPTED, account-scoped frontend
intents and pending/auth-only Continue UI. This supersedes proposal 034 ONLY for
the approved stub milestone. Real Credit replay/result/fencing/reversal are
missing; live HTTP recovery is hard disabled. No peer edits, stored tokens,
delegated credentials, new broker or repost recovery. Scoped effective-context
loading is approved; preserve history and all testing/approval gates.
Design chain: ADR-033 -> concurrency/concurrency-order-credit.md -> command
classes/API/store + V5 -> recovery tests/frontend tests -> CHANGE-100 evidence.
Order/frontend stub implementation is locally tested (CHANGE-100); live provider
integration and browser/operational gates remain blocked/open, not Sprint completion.
Owner-only result reads reuse validated identity/role facts without treating a
past task as new courier eligibility; actual mutation execution still verifies it.

## ARCH-EVO-034: Proposed cross-service creation crash recovery

- Status: PROPOSED, not approved or implemented. Vincent requested analysis and
  learning documentation on 2026-10-10; that request is not implementation approval.
  Classification: architecture refinement requiring approval before implementation.
- Existing design: synchronous Credit reservation precedes local OPEN persistence.
  Order's local transaction/row lock cannot roll back Credit's separate transaction.
  Current creation generates its candidate in memory, and the reserve adapter
  ignores the success body. A remote commit plus local crash can orphan a hold.
- Proposed design: commit a durable Order-owned operation intent before the remote
  write; bind caller, command, immutable request and one candidate business ID;
  reconcile/replay the same candidate; confirm matching RESERVED state; atomically
  commit OPEN, checkpoint, receipt and operation success. Recover failed local
  commits by continuing forward, or durably compensate if creation is no longer
  valid. A lost local commit acknowledgment requires a local state read too.
- Unknown outcome is not rejection: timeouts and generic server errors can occur
  after Credit commits. An earlier ambiguous attempt is not disproved by a later
  rejection, nor by GET 404 while a write remains in flight. Terminal replay 200
  is not an active hold. Stop permanent unchanged retries; retain unresolved work.
- Alternatives: plain synchronous HTTP/in-memory retries leave the crash gap;
  durable HTTP orchestration is recommended; a broker command/outbox protocol is
  another option but adds contracts/infrastructure; a local transaction alone
  cannot provide distributed atomicity. No new broker or transport is selected.
- Approval gates: operation schema and migration, command ownership/hash checks,
  worker claim/lease and fencing, authoritative reservation interpretation,
  compensation and late-write prevention, retry/deadline/escalation policies,
  UI/API pending behavior, deployment scheduling and fault-injection tests.
  FEEDBACK-006 covers provider recovery/compensation agreement; FEEDBACK-005
  covers delegated authorization. ALL background retry implementation stays paused.
- Scope: creation/reservation proposal, not implementation of assignment/reset
  recovery. Existing approved lifecycle, contracts, diagrams, schemas and ADRs
  remain effective. No new endpoint/topic/status or peer change is approved.
- Evidence: inspected actual OrderCreationService, HttpPeerAdapters and Credit
  PUT/GET, replay and transactional error paths. No live recovery test performed.
  Local excluded learning: learning/cross-service-state-change-crash-recovery.md.
  This shared register preserves proposal status independently of that local file.

### 2026-10-10 proposed command-key protocol follow-up

- Vincent requests rationality review, not implementation approval: frontend
  generates/retains one commandId per intent, Order persists immutable intent and
  business IDs, Credit recognizes a scoped operation identity, Order/peer each
  commit their own effects with the appropriate durable result, unresolved work
  is recovered with safe whole-handler replay. Extra explicit phases are optional.
- PROPOSED extension for review includes all three active financial HTTP writes
  (reservation, assignment, reset) and their UI callers. It does not silently
  expand the approved scope or change ADR-018's current minimal peer payloads.
- Current frontend generates a fresh UUID per payload build; Order does not send
  that command key in these Credit calls. Credit deduplicates reservation by
  business order ID and assignment/reset by current state, not a historical command
  identity/result. Coordinated API/auth/replay amendments require peer approval.
- PENDING/RETRYABLE/COMPLETED is one candidate representation, not selected schema.
  COMPLETED includes resolved SUCCESS/REJECTED; PENDING with retry metadata is an
  alternative. Minute scan cannot claim actively leased foreground jobs; expired
  ambiguous financial work needs reconciliation/compensation, not abandonment.
- Same key requires immutable args/actor/operation binding; completed results are
  persisted with local effects. Browser clears only its active key on authoritative
  terminal result; servers retain deduplication evidence. Unknown responses and
  subsequent auth errors must not cause a new financial identity. Exact client
  persistence, response/query DTOs, peer key transport/retention, concurrency and
  fault-injection tests remain approval gates; 003/005/006 remain open. No new
  broker/event/topic, source, migration or worker is approved or implemented.

### Proposed implementation plan: three foreground Credit commands

Status: PROPOSED for Vincent's review, 2026-10-10. The request asks for a plan
FIRST; it does not approve application/test/schema changes, peer changes or
resumption of ADR-027's paused background work. Classification: architecture/
contract/data/security change requiring detailed approval and peer agreement.
This expands proposal 034 for review only, not the effective approved architecture.

#### Scope and current evidence

- Proposed slice: user-initiated CREATE/reservation, ACCEPT/courier assignment,
  CANCEL_ACCEPTED/abort reset. Reposts use the reservation port too: coordinate its
  signature safely, but automatic/manual repost recovery is not silently included.
- Actual provider routes: PUT reservation (requesterId/amount, 201/200 JSON),
  PUT courier-assignment (courierId, exact 200 empty), POST hold-for-reopen
  (no body, exact 200 empty). Firebase caller/self/role requirements remain.
- Actual Order reserves before local OPEN; acceptance/abort lock the Order row
  before Credit and commit receipts afterward. CREATE has no current Order row
  to lock. CommandReceipt deduplicates operation/command but lacks actor/input
  binding and a durable pre-I/O recovery record; reserve discards success JSON.
- Actual frontend builds a new UUID per request build, obtains tokens through
  useApi and supports visible 15-second reads. No durable client action identity
  or command-status/recovery endpoint exists in inspected implementation.
- Requirement references to finish tracing: creation F1/F2; acceptance F3/F4.1.1;
  concurrency F13; accepted abort F11.2 and ADR-025; NFR3 tests/coverage and NFR4
  logging. Full original text/source-chain review remains a pre-coding gate;
  no new D1 acceptance wording or completed feature marker is asserted here.

#### Proposed command record and responsibilities

- Keep two lifecycle states PENDING and COMPLETED, with final SUCCESS/REJECTED.
  Separate metadata describes retry/auth/reconciliation reasons, not OrderStatus.
- Candidate Order-owned record: commandId, actorId, operation, immutable canonical
  input/hash, target/candidate business ID, original version/validated timing,
  status/outcome, saved safe result, attemptCount, nextRetryAt, worker owner,
  leaseExpiresAt, monotonically increasing claim generation, safe reason/error
  and audit timestamps. No bearer/refresh tokens or credentials in the record.
- Candidate classes: command application coordinator, command repository/JPA
  adapter, recovery scheduler, operation-specific executors, named status/resume
  DTOs and mapper; reuse User/Supplier/Credit ports, lifecycle domain methods,
  receipt/history/outbox rules. Names are proposals, not source files created.
- A new next-numbered Flyway migration after current V4 must be coordinated and
  tested clean/upgrade. Do not edit V1-V4 or invent a schema by ORM auto-update.
  Historical receipts need a reviewed compatibility path, not fabricated inputs.

#### Proposed execution sequence and locking

1. Browser persists one UUID and frozen request per logical action before POST,
   scoped to the authenticated account. Same action retry retains both; a new
   action uses a new key. Candidate storage is IndexedDB; approval required.
2. Order authenticates/authorizes first, validates key/operation/actor/input binding
   and atomically commits PENDING plus initial worker lease before remote I/O.
   CREATE persists its single candidate business ID. Existing completed command
   returns its authorized saved result; valid active claim returns pending status.
3. All foreground/resume/scheduler entry points share one DB claim implementation.
   Eligibility is PENDING, nextRetryAt <= DB time, and no valid lease. Atomic
   conditional UPDATE or locked batch claim increments generation and commits;
   FOR UPDATE SKIP LOCKED is suitable only for recovery queue selection.
4. Different commands for an existing Order use its row lock AND a durable
   unresolved-command guard. Once an unsafe call is issued, a competing start,
   accept, abort, cancel or expiry must not invalidate it unnoticed after a crash.
   Guard persists until reconciliation, not merely until worker lease expiry.
   All affected transition/lifecycle entry points must honor it. Lock ordering,
   takeover, lease renewal, generation checks and peer late-write fencing require
   PostgreSQL tests; a Java synchronized method is not sufficient across replicas.
5. Credit receives a proposed Idempotency-Key header using commandId; current
   bodies remain minimal. Credit authenticates every replay, binds actor/operation/
   target/input, serializes duplicates and atomically commits financial effect
   plus historical key/result. Exact header/result/query/retention is peer-owned
   and UNAPPROVED. Mere current-state replay or a lease cannot fence late writes.
6. Confirm success including matching ACTIVE reservation semantics; atomically
   commit Order state/history/receipt/existing outbox and command success under
   the current claim generation. Preserve existing post-commit Pub/Sub dispatch.
7. Definitive no-effect rejection commits terminal rejection only after rollback.
   Timeout/ambiguous error rolls back business writes and separately commits
   retry metadata conditional on ownership/generation; failure to write that
   metadata leaves the initial durable PENDING intact. A crash cannot report its
   own crash; another worker detects the expired lease and recorded uncertainty.
8. Recovery reconciles original input/key and current state. A lost local COMMIT
   reply is resolved by reading the local result first. Remote success after
   expiry/conflicting state cannot simply become rejection: use agreed recovery/
   compensation or retain PENDING with reconciliation-needed and operator alert.
   No synthetic OPEN/ACCEPTED or erased financial uncertainty is approved.

#### Proposed authorization, UI and API contracts

- No stored user tokens, role bypass, unauthenticated retry or new service identity.
  Existing useApi requests use current Firebase authorization. Expired token can
  be refreshed while the user session is valid; otherwise ask for sign-in.
- Without delegated credentials, recovered jobs cannot autonomously call peers
  after logout/crash. Minute scheduler may identify stale/due work and expose
  authorization-needed; user explicitly resumes with a fresh token. This limitation
  must be approved as the interim milestone; fully unattended finance stays blocked.
- Candidate inbound GET /api/orders/commands/{commandId} plus paginated owned
  pending-command discovery and POST .../{commandId}/resume. Authenticated owner
  only, resume has no replacement payload and uses the saved command. Paths/DTOs
  require approval; no endpoints are added by this record. Unknown command GET404
  does not authorize generating a new key after a timed-out in-flight submission.
- Pending response candidate: HTTP 202, commandId, PENDING, attemptCount,
  reason, nextRetryAt, safe message and optional orderId. Terminal responses
  preserve successful business codes and store/replay safe rejection envelopes.
  Commands never expose raw provider traces, token, payload hash or worker internals.
- Frontend keeps keys after timeout, 202, uncertain 5xx or auth interruption;
  backend result is authoritative. Same-key Retry/Check-status stays available;
  disable new conflicting actions/input changes while unresolved. Terminal result
  clears browser active intent only, never server deduplication evidence.
- Reuse visible 15-second polling for owned command status/list and existing order/
  balance refresh. Recover on reload/login through browser key or owned server
  discovery, so CREATE without a saved Order card remains visible as an operation.
- Honest messages: scheduled retry time and last attempt; processing attempt N;
  outcome unknown/checking; sign in or Continue to authorize recovery; definite
  rejection; reconciliation needed. Never claim crash knowledge on network timeout,
  automatic retry while auth is unavailable, or completion from Credit alone.
  Existing neutral components, USER Requester/Courier roles, responsive web and
  hidden business IDs remain; no ADMIN mutation permission or mode switch added.

#### Proposed delivery order and acceptance tests

1. Obtain design/provider agreement, finish full workflow/source drift review and
   exact FR/NFR mapping; record ADR/change/contracts/class+sequence/data diagrams.
2. TDD durable intent/input binding/result replay and safe next migration.
3. TDD claim/generation/per-order guard, replay-safe three executors and mapped
   peer results; implement only provider-verified agreed contracts.
4. TDD authorized status/resume/discovery, client key persistence, pending/retry/
   auth UI and polling; implement coordinated shared frontend/auth changes only.
5. TDD recovery scanning, bounded batches/backoff/lease renewal and escalation.
   Keep minute scan separate from lifecycle and 15-minute outcome-outbox recovery.
6. Inject failures before/after each intent, peer and local commit/response;
   race UI/UI, UI/scheduler, two schedulers, lease takeover/stale worker, different
   keys/order, expiry/cancel versus pending acceptance and start versus abort.
   Verify one financial effect, one local outcome/history/outbox intent, immutable
   payload conflict, account isolation, timeout+401 recovery and reload/key loss.
7. Run Java21 Maven verify, real isolated PostgreSQL migration/concurrency tests,
   actual Credit contract/integration tests, Vitest/RTL/lint/typecheck/build,
   authenticated browser tests and live runtime checks. Preserve >=80% lines and
   branches; code existence or mocked success cannot close Sprint [~].
- Observability: correlated command/operation/actor/business IDs, attempt/lease
  generation and safe classification; pending-age/auth/reconciliation metrics
  and alerts. No sensitive input/tokens in logs; retry budget escalation retains
  unresolved money records. Exact backoff, timeouts, lease duration and retention
  are configurable and must be agreed, not hardcoded examples selected silently.

#### Alternatives, operational limits and approval questions

- Recommended: durable synchronous HTTP fast path + exceptional recovery/status
  polling; keeps current result dependency, adds DB/contract/worker complexity.
  Plain browser retries/in-process events lose crash records. A broker command
  flow adds coupling/versioning/IAM/consumer operations and still needs idempotency;
  no new broker is proposed. Query-only recovery can observe but cannot safely
  resolve an in-flight write without peer identity/fencing semantics. Existing
  EV-7 outcome events/outbox and EV-5 lifecycle remain unchanged.
- Lease expiry alone does NOT prove old worker/HTTP request stopped; Credit must
  deduplicate overlapping same-command calls and prevent stale attempts affecting
  newer commands. Safety guarantee is one logical effect, not one physical call.
- Cloud Run idle/scale-to-zero may delay an in-process minute scan. Guaranteed
  background timing requires a separate approved deployment/cost decision.
- Await approval of new schema/API/UI storage and claim/guard behavior; peer's
  historical key/result/stale-write/compensation contract; explicit user-assisted
  auth resume interim milestone; and expired-success policy. Retain existing
  deadlines until an approved alternative; blocked compensation cannot be faked.
- Rechecked relevant source and primary D1/Overall hashes match. Broad historical
  mandatory rehydration remains incomplete/truncated, so this is a bounded proposal,
  not a completed pre-coding gate. No source/test/schema/cloud change or commit.

## ARCH-EVO-033: New repost minimum and actual-field errors (CHANGE-091)

- Classification: user-approved specification refinement; Vincent, 2026-10-09,
  ADR-030. Supersedes ADR-028 only for newly configured plan timing.
- Original: explicit automatic expiry merely > due; manual backend merely future;
  creation HTTP 400 replaced with all-rule UI message.
- Approved: new automatic expiry >= due+30min, due>=original expiry; new manual
  expiry >= submission+30min. Saved explicit plans keep original instructions,
  without migration/disable/extension. Late automatic execution needs future
  saved expiry only. Actual-field-only details reuse the approved API envelope.
- Class refinement: Order owns creation/manual checks; RepostPlan constructor
  validates NEW plan input, not JPA hydration. Creation validates local data after
  requester verification but before Supplier/Credit. Repost service retains the
  separate automatic path and eligible-failure rollback/outcome behavior.
- Alternatives: silently normalize/disable legacy plans rejected by Vincent;
  browser-only timing permits invalid direct API posts; applying manual min30 to
  automatic execution wrongly rejects late runs. No new integration or schema.
- Chain: CHANGE-091, ADR-030, contexts/sprint/contracts/traceability and editable
  lifecycle diagram; tests/evidence in CHANGE-091. Peers/events/auth, paused
  background retries and deployment remain unchanged. Sprint [~].


## ARCH-EVO-032: Approved isolated local cloud push connector

- Vincent, 2026-10-09, CHANGE-088 / ADR-029: explicit implementation approval.
- Classification: local-only deployment/security-topology refinement; changes
  neither business lifecycle nor peer contracts/data ownership.
- Real HTTP peers + real isolated Pub/Sub topics; financial push reaches local
  Credit through temporary HTTPS and exact-path POST-only nginx. Credit retains
  Google OIDC; Order uses its existing authenticated profile with local DB/Auth.
- Scoped IAM and resource ownership checks, stable custom audience, two financial
  subscriptions, DLQ and Pause before down. No Credit User-penalty subscription.
- 60 configuration/safety + 16 actual nginx/fixture assertions pass. Cloud setup,
  Google identity and local financial/browser effects await personal gcloud/ADC.
  No staging/peer source/database changes. User consumers and background retry/
  delegated credential gates remain separate; Sprint `[~]`.

## ARCH-EVO-031: Explicit automatic expiry and durable latest outcomes

- Vincent, 2026-10-09, CHANGE-086 / ADR-027 follow-up: explicit implementation
  request for the new expiry and latest manual/automatic failure persistence.
  Vincent chose disabling legacy plans without expiry rather than backfilling.
- Classification: user-approved Order-owned field/API/persistence refinement;
  supersedes only prior missing-expiry/client-local-outcome limitations.
- Domain RepostPlan owns strict timing; Order owns latest outcome and clearing.
  OrderRepostService keeps rollback; RepostFailureRecorder writes safe outcomes
  AFTER rollback in a separate locked REQUIRES_NEW transaction. Lifecycle
  repost batch has no outer transaction so each attempt owns its rollback.
- V4 adds nullable expiry/code/message/time plus a plan timing constraint;
  disables legacy enabled plans without a deadline. No order/history/event
  deletion, new peer API/topic, credentials or background retry worker.
- UI reuses quarter-hour picker, reads durable result and refreshes row version.
  Provider ownership and existing event payloads remain unchanged. Paused retry
  design is not made implemented by outcome persistence; no Sprint [x] claim.


## ARCH-EVO-030: Polling/manual failure implementation; all background retries paused

- Vincent, 2026-10-09, CHANGE-085: explicit implementation request for polling
  and short repost messages; subsequent explicit decision pauses ALL background
  retry implementation until peers agree. ADR-027 principles remain a deferred
  design, not a worker/table/candidate implementation.
- Classification: approved scope narrowing; 15-second visible hook, reusable
  list ownership/revision guards and semantic error translation are implementation
  refinements inside the approved polling/failure design.
- Order UI/list and shared Credit hook use authenticated gateway/useApi reads,
  no overlap, focus/mutation refresh, hidden pause and abort cleanup. Existing
  cards survive temporary background errors. Manual failure text is local to
  the EXPIRED component, not a persisted automatic outcome.
- Peer feedback replacement explicitly user-authorized; retained stable IDs and
  old Git history. No peer source, migration, deployment or event schema changed.
- Explicit next-expiry/persistent auto outcomes, live consumers/contracts/browser
  and cloud are still gates. No Sprint [x] upgrade.

## ARCH-EVO-029: Repost retry/polling approval; credential proposal deferred

- Vincent, 2026-10-09, CHANGE-084 / ADR-027: approved same-candidate-ID temporary
  retries bounded by explicit new expiry, short insufficient/permanent-failure
  messages with original EXPIRED, and authenticated polling for UI refresh.
- Classification: approved design refinement and failure-UX amendment; supersedes
  ARCH-EVO-028's pending user choices/insufficient-credit-only message proposal.
- Trusted background service authorization approved ONLY for documentation and
  peer discussion; user explicitly prohibits implementing it yet. FEEDBACK-005
  stays OPEN; FEEDBACK-006 provider semantics/recovery also requires agreement.
- No task worker/schema/API/security/polling/UI implementation or new tests in
  this decision turn. Existing source/timer/outbox rules and original sources
  unchanged; no feature [x] or live integration claim. Target diagram, contexts,
  contracts, feedback, sprint, acceptance obligations and disclosure synchronized.

## ARCH-EVO-028: Updated diagram cadence and repost reconciliation

- Approved by Vincent, 2026-10-08, CHANGE-083 / ADR-026: one shared minute
  expiry/completion job and 15-minute recovery for all three event types.
  Supersedes only cadence/settings of ADR-022/023; keeps immediate dispatch,
  >=48h latest-delivery completion and ADR-025 abort/history/new-repost-ID rules.
- Ordinary implementation defect: Supplier valid:false/missing confirmation
  repaired against its existing contract; no peer design change.
- Approved NTH4 target: repostExpiresAt > repostDueAt >= original.expiresAt;
  late processing only while new expiry is future. Explicit field/retry/UI
  failure state is NOT implemented yet.
- Proposed, pending decisions: fixed-ID durable retries with expiry/permanent-error
  limits; trusted background service authorization versus fresh-user requests.
  No new retry schema/peer endpoint/refund-confirmation event silently approved.
- Context/diagram/contract/traceability/feedback/timer/test chain synchronized;
  original PDF/PNG and learning unchanged. Local verify passed 163 backend tests,
  34 unchanged frontend tests,  >=80% line/branch gates; peers/browser/cloud open.

## ARCH-EVO-027: Sprint 2-3 abort history and lifecycle amendments (2026-10-08)

- Classification: Approved architecture/specification change, implemented and locally verified; not production-complete.
- Approver: Vincent; CHANGE-081/082 and ADR-025 record explicit follow-up approvals.
- Approved/implemented: one current Order plus immutable courier-attempt history;
  separate internal primary UUID/business orderId; ACCEPTED-only abort; User
  penalty event on every abort; requester current state OPEN/EXPIRED with refund
  only for the expired outcome; missing assignment endpoint mocked locally.
- Historical conflict: ADR-001's Sprint 1 prohibition and ADR-014's before-expiry
  no-event/after-expiry ABORTED behavior do not describe the new requested rules.
  Preserve those records as history; do not implement from them for this slice.
- Follow-up approved: synchronous Credit courier update on abort and same-ID
  EXPIRED current order plus separate ABORTED courier history after expiry.
- Follow-up retention approved: keep the old EXPIRED row/ID and new repost row/ID;
  suppress successfully reposted expired originals from My Requests using the
  existing repost links. This supersedes the earlier row-delete/overwrite proposal.
  Query and count filtering precede pagination; UI immediately replaces reposted cards.
- Reset contract confirmed: bodyless hold-for-reopen, clear courierId while retaining
  funds on EVERY abort. Peer stale-retry protection/reconciliation remains missing
  or unverified; broker retries do not guarantee completed refunds.
- Schema evidence: V2 outbox rows reference orders(id); deleting/rekeying an order
  conflicts with those references. V3 instead preserves old IDs/FKs, adds internal
  UUID PK and immutable snapshots, and removes the one-status checkpoint constraint.
- Data risk: legacy unexpired abortions without checkpoints cannot be reconstructed.
  Legacy cancellation-event refund handling must be coordinated before rollout.
- Affected chain: F3/F4/F5/F7-F11, NTH2/NTH4; Order/attempt/history persistence,
  query isolation, transitions/repost, task events, mocks/HTTP contracts and UI.
- Evidence: CHANGE-082 records 162 passing backend tests including clean/upgrade
  PostgreSQL/history/pagination/rollback, 34 frontend tests, production build,
  lint/typecheck and fresh  >=80% line/branch coverage. Effective editable diagrams,
  traceability/contracts/context are synchronized; peer/browser/cloud gates pending.

## ARCH-EVO-025: Hourly outbox recovery polling (2026-10-08)

- Classification/approval: User-directed scheduling refinement; accepted in ADR-023 / CHANGE-078.
- Previous behavior: CHANGE-077/ADR-022 polled pending outbox events every five minutes.
- Effective rule: after-commit listener makes the immediate publish attempt once the transaction commits; the Spring recovery scheduler scans pending/expired-lease rows at `0 0 * * * *` (once at the top of each hour). Expiry remains every 15 minutes; automatic completion remains every minute.
- Rationale/trade-off: the user expects publish failures to be uncommon and prefers a lighter retry poll. A failed publish can wait nearly an hour for the next recovery pass while the service is running; Cloud Run scale-to-zero/request-based CPU may delay it beyond that. Retry timestamps/backoff and outbox persistence are unchanged.
- Affected chain: OrderOutboxScheduler, application and local/cloud cron configuration, cadence test expectation, current architecture/sequence/handoff docs. No event contract, peer API, database, or frontend change.
- Verification: configuration/reference consistency and `git diff --check`; Maven tests not run.


## ARCH-EVO-024: Quarter-hour UI and scheduler cadence (2026-10-08)

- Classification/approval: User-approved behavior and scheduling refinement; ADR-022 / CHANGE-077.
- Previous behavior: Arbitrary-minute native timestamp inputs, per-minute expiry and outbox recovery.
- Effective rule at that change: Shared Requester time picker offers 00/15/30/45 minutes for creation/repost timestamps; defaults round up. Expiry runs every 15 minutes, recovery ran every five minutes until ARCH-EVO-025, and auto-completion runs every minute. Immediate event dispatch stays after commit.
- Alternatives/trade-offs: Explicit minute selectors make choices consistent across browsers; step-only inputs would still permit unsupported typing. API-side rejection is not introduced because the user requested UI selection and existing/direct API timestamps remain valid. Less frequent scans reduce load but can delay expiry/refund and event retry. Exact deadline acceptance checks and DB due selection remain effective.
- Affected chain: Creation/expiry/repost/completion acceptance and traceability, Requester picker/page/helper tests, scheduler cron-boundary tests, application/local/cloud config, current context and Sequence 5/6 notes. No data model, migration, event schema, peer endpoint or backend class dependency changes.
- Verification: Frontend component/form/helper and backend test/coverage/configuration checks recorded in CHANGE-077. Browser visual checks and deployed Cloud Run scheduling remain unverified; idle scale-to-zero limits remain.


## ARCH-EVO-023: Use real Pub/Sub with separate dev/prod topics (2026-10-07)

- Discovery classification: User-approved architecture and local-infrastructure change.
- Approver: User explicitly requested real Pub/Sub and approved the existing project, topic-level IAM separation, and three dev topic IDs.
- Original behavior: CHANGE-060 made the local emulator the default, used project `demo-foc`, initialized local topics in Compose, and bypassed GCP authentication/IAM.
- Effective rule: Use existing project `protean-vigil-509704-q4` for both environments, with local dev topic IDs `order-completion-dev-v1`, `open-order-refund-dev-v1`, and `accepted-order-cancellation-dev-v1`. Production topic IDs are supplied through environment configuration. Developers use personal ADC; Compose mounts the developer's ADC file read-only. Cloud Run uses its attached service identity. Developers can publish only to dev topics; the production identity can publish only to prod topics. Do not use shared service-account keys or project-wide Pub/Sub Publisher grants.
- Alternatives considered: Keep the emulator (rejected because it does not exercise real authentication/IAM/delivery); create a separate GCP project (rejected by the user); use a shared service-account key (rejected because it shares a long-lived credential).
- Trade-offs: Real local publishes exercise cloud behavior and may activate dev subscribers or consume shared quota/billing. Topic-level IAM limits cross-environment publishing, while the shared project retains common billing, quota, and administrative controls. A mounted personal ADC file is private to the developer but usable by the running Order container.
- Constraints: Order Service producer and its root Compose wiring only; do not change peer-service source or consumer subscriptions. Keep outbox semantics, event schemas, mock peer mode, and business flows unchanged.
- Affected design chain: CHANGE-073, ADR-021, Order publisher factory/test, `application.yaml`, root Compose/`.env.example`, local README, peer event topic handoff, architecture/runtime context, change/evolution/AI records.
- Migration/rollback: No database/schema migration. Reverting CHANGE-073 restores the emulator-based local setup. Messages already accepted by Pub/Sub cannot be recalled. GCP topics, IAM, and production topic environment variables are team-managed.
- Status: Repository implementation complete; Maven/Compose/live-cloud verification pending.

## ARCH-EVO-022: Add 48-hour automatic completion (2026-10-07)

- Discovery classification: Architecture/sprint-scope amendment explicitly directed by the user.
- Approver: User.
- Original approved scope: Sprint 1 listed 48-hour auto-completion as out of scope; requester-only completion changed `DELIVERED` to `COMPLETED`.
- Effective rule: A configurable Spring scheduler queries and pessimistically locks `DELIVERED` orders with a delivery checkpoint at or before `now - 48 hours`; the transition rechecks under lock and records `COMPLETED` through the existing checkpoint, idempotent receipt, overdue calculation, and `OrderCompletionTaskEvent` transactional outbox flow. Requester completion remains available before that time.
- Alternatives considered: Keep completion requester-only (superseded by the user's amendment); add a new completion event or peer call (rejected because the existing completion flow already publishes all completion consequences); load all orders and filter in memory (rejected; the database applies status and timestamp predicates).
- Trade-offs: A Spring cron is straightforward and reuses tested lifecycle/outbox behavior, but in-process jobs may pause while Cloud Run scales to zero. A one-minute default may complete shortly after the exact 48-hour boundary.
- Constraints: Order Service only; no new peer service contract, event type, or database schema. The user authorized use of the current profile branch; the shared allocation's branch label remains stale but Sequence 5 is within Yao's feature allocation.
- Affected design chain: F4.1.5/F5.1, Sprint Sequence 5/7, CHANGE-072, ADR-020, lifecycle scheduler, Order query/row lock, completion transition, tests, architecture/scope/sequence/class diagrams and traceability.
- Migration/rollback: No schema migration. Revert the scheduler/config and restore the scope deferral only if no product data or automated completions require retaining the behavior; already-emitted completion events cannot be recalled.
- Status: Implementation and documentation complete; focused Maven tests did not execute because Java 21 failed during compile resource cleanup.

## ARCH-EVO-021: Share the OPEN-order refund event (2026-10-06)

- Discovery classification: Architecture or specification change, explicitly directed by the user.
- Approver: User.
- Original approved rule: CHANGE-065/ADR-015 used a distinct `OrderExpirationTaskEvent` for scheduled expiry and `OpenOrderCancellationTaskEvent` for requester cancellation, despite both subscribers refunding/releasing the same OPEN-order transaction.
- Effective rule: Both flows publish `OpenOrderRefundTaskEvent` through one publisher and one topic. Requester cancellation still commits `CANCELLED`; scheduler expiry still commits `EXPIRED`. Credit refunds both and may distinguish their cause using `order.status`; User is not involved.
- Alternatives considered: Keep separate events/topics (rejected as duplicate Credit refund contracts); publish one generic event but retain separate topics (rejected because subscriber work and topic are also the same); use one event and one topic with status in the existing Order snapshot (selected).
- Trade-offs: One consumer subscription and refund action reduce duplicated integration surface. The resulting status distinguishes the two causes without another event-specific field. The event name/topic changes, so future Credit consumers must use the new contract; already-published messages cannot be recalled. Pending old outbox rows are translated by the Order dispatcher with their stable `eventId` preserved.
- Constraints: Order Service and Order-owned local Compose topic only; do not change Credit or User source. Keep event version 1 and current no-checkpoint snapshot. Spring expiry scheduling and atomic outbox processing do not change.
- Affected design chain: F4.1.8/F10, Sequence 6/9, EV-DEC-005/007, CHANGE-071, ADR-019; event DTO, mapper/factory, both producers, dispatcher, publisher pair, topic config, tests, peer/service contracts, class/sequence diagrams, traceability and handoff.
- Migration/rollback: No database schema migration. Legacy pending outbox rows are routed to the new topic. Rollback requires restoring old publisher/topic routing only after checking whether new-contract events have been emitted; already-published events cannot be recalled.
- Status: Implementation and verification in progress.

## ARCH-EVO-020: Keep Order versions out of synchronous Credit requests (2026-10-06)

- Discovery classification: User-approved cross-service contract refinement.
- Approver: User.
- Effective rule: Order validates its expected version, ownership, and amount locally. Credit assignment sends `orderId` and `courierId`; hold/reset sends only `orderId`, with no body. Credit reads the rest from its transaction record. Published event payloads continue to carry `orderVersion` for event identity and context.
- Alternatives considered: Send redundant requester/amount/command details to Credit (rejected because Credit resolves transaction details from Order ID and these updates can be idempotent by state); remove versions from events too (rejected because consumers may use them to identify/order event facts).
- Trade-offs: Minimal peer requests avoid coupling Credit to Order concurrency state or duplicating transaction data. Credit must make same-courier assignment and repeated hold/reset idempotent by Order ID/state; event consumers can use event ID/version for deduplication and ordering policy.
- Constraints: Order Service scope only. Do not modify Credit Service. FEEDBACK-003's hold/reset contract is agreed but its endpoint is missing; FEEDBACK-004 assignment contract/endpoint remains pending.
- Affected design chain: F3/F13 and F4.1.7; CHANGE-069; ADR-018; peer/service/sprint contracts; Sequence 3 and Credit class diagrams; adapter DTOs, idempotency records, and tests. Event schemas, Order API versions, and data model are unchanged.
- Migration/rollback: No database or event-schema migration. Credit must implement the agreed FEEDBACK-003 contract and agree production authentication/recovery before live integration.
- Status: Minimal Order port/mock/HTTP shapes implemented; FEEDBACK-003's bodyless hold contract user-confirmed by CHANGE-070. Credit provider implementation is still missing. Focused Maven verification was blocked before tests by local Java compilation failure.

## ARCH-EVO-016: Accepted cancellation holds Credit before reopening (2026-10-03)

- Discovery classification: User-directed architecture refinement; the user's request explicitly approves the design and implementation.
- Approver: User.
- Effective rule: Only the assigned courier may cancel. Before `expiresAt`, Order synchronously asks Credit to hold/reset the existing transaction without refund; only confirmed success allows direct `ACCEPTED -> OPEN` and clears the assignment. At/after expiry, Order transitions to `ABORTED` and emits the cancellation event for Credit refund and User penalty. Recheck expiry after a slow Credit response.
- Alternatives considered: Publish an event for all cancellations (rejected because asynchronous consumption can race a new courier's acceptance); always abort/refund (rejected because an unexpired errand should be available again); use synchronous hold after expiry (unnecessary because the expired outcome stays event-driven).
- Trade-offs: Synchronous confirmation protects reopening order but adds Credit latency and needs idempotency/reconciliation if Credit succeeds before the Order database commit. Expired cancellation stays decoupled through the outbox.
- Constraints: Order Service and shared frontend only; no Credit/User source edits. Credit lacks the endpoint, so local mock mode is supported. CHANGE-070 confirms the final HTTP contract in `FEEDBACK-003`; provider implementation and production authentication/recovery remain pending.
- Affected design chain: requirement `CHANGE-064`; `ADR-014`; service/architecture/peer contracts; updated Sequence 7 and publisher class diagram; no schema/data-model change; Credit endpoint contract pending; application/domain/mock/HTTP adapter and frontend tests.
- Migration/rollback: No database migration. Rollback is a code/configuration rollback; do not restore the unconditional event path without a replacement rule. Any confirmed Credit hold must be safely idempotent and reconcilable.
- Status: Order-side implementation verified by 107 passing Maven tests and frontend checks. Peer endpoint and subscriber implementations remain unverified.

This is the persistent register for architecture and design discoveries made while implementing the Order Service. It complements, but does not replace, `docs/change-log.md`, `changes/`, ADRs, specifications, diagrams, contracts, traceability, or Git history.

Read this file at the beginning of every implementation-affecting turn. Follow the latest approved and effective design, not an original design that a later entry supersedes. Chat history is not authoritative.

## Baseline

The initial approved context is recorded in:

- `docs/ai-project-context.md`
- `docs/architecture-overall.md`
- `docs/architecture-order-service.md`
- `docs/decisions/`
- `docs/service-contracts.md`
- `docs/peer-service-api-feedback.md`
- the source and Sprint diagrams fingerprinted in `docs/project-d1-reference.md`

ARCH-EVO-001 records the user-supplied correction to the Order Service high-level diagram's application/domain/outbound-port control flow. Existing ADRs remain effective according to their own status and supersession rules.

CHANGE-052 records the requested `messagingpublisher/interfaces/` and `messagingpublisher/publisher/` layout and proposed updated diagrams for the four events in CHANGE-051. CHANGE-053 supplies the approved Order-side snapshot, topic placeholders, assumed future peer consumers, and publish-before-status behavior; CHANGE-067/ADR-016 later removes checkpoint history from the effective payload.

CHANGE-053 records the user's explicit direction to publish each task event before persisting its Order status. CHANGE-063/ADR-013 later supersedes only that ordering for completion and cancellation: Order state and event intent are committed through a transactional outbox, then an after-commit listener tries delivery immediately and a Spring cron job recovers due rows. Resulting Order/repost fields, topic placeholders, Pub/Sub, peer-consumer assumptions, and Order-only scope remain effective; checkpoint history is excluded by CHANGE-067/ADR-016. Delivery is at least once, with stable IDs for consumer deduplication.

CHANGE-054 records the user's explicit Google Cloud Pub/Sub selection. ARCH-EVO-023/ADR-021 supersedes the emulator path: local Compose and production use real Pub/Sub with personal ADC and Cloud Run service identity respectively. The dev topic IDs are set; production IDs remain deployment configuration.

CHANGE-056 and ADR-011 supersede the separate normal/overdue completion routing from CHANGE-053/ADR-009. The effective completion event is `OrderCompletionTaskEvent` for every completion, with `overdue` and `overdueAt` facts consumed by both User and Credit. The prior records remain historical; the current diagrams and contracts contain no overdue-only publisher.

CHANGE-063 and ADR-013 supersede CHANGE-053's publish-before-status ordering. The post-transition state, checkpoint, receipt, and serialized event now commit atomically; immediate dispatch occurs after commit and cron is recovery only. Cloud Run scale-to-zero/request-based CPU means the in-process scheduler is not guaranteed to execute while idle; deployment billing/minimum-instance changes require a separate cost decision.

CHANGE-065 and ADR-015 originally extended the outbox flow to scheduled OPEN-order expiration. CHANGE-071/ADR-019 supersedes their separate event type: Spring `@Scheduled` still finds due unassigned OPEN orders, and EXPIRED state, checkpoint, and `OpenOrderRefundTaskEvent` commit atomically. Requester-triggered cancellation uses that same event with `CANCELLED`; Credit refunds both. The prior synchronous Credit release call is removed. Cloud Run's scale-to-zero/request-based CPU limitation remains.

CHANGE-067 and ADR-016 refine the event data contract: checkpoint history is not serialized into Order events. The Order and outbox still commit the checkpoint in the database; the event carries the resulting Order/repost fields, while completion overdue facts continue to derive from internal checkpoint history. Event version 1 remains the future-consumer contract because no peer consumers were found.

## Change classification

Classify every implementation discovery before acting on it.

### Implementation detail

An internal mechanical choice that does not change approved requirements, externally visible behavior, service or data ownership, contracts, security, control flow, data flow, consistency, or architecture. A safe implementation detail may be implemented within the approved design and recorded through the normal change/TDD workflow.

### Design refinement

An internal class, method responsibility, validation step, persistence detail, internal interaction, or test-fixture adjustment that preserves intended external behavior and approved boundaries. Document every material refinement in this register and the related change record. Obtain approval when it changes an approved class/sequence responsibility or when its classification is uncertain.

### Architecture or specification change

A change to requirements, user-visible behavior, service boundaries, database ownership, public contracts, cross-service interactions, synchronous/asynchronous communication, event behavior, security/authorization, consistency/reliability, major component responsibilities, or sequence interactions. Explicit user approval is required before implementation.

The AI's recommendation is never approval. If classification is disputed or ambiguous, use the stricter class and stop for a decision.

## Required proposal before a material design change

Show:

- the original requirement or design;
- the implementation discovery and why the current design is insufficient;
- what may be added, changed, or removed;
- at least two viable solutions where appropriate;
- advantages, disadvantages, and trade-offs involving complexity, maintainability, performance, consistency, testing, and future change;
- the recommended solution and reason;
- all affected requirements, architecture, class/sequence diagrams, data model, contracts, tests, and source files;
- the proposed classification and whether approval is required.

Ask the user to approve, reject, or modify every architecture/specification change before implementing it. Do not change application code, implementation tests, contracts, or diagrams to embody an unapproved proposal.

## Evolution index

| Evolution ID | Date | Feature | Change type | Status | Current rule or outcome | Decision/change links | Supersedes |
|---|---|---|---|---|---|---|---|
| ARCH-EVO-025 | 2026-10-08 | Hourly outbox recovery polling | User-directed scheduling refinement | IMPLEMENTED; STATIC CHECKS PASSED; TESTS NOT RUN | Immediate dispatch remains; recovery hourly; expiry 15 minutes; auto-completion one minute | CHANGE-078 / ADR-023 | Five-minute recovery poll from ARCH-EVO-024 |
| ARCH-EVO-024 | 2026-10-08 | Quarter-hour UI and scheduler cadence | User-approved behavior/configuration refinement | IMPLEMENTED; LOCAL CHECKS PASSED; VISUAL/RUNTIME PENDING; RECOVERY CADENCE SUPERSEDED | UI clock minutes 00/15/30/45; expiry 15 minutes; recovery was five minutes until ARCH-EVO-025; auto-completion one; immediate dispatch unchanged | CHANGE-077 / ADR-022 | Arbitrary-minute UI and per-minute expiry/recovery defaults |
| ARCH-EVO-023 | 2026-10-07 | Use real Pub/Sub with separate dev/prod topics | Architecture or specification change | USER-APPROVED; IMPLEMENTED; CLOUD/COMPOSE VERIFICATION PENDING | One existing GCP project, dev/prod topics, personal local ADC, Cloud Run service identity, topic-scoped IAM | CHANGE-073 / ADR-021 | Emulator as the default local transport in CHANGE-060 |
| ARCH-EVO-001 | 2026-09-28 | High-level internal control flow | Design refinement | IMPLEMENTED | Application components invoke outbound ports; domain rules return decisions/data | CHANGE-012 | Previous diagram revision `875238E1...` |
| ARCH-EVO-002 | 2026-09-29 | Order Service persistence and deployment | Architecture or specification change | APPROVED | Order Service uses PostgreSQL on one Cloud SQL instance and deploys to Cloud Run with a public-IP Cloud SQL Java Connector | CHANGE-015 / ADR-008 | Unresolved PostgreSQL/Firestore and Kubernetes/Cloud Run conflict |
| ARCH-EVO-003 | 2026-09-30 | Unified Order dashboard and authenticated actor identity | Architecture or specification change | APPROVED | Shared dashboard exposes requester and courier functions without a client-side mode switch; Order uses User Service-confirmed actor IDs; supplier labels never flash opaque IDs | CHANGE-029 | Previous mode-switching frontend slice in CHANGE-022 |
| ARCH-EVO-004 | 2026-09-30 | Creation-time-only automatic repost choice | Architecture or specification change | IMPLEMENTED | Automatic repost is selected atomically during order creation; `OPEN` orders are read-only; manual repost is available only for un-reposted `EXPIRED` orders | CHANGE-031 | Post-creation configuration wording in CHANGE-022 |
| ARCH-EVO-005 | 2026-09-30 | Temporary Credit outcome stub boundary | Architecture or specification change | APPROVED | Local mock may exercise outcome flows while provider settlement/release operations remain pending | CHANGE-032 / FEEDBACK-001 | Blocking all local outcome-flow work |
| ARCH-EVO-006 | 2026-10-01 | Domain repository boundary and traditional API DTOs | Design refinement | IMPLEMENTED; full suite verified by CHANGE-054 | Application services use domain repository interfaces; Spring Data stays in infrastructure; API contracts use named DTO classes | CHANGE-050 / CHANGE-054 | Direct Spring Data injection and nested API DTO records |
| ARCH-EVO-007 | 2026-10-02 | Updated overall sequences 5-8 and typed outcome events | Architecture or specification change | APPROVED SOURCE; implementation ordering restored by ARCH-EVO-015 | Typed completion/cancellation events, broker fan-out, independent Credit/User subscriptions, and same-order accepted reopening are current; atomic outbox consistency applies to Sequences 5-7 | CHANGE-051 | Synchronous Credit outcome boundary and deferred accepted reopening in Sprint 1 records |
| ARCH-EVO-009 | 2026-10-02 | Publish task event before status persistence | Architecture or specification change | USER-APPROVED; SUPERSEDED BY ARCH-EVO-015 | Historical rule: publish full Order snapshot before status/checkpoint; this ordering no longer applies to completion/cancellation | CHANGE-053 / CHANGE-054 / ADR-009 | Outbox-first ordering in CHANGE-051/ADR-009; superseded by ARCH-EVO-015 |
| ARCH-EVO-010 | 2026-10-02 | Select Google Cloud Pub/Sub for Order task publishers | Architecture or specification change | USER-APPROVED; IMPLEMENTED; transport choice effective; emulator detail superseded by ARCH-EVO-023 | Use Google's Java Pub/Sub client; await message ID before marking an outbox row published | CHANGE-054 / ADR-009/013 | Unselected broker client in CHANGE-053 |
| ARCH-EVO-012 | 2026-10-02 | Unify order completion publication | Architecture or specification change | USER-APPROVED; IMPLEMENTED; publish-before-status ordering superseded by ARCH-EVO-015 | Publish one completion event for both overdue and on-time orders; include overdue facts for User and Credit | CHANGE-056 / ADR-011 | Separate normal and overdue completion routes in ADR-009/CHANGE-053 |
| ARCH-EVO-015 | 2026-10-03 | Transactional outbox for outcome events | Architecture or specification change | USER-APPROVED; IMPLEMENTED AND VERIFIED | Commit Order transition plus event intent atomically; attempt delivery after commit; Spring cron recovers due rows; at-least-once delivery; Cloud Run scheduling limitation remains | CHANGE-063 / ADR-013 | Publish-before-status ordering in ARCH-EVO-009 for completion/cancellation |
| ARCH-EVO-017 | 2026-10-03 | Spring-scheduled OPEN expiry event | Architecture or specification change | USER-APPROVED; IMPLEMENTATION IN PROGRESS; SEPARATE EVENT SUPERSEDED BY ARCH-EVO-021 | Spring scheduler expires due unassigned OPEN orders and persists the shared `OpenOrderRefundTaskEvent` in the state/checkpoint transaction; Credit refunds asynchronously | CHANGE-065 / ADR-015 / EV-DEC-005/007; CHANGE-071 / ADR-019 | Synchronous Credit release during expiry; separate expiration event type |
| ARCH-EVO-018 | 2026-10-06 | Exclude checkpoint history from Order event payloads | Architecture or specification change | USER-APPROVED; IMPLEMENTED; MAVEN VERIFICATION BLOCKED LOCALLY | Publish current Order/repost fields without checkpoints; retain history storage/query and internal overdue calculation; event contract remains v1 for future consumers | CHANGE-067 / ADR-016 | Full event snapshot including checkpoint history in CHANGE-053/054 |
| ARCH-EVO-019 | 2026-10-06 | Synchronously assign the Credit reservation before Order acceptance | Architecture or specification change | USER-APPROVED; ORDER-SIDE STUB IMPLEMENTED; PEER API OPEN; MAVEN VERIFICATION BLOCKED LOCALLY | After validating the locked OPEN Order, await Credit courier assignment and a matching response before persisting ACCEPTED; recheck expiry after the call | CHANGE-068 / ADR-017 / FEEDBACK-004 | Acceptance without a Credit courier assignment |
| ARCH-EVO-021 | 2026-10-06 | Share the OPEN-order refund event | Architecture or specification change | USER-APPROVED; IMPLEMENTATION AND VERIFICATION IN PROGRESS | Requester cancellation and scheduled expiry use one `OpenOrderRefundTaskEvent` and topic; resulting `CANCELLED`/`EXPIRED` status remains distinct | CHANGE-071 / ADR-019; supersedes event-type portion of CHANGE-065 / ADR-015 | Separate OPEN-cancellation and OPEN-expiration refund events/topics |

Use stable `ARCH-EVO-NNN` identifiers. The detailed entry and its linked ADR/change record together preserve the decision history; do not copy full ADR contents into this table.

## Entry template

```markdown
## ARCH-EVO-NNN: <title>

- Change ID:
- Date:
- Developer:
- Feature:
- Original design or requirement:
- Problem discovered:
- Change type: Implementation detail / Design refinement / Architecture or specification change
- Status: PROPOSED
- Approved change:
- What was added:
- What was changed:
- What was removed:
- Why the change was necessary:
- Alternatives considered:
- Trade-offs:
- Affected architecture:
- Affected class diagram:
- Affected sequence diagram:
- Affected data model:
- Affected contracts:
- Affected tests:
- Affected source files:
- Approved by:
- Approval date:
- Effective from:
- Implementation status:
- Supersedes:
- Superseded by:
- Related ADR/override:
- Related traceability:
```

Allowed evolution statuses are `PROPOSED`, `APPROVED`, `IMPLEMENTED`, `REJECTED`, `SUPERSEDED`, `REVERTED`, and `ROLLED_BACK`.

- `APPROVED` permits the recorded change but does not claim that all artifacts or code are updated.
- `IMPLEMENTED` requires the approved design, affected documentation, traceability, tests, and implementation to be synchronized and verified.
- `SUPERSEDED` links to the newer effective entry while retaining the original history.
- `REVERTED` withdraws the decision; `ROLLED_BACK` means an applied implementation was undone and requires verification of the restored design.

## ARCH-EVO-001: Correct application/domain/outbound-port flow

- Change ID: CHANGE-012
- Date: 2026-09-28
- Developer: Vincent
- Feature: Order Service high-level internal architecture
- Original design or requirement: The prior diagram fingerprint and Markdown summary did not preserve the corrected direction between application components, Order-owned domain rules, and outbound ports.
- Problem discovered: The revised authoritative diagram explicitly states that domain rules return decisions while application components invoke outbound ports.
- Change type: Design refinement
- Status: IMPLEMENTED
- Approved change: Treat the user-corrected diagram as the current authoritative revision and persist its clarified dependency direction.
- What was added: Explicit application-to-domain, domain-to-application, application-to-port, and port-to-application control/data-flow rules.
- What was changed: Diagram fingerprint metadata and the architecture/context summaries.
- What was removed: The previous diagram fingerprint from the current-source row; it remains recorded here as superseded history.
- Why the change was necessary: Future implementation must not place repository or peer-service calls inside Order-owned domain rules.
- Alternatives considered: Leave the Markdown summaries implicit; rejected because future turns could reconstruct the old or ambiguous dependency direction.
- Trade-offs: Slightly more prescriptive internal layering in exchange for clearer separation, testability, and dependency inversion. No external behavior or contract changes.
- Affected architecture: `docs/architecture-order-service.md` and `docs/ai-project-context.md`.
- Affected class diagram: None; existing logical class responsibilities remain unchanged.
- Affected sequence diagram: None.
- Affected data model: None.
- Affected contracts: None.
- Affected tests: None; no implementation exists and no application behavior changed.
- Affected source files: None.
- Approved by: User-provided corrected authoritative diagram
- Approval date: 2026-09-28
- Effective from: Diagram SHA-256 `BB092EC12C895CC31ED1674F595FEFDAE36E20C2769FFFEF7BC1D20631ADB8B7`
- Implementation status: Source fingerprint and affected Markdown context synchronized; no application implementation was required.
- Supersedes: Diagram revision SHA-256 `875238E1A69A37245052DD6BE2E9167C39851B1EF566FF6A9F84B4DB7B6EA210`
- Superseded by: None
- Related ADR/override: None; this is a source-diagram design refinement, not a contract or product amendment.
- Related traceability: `docs/project-d1-reference.md`

## ARCH-EVO-002: Approve Order Service Cloud SQL and Cloud Run

- Change ID: CHANGE-015
- Date: 2026-09-29
- Developer: Vincent (Developer 2)
- Feature: Order Service persistence and deployment foundation
- Original design or requirement: Order Service design sources named PostgreSQL/Kubernetes while parent repository defaults named Firestore/Cloud Run.
- Problem discovered: The conflicting persistence/deployment authorities prevented a concrete Cloud SQL or Cloud Run setup.
- Change type: Architecture or specification change
- Status: APPROVED
- Approved change: Use PostgreSQL on one Cloud SQL instance with separate `order_staging` and `order_production` databases; deploy Order Service to Cloud Run using a public-IP Cloud SQL Java Connector.
- What was added: Cloud SQL instance/database/IAM/Secret Manager provisioning direction, Cloud Run connection direction, backup/PITR/deletion-protection requirements.
- What was changed: Order Service-specific effective persistence and deployment authority.
- What was removed: The unresolved conflict as a blocker for Order Service infrastructure.
- Why the change was necessary: The user selected the concrete cloud runtime and relational persistence needed for the service.
- Alternatives considered: Separate instances (more isolation/cost); private IP/VPC (more isolation/complexity); direct public connection (rejected).
- Trade-offs: Shared instance lowers cost but couples environments; public connector simplifies operations but is less isolated than private VPC networking.
- Affected architecture: `docs/architecture-order-service.md`, `docs/ai-project-context.md`, `docs/ai-project-context.toml`.
- Affected class diagram: None.
- Affected sequence diagram: Deployment/infrastructure configuration only; business sequence diagrams unchanged.
- Affected data model: Cloud database boundary approved; application schema and migration tool remain separately gated.
- Affected contracts: None.
- Affected tests: Infrastructure verification to be added; application tests unchanged.
- Affected source files: `infra/gcp/bootstrap.sh`, `scripts/ci/check-infra.sh`, environment/deployment configuration.
- Approved by: User
- Approval date: 2026-09-29
- Effective from: Approval of ADR-008
- Implementation status: Approved; repository synchronization and cloud provisioning are pending/underway.
- Supersedes: The unresolved PostgreSQL/Firestore and Kubernetes/Cloud Run conflict recorded by ADR-003.
- Superseded by: None
- Related ADR/override: `docs/decisions/ADR-008-order-service-cloud-sql-cloud-run.md`
- Related traceability: `docs/project-d1-reference.md`; no Sprint business requirement changed.

## ARCH-EVO-003: Unified Order dashboard and authenticated actor identity

- Change ID: CHANGE-029
- Date: 2026-09-30
- Developer: Vincent (Developer 2)
- Feature: Shared Order Service dashboard and acceptance authorization
- Original design or requirement: The earlier frontend slice included a client-side Requester/Courier mode switch, and Order application services accepted request-body actor IDs after a role/eligibility check.
- Problem discovered: The user requested one dashboard exposing both functions, and the actual User Service role endpoints derive identity from the bearer token rather than trusting the forwarded `X-User-Id`. Supplier lookup also caused a transient opaque-ID flash.
- Change type: Architecture or specification change
- Status: APPROVED
- Approved change: Remove the mode-switch control, expose both functions through shared navigation, use provider-confirmed identities for Order operations, filter self-orders from the browse presentation, and hold cards until Supplier lookup settles.
- What was added: Authenticated identity return values from the Order UserServicePort and adapters; stable supplier-label readiness handling.
- What was changed: Frontend route gating and mode persistence were removed; Order application callers now use the verified identity.
- What was removed: Client-side mode-switch UI and transient supplier-ID fallback.
- Why the change was necessary: It matches the user's chosen dashboard behavior and closes the actor-identity gap without modifying peer services or public Order contracts.
- Alternatives considered: Keep the switcher; add a new Order response containing supplier details; or keep rendering IDs until lookup completion. Those options were rejected for user experience, ownership, or security reasons.
- Trade-offs: The unified dashboard exposes more navigation at once, so backend authorization must remain authoritative. Waiting for lookup completion can briefly show skeletons, but avoids misleading identifiers.
- Affected architecture: Shared frontend role/function presentation and Order-side authorization boundary.
- Affected class diagram: UserServicePort now returns a verified identity; no public class ownership changed.
- Affected sequence diagram: Acceptance and actor-sensitive flows now bind the actor to the authenticated User Service identity.
- Affected data model: None.
- Affected contracts: No peer contract changed; existing User Service response fields are consumed by the adapter.
- Affected tests: Existing self-acceptance domain test retained; frontend Order-card coverage extended. Runtime and contract verification remain pending.
- Affected source files: `frontend/`, `order-service/src/main/java/sg/edu/nus/foc/order/application/`, `order-service/src/main/java/sg/edu/nus/foc/order/adapter/`, and `order-service/src/main/java/sg/edu/nus/foc/order/api/OrderController.java`.
- Approved by: Vincent
- Approval date: 2026-09-30
- Effective from: CHANGE-029 source update
- Implementation status: Source changes applied; full test/runtime verification pending.
- Supersedes: Mode-switch portion of CHANGE-022
- Superseded by: None
- Related ADR/override: None; this is a user-approved frontend/security refinement.
- Related traceability: `docs/requirements-traceability.md`, Sequence 3 and cross-cutting notes.

## ARCH-EVO-004: Creation-time-only automatic repost choice

- Change ID: CHANGE-031
- Date: 2026-09-30
- Developer: Vincent
- Feature: NTH4 automatic and manual reposting
- Original design or requirement: NTH4 permits an automatic repost plan for an unaccepted order and a requester-reviewed manual repost after expiry. The source context did not explicitly define post-creation mutability.
- Problem discovered: The earlier frontend and configure route allowed an `OPEN` order to be enabled, disabled, or edited after creation through a second request.
- Change type: Architecture or specification change
- Status: IMPLEMENTED
- Approved change: The developer clarified and approved that the automatic-repost checkbox and all plan details are selected during creation; an order cannot be changed later. Only an eligible `EXPIRED` order without a repost may show the manual repost action.
- What was added: Create-order repost fields, immutable read-only display, and tests for creation-time persistence and rejected later configuration.
- What was changed: Order creation stores the plan; the legacy configure route returns a conflict; the frontend no longer offers post-creation automatic-plan editing.
- What was removed: The `OPEN`-order configure interaction and its second-request mutation behavior.
- Why the change was necessary: It matches the clarified product behavior and prevents a user from changing the repost decision after an order is already published.
- Alternatives considered: Keep editable settings until expiry; add a separate disable-only command; or make the creation choice immutable. The approved immutable choice preserves predictable lifecycle semantics and requires no new command state.
- Trade-offs: A mistaken creation choice requires manual repost after expiry rather than editing the live order; the create request is slightly wider, but the lifecycle is deterministic and idempotent.
- Affected architecture: Order creation/repost application boundary and frontend request lifecycle.
- Affected class diagram: `Order` owns the creation-time `RepostPlan`; no new aggregate or peer ownership.
- Affected sequence diagram: Sequence 1 carries the optional plan; Sequence 10 reads it after expiry; Sequence 11 remains requester-reviewed manual repost.
- Affected data model: Existing embedded repost-plan columns are reused; no migration.
- Affected contracts: `POST /api/orders` gains optional repost fields. The legacy configure route remains but rejects mutation with conflict.
- Affected tests: Domain and repost-service tests updated; frontend payload/validation tests updated.
- Affected source files: Order API/application/domain classes and shared frontend create/repost controls.
- Approved by: Vincent
- Approval date: 2026-09-30
- Effective from: CHANGE-031 implementation
- Implementation status: Code and records synchronized; runtime/test gates pending.
- Supersedes: Post-creation configuration interpretation in CHANGE-022
- Superseded by: None
- Related ADR/override: None; this is a developer-approved clarification of NTH4 behavior.
- Related traceability: `docs/requirements-traceability.md`, Sequences 1, 10, and 11.

## ARCH-EVO-005: Temporary Credit outcome stub boundary

- Change ID: CHANGE-032
- Date: 2026-09-30
- Developer: Vincent
- Feature: Credit settlement/release for completion, cancellation, expiry, and automatic repost
- Discovery classification: Architecture or specification change, explicitly approved as a temporary Sprint 1 exception
- Status: APPROVED (temporary; provider implementation pending)
- Approved change: Order Service may invoke a validating no-op `CreditServicePort` for local verification while Credit Service implements the provider-owned settlement and release endpoints. The real boundary remains synchronous and Credit-owned.
- Proposed contracts: `POST /api/credits/orders/{orderId}/settlement` and `POST /api/credits/orders/{orderId}/release`, with command identity, order/requester identity, amount, outcome where applicable, and expected order version. Exact response/error/authentication fields require Credit owner agreement.
- Security decision: lifecycle calls must first pass the Order-owned lifecycle-token check; an explicit bearer-form internal credential is forwarded to automatic peer calls. Provider acceptance of that credential is not yet verified.
- Trade-offs: The mock allows Order state-machine and UI work to proceed, but cannot verify balances, ledger transfers, or peer error semantics. Sequences 7-9 remain `[~]`.
- Alternatives considered: block all outcome flows; invent Order-owned credit mutations; or introduce a broker. The approved temporary stub preserves Credit ownership and the synchronous boundary without inventing peer behavior.
- Affected architecture chain: Order application port/adapters, completion/cancellation/expiry/repost sequences, peer API feedback, traceability, tests, and active-work records. No peer source or schema changed.
- Exit criteria: Credit owner agrees and implements both endpoints; actual peer code and tests are re-read; contract/idempotency/authentication/error tests pass; mock is removed or disabled for the verified integration.
- Related records: `changes/CHANGE-032-credit-outcome-stub-exception.md`, `docs/peer-service-api-feedback.md` FEEDBACK-001.

## ARCH-EVO-006: Domain repository boundary and traditional API DTOs

- Change ID: CHANGE-050
- Date: 2026-10-01
- Developer: Yao Xiang
- Feature: Cross-cutting Order Service Java structure
- Original design or requirement: The approved architecture requires application components to invoke an Order persistence abstraction while domain rules remain independent of persistence. The implementation directly injected Spring Data repositories into application services and grouped API contracts into nested records.
- Problem discovered: Derived query names, Spring Data pagination, and locking methods leaked infrastructure details into application orchestration. Compact nested DTO records and one-line methods also made review and maintenance difficult.
- Change type: Design refinement
- Status: IMPLEMENTED; full suite verified by CHANGE-054
- Approved change: Use named API request/response DTO classes, domain repository interfaces, and infrastructure persistence adapters. Use explicit types and Lombok-generated boilerplate with conventional Java formatting.
- What was added: Domain repository interfaces, an Order page result, JPA repository interfaces, persistence adapters, separate request/response DTO packages, and a Spring-managed MapStruct response mapper.
- What was changed: Application services now use semantic repository methods; Spring Data calls stay in infrastructure; entity and service boilerplate uses Lombok where access rules permit; controllers delegate domain-to-response conversion to explicit `@Mapping` declarations.
- What was removed: The nested `OrderDtos` record container, response DTO `from(...)` factory methods, direct application imports of Spring Data repositories, application-layer derived-query calls, and `var` usage.
- Why the change was necessary: It enforces the approved dependency direction, improves separation of concerns, and makes API contracts and methods easier to review.
- Alternatives considered: Keep Spring Data repositories in the application layer and only reformat code; add a generic persistence service over Spring Data. The selected repository-port/adaptor structure gives clearer ownership without adding a second business-service layer.
- Trade-offs: More files and annotation processors provide stronger boundaries, independently named contracts, and compile-time mapping checks. Lombok and MapStruct require annotation processing and `lombok-mapstruct-binding`. Domain entities intentionally avoid public setters so lifecycle invariants remain enforceable.
- Affected architecture: Internal application, domain repository, and infrastructure persistence boundaries.
- Affected class diagram: Logical `OrderRepository` responsibility is now represented by a domain interface and infrastructure adapter.
- Affected sequence diagram: No interaction or ordering change.
- Affected data model: None; no migration.
- Affected contracts: JSON field names and HTTP operations are unchanged; Java DTO class names changed internally.
- Affected tests: Existing source tests were updated for the named DTOs and repository interfaces; the complete Order Service suite passed under CHANGE-054.
- Affected source files: Order API, application, domain, repository, infrastructure, and directly affected tests.
- Approved by: Yao Xiang
- Approval date: 2026-10-01
- Effective from: CHANGE-050
- Implementation status: Source and persistent instructions updated; Java 21 production/test compilation and the full test suite passed under CHANGE-054.
- Supersedes: Direct Spring Data repository injection and nested API DTO records in the initial Sprint 1 implementation.
- Superseded by: None
- Related ADR/override: ARCH-EVO-001 dependency direction
- Related traceability: Sprint 1 sequences 1-11; no product requirement change.

## ARCH-EVO-007: Updated overall sequences 5-8 and typed outcome events

- Change ID: CHANGE-051
- Date: 2026-10-02
- Developer: Yao Xiang
- Feature: Updated Order Service overall design comparison
- Original design or requirement: The previous overall source and Sprint 1 records used a synchronous Credit outcome boundary, deferred accepted-order reopening, and open questions for event transport.
- Problem discovered: The newly supplied overall design changes Sequences 5-8 to typed asynchronous completion/cancellation events, a transactional outbox, shared broker fan-out, independent Credit/User subscribers, and same-order `ABORTED` reopening before original expiry.
- Change type: Architecture or specification change
- Status: APPROVED DESIGN SOURCE; publish ordering superseded by ARCH-EVO-009
- Approved change: Treat `Order Service Overall Doc - Updated.pdf` as the current overall design source and synchronize persistent Markdown records. Do not change application code until the event/outbox/broker implementation proposal is explicitly approved.
- What was added: Four typed event contracts, event metadata/delivery rules, transactional-outbox consistency, independent subscriber responsibilities, and same-order reopening conditions.
- What was changed: Completion/cancellation Credit consequences are asynchronous events; reservation and `evaluateOpenEntry` remain synchronous; User consumes accepted-cancellation and overdue-completion facts.
- What was removed: The updated design removes the prior assumption that settlement/release must complete synchronously before the Order outcome is committed and removes the assumption that accepted reopening is outside the effective overall design.
- Why the change was necessary: The developer supplied a newer authoritative design source with materially different sequence, consistency, failure, and cross-service ownership rules.
- Alternatives considered: Keep the existing synchronous implementation and treat the PDF as advisory; implement broker code immediately from the PDF; synchronize documentation first and hold implementation for a feature-level proposal. The selected option preserves authority while preventing unapproved transport/schema assumptions.
- Trade-offs: Asynchronous processing improves Order response independence and subscriber isolation but requires outbox durability, event versioning, deduplication, retry/dead-letter recovery, observability, and new peer contracts.
- Affected architecture: Order application transitions, messaging/outbox boundary, Credit/User integration, and cross-service failure semantics.
- Affected class diagram: Add four event-specific publisher interfaces/matching publishers and typed event payloads; standalone diagram artifact remains stale and was not overwritten.
- Affected sequence diagram: Sequences 5-8 are replaced by the updated source flows; Sprint 1 sequence records remain the old implementation subset pending reconciliation.
- Affected data model: Additive transactional-outbox/event-record design is required; exact schema and migration are not approved.
- Affected contracts: Credit/User event subscriptions, event metadata, at-least-once delivery, acknowledgement, deduplication, retry, and dead-letter rules.
- Affected tests: New event publisher, outbox atomicity, consumer idempotency, retry/dead-letter, same-order reopening, and contract tests are required before implementation completion.
- Affected source files: No application source changed in this documentation synchronization turn; current source remains visibly nonconforming and blocked.
- Approved by: Yao Xiang supplied the updated design and requested comparison/synchronization; implementation approval is still required.
- Approval date: 2026-10-02
- Effective from: CHANGE-051 for architecture records
- Implementation status: Source fingerprint and Markdown authority chain updated; Java, tests, schema, peer services, frontend, and deployment remain unchanged.
- Supersedes: Synchronous Credit outcome assumptions in CHANGE-032, FEEDBACK-001 expected behavior, and corresponding Sprint 1 traceability wording.
- Superseded by: None
- Related ADR/override: CHANGE-051; no concrete broker technology or event decision ADR yet
- Related traceability: Project D1 F4.1.5-F4.1.11, F7, F10, F11, F12 amendment, NTH2, NTH4; Sequences 5-8.

## ARCH-EVO-008: Event-specific publisher package and diagrams

- Change ID: CHANGE-052
- Date: 2026-10-02
- Developer: Yao Xiang
- Feature: Publisher organization and updated Sequences 5-8 diagrams
- Original design or requirement: CHANGE-051 recorded four typed events and matching publisher responsibilities, but no requested source package convention or standalone updated diagrams had been added.
- Problem discovered: Future publisher code needs a consistent location and each event needs a separately reviewable interface/implementation pair and sequence flow.
- Change type: Developer-requested internal design structure; transport/contract implementation remains architecture-gated
- Status: Structure, requested method names, and diagram routing documented; application code pending unresolved decisions
- Approved change: Use lowercase Java package `messagingpublisher`, with `interfaces/` and `publisher/` subpackages; model one typed event publisher interface and matching class per event; preserve the same event-specific method name on both.
- What was added: `IOrderCompletionPublisher`/`OrderCompletionPublisher`, `IOpenOrderCancellationPublisher`/`OpenOrderCancellationPublisher`, `IAcceptedOrderCancellationPublisher`/`AcceptedOrderCancellationPublisher`, and `IOverdueOrderCompletionPublisher`/`OverdueOrderCompletionPublisher` class-diagram entries, plus separate sequence diagrams for updated Sequences 5-8.
- Why the change was necessary: The developer requested a predictable source layout and explicit diagrams for the four updated event flows.
- Alternatives considered: One generic publisher for every event (less explicit per-event contract); or one event-specific interface/class pair per event (selected to match the request and keep each method/route visible). A concrete Spring event or broker implementation cannot be selected without contradicting unresolved transport and peer-contract records.
- Trade-offs: Separate pairs make event-specific behavior easy to discover and test but add classes. Typed parameters carry required facts; exact payload schemas remain open. A shared `IEventPublisher` abstraction is shown as a marker pending confirmation.
- Affected architecture: Order event publisher package convention and outbox-to-publisher dispatch documentation. No data ownership or public HTTP API changed.
- Affected class diagram: `sprints/sprint-1/class-diagrams/updated-overall/publisher-class-diagram.md`.
- Affected sequence diagrams: `sprints/sprint-1/sequence-diagrams/updated-overall/sequence-5-complete-non-overdue.md` through Sequence 8; see the directory index.
- Affected data model: No schema designed or migration created; transactional-outbox table/locking remain open.
- Affected contracts: User-requested Credit/User routing recorded. Actual subscriber schemas/authentication/idempotency/retry/ack contracts remain unverified and are tracked in `FEEDBACK-002`.
- Affected tests: No tests added. Future implementation requires publisher mapping/dispatch, outbox atomicity, consumer idempotency/retry/recovery, reopen behavior, and provider contract tests.
- Affected source files: No Java source changed.
- Approved by: User requested the package structure, per-event pairs, method names, subscribers, and diagrams in this turn. This approval does not extend to unspecified event schemas, transport, outbox migration, or peer-service consumer implementation.
- Approval date: 2026-10-02
- Effective from: CHANGE-052 for documentation and package guidance
- Implementation status: The original layout/diagram request is implemented by CHANGE-054. Topic IDs and peer consumers remain external configuration/future work.
- Supersedes: None
- Superseded by: None
- Related ADR/override: ADR-009; CHANGE-051
- Related traceability: Updated overall design Sequences 5-8; F7.1, F10.1.4, F11.1.2, F11.2.3, NTH2.

## ARCH-EVO-009: Publish task event before status persistence

- Change ID: CHANGE-053
- Date: 2026-10-02
- Developer: Yao Xiang
- Feature: Updated overall Sequences 5-8 task publication
- Original design or requirement: CHANGE-051 and ADR-009 described an atomic Order state/checkpoint/outbox commit followed by asynchronous broker publication. The current `OrderTransitionService` still calls synchronous Credit settlement/release.
- Problem discovered: The user now explicitly requires each event to publish before the corresponding Order status is committed; a publication failure must leave status/checkpoint unchanged, and Order must not wait for consumer replies.
- Change type: Architecture/specification change
- Status: User-approved design; implemented by CHANGE-054.
- Approved change: Publish full-Order task event first; after transport confirmation, commit the Order status/checkpoint/receipt. On publish failure, do not commit the transition. Leave topic values as placeholders in each event-specific publisher. Treat Credit/User consumers as future peer work; make no peer-service source changes.
- What was added: Four `*TaskPublisher`/`I*TaskPublisher` pairs, generic `IEventPublisher<T>` transport boundary, complete Order snapshot payload, and publish-before-save sequence diagrams. Pub/Sub classes and transition integration are recorded in CHANGE-054.
- Why the change was necessary: The developer explicitly selected this ordering and responsibility boundary for the Order-side publisher implementation.
- Alternatives considered: Transactional outbox then publish (safer consistency but contrary to selected order); publish before save (selected); synchronous peer request/response (contrary to not waiting for the other service).
- Trade-offs: The selected order makes publisher acceptance the gate for status mutation and avoids consumer-response coupling. It cannot atomically coordinate an external broker with PostgreSQL; a later database failure can leave a consumed event while Order remains unchanged. At-least-once retries and event idempotency do not fix that semantic mismatch.
- Affected architecture: Transition orchestration, event publisher ports, all four updated event sequences, event payload data, peer-consumer assumption, and database failure semantics.
- Affected class diagram: `sprints/sprint-1/class-diagrams/updated-overall/publisher-class-diagram.md` uses `OrderCompletionTaskPublisher`, `OverdueOrderCompletionTaskPublisher`, `OpenOrderCancellationTaskPublisher`, and `AcceptedOrderCancellationTaskPublisher` with matching interfaces.
- Affected sequence diagrams: Sequences 5-8 now show publish success before status persistence and failure leaving current status unchanged.
- Affected data model: Full snapshot and overdue facts use Order/checkpoint history; no schema migration was needed.
- Affected contracts: Each task event carries full Order snapshot and event metadata; topics remain placeholders. No peer contract is verified. User authorizes assuming future consumers for this Order-only milestone.
- Affected tests: CHANGE-054 adds publisher confirmation/failure/placeholder tests and publish ordering, failure, route, and status tests.
- Affected source files: CHANGE-054 implements publishers and transition orchestration in Order Service.
- Approved by: User, in the current request.
- Approval date: 2026-10-02
- Effective from: CHANGE-053 for the requested Order-side design.
- Implementation status: Implemented in CHANGE-054; focused tests/verification are in progress.
- Supersedes: CHANGE-051/ADR-009 outbox-first publication order for these four events.
- Superseded by: None.
- Related ADR/override: ADR-009 updated; CHANGE-053.
- Related traceability: Updated overall Sequences 5-8; D1 F4.1.5-F4.1.11, F7, F10, F11, F12 amendment, NTH2, NTH4 where applicable.

## ARCH-EVO-010: Select Google Cloud Pub/Sub for Order task publishers

The emulator-support portion below is superseded by ARCH-EVO-023/ADR-021.

- Change ID: CHANGE-054
- Date: 2026-10-02
- Developer: Yao Xiang
- Feature: Order Service Sequences 5-8 typed task-event publication
- Original design or requirement: CHANGE-053 approved publish-before-status ordering, complete Order snapshots, per-publisher topic placeholders, and assumed future consumers, but the transport was not selected.
- Problem discovered: The publisher and transition workflow cannot return a real publish confirmation without a concrete transport client.
- Change type: Architecture or specification change
- Status: USER-APPROVED; IMPLEMENTED; `mvn verify` PASSED; live broker delivery pending
- Approved change: Use Google Cloud Pub/Sub's Java client and await the Pub/Sub message ID as the success signal. The later approved environment/topic/authentication rules are recorded in ARCH-EVO-023/ADR-021.
- What was added: Pub/Sub dependency management, a shared transport adapter, four typed publisher pairs, event snapshots, checkpoint-history retrieval, and publish-first transition orchestration.
- What was changed: Completion/cancellation transitions publish before mutating/saving status. Credit outcome work moves to the future event consumers; synchronous Credit settlement/release is removed from those four transitions.
- What was removed: Nothing from peer services; they remain outside the scope.
- Why the change was necessary: The user selected Google Pub/Sub and asked to proceed with implementation.
- Alternatives considered: Keep transport abstract (cannot actually publish); use another broker (not selected); selected Google Cloud Pub/Sub.
- Trade-offs: Pub/Sub provides a real broker acknowledgment and managed credentials. A later PostgreSQL commit can still fail after message acceptance, and a timeout can leave publication outcome uncertain. Topics must exist and be configured before live publishing.
- Affected architecture: Sequences 5-8, application transition orchestration, publisher infrastructure, event mapping, configuration, and Order status/checkpoint writes.
- Affected class diagram: `sprints/sprint-1/class-diagrams/updated-overall/publisher-class-diagram.md` and implementation packages under `messagingpublisher/`.
- Affected sequence diagram: Four diagrams under `sprints/sprint-1/sequence-diagrams/updated-overall/`.
- Affected data model: No schema migration added. Event snapshots use current Order data plus checkpoint history; overdue facts derive from accepted/delivered checkpoints at completion. `ABORTED` fits the existing status column; same-order reopening is excluded by ADR-001.
- Affected contracts: JSON typed event bodies include all current Order fields, repost plan, checkpoint history, metadata, and overdue facts where applicable.
- Affected tests: Added event mapping, publisher acknowledgment/failure/placeholder, transition ordering/failure/status-routing, and API endpoint/context tests. Full `mvn verify` passed all 57 tests and the configured line/branch coverage gates.
- Affected source files: Order Service only. No peer service or frontend source changed.
- Approved by: User ("google pubsub. Please start coding")
- Approval date: 2026-10-02
- Effective from: CHANGE-054
- Implementation status: Code is in progress; Maven verification pending after the initial compile found checked `IOException` handling that is being corrected.
- Supersedes: Unselected transport in CHANGE-053.
- Superseded by: None.
- Related ADR/override: ADR-009; CHANGE-053.
- Related traceability: D1 F4.1.5-F4.1.11, F7, F10, F11, and completion-time overdue amendment.

## Supersession and synchronization

## ARCH-EVO-011: Bind order transitions to requester/courier ownership

- Change ID: CHANGE-055
- Date: 2026-10-02
- Developer: Yao Xiang
- Feature: Order acceptance, progress, accepted cancellation, open cancellation, and completion authorization
- Original design or requirement: The aggregate bound courier progress to `courierId`, requester completion/open cancellation to `requesterId`, but accepted cancellation was documented and implemented as requester-owned; acceptance checked `OPEN` status but did not reject a stale non-null assignment.
- Problem discovered: Accepted cancellation must be performed by the assigned courier, acceptance must not overwrite an existing assignment, and receipt replay returned an order before the caller's role was revalidated.
- Change type: Architecture or specification change, explicitly approved by the user's request and recorded in ADR-010.
- Status: USER-APPROVED; IMPLEMENTED; full Maven verification passed (62 tests; coverage gates passed).
- Current rule: User Service verifies requester/courier identity and eligibility; the aggregate verifies requester ID or assigned courier ID. Acceptance requires an unassigned `OPEN` order and rejects self-acceptance. Accepted cancellation is courier-owned. Completion and `OPEN` cancellation remain requester-owned.
- Alternatives considered: Controller-only ownership checks (rejected because domain transition safety would rely on an outer layer); new ownership/schema fields (unnecessary with existing requester/courier identifiers).
- Trade-offs: Domain checks preserve invariant enforcement regardless of caller; role lookup before receipt replay may require User Service availability for command retries.
- Affected artifacts: `Order`, `OrderAssignmentService`, `OrderTransitionService`, aggregate/application tests, ADR-010, CHANGE-055, updated overall Sequence 7, Sprint requirements/acceptance tests, service contracts, traceability, current sprint and usage log. No schema or peer contract changes.
- Approved by: User, explicit request on 2026-10-02.
- Effective from: CHANGE-055.
- Supersedes: The requester-as-actor wording for accepted cancellation in the updated overall Sequence 7 document and previous implementation.
- Related traceability: D1 F3, F4.1.1-F4.1.7, F5.1, F13 and updated overall Sequence 7.

## Supersession and synchronization

## ARCH-EVO-012: Unify completion publication

- Change ID: CHANGE-056
- Date: 2026-10-02
- Developer: Yao Xiang
- Feature: Completion publication and overdue-dependent peer policy
- Original design or requirement: CHANGE-053/ADR-009 separated non-overdue completion for Credit and overdue completion for Credit and User.
- Problem discovered: User Service needs every completion to apply either the late penalty or on-time score decrease; separate routing omitted on-time completions.
- Change type: Architecture or specification change
- Status: USER-APPROVED; IMPLEMENTED; full `mvn verify` passed (62 tests; line/branch gates passed)
- Approved change: Publish one `OrderCompletionTaskEvent` for every successful completion, with the full Order snapshot, `overdue`, and `overdueAt`. Credit and User consume the event and apply their own policy. At the time of CHANGE-056, publish-before-status remained effective; CHANGE-063/ADR-013 later supersedes that ordering. Order never awaits peer replies.
- What was added: Overdue facts on the shared completion DTO, unified completion tests, sequence/class diagrams and peer contract coverage for both subscribers.
- What was changed: Completion flow, publisher inventory (four pairs to three), and completion subscriber routing.
- What was removed: The overdue-only DTO, interface, publisher, topic setting, and extra Sequence 8 completion diagram.
- Why the change was necessary: User must receive all completions regardless of whether the delivery exceeded its time limit.
- Alternatives considered: Keep split messages and subscribe User to both (two routes and schemas); unified event selected for one stable completion contract with an explicit overdue flag.
- Trade-offs: Consumers branch on the overdue fact; both branches share event identity, versioning, and full Order data.
- Affected architecture: Completion orchestration, Pub/Sub event payload, User/Credit consumer expectations; no database schema, frontend, topic ID, or peer source change.
- Affected class diagram: `sprints/sprint-1/class-diagrams/updated-overall/publisher-class-diagram.md`.
- Affected sequence diagram: Generic completion is `sprints/sprint-1/sequence-diagrams/updated-overall/sequence-5-complete-order.md`; old overdue-only Sequence 8 removed.
- Affected contracts: `docs/service-contracts.md`, `docs/peer-service-api-feedback.md`, and Sprint 1 contracts.
- Affected tests: Factory mapping and transition publication tests cover overdue true/false in the same event type; full Maven verification passed 62 tests with line/branch gates.
- Affected source files: Order Service only; peer consumers remain absent/unverified.
- Approved by: User, explicit request on 2026-10-02.
- Effective from: CHANGE-056.
- Supersedes: Separate completion routes in ADR-009/CHANGE-053; Pub/Sub remains effective; publish-before-status was later superseded by ARCH-EVO-015.
- Related ADR/override: ADR-011.
- Related traceability: Updated overall Sequence 5 and D1 completion requirement.

## ARCH-EVO-013: Add admin-authorized paginated Order query

- Change ID: CHANGE-057
- Date: 2026-10-02
- Developer: Yao Xiang
- Feature: Order Service all-orders admin query
- Original design or requirement: NTH1 assigns the administrator dashboard to Admin Service; Sprint 1 excluded Admin Service integration and Order's contract had no admin list operation.
- Problem discovered: dashboard data must be read from the Order data owner, and the local Order security chain permits all requests while production does not map User Service roles to method authorities.
- Change type: User-approved Order-side API addition; security implementation refinement.
- Status: USER-APPROVED; IMPLEMENTED; local-profile security behavior superseded by ARCH-EVO-014; production admin role requirement remains effective.
- Approved change: admin-only `GET /api/orders`, optional status, one-based pageable response, and Supplier-style User Service role lookup with local mock configuration.
- Alternatives considered: Admin Service direct database access (rejected by ownership); event projection (unnecessary for a direct paginated query); unprotected query (rejected); synchronous Order-owned query (selected).
- Trade-offs: each HTTP-mode request resolves current roles through User Service; lookup outages fail closed; local mock configuration is for local development.
- Affected artifacts: ADR-012, CHANGE-057, EV-DEC-003, Order security, controller/query/repository/persistence, tests, contracts, diagrams, traceability, change log, active work, usage log. No schema or peer source changes.
- Approved by: User, explicit request on 2026-10-02.
- Effective from: CHANGE-057.
- Related traceability: NTH1, `docs/requirements-traceability.md`.

## ARCH-EVO-014: Restore local/production security profile split

- Change ID: CHANGE-062
- Date: 2026-10-03
- Developer: Yao Xiang
- Feature: Order Service API authentication profile behavior
- Original design or requirement: the committed Order security configuration permitted all requests outside `prod` and required Firebase bearer authentication in `prod`; CHANGE-057 later enabled admin-role checks while adding the admin order query.
- Problem discovered: the current uncommitted security configuration applied authentication and method-level admin checks locally as well as in production, blocking the requested unauthenticated local workflow.
- Change type: User-approved restoration of the established environment-specific security behavior.
- Status: USER-APPROVED; IMPLEMENTED; full `mvn verify` passed (89 tests; line and branch coverage gates passed).
- Approved change: restore `permitAll()` for non-production profiles and enable OAuth2 bearer authentication plus method-level `ROLE_ADMIN` checks only in `prod`. Public health and Swagger paths remain accessible in production.
- Alternatives considered: keep Firebase authentication locally (rejected by the user); remove the admin role check in all environments (rejected); profile-gate the security chain and method security (selected).
- Trade-offs: local API behavior is convenient for development but does not exercise authentication/authorization; production remains protected and must be verified with valid Firebase tokens and roles.
- Affected artifacts: Order `SecurityConfiguration`, production-only method security configuration, admin security tests, README, ADR-012, CHANGE-057/059 follow-up notes, change log, active-work record, and AI usage log. No API shape, diagrams, data model, persistence, Compose, or peer-service source changed.
- Approved by: User, explicit request on 2026-10-03.
- Effective from: CHANGE-062.
- Related traceability: NTH1 and ADR-012 admin query; production-only authentication/role authorization.

## ARCH-EVO-015: Transactional outbox for outcome events

- Change ID: CHANGE-063
- Date: 2026-10-03
- Developer: Yao Xiang
- Feature: Order completion and cancellation event delivery
- Original design or requirement: CHANGE-053 instructed Order to publish before persisting the related status transition, leaving a possible event for an unchanged Order if the later database commit failed.
- Problem discovered: PostgreSQL and Pub/Sub cannot commit atomically; publish-first can expose outcome facts for a transition that never commits.
- Change type: User-approved architecture/specification change
- Status: USER-APPROVED; implemented; full Maven verification and focused PostgreSQL migration/JPA checks passed (final full-suite count recorded in active work).
- Approved change: Commit resulting Order state, checkpoint, command receipt, and serialized outbox event together. Dispatch immediately after commit and use a Spring cron job to recover due rows. Pub/Sub failure does not undo a committed transition. Use lease-based claims, bounded exponential retry, stable event IDs, and at-least-once consumer deduplication.
- Alternatives considered: retain publish-first (rejected for the resulting database/broker gap); after-commit callback only (rejected because a process crash could lose the only attempt); transactional outbox with post-commit fast path and cron recovery (selected).
- Trade-offs: adds a table, migration, relay, retries, and retained published rows; duplicates remain possible after Pub/Sub accepts and before the published marker commits. Cron reduces latency only as recovery; Cloud Run scale-to-zero/request-based CPU may not run it while idle.
- Affected artifacts: V2 migration, outbox entity/domain repository/JPA adapter, transition service, event snapshot mapping, after-commit listener, dispatcher, scheduler, tests, updated Sequences 5-7/class diagram, service and project contracts, traceability, current-sprint context, ADR/change indexes, AGENTS/skills, AI usage log.
- Affected data model: additive `order_event_outbox` table with event payload, publication state, attempts, retry time, lease, published time, and last error.
- Affected contracts: typed event payload unchanged except it now represents resulting post-transition state and the incremented Order version; delivery is at least once.
- Affected tests: transition/event payload tests, dispatcher retry/claim tests, persistence mapping tests, and clean/upgrade PostgreSQL Flyway migration tests.
- Approved by: User, explicit approval in the preceding conversation turn.
- Effective from: CHANGE-063.
- Supersedes: ARCH-EVO-009 publish-before-status ordering for completion/cancellation; preserve full snapshots, event types, Pub/Sub, topic placeholders, and peer-service boundary.
- Related decision: ADR-013.
- Related traceability: Project D1 F4.1.5/F4.1.7/F5.1 and Sequences 5-7.
- Remaining deployment issue: current Cloud Run min-instances-zero/request-based CPU does not guarantee cron recovery while idle; no cost-affecting deployment setting was changed.

## ARCH-EVO-017: Spring-scheduled OPEN expiry event

Historical decision: the separate expiration event recorded below was superseded for event naming/topic by ARCH-EVO-021/CHANGE-071/ADR-019. Spring scheduling, EXPIRED state/checkpoint, and outbox behavior remain effective.

- Change ID: CHANGE-065
- Date: 2026-10-03
- Developer: Yao Xiang
- Feature: Expiration of due, unassigned OPEN orders and Credit refund trigger
- Original design or requirement: Sprint Sequence 9 set due unassigned OPEN orders to EXPIRED and synchronously called Credit to release the reservation. Updated overall Sequence 6 was revised to contain both requester-triggered OPEN cancellation and scheduled expiry, whose outcome differs by event.
- Problem discovered: The expiry transition's direct Credit release call bypassed the event-driven refund pattern requested for OPEN-order outcomes and differed from the updated Sequence 6 contract.
- Change type: User-approved architecture/specification change
- Status: USER-APPROVED; implementation in progress
- Approved change: Use Spring `@Scheduled` with configurable cron to scan due unassigned OPEN orders. Persist EXPIRED state, checkpoint, and full-snapshot `OrderExpirationTaskEvent` in the same transaction. Dispatch via the existing after-commit outbox path. Credit consumes the event and refunds/releases; Order does not synchronously call Credit or await a subscriber. Keep requester cancellation in the same Sequence 6 with `CANCELLED` and `OpenOrderCancellationTaskEvent`.
- Alternatives considered: Keep synchronous Credit release (rejected by user); use an external scheduler trigger (viable operational option but user selected Spring scheduler); select an event per Order (selected as consistent with updated Sequence 6 and durable-outbox flow).
- Trade-offs: Order remains independent of Credit refund availability, but refund is eventual and automatic repost reservation may run before Credit processes the refund. At-least-once delivery requires consumer deduplication. Spring scheduling requires an active, scheduler-capable instance; Cloud Run scale-to-zero/request-based CPU does not guarantee expiry during idle periods.
- Affected architecture: Lifecycle processing, Order outbox, Credit refund subscription expectation; no peer code, shared Compose, deployment billing, or database schema change.
- Affected class diagram: `sprints/sprint-1/class-diagrams/updated-overall/publisher-class-diagram.md`.
- Affected sequence diagram: `sprints/sprint-1/sequence-diagrams/updated-overall/sequence-6-cancel-open-order.md`; Sprint Sequence 9 remains lifecycle scope, now explicitly tied to overall Sequence 6.
- Affected data model: No new Order/outbox columns or migration.
- Affected contracts: `docs/service-contracts.md`, FEEDBACK-002 and `OrderExpirationTaskEvent`; Credit refunds the expired OPEN reservation; User is not subscribed.
- Affected tests: Expiry state/checkpoint/outbox intent, stable full-snapshot event mapping, event-specific publisher dispatch, scheduled trigger, and row-lock query.
- Affected source files: Order Service only; Credit/User consumers not modified.
- Approved by: User, explicit requests to add an expiration event, match updated overall Sequence 6, and use Spring scheduler, 2026-10-03.
- Effective from: CHANGE-065.
- Supersedes: Synchronous Credit `release` in lifecycle expiration.
- Related decision: ADR-015.
- Remaining deployment issue: Cloud Run idle schedule guarantee and local emulator topic initialization remain unresolved; no deployment or root Compose change authorized.

## ARCH-EVO-018: Exclude checkpoint history from Order events

- **Change ID:** CHANGE-067
- **Date:** 2026-10-06
- **Developer:** Yao Xiang
- **Feature:** Typed completion, cancellation, and expiration event payloads
- **Original design:** CHANGE-053/054 included all checkpoint history in every full Order event snapshot.
- **Problem discovered:** Checkpoint history grows over the Order lifetime and is separately persisted and available through Order Service history queries. Replicating it in each event increases payload size without being needed for Credit settlement/refund or User penalty/score actions.
- **Change type:** User-approved architecture/specification change
- **Status:** USER-APPROVED; implementation in progress
- **Approved change:** Omit the `checkpoints` field from `OrderEventSnapshot` and all serialized outcome events. Retain all current Order/repost fields and event-specific facts. Continue to persist/query checkpoints and calculate completion overdue facts internally from accepted/delivered checkpoints.
- **Alternatives considered:** Keep all history in every event (rejected due unbounded/repeated payload); include only the latest checkpoint (not needed by current subscribers); omit checkpoint history (selected).
- **Trade-offs:** Smaller messages with size independent of checkpoint count; a subscriber cannot build a full timeline from events and must query Order Service if future behavior requires it.
- **Versioning:** Keep `eventVersion: 1` as the current pre-consumer contract. No peer consumer was found. If an older-contract consumer is discovered, coordinate a versioned transition before rollout.
- **Affected architecture:** Publisher event mapping and peer event contracts; Order checkpoint ownership/history endpoints remain unchanged.
- **Affected class diagram:** `sprints/sprint-1/class-diagrams/updated-overall/publisher-class-diagram.md` removes checkpoint snapshot from `OrderEventSnapshot`.
- **Affected sequence diagrams:** No interaction changes; messages continue to carry event envelope and resulting Order fields without history.
- **Affected data model:** None; no database migration.
- **Affected contracts:** Peer feedback, service contracts, event candidates, sprint context, and consumer handoff specify checkpoint-free snapshots.
- **Affected tests:** Assert JSON excludes `order.checkpoints`, retains Order/repost fields and completion overdue facts, and preserves internal history-based overdue calculation.
- **Affected source:** `OrderEventSnapshot`, event mapper/factory, and obsolete checkpoint-event-snapshot DTO only; peer services untouched.
- **Approved by:** User, explicit request on 2026-10-06.
- **Remaining risk:** No live Pub/Sub/peer consumer compatibility test; no consumer implementation was found in the inspected repositories.

## ARCH-EVO-019: Synchronously assign the Credit reservation before acceptance

- **Change ID:** CHANGE-068
- **Date:** 2026-10-06
- **Developer:** Yao Xiang
- **Feature:** Courier acceptance and eventual Credit settlement recipient
- **Original design:** Sequence 3 locally changed the Order to `ACCEPTED` after verifying courier identity, with no Credit-side association made at assignment time.
- **Problem discovered:** Credit's reservation has a nullable courier field, but the inspected provider API has no operation to set it. Without recording the courier before completion, Credit cannot reliably transfer funds to the actual assignee.
- **Change type:** User-approved architecture/specification change
- **Status:** USER-APPROVED; ORDER-SIDE STUB IMPLEMENTED; PEER API OPEN; MAVEN VERIFICATION BLOCKED LOCALLY
- **Approved change:** Validate the locked `OPEN` Order, synchronously call `CreditServicePort.assignCourier`, validate Credit's confirmation, recheck expiry, and only then persist `ACCEPTED`, checkpoint, and command receipt. Keep a local in-memory mock for mock-peer mode and a typed HTTP adapter for the proposed route. Do not modify Credit Service.
- **Alternatives considered:** Depend only on the later completion event (does not synchronously bind or confirm the reserved transaction before acceptance); change Order status first (violates required Credit-before-acceptance ordering); add a synchronous Credit port with a local mock and proposed HTTP contract (selected).
- **Trade-offs:** Credit knows the intended recipient early and failure leaves Order unchanged, but acceptance now depends on Credit latency/availability and holds the Order row lock/database transaction open while waiting. The remote Credit update and local database commit cannot be atomic; Credit must define safe idempotent recovery. The current user bearer forwarding in the proposed HTTP adapter is not an agreed service-authentication design.
- **Affected architecture:** `OrderAssignmentService`, `Order` validation, `CreditServicePort`, mock/HTTP adapters, and the future Credit completion consumer consistency check.
- **Affected class diagram:** `sprints/sprint-1/class-diagrams/updated-overall/accept-order-credit-assignment-class-diagram.md` adds the port, adapters, request/response DTOs, and Order/application/persistence dependencies; the index links it. No canonical source class image was present to directly edit.
- **Affected sequence diagram:** `sprints/sprint-1/sequence-diagrams/updated-overall/sequence-3-accept-order.md` captures Credit confirmation before Order mutation.
- **Affected data model:** No Order schema change. The Credit reservation's existing courier field is the intended provider target.
- **Affected contracts:** FEEDBACK-004, service contracts, sprint contracts, and acceptance criteria specify the proposed request/response and open security/failure questions.
- **Affected tests:** TDD acceptance order/failure tests, local mock assignment/idempotency/settlement tests, and HTTP adapter response validation tests were authored. Focused Maven execution stopped during production compilation with the local Java fatal error `Cannot close compiler resources`.
- **Affected source:** Order Service only; no sibling Credit source or frontend files changed.
- **Approved by:** User, explicit follow-up authorizing the mock/contract stub, 2026-10-06.
- **Effective from:** CHANGE-068.
- **Related decision:** ADR-017.
- **Related traceability:** Sprint Sequence 3, F3/F13 and `docs/requirements-traceability.md`.
- **Remaining risks:** Credit route/authentication/idempotency/reconciliation are unagreed and unimplemented; HTTP mode will fail until provider work lands. Maven verification must be rerun under a working Java compiler; no live integration is claimed.

When a newer rule is approved:

1. Mark the old entry/rule `SUPERSEDED` and link the new evolution record.
2. State the new current rule and effective date.
3. Update every future-work navigation point that could otherwise select the old rule.
4. Preserve the original text and history.

After approval, inspect and update this chain:

```text
Requirement
-> Architecture diagram
-> Class diagram
-> Sequence diagram
-> Data model
-> Contract
-> Test
-> Implementation
```

Update each affected artifact or record an explicit blocker. A feature cannot be complete when implementation follows a changed design while any approved documentation still describes the superseded design.

## Required response after a design or implementation change

Use the per-turn response contract in `docs/completion-reporting.md`. Under `Design Decisions`, include the discovery classification, approval status, approver when known, current effective rule, alternatives, and trade-offs. Under `Affected Artifacts`, identify every applicable link in the synchronized design chain. Report stale artifacts, pending approval, blockers, and required human review under `Remaining Issues`.

The required report is an audit baseline, not the entire response. Add meaningful architecture-proposal, migration, compatibility, rollback, decision, or next-step sections when the current scenario benefits from them. Do not create a separate Markdown file only for the response; update the persistent records that actually changed.


## ARCH-EVO-026: Central role annotations

- Classification: approved architecture refinement, 2026-10-08; ADR-024 / CHANGE-079.
- Supersedes duplicated production action role-context calls and production mock-role default for Order only.
- User explicitly requested contextual centralized annotations. Use standard Spring method security; no handwritten RoleAspect, no role ordering, no cross-request authorization cache. Token verification/roles precede annotations; adapters verify client identity and keep fresh courier eligibility. Domain ownership remains under lock. Local/system flows unchanged.
- Source PDFs remain unavailable; effective approved Markdown and actual User role/eligibility source inspected.

## Effective compact-event amendment — CHANGE-092 / ADR-031 (2026-10-09)

Yao Xiang approved the exact seven-field Order-only payload: eventId, eventType, orderId, orderStatus, creditAmount, occurredAt, courierId. This replaces full snapshots and overdue facts ONLY for OpenOrderRefundTaskEvent and OrderCompletionTaskEvent. AcceptedOrderCancellationTaskEvent retains its existing v1 envelope/snapshot. Internal outbox versions and Pub/Sub eventVersion attribute remain (compact schema v2); topic names and DB schema unchanged. Old pending snapshot rows normalize at dispatch from their saved facts, with stable IDs. Lifecycle/outbox scheduling, locks, synchronous Credit assignment/reset and ADR-025 abort behavior remain. Historical v1 descriptions below are superseded for these two bodies. Credit currently requires the old snapshot and overdue; FEEDBACK-009 is INCOMPLETE_OR_INCOMPATIBLE. User completion penalties need an agreed separate overdue source. User approved implementing Order-only and documenting peer work; live integration remains blocked, Sprint [~].

### ARCH-EVO-034 — Compact event contract

Architecture/specification change approved by Yao Xiang 2026-10-09; CHANGE-092 / ADR-031. Supersedes payload portions of ADR-011/016/018/019 for refund/completion only. Exact seven keys; internal metadata; saved legacy conversion; no data-model migration. Actual Credit consumer is incompatible (FEEDBACK-009), User overdue source unresolved. Order implementation verification is separate from BLOCKED integration; original history retained.

### ARCH-EVO-035 — Per-order lifecycle failures

Implementation/design refinement approved by the explicit user request (Yao Xiang, 2026-10-09). CHANGE-093 documents why catching inside one batch transaction is insufficient and replaces it with per-order REQUIRES_NEW execution and DB ID selection, preserving row rechecks and atomic state/outbox. No product/peer/schema/cadence change. Deterministic verification: 44 focused pass; fresh Maven verify 232 total / 211 passed / 21 Docker skips / 0 failures/errors, existing coverage gates pass (91.44% lines / 82.10% branches). Four new live PostgreSQL isolation/locking/query regressions remain unverified without Docker; mock Spring transaction-proxy tests do not replace them. Sprint [~]; CHANGE-093 holds exact evidence.

### ARCH-EVO-036 — Personal Order filters and polling

User-approved UI/query specification refinement, Yao Xiang 2026-10-09, CHANGE-094/ADR-032. No new service interaction: reuse personal endpoint and auth, add optional exact enum filter behind repositories, DB content/count before pagination including ABORTED immutable views; reset frontend page and cancel stale reads. Selected over client-only filtering/new endpoints; more frequent visible Order reads (5 seconds vs15) remain guarded. No schema/peer/event/cron/paused retry change. Source/test, class/sequence refinement and contracts recorded; integrated completion remains unverified.

### ARCH-EVO-037 — Personal filter options match mode

User-approved UI refinement, Yao Xiang 2026-10-09, CHANGE-095 under ADR-025/032. Replace shared all-status options with explicit requester/courier option lists on OrderStatusFilter; requester excludes ABORTED, courier excludes OPEN/EXPIRED/CANCELLED. No backend/contract/schema/peer/auth change. Class/caller responsibility and current context amended; two tests observed failing first, full 60 frontend tests and lint/typecheck pass; eight browser fixture mode/width checks pass. Live integration/normal font-dependent build gaps remain.

### ARCH-EVO-038 — Independent outbox recovery items

Implementation refinement authorized by Yao Xiang's explicit per-job isolation request, 2026-10-10, CHANGE-096 under ADR-013/026. Replace active batch claiming with SQL-filtered bounded IDs and per-event REQUIRES_NEW claim/marker/retry writes; outside catch includes failures while saving retry state. Enqueue remains in the original atomic Order transaction; external publication cannot roll back. Individual claims cost more round trips but isolate failures and start the lease immediately before publication. Existing legacy batch API remains unused by the scheduler. Tests-first regression: 1 expected failure (retry database unavailable), target/change096-red.log. Focused 43 tests passed, including eight PostgreSQL lifecycle/outbox isolation tests; fresh source-only wrapper-selected Maven 3.9.16 / Java21 offline verify: 252 tests passed, 0 failures/errors/skips, including 28 PostgreSQL tests. JaCoCo 95.99% lines / 83.72% branches; unchanged >=80% gates passed. Logs: target/change096-focused.log and target/change096-verify.log; reports target/change096-source-check/target/. Docker28.4.0; isolated PostgreSQL15 Testcontainers; new isolation suites mock all cloud publishers. No application database, peer service, real topic or cloud setting changed.

## ARCH-EVO-034: Swagger current-origin metadata (CHANGE-098)

Classification: implementation detail within the approved gateway/OpenAPI runtime. Live staging Swagger was HTTPS gateway but generated server was HTTP backend. A dedicated Order OpenApiConfiguration supplies relative / to resolve against the specification origin. No business interaction, auth/CORS policy, trusted-header or infrastructure change. Tests first: one expected server-URL failure and one existing documentation pass (target/change098-red.log). Fresh source-only wrapper-selected Maven3.9.16/Java21 offline verify:253 tests,0 failures/errors/skips, including28 PostgreSQL tests; coverage96.00% lines (1441/1501),83.72% branches (468/559), unchanged >=80% gates pass. Generated target/openapi.json servers=[{url:"/",description:"Current gateway or service origin"}];160 current POM/source/test/resource files equal the fresh tested copy. Logs/reports target/change098-verify.log and target/change098-source-check/target/, evidence target/change098-evidence.json. git diff --check passes. No local application container rebuild or real authenticated browser request; no commit/push/cloud deployment. Staging remains unchanged until Order Service redeployment.


CHANGE-144 / ADR-049: approved architecture refinement. Supersedes unshipped adjustment-event draft with synchronous User replacement and durable pending recovery; no new topic. Per-attempt outcome/reward replacement and Report deadline removal as user-approved product amendments. Initial financial/penalty events unchanged.


CHANGE-146: user-approved product/architecture supersession of ADR-049 replacement and ADR-046 admin completion. Deferred monotonic scoring uses an Order-local atomic write and existing final outbox events; no User replacement integration. Historical migrations/audit preserved.


## Effective CHANGE-147 — Report reply privacy and active policy choices (2026-10-19)

Approved Yao Xiang: admin resolution reply is visible only to the submitter and reviewing admins; courier participants still see resolved status/time and other existing case information. Local prototype list/detail responses redact resolutionNote on copied snapshots, and UI hides the reply in courier views. Production Report Service is still missing and must enforce this with verified caller identity, never client-supplied roles. Live Reports remain Coming soon.

COURIER_UNRESPONSIVE is retired from active policy lists and new admin apply/cancel choices. Its enum/amount remain only for historical persisted rows and existing outbox events; immutable migrations and saved penalties are not rewritten or waived. Six active policies; three selectable report penalties (wrong location4, damage4, theft10). Cancellation UI selects one radio case and sends the existing one-element list; stored maximum semantics and existing penalty topics remain unchanged.

Report cards omit Order descriptions; closed cards are muted but remain navigable. Requester/courier names link to admin profiles, IDs have separate copy rows. Admin table names, email, roles and IDs truncate visually while full values remain in titles/copy/details. No sibling backend or shared runtime/CI/cloud configuration changes. See CHANGE-147.


## Effective CHANGE-153 — Hold eligibility and paused funding (2026-10-19)

Yao Xiang approved placing a requester-owned completion hold on any Order status except COMPLETED. This supersedes delivered-only placement and the old blanket terminal-state rejection for new holds. Preserve status, ownership/role checks, bound report IDs, locked transaction and release history. A hold placed after cancellation/expiry records a hold only; it does not restore lifecycle state or reverse settled funding.

The user explicitly clarified that ordinary cancellation, expiry and courier abort (and their refunds/penalties) must remain paused, in addition to requester/automatic completion. START, PICKUP and DELIVER continue normally; acceptance keeps its existing behavior. Admin cancellation remains the previously approved explicit override. Auto-completion and expiry retain held-row SQL exclusion. Report mock submission fixtures remain delivered-item samples; this change broadens the real Order hold endpoint, not a production Report Service implementation.

No schema, event/topic, frontend, shared configuration or sibling backend change. This is eligibility validation only. See CHANGE-153 and ADR-052.


## Effective HANDOFF alignment - CHANGE-159 / ADR-056 (2026-10-28)

See [reporting-order-integration.md](reporting-order-integration.md) for the current active-requester list/atomic report hold contracts, approved current-snapshot retry clarification (no new migration), explicit admin No penalty override, ready User/Credit admin links and deferred synchronous resolution design. New public hold placement is PUT /api/orders/mine/active/{orderId}/report-holds/{reportId} with requireAssignedCourier; caller identity comes from the token. SQL list is GET /api/orders/mine/active. Holds still pause ordinary funding/penalty outcomes and allow START/PICKUP/DELIVER. Existing admin cancellation overrides held funding.

Admin null/empty cancellation selections now suppress scoring even when provisional appliedPenalty was stored; selected additions compete with the stored maximum. Prior claims that No penalty cannot waive stored scoring are superseded for ADMIN CANCELLATION only. The provisional audit remains; requester/auto completion and Apply Penalty policy are unchanged.

Credit selected-user balance and User admin profile/promotion/deactivation are source-ready and linked with independent balance error handling. User paginated directory remains missing. Reporting source and non-callback resolve/result/conditional-restore contracts are missing; coordinator/live report resolution is explicitly deferred, not mocked as completed. No sibling backend, shared config, topic, migration or GCP edit.


## Effective ready Admin integration — CHANGE-160

CHANGE-160 / ADR-057 (Yao Xiang, 2026-10-28): all non-Report Admin sections use ready provider APIs in base Compose, HTTP-peer Compose, staging and production. Generic /api/orders/admin-mock routes and frontend transport are removed. User search retains the category dropdown with ID only, adapting existing admin profile lookup into a single-result page; blank/clear makes no peer call and name search remains pending. Reports alone retain /api/orders/admin-mock/reports with independent ORDER_REPORT_DEMO_ENABLED / FOC_REPORT_API_MODE settings gated by local environment plus Auth emulator; cloud Reports remain Coming soon. Report-only fixture store/mapper replace generic Admin mock CRUD. No schema, score, Order lifecycle, provider authorization or sibling backend changes. Feedback now contains only pending work; historical records are archived in the same docs folder.

See [pending peer contracts](peer-service-api-feedback.md).

CHANGE-160 implementation complete: ADR-057 ready-only Admin transport and separate Report-local gate verified by656 backend/common tests,252 frontend tests, image/runtime/config checks; no schema/lifecycle/peer implementation change. Source-ready integrations are not claimed deployed.

## Effective real User directory and resolution display — CHANGE-161

CHANGE-161 / ADR-058 (Yao Xiang,2026-10-29) supersedes CHANGE-160 ID-only/blank-directory behavior: GET /api/users/admin/search supplies the initial real User page and optional exact Firebase ID/literal case-insensitive username search, Mongo count/filter/sort/paging, size1..100 and active-admin authorization. User Service edits are explicitly limited to this endpoint/DTO/query, tests/test dependency and maintainer handoff; legacy routes/model/role/penalty/deactivation behavior unchanged. Frontend requests20, keeps ID default and enables Name, with no generic mock fallback. Admin resolution is full-width below Repost information; retired waiver fields/empty admin values are hidden in UI only. No Order lifecycle/schema/saga/config/cloud change. Only Report remains a missing Admin HTTP integration; separate subscriber/Supplier guard follow-ups remain.

Contract/handoff: ../../user-service/user-servicehandoff.md. Verification: CHANGE-161.

CHANGE-161 verification complete: ADR-058 endpoint/query/DTO integrated with actual Mongo/HTTP evidence and existing role chain; no Order saga/persistence or sibling Supplier/Credit change. See CHANGE-161 and User maintainer handoff.


## Effective Report resolution saga — CHANGE-162 / ADR-059 (2026-10-29)

Approved by Yao Xiang on order-service/admin-ui-linking: implement a guarded Order contract stub while Report Service is absent. Initial callback-free Report resolve is synchronous HTTP with admin Firebase token/reply; Order persists a bound command and possible-effect marker before the call. Confirmed remote result permits one locked transaction releasing only that report hold plus SUCCEEDED/saved result. Failed or uncertain local success chooses separate durable generation2 compensation through the existing Pub/Sub outbox. Authenticated exact-binding result inbox commit, not broker ACK, confirms reversal/fence. Committed local success is never compensated after a lost response. Pending/reconciliation holds stay active and manual release is guarded even after transport disablement.

V18 adds independent Report journal/inbox; no placement-snapshot backfill, Credit journal change or old migration edit. Existing minute scheduler selects due IDs in SQL (limit20), with per-command transactions/catches; no new whole-batch timer. New conditional admin resolve/status APIs and dedicated Google OIDC result receiver default disabled. Configuration/.env.example document explicit topics/URL/identity. No Report backend, GCP provisioning, deployment activation or frontend change. Reports stay local sample/cloud Coming soon. Existing progress/funding/penalty/admin-cancel rules are retained.

Report must implement operation preimage/revision checks, idempotent resolve, generation fences/tombstones, conditional restore and durable result outbox. This supersedes earlier proposed HTTP restore/result-query requirements only for Report resolution. Proposed exact protocol, diagram, migration and activation gates: docs/report-servicehandoff.md (relative to Order root); ADR-059 and changes/CHANGE-162-report-resolution-compensation-saga.md. Tests use explicit peer fixtures, not a verified live Report integration.


## Approved Report response window and early resolution — CHANGE-163 / ADR-060 (2026-10-29)

Yao Xiang confirms the courier response deadline is required. Report persists/exposes responseDeadlineAt and changes to READY_FOR_REVIEW on a timely response or deadline expiry without response. This supersedes earlier no-deadline guidance; no new duration is selected here. Admin may resolve either unresolved status; still-awaiting cases require a UI warning/confirmation that the courier has not responded and still has time. Required reply is stored as resolutionNote with resolvedBy/resolvedAt and is visible only to submitter/admin. Violation category changes remain undecided.

Documented Report provider responsibilities retain ADR-059: synchronous callback-free resolution with admin token, atomic report/operation-preimage/revision journal, stable command deduplication, generation2 compensation/fencing and durable authenticated result. Restore actual prior state/reply, reconcile the original deadline, and preserve newer work. No Order wire change or new confirmation flag is introduced. Report source is absent; this is a documentation milestone, not implemented Report/UI behavior. Local sample Report behavior is unchanged, Order saga defaults disabled and cloud Reports remains Coming soon. Exact peer requirements/tests: docs/report-servicehandoff.md (relative to Order root).


## Automatic repost retry repair — CHANGE-164 (2026-10-29)

Yao Xiang explicitly requests repeated automatic repost attempts until success. Existing NTH4/ADR-055/V16 flow is retained: SQL-only due selection, original NOWAIT lock/unique pending command guard, refund/requester/location checks, one forward Credit effect per immutable attempt, durable compensation on uncertainty, and atomic successor/link/plan-used/result commit.

Safe completed automatic rejections no longer permanently exclude the original. Each later eligible minute pass may register a fresh server-only AUTO_REPOST:<originalId>:retry:<UUID> command/candidate after the previous attempt is COMPLETED/REJECTED, FULLY_COMPENSATED and its Credit step is FAILED or COMPENSATED. First legacy key, all old candidate IDs/results/fences and public/peer payloads stay intact. Pending/reconciling/uncertain work blocks another attempt; success is replayed rather than repeated. DB selection prioritizes older due work over recently failed plans and remains bounded100; latest-attempt SQL is actor/order scoped, newest-first/limit1, not an in-memory history search.

No attempt-count cutoff is imposed on safe later attempts. Retry stops when a successor exists or the configured plan expires/is disabled/used; holds and deactivation/pending guards remain. Unresolved or exhausted compensation publication is not bypassed and retains the existing operator recovery requirement. No new schema, API, topic, credentials, timer, flag, frontend or sibling/backend/cloud change. Existing automatic-repost/compensation activation gates remain unchanged. Tests and rollout evidence: changes/CHANGE-164-automatic-repost-retry-until-success.md (relative to Order root).


## Effective Report integration - CHANGE-166 / ADR-061 (2026-10-29)

Yao Xiang approved the real Report backend, frontend and Order-owned saga integration on feat/reporting-service, then merged main and approved excluding OPEN from reporting. GET /api/orders/mine/active and its locked PUT report-hold endpoint now accept only ACCEPTED, IN_PROGRESS, PICKED_UP and DELIVERED for the verified requester. OPEN remains active for unrelated User/Supplier involvement guards. Both ORDER/COURIER report submissions require an assigned courier. A hold retry still returns the current snapshot; no snapshot migration.

Report now implements the exact callback-free admin resolve contract, atomic Firestore preimage/revision journal, compensation-before-original fencing, conditional restoration and stable result outbox. Admin Reports uses actual APIs in all frontend modes, required/private replies, an early-resolution warning, stable retry keys and pending-status polling; the obsolete sample/Coming soon frontend gate is superseded. The old Report release-first route rejects409. Report's deadline/filter job selects due IDs in Firestore and handles each transaction independently. Existing progress/funding/penalty rules and Order V18 remain unchanged. Cloud activation is explicit/default-off.

Source and operations: [Report handoff](../../reporting-service/HANDOFF.md), [saga contract](../../reporting-service/docs/order-resolution-saga.md), [change record](../changes/CHANGE-166-reporting-integration-and-reportable-orders.md). Earlier missing-provider statements describe prior evidence. Final verification results are recorded in CHANGE-166; no User/Credit/Supplier code, GCP resource or deployed flag is modified by this task. Report creation after an uncertain hold is a separate remaining reconciliation requirement.


## Report saga cloud configuration - CHANGE-167 (2026-10-30)

Yao Xiang approved Report-only shared provisioning and Report/Order deployment settings on feat/reporting-service. Existing Order Publisher grants must remain unchanged; no cloud provisioning or deployment is authorized by this code change. Added infra/gcp/configure-report-pubsub.sh with prepare/wire phases: Report runtime and per-environment push identities, result-topic Publisher, Google token minting/invoker permissions, checked existing subscription bindings, authenticated push, retry and retained dead-letter recovery. Wire preflights both backend services. Existing bootstrap owns Firestore/attachment buckets and permissions. Staging reuses the owner-created dev topics/subscriptions; production uses prod. Both deployment templates now pass the exact saga settings, direct backend audiences/URLs and the 20s Report-to-Order / 5s Order-to-Report timeout budget. Both flags remain false. No application Java/frontend/domain/API/schema/event changes.

Verification: existing CI infrastructure test entry point now discovers five Report provisioning cases; all 10 combined tests pass with fake gcloud and no credentials/network. Covers prepare idempotency, preserving existing pull subscriptions while wiring push, fresh creation, bad bindings/missing services rejected before mutation, separate environment names/identities and disabled deployment flags. ShellCheck passes the new script. Live local HTTP/PubSub integration evidence from CHANGE-166 remains valid; cloud delivery has not been exercised. Actual read-only GCP inspection confirmed all four topics and pull-only subscriptions, missing Report runtime account and absent Cloud Run Report service.

Operations and exact commands: reporting-service/HANDOFF.md, Cloud rollout. Run approved prerequisites and prepare, deploy with flags off, install indexes, wire, then explicitly enable/redeploy and validate staging. The script creates an extra report-resolution-dead-letter-{dev|prod}-v1 topic and recovery subscription; no manual creation required. Main application/Compose and sibling backend behavior are unchanged by CHANGE-167.


## Credit report context and courier reminders - CHANGE-168 (2026-10-30)

Owner: Yao Xiang on feat/reporting-service. The user requested optional Order context for credit issues, dates and a clearer order picker, an actionable duplicate-report message, and a red unanswered-report reminder. They explicitly approved completed-order context for either the requester or assigned courier, with no completion hold, no courier response request and direct admin review. Compact radio cards reuse the existing UI theme; all original report categories and active ORDER/COURIER restrictions remain.

Contracts: GET /api/orders/mine/completed?page=1&size=20 lists only COMPLETED orders where the verified caller is requester/current courier. GET /api/orders/mine/completed/{orderId} performs the same ownership/status check for Report backend validation; missing, unrelated and non-completed records return 404. No userId is accepted. Any recognized Order role may use these caller-scoped reads. SQL applies status/ownership/count/pagination; no all-order scan. OrderResponse.startedAt is nullable and derived from the stored deadline minus its declared delivery duration; no SQL migration or speculative legacy backfill.

CREDITS may remain unlinked or reference that completed order. GENERAL remains unlinked. Credit linkage is context only: courierId/deadline remain null, status READY_FOR_REVIEW, no hold or funding/penalty action. Credit resolution stays in Report's durable local journal even with an orderId; it never calls Order's hold-release coordinator or polls an Order command. Only submitter/admin can access these credit reports. ORDER/COURIER still require own assigned ACCEPTED/IN_PROGRESS/PICKED_UP/DELIVERED order and their existing hold/response flow.

Duplicate protection: public placeActive locks the Order and rejects another active report while preserving same-report retry. Report saveNewLinked also serializes creation with Firestore active_report_orders slots, checking both the referenced report and a bounded legacy active-report query before writing report+slot atomically. Slot records can reference resolved history; a new report is permitted after resolution. Existing generic historical/admin multi-hold data is preserved. The response says: This order already has an active report. Please resolve it before submitting another report. Other conflicts are not relabeled as duplicates. This does not introduce a separate cross-service report-creation saga; the known hold-commit/report-save uncertainty remains a separate recovery requirement.

Reminder: GET /api/reports/mine/response-count returns {count}, scoped solely by the JWT subject, using Firestore aggregate predicates on courierId/status/responseDeadlineAt. Expired, responded and resolved reports do not count. One visible/authenticated five-second poller in the app shell supplies both desktop/mobile Report an Issue navigation badges; admin mode does not poll, account changes cannot inherit another user's badge and transient failures retain the same user's last confirmed count. No new event topic, secret or env var is required.

UI: optional completed-order cards for Credits and required active-order cards for Order/Courier; truncated description/ID, status, Created and actual Started dates, explicit unknown/not-started labels, bounded scroll and existing photo validation retained. Empty optional link remains supported, active-hold cards show their report state, and API errors preserve the entered form. No User/Credit/Supplier backend or cloud resources were modified.

Verification (final application source): root reactor 669 Order +12 common tests, zero failures/errors/skips, Maven SUCCESS and coverage gates (Order BRANCH81.03%, LINE94.80%). Report61 tests, zero failures/errors/skips, coverage BRANCH81.63%, LINE95.13%. Initial client test reproduced rejection of a response missing hold fields; fixed with a separate completed-context DTO, not by weakening hold validation. Real local Order/Report HTTP, PostgreSQL/Firestore and two-way Pub/Sub integration passes all seven scenario groups, including the new ownership/credit-context/duplicate/count cases plus existing compensation/replay/lost-response/fencing cases. Test containers/processes removed. Root Surefire emitted a post-success fork shutdown timeout warning; Maven still completed with exit0, zero failed tests. No production timeout or coverage gate changed. Logs: order-service/target/change168-order-verify.log, change168-report-final.log, change168-live.log; reporting-service/target/live-order-resolution-result.json.

Final frontend verification: all274 tests pass across52 files after the credit-case UI refinements; TypeScript, lint and production build pass. Credit case details show Submitter account, no courier-response section, and use actual Order participant IDs for Order names. The Order OpenAPI MVC slice now includes CompletedReportOrderController, with explicit path assertions; all4 focused documentation tests pass and the regenerated artifact includes both completed-context routes and startedAt. Report response-count OpenAPI and Firestore index/context validation pass. Live staging/production and Google IAM delivery remain unverified; this change does not deploy/rebuild the user's running stack. Install the two additional Firestore indexes in reporting-service/firestore.indexes.json before cloud rollout (courierId/status/responseDeadlineAt and orderId/status). No SQL migration is needed; Firestore slots are created lazily with a legacy-record check.


## Effective reporting simplification - CHANGE-169 (2026-10-30)

Owner: Yao Xiang on feat/reporting-service. The user revoked the optional CREDITS/Order association introduced in CHANGE-168 and requested the initial submission UI, while retaining completed/cancelled Order lookup and the red courier reply reminder. This supersedes only credit association and picker layout from CHANGE-168; active reporting/hold restrictions, duplicate feedback and the response-count behavior remain.

CREDITS and GENERAL submissions are unlinked: no Order selector or lookup, orderId null, READY_FOR_REVIEW, no reported courier, response deadline, completion hold or automatic credit adjustment. Sending a nonblank orderId for either category returns400. ORDER/COURIER keep the existing active-only associated-order dropdown. The card/row/date alternatives are removed from this form. A supplied initialOrderId is ignored for unlinked categories. Form contents/photos and the helpful active-report message remain on failure.

Retain GET /api/orders/mine/completed and /api/orders/mine/completed/{orderId}. Add the matching GET /api/orders/mine/cancelled and /api/orders/mine/cancelled/{orderId}. OrderCreditHistoryController replaces the internal CompletedReportOrderController class name without changing the completed URLs. List endpoints return the existing one-based Order page, with status/ownership/count/pagination in SQL; detail returns404 for wrong status, missing or unrelated orders. Requester/current assigned courier only, from verified principal, with any recognized Order role. Read-only history: no Credit ledger access, hold, funds or penalty changes. These APIs are independent of Report submission. Expiry also has refund behavior in the existing system; the requested retained history scope here is COMPLETED/CANCELLED, not a statement that other statuses have no Credit activity.

Remove the now-unused Report getCompletedOrder HTTP adapter/interface method and CompletedOrderContext DTO. Keep reading historical linked credit reports and resolving them locally through the existing Report journal; no database records are deleted or backfilled. The Report result/compensation contracts and topics remain unchanged. No SQL/Firestore migration or new index/env/role is required. Existing completed-query metadata, including nullable startedAt, is retained as response compatibility; the form does not display it.

Preserve GET /api/reports/mine/response-count and the red badge in normal desktop/mobile Report an Issue navigation, including five-second visible/authenticated polling, caller isolation and deadline filtering. No User/Credit/Supplier backend, CI workflow, cloud setup, running container or application database mutation is part of this change. Backend Java, Report form/tests and existing documentation are the affected slice. Tests and final evidence are recorded below after verification.


## Effective CHANGE-170 - 2026-11-01

Local follow-up classification: Implementation detail and completion of already approved local integration. Preserve trusted validation explanations in RETRY and map existing hold reason codes in the frontend for historical rejections. No command state, financial rule, compensation contract or schema changes. User reproduced404 from disabled local routes. Local Compose now enables both saga endpoints with existing approved topics/push contracts in the private emulator, never GCP, and nests20s/5s timeouts. Bootstrap is idempotent; both Compose configs and eight real Nginx/HTTP/Firestore/PostgreSQL/PubSub scenarios pass. Cloud settings remain unchanged; user browser retry remains to confirm their record.

Yao Xiang on hfix/report-service approved Report resolution response/recovery fixes, meaningful held-action rejection messages, Report-to-Orders exact-search navigation, ORDER/GENERAL-only new submissions with legacy readability, and COURIER_BAD_ATTITUDE=2. Return fresh Report responses without forwarding downstream HTTP framing headers. Preserve business rejection messages only before possible Credit effects; retain compensation afterward. V19 expands existing deferred-penalty constraints without changing saved rows or old migrations. Existing saga, holds, event schemas/topics and production flags remain unchanged. User penalty consumer integration is still missing in the inspected checkout. See changes/CHANGE-170-report-resolution-and-feedback-hotfix.md and reporting-service/HANDOFF.md for implementation and verification evidence.

## Effective CHANGE-171 / ADR-064 — courier Errand reports (2026-11-01)

User-approved: ERRAND lets the currently assigned courier report ACCEPTED, IN_PROGRESS, PICKED_UP or DELIVERED Orders, directly READY_FOR_REVIEW without self-response/deadline/reminder. ORDER stays requester-only; GENERAL unlinked; historical COURIER/CREDITS readable. GET /api/orders/mine/active adds mode=courier (default requester). Existing hold body adds reporterRole=COURIER (default REQUESTER). Verified role/token subject and SQL current ownership/status scope are mandatory; placement remains locked/transactional and hold rows bind the actual requester. New Report requesterId is actual owner; reporterId remains submitter. Legacy linked non-ERRAND records fall back to reporterId. Frontend selects the correct scoped list and labels submitter correctly. Replies remain submitter/admin only. Existing one-active-report, funding pause, continued delivery and resolution/compensation stay unchanged. No new SQL migration, topic, GCP or User/Credit/Supplier backend change. Deploy Order/Report/frontend together; older Report binaries cannot read new ERRAND documents. See changes/CHANGE-171-courier-order-reports.md and docs/decisions/ADR-064-courier-errand-reports.md for approval, design and verification. Implementation and verification in progress; prior170 staged work preserved.

## CHANGE-172 — active-report error feedback (2026-11-01)

Yao Xiang on hfix/report-service. User clarified generic feedback occurs when submitting another report. Form now shows the specific backend/client reason as the alert title, replacing "Could not submit". Duplicate-report checks and known hold rejection/saved-command UI use "This order has an active report. Please resolve it before proceeding." Report's HTTP adapter recognizes both historical and current wording. ORDER/ERRAND stale-selection tests retain form content and never show success. The initial cancellation example also exposed a real hold-version regression: a genuine hold increments version, so authorized owners now see the hold before a stale-version rejection; unrelated-caller precedence remains unchanged. No funding, authorization scope, API/schema/topic or workflow change. Existing context/owner/PDF fingerprints match. Full verification in progress; prior staged171/170 work preserved. Evidence: changes/CHANGE-172-active-report-error-messages.md.

## CHANGE-173 — default Order category (2026-11-02)

Yao Xiang on hfix/report-service; user-authorized frontend default only. Missing/empty category now starts ORDER; explicit ERRAND/GENERAL and retired/invalid GENERAL fallback remain. Screenshot's empty Description/0 counter explains client validation stopping before POST; keep required explanation and backend rules. No backend/schema/config change. Existing reporting tests and direct default checks, lint/build planned; rebuild only local frontend. No new low-impact tests or broad backend rerun. Prior changes/staging preserved. See changes/CHANGE-173-default-order-report-category.md.


## Effective CHANGE-174 / ADR-065 ? unified Order reports (2026-11-02)

Yao Xiang approved ORDER for either the requester or current assigned courier; GENERAL stays unlinked. The opposite participant sees Against me and a response reminder and has 24 hours to provide an explanation/evidence. Reply or deadline makes the case READY_FOR_REVIEW. A missed response never automatically cancels or penalizes; admin review decides. Early admin resolution retains its warning. New ERRAND submissions are retired; resolved history remains readable. Unresolved ERRAND cases upgrade transactionally once to ORDER with a fresh 24-hour window, using bounded rotating batches in the existing scheduler and reconciliation on access.

GET /api/orders/mine/active?mode=participant SQL-filters owned/current assignments and reportable states before pagination; hold PUT accepts reporterRole=PARTICIPANT and verifies the actual locked participant's role/token identity. Existing requester/courier defaults remain. Report reporterId is submitter, requesterId/courierId are actual Order participants, and additive respondentId is the opposite participant. Additive responseExplanation exposes the reply; courierResponse and AWAITING_COURIER_RESPONSE remain compatibility wire names, displayed as Response/Awaiting response. No new SQL migration, status, topic, env flag, GCP resource or sibling User/Credit/Supplier implementation. Private admin replies remain submitter/admin only. Funding hold and delivery progression are unchanged.

Existing resolution/compensation preserves actual participant bindings, and captures a normalized legacy preimage so rollback does not reset the response deadline. Participant report/count reads are scoped in Firestore; their per-participant result sets are currently filtered/paged in memory. The existing single-field indexes suffice for the rotating legacy and participant queries. Deploy Order, Report and frontend together; avoid rolling back to the superseded requester-only behavior. Verification in changes/CHANGE-174-unified-order-report-responses.md; frontend under ../frontend/src, USER requester/courier and ADMIN impacted. This amendment supersedes CHANGE-171/173's separate ERRAND choice/direct review, not historical records.


## Effective CHANGE-175 / ADR-066 ? separate categories, two-sided responses (2026-11-02)

User-directed supersession of CHANGE-174's unified new-submission category: ORDER is submitted by the actual requester and the assigned courier replies; ERRAND is submitted by the currently assigned courier and the actual requester replies. GENERAL remains unlinked. Both linked categories use the existing24-hour response window, Against me view, opposite-participant notification and evidence response. Reply or deadline -> READY_FOR_REVIEW; admin decides any cancellation. Existing early-resolution warning, private admin reply, funding hold, delivery progression and guarded resolution/compensation remain.

Frontend ORDER uses the existing requester active selector; ERRAND uses mode=courier. Report chooses REQUESTER/COURIER hold role from category and validates the authoritative participant snapshot. One active report is enforced by orderId across BOTH categories: changing category cannot create another case until resolution. The duplicate error links to incoming cases. Existing generic respondentId/responseExplanation and compatibility response/status fields are retained.

New ERRAND reports keep their original deadline through reconciliation and rollback. Legacy unresolved ERRAND without deadline/response receives a fresh window once while retaining ERRAND; responded/resolved history is not reopened. Saved courier ORDER cases from the preceding unified design retain their existing category/bindings/replies/deadlines and remain accessible. No new Order API/application code, schema/index/topic/env/deployment/shared configuration, GCP or User/Credit/Supplier backend change. See changes/CHANGE-175-separate-report-categories-with-responses.md and ADR-066 for verification. Applies to existing frontend/src USER Requester/Courier and ADMIN reporting views.


## CHANGE-176 ? pending-response navigation (2026-11-02)

Approved Yao Xiang: in USER mode, Report an Issue opens /reporting?tab=against-me when the existing response count is positive; zero/unknown opens the existing /reporting form. Desktop/mobile use the shared shell. Reporting tabs follow explicit URL navigation and preserve category/order query context. Background count changes only update the link/badge and do not switch the current tab or discard a draft. ADMIN navigation, backend/API/auth, report statuses/holds/saga, schema/topics/env and deployment settings unchanged. Existing frontend/src AppShell/ReportingHub and related tests updated. Verification: CHANGE-176; backend checks are not rerun for this UI-only change.


## CHANGE-177 ? Action-eligible orders filter (2026-11-02)

User-approved Yao Xiang: Admin Orders gains the existing Supplier-style Switch labeled Action-eligible orders, off by default. Eligibility is the current five cancellation states OPEN, ACCEPTED, IN_PROGRESS, PICKED_UP and DELIVERED, including held Orders; assigned active Orders can also receive a stored penalty. It does not bypass command authorization, contention/pending-request or version validation. No new lifecycle state or financial policy.

GET /api/orders (existing admin authorization) accepts optional actionEligibleOnly=false. True intersects the five states with exact Order ID, selected status and creation-date predicates in SQL BEFORE count/paging. Response and omitted/false behavior stay compatible. Frontend exact-ID queries use this SQL path when the switch is enabled. Switch/status changes reset page1 and row selection; enabling clears a conflicting terminal status, selecting a terminal status disables the switch. Clear restores defaults; ID/date filters otherwise stay. Report links start with the switch off. Only Admin Orders is implemented here; Reports Ready for review shortcut remains a proposal.

Affected source: Order AdminOrderController/OrderQueryService/repository port/persistence adapter; frontend/src AdminOrders/admin-api and shared current action eligibility constant; existing backend/frontend tests and required context/disclosure. Same database/index/schema/topic/env/shared config/service boundaries, no sibling backend or workflow/skill change. SQL filtering is an implementation refinement within the approved filter, not a new architecture. See changes/CHANGE-177-action-eligible-order-toggle.md for test-first and final verification evidence.


## CHANGE-178 ? matching inline admin filters (2026-11-02)

User requests Orders toggle on the status/search row and explicitly adds Admin Reports toggle. Existing AdminFilterForm gets an opt-in desktop four-column layout: Status, shorter flexible Order ID input, toggle, Search/Clear. Orders and Reports use it; narrower screens wrap and other admin search forms keep their original layout. Toggle controls match the40px field/button height.

Reports Ready for review is a UI shortcut for existing READY_FOR_REVIEW status, off by default. Enable selects it; disable selects All statuses; dropdown changes reflect the switch. Existing changeFilters resets page1 and retains applied ID; Clear resets both. Existing Report API/database paging/status filtering, grey viewable resolved cards and early admin resolution stay unchanged. Orders actionEligibleOnly SQL/status/page behavior remains unchanged. No backend/API/schema/config/broker/cloud or workflow/skill change; frontend source/tests/context only. Verification in changes/CHANGE-178-inline-admin-filter-toggles.md.


## CHANGE-179 - Courier suspension role context (2026-11-04)

Approved contract/security refinement, ADR-067: User retains courier roles and adds the suspension flag. Reuse current per-request role context, carrying verified suspension separately from roles. Add one explicit acceptance guard rather than broadening existing endpoint authorization. Reuse existing synchronous User lookup, command leases/uncertainty barrier, compensation journal/outbox and browser intent store. No new technology/service/broker/API operation, SQL schema or deployment resource. User implementation inspected read-only; tests distinguish contract fixtures from cloud integration. Earlier universal courier-eligibility checks are superseded only for Order consumption.


CHANGE-179 verification amendment:701Order+13common full scoped verify passes, no failures/errors/skips; branch81.28/line94.63%;321frontend tests, lint and both Docker builds/TypeScript pass. Initial environment and fixture failures are resolved; authoritative final log is target/change179-scoped-verify.log. No backend peers, schema/config/cloud change. Images built, application stack not started; browser/staging rollout pending. Full acceptance/negative-case traceability is in changes/CHANGE-179-suspended-courier-acceptance.md.


## CHANGE-180 - Existing Admin profile gains suspension actions (2026-11-04)

The explicit user request supersedes the earlier removal of Suspend from Admin Users. Reuse the existing profile/actions/confirmation and API normalization; no new service, endpoint, client authentication, persistence or broker mechanism. Shared confirmation labels/variant are optional with original deactivation defaults. User Service remains policy/authorization authority. Existing ADMIN gate and USER-mode behavior are unchanged. No new ADR is needed for this presentation extension. CHANGE-180 records test-first evidence and build/runtime limits.


## CHANGE-181 - Supplier query completeness and nullable create image (2026-11-09)

Implementation repair within existing HTTP contracts: consume every page for today's Order dropdown, normalize optional Admin create image to explicit null, reuse real catalogue types and existing form/loading primitives. No new architecture/ADR/schema/auth/broker. User also requests a scale design; CHANGE-181 proposes bounded searchable comboboxes and documents that the provider's cached findAll/in-memory search cannot scale to100million. Indexed Supplier-owned querying and cursors require separate approval; no external search service or database/index mutation is authorized or made. All-pages loading is explicitly interim, not the large-scale solution.


## CHANGE-182 - Approved bounded Supplier selection (2026-11-09)

User explicitly approves the revised optional-search-and-browse proposal. A single Order-feature SupplierSelector reuses installed Base UI Combobox, Input/Button and useApi; each instance owns bounded page/query/selection and request cancellation state. This replaces CHANGE-181 all-pages Order loading without changing its independent Admin image/type repair. Existing synchronous authenticated Supplier list remains matching; no new endpoint, backend, schema, service, event, cache/index infrastructure or ADR. Selection is not a reservation: existing backend pair validation remains authoritative. Backend currently caches/scans all suppliers; separately proposed indexed/cursor search is still unapproved. This records the UI refinement, not100million-scale readiness.
# ARCH-EVO-068 — Report creation uncertainty is rollback-only (2026-11-10)

- Classification: approved architecture/specification change
- Approval: user, 2026-11-10
- Records: CHANGE-184 / ADR-068
- Current rule: Reporting durably journals creation before Order effects. It never
  rolls a creation forward in background or queries hold state. Uncertain placement
  and failed activation are fenced and compensated through an Order lifecycle
  tombstone that also blocks late placement. Inactive pre-hold work expires after
  one hour. Resolution compensation remains separate and unchanged.
- Supersedes: CHANGE-166/ADR-061's open creation-reconciliation requirement and
  any proposal to recover creation by completing a report after the request.
- Affected artifacts: Reporting creation/storage/API/scheduler, Order hold API,
  V20 persistence and compensation push/result contracts, frontend Report form,
  AsyncAPI/OpenAPI, gateway and environment/provisioning records.
