# Approved Change Log

## CHANGE-158 - Gated real compensation integration

Vincent2026-10-27 approves actual transport and real local integration tests.
ADR-055: persisted-policy cutover repair, exact gateway isolation and default-off
local wiring; Credit recovery-fixture clock repair; unchanged message schemas.
See changes/CHANGE-158-real-compensation-integration.md for evidence/rollout gates.

## CHANGE-157 - Compensation CI fixture repair

Vincent requests reproducing/fixing upstream Maven verify. Correct the compensation
integration fixture's unsupported messaging mode and isolate its transport;
preserve real PostgreSQL scenarios, production validation and coverage gates.
See [CHANGE-157](../changes/CHANGE-157-compensation-ci-fixture-repair.md) for exact
CI root cause and RED/GREEN/full verification evidence. ADR-054/live gate unchanged.

## CHANGE-156 - Compensation-first recovery fixture milestone

Vincent-approved opt-in compensation policy for the initial three Credit mutations
and manual repost reservation. Durable step/final status, V15 command-owned outbox
references and result inbox; one initial financial attempt, fenced compensation
decision and matching-result completion. New HTTP mode fails closed. Actual Credit
consumer/result publisher, missing-key tombstones and safe clear reversal remain
FEEDBACK-017. See [change record](../changes/CHANGE-156-compensation-first-recovery.md)
and [peer handoff](../concurrency/compensation-workflow-handoff.md). Verification
evidence/limitations are recorded there; no whole-feature/Sprint completion claim.

## CHANGE-140 — Twenty-row admin table pages

Orders/mock Users table pages now request20, retaining server pagination and actual smaller result counts. See [CHANGE-140](../changes/CHANGE-140-admin-table-page-size.md).


## CHANGE-139 — Compact calendar toolbar

Compact table-top actions, calendar-only date controls and existing icon-only refresh. Real SQL admin date/status/ID search, local-day conversion, filtered totals and isolated mock equivalent. See [change record](../changes/CHANGE-139-compact-admin-toolbar-date-filter.md).


## CHANGE-138 — Admin Order resolution UI

Single selected-row toolbar, shared cancel/complete dialog, explicit penalty/no-penalty and preset/custom reason; optional backend persistence and V11 with compatible replay. See [change record](../changes/CHANGE-138-admin-order-resolution-ui.md) for verification and migration evidence.


## CHANGE-137 — Admin completion including report-held Orders

CHANGE-137 / ADR-046, approved Yao Xiang2026-10-17: AdminOrderController adds
POST /api/orders/admin/{orderId}/complete. Assigned ACCEPTED/IN_PROGRESS/PICKED_UP/
DELIVERED may become COMPLETED, including held Orders. Stored participant IDs must
match. Publish existing Credit completion event plus at most one highest selected
penalty addition; null/empty means WAIVED, no automatic overdue penalty or reward.
Locked atomic decision/checkpoint/receipt/outbox and bound ADMIN_COMPLETE replay;
hold history and actual timing preserved, no fabricated delivery. Ordinary hold
guards remain. Reuses V10 columns/topics; no migration, UI, peer or cloud change.
HTTP200 confirms local intents, not Credit settlement or User score application.


## CHANGE-136 — Admin controller consolidation and annotation imports

CHANGE-136 (Yao Xiang, 2026-10-17): AdminOrderController now owns both GET
/api/orders and POST /api/orders/admin/{orderId}/cancel. The separate cancellation
controller is removed; paths, roles, validation, transaction service and event
contracts are unchanged. OrderResponse imports Schema normally; JsonProperty
retains isCompletionHold/isOverdue and Schema documents nullable timing.


## CHANGE-135 — 2026-10-17

Approved START-based timing, additive nullable response fields, persisted admin
waiver/addition decision and SQL auto-completion selection. Removes query-based
reader. V10 migration; existing funding holds and event wires remain. Verification
and local migration results are recorded in changes/CHANGE-135-start-based-delivery-timing.md.


CHANGE-134 / ADR-044 (Yao Xiang2026-10-16): POST /api/orders/admin/{orderId}/cancel
accepts requesterId, nullable courierId and optional appliedPenalties. Admin-only;
all active/held states -> CANCELLED; locked stored participants, maximum one
addition, no successful reward; refund and optional penalty commit in outbox.
Common adds COURIER_UNRESPONSIVE=3. OrderResponse nullable isOverdue is calculated
from grouped checkpoint timings (actual delivery freezes result). Existing
roles/topics/schedulers unchanged; Report/User integration remains pending.


CHANGE-133 (Yao Xiang2026-10-15): nine merge conflicts resolved preserving both
workstreams; real selected-user Admin Credit history linked, paginated/error/retry.
Base mocks retained, balances pending; no global tab or sibling implementation edit.

CHANGE-132 (Yao Xiang2026-10-15): shared enum renamed PenaltySystemPolicy,
three static selection methods, Order imports and reward-helper adoption.
Tests/docs amended; constants/amounts/JSON unchanged, no peer/deploy change.

CHANGE-131 (Yao Xiang2026-10-15): D1 NTH2 shared enum complete with wrong
location4, mishandling/damage4, deliberate retention/theft10. Original3 cases,
automatic events and wire contracts retained. No Report/User enforcement added.

CHANGE-130 (Yao Xiang2026-10-15, ADR-043): ordinary foc-common Maven penalty
enum extraction only, Order first consumer; root wrapper/reactor, root-context
Order Docker/Compose/CI/staging and shared-change detection. Policy/event JSON
unchanged; no auth, peer implementation, database, frontend or cloud operation.

CHANGE-129 (Yao Xiang2026-10-14, ADR-042): shared-role User/Supplier active
involvement endpoints, SQL EXISTS/current relationships including held Orders;
two-field mapped responses. Missing/null supplier lookups show Deleted supplier.
420 backend/129 frontend tests, original coverage gates, lint/typecheck/build pass.
Peer callbacks/deletion coordination/browser rollout pending; no schema/config change.
CHANGE-128 (Yao Xiang2026-10-14, ADR-041): approved +2 accepted cancellation,
+1 overdue delivery and -1 successful delivery, explicit add/deduct events.
New abort publication replaced; Credit events and legacy outbox replay retained.
Exact courier payload/stable retry ID; actual User subscriber remains FEEDBACK-014.

CHANGE-127 (Yao Xiang, 2026-10-14): approved requester-owned active-Order holds,
forwarded Firebase auth, funding guards, SQL filters/locked rechecks and UI.
ADR-040/V9 implemented; immutable report insert prevents rebinding races;
stale completion returns report message.394 backend/126 frontend tests pass,
coverage/typecheck/lint/build pass. Local schema9 preserves seven Orders.
Report caller/release/browser/cloud rollout pending; full NTH2/NTH3 partial.

CHANGE-125 (Yao Xiang, 2026-10-13): central Admin font/theme scope matches shared
Geist Sans, regular14px data/badges/IDs and semantic colours. Headings/helper
hierarchy retained; missing balance text muted14px; map popups use shared theme.
Shared normal-profile implementation and backend/data/provider behaviour unchanged.

CHANGE-124 (Yao Xiang, 2026-10-13): scoped Order table body to regular14px, including
linked IDs/names, statuses and dates. Column headings remain distinct; all copy,
navigation/ellipsis/filter behavior and other table/detail typography unchanged.

CHANGE-123 (Yao Xiang, 2026-10-13): bound table Order ID width and use one-line
ellipsis via optional CopyId compact mode. Full-ID copy/title/detail/navigation
preserved; other ID displays and backend/config behavior unchanged.

CHANGE-122 (Yao Xiang, 2026-10-13): explicitly approved shared Compose selection
for Admin UI. Base pins mock, HTTP override live/demo-disabled; new request-time
FOC_ADMIN_API_MODE, cloud live-only. Existing backend HTTP peers/emulators and
partial119 integration remain. Verification recorded in122.

CHANGE-121 (Yao Xiang, 2026-10-13): apply120's responsive Order search pattern to
all Admin searches through shared form/action components. Users/Suppliers now
match Orders: fields first, actions below on mobile; inline on larger screens.
Single-UID live lookup uses the same wrappers. Existing behavior is preserved.

CHANGE-120 (Yao Xiang, 2026-10-13): screenshot-driven mobile Order filter fix.
Status and Order ID now share one responsive form/grid row, Search/Clear below
on mobile and inline on desktop. Layout only; existing119 integrations retained.

CHANGE-119 (Yao Xiang, 2026-10-13): explicit user-approved environment-aware Admin
adapter. Local emulator keeps samples; outside local completed real providers
are used, missing User/Credit features show Coming soon/disabled controls, no
mock fallback or peer/backend/config changes. Tests first; verification in119.

CHANGE-116 (Yao Xiang, 2026-10-12): user's clarification reverts115's Order
full-width/three-column/span changes. Original card dimensions/two-column grid
with Version/Item Description swapped; requester before courier preserved.
Supplier map/status changes remain; no backend/contract/data/config change.

CHANGE-115 (Yao Xiang, 2026-10-12): Order metadata then credits/wide-description
final row; requester before courier regardless of response key order. Remove only
Supplier list overview map; status badge moves to Location details heading.
Creation/detail maps and all business/API/backend behavior unchanged.

CHANGE-114 (Yao Xiang, 2026-10-12): Admin supplier maps/address suggestions/
draggable pins/manual sync; card deactivation removed; User columns separated;
Order details grouped with repost card, linked names and distinct copy IDs.
Frontend-only implementation/dependencies; existing mock API contracts reused.
Provider boundaries/limits and verification recorded in CHANGE-114/ADR-039.

CHANGE-113 (Yao Xiang, 2026-10-11, continued2026-10-12): dedicated Admin Order/
Supplier detail pages and upward User/Supplier action placement. Existing mock
exact-ID contracts, list functionality, guards and confirmations retained.
Frontend-only source/tests; no new backend endpoint or schema/config change.

CHANGE-112 (Yao Xiang, 2026-10-11): approved Admin prototype refinement: full
user profile/shared history view, selected-record routes, supplier badges,
aligned controls, individual Order columns/details and header mode switch only.
Order-local sample transaction API; ADMIN-API-006 pending real Credit contract.
Source/test verification is recorded in changes/CHANGE-112-admin-ui-profile-navigation.md.

CHANGE-111 (Yao Xiang, 2026-10-11): user-approved local Admin UI prototype on
order-service/admin-dashboard. Shell mode navigation, guarded three pages,
semantic adapter and Order-only sample HTTP store/DTOs/mapper. Explicit local
emulator gate preserves prod-security Compose and excludes cloud. Existing
providers/gaps documented in admin-peer-api-request.md. No real peer/account/
credit/Order/schema/cloud mutation; test evidence in change record. Real
administrative integration and overall Sprint completion remain [~].

CHANGE-111 verification:379 Order tests/full coverage gate; final10 API/OpenAPI;
146 frontend tests/typecheck/build, lint0errors/3 pre-existing warnings. Changed
Docker images built; local stack healthy, three admin routes200 and sample API
unauthenticated401. Real peer administration and visual browser check pending.

CHANGE-110 (Vincent, 2026-10-11): approved command polling race correction under
ADR-033/035/037/038; source/test386f58f. Pause individual status reads during
initial submission/local Continue; preserve frozen-key unknown-outcome recovery.
Eight tests RED then GREEN using actual visible-poll hook; final124 frontend
tests/28 files, typecheck/build pass; lint0errors/3 existing warnings. Backend,
Credit contracts, schema and deployment unchanged. Browser/rollout gates[~].

CHANGE-109 (Vincent, 2026-10-11): approved narrow profile merge frontend repair;
source/testd7f72a8. Current AuthProvider retained; account-keyed profile GET/PUT
through useApi, verified email sync/token refresh, failure retry, account-switch
guard and Edit navigation.116 frontend tests/typecheck/build pass; lint0errors/
3 existing login warnings. No backend/schema/infra/API changes. Exactcd41186
removes delete UI only: no new peer requirements. Browser/email/mobile/runtime/
strict gates[~]; CHANGE-109 and FEEDBACK-012.

CHANGE-108 (Vincent, 2026-10-11): approved ADR-038/ARCH-EVO-044 pending card recovery
and owner-only command display projection. Source9f2e054/942b790;373 backend/103
frontend pass; lint/typecheck/build pass; browser/rollout/strict gates[~].
Credit, financial policy, schema and general read permissions unchanged.

CHANGE-107 (2026-10-11, Vincent): approved ARCH-EVO-043 removal of the unused
expiry HTTP trigger and OpenAPI/docs operation; direct minute expiry/refund and
all repost-related routes retained. RED observed then 40 focused tests passed;
generated OpenAPI removal verified, runtime rebuild remains:
[record](../changes/CHANGE-107-retire-expiry-http-trigger.md).

CHANGE-106 (2026-10-11, Vincent): approved ADR-037 / ARCH-EVO-042 durable manual
repost, V8 original/candidate identity and command route, backend/UI recovery.
Source2c021b6;367 backend/90 frontend pass,94.76%line/80.23%branch. Local rollout
blocked by Docker engine500; strict record/human/browser/cloud gates remain[~].
No peer, automatic or deployment changes.

- CHANGE-105 (2026-10-11, Vincent): ADR-036 emulator-only local Compose with real
  HTTP peers; approved local Credit push-auth exception; cloud min1/always-CPU;
  durable legacy CREATE/ACCEPT/ABORT; relationship-protected reads; bound
  receipts/scoped event IDs; bounded async outbox, V6 FAILED/redrive, V7 binding.
  No cloud deploy or automatic-repost implementation. Evidence and handoff:
  changes/CHANGE-105-local-emulator-and-review-hardening.md.

- CHANGE-104 (2026-10-11, Vincent): ADR-035 actual Credit HTTP command gateway,
  paired key/generation headers, historical lookup/conditional compensation,
  enabled capability, bounded timeouts, real financial-provider tests and
  frontend regression. See changes/CHANGE-104-live-credit-command-recovery.md.
  No peer source/schema/event changes; tokenless recovery needs user Continue.

- CHANGE-103 (2026-10-10, Vincent): approved documentation-only AsyncAPI for the
  three current outgoing Pub/Sub contracts, exact schemas/examples, viewing guide
  and source-parity validator. No runtime or peer change; live gates unchanged.
  [Record](../changes/CHANGE-103-asyncapi-pubsub-documentation.md).

- CHANGE-102 / ADR-034 / ARCH-EVO-039 (2026-10-10, Vincent): approved shared
  minute recovery -> expiry -> completion orchestration; independent failures,
  existing guards and live recovery gate retained; implemented in `10fd76d`.
  28 focused / 301 full backend pass; 95.60% line / 81.95% branch coverage.
  Workflow-format and live peer gates remain; Sprint `[~]`.
  [Record](../changes/CHANGE-102-merged-minute-scheduler.md).

- CHANGE-101 (2026-10-10, Vincent): local excluded JWT signing learning note;
  [record](../changes/CHANGE-101-jwt-signature-learning.md). No security/source change.

- CHANGE-100 / ADR-033 / ARCH-EVO-038 (2026-10-10, Vincent): approved durable
  foreground Credit-command contract-stub slice; live HTTP recovery disabled;
  Order/frontend tests and V5 migration in progress.

| Change ID | Date | Status | Summary |
|---|---|---|---|
| [CHANGE-093](../changes/CHANGE-093-accept-cancel-concurrency-verification.md) | 2026-10-09 | Test slice locally verified; workflow/live gates remain | New pair 2/2; all five PG races 10/10 plus 49 related regressions, zero failures/errors/skips; test commit 827844b; no production/schema/peer changes |
| [CHANGE-092](../changes/CHANGE-092-postgresql-concurrency-verification.md) | 2026-10-09 | Order database race test unit verified; live recovery deferred | 8 real PostgreSQL races, both winner orderings; 215 tests/no skips; fresh 95.67% line/84.70% branch coverage; no production/peer/schema changes |
| [CHANGE-099](../changes/CHANGE-099-backend-expiry-api-regression.md) | 2026-10-10 | Verified locally: 19 focused / 258 full pass; no skips | Existing server-side 30-minute expiry rule verified through direct API; no production change |
| [CHANGE-091](../changes/CHANGE-091-field-errors-and-repost-window.md) | 2026-10-09 | Implemented; local tests recorded; live/browser gates open | Field-specific creation errors; new auto/manual min30, saved explicit plans grandfathered; no peer/schema/retry changes |
| [CHANGE-090](../changes/CHANGE-090-credit-push-security-interference.md) | 2026-10-09 | Narrow Credit repair verified locally; owner/live gates open | Push converter isolated from Firebase roles; 15 new bearer regressions, 80 clean Credit tests, 95.48% line/85.56% branch coverage; exact interference handoff; source commit 198cd7c |
| [CHANGE-089](../changes/CHANGE-089-powershell-compose-stderr.md) | 2026-10-09 | Script regression fix verified; live gates open | Windows PS5.1 harmless Compose stderr no longer aborts Setup; actual exit failures/private stdout/restoration retained; 11 native + 60 config + 16 ingress assertions pass |
| [CHANGE-088](../changes/CHANGE-088-local-live-credit-push.md) | 2026-10-09 | Local connector implemented/tested; live gates open | Isolated real Pub/Sub authenticated HTTPS push to local Docker Credit, scoped setup/check/pause and runbook; peer source/staging/data untouched |
| [CHANGE-087](../changes/CHANGE-087-integrated-credit-feedback-review.md) | 2026-10-09 | Documentation review completed; live integration not verified | Rules out implemented Credit routes/refund/completion handlers; retains reset/retry/auth gaps and records incompatible legacy accepted-cancellation subscription; no peer/app/cloud edits |
| [CHANGE-086](../changes/CHANGE-086-explicit-repost-expiry-and-persistent-failures.md) | 2026-10-09 | Implemented; local verification recorded; live gates open | Explicit automatic next expiry, strict timing and saved latest safe manual/automatic failure; V4 disables legacy no-expiry plans by Vincent's decision; background retries remain paused |
| [CHANGE-085](../changes/CHANGE-085-polling-and-repost-failure-ui.md) | 2026-10-09 | Polling/manual messages implemented; background retries paused | Auth-ready 15-second visible polling and semantic Credit failure text; user-authorized service-grouped peer handoff; no trusted credentials or retry worker |
| [CHANGE-084](../changes/CHANGE-084-repost-retry-polling-approvals.md) | 2026-10-09 | Approved design documented; not implemented | Polling, bounded same-ID temporary retries, short EXPIRED-card permanent failures; trusted peer credentials proposal only, implementation explicitly deferred |
| [CHANGE-083](../changes/CHANGE-083-diagram-cadence-and-repost-review.md) | 2026-10-08/09 | Cadence/Supplier repair verified; repost design pending | Shared minute job, 15-minute recovery, Supplier valid:false guard; target diagram and peer retry/auth feedback; 163 backend / 34 frontend tests |
| [CHANGE-082](../changes/CHANGE-082-sprint-2-3-lifecycle-implementation.md) | 2026-10-08 | Order slice implemented; local gates pass; production integration pending | V3 internal UUID and immutable courier attempts, every-abort reset/penalty, expired refund, requester repost filtering, replay authorization; 162 backend/34 frontend tests and  >=80% line/branch coverage |
| [CHANGE-081](../changes/CHANGE-081-sprint-2-3-scope-and-decisions.md) | 2026-10-08 | Historical partial approval; resolved/implemented by CHANGE-082 | Vincent's Order-owned Sprint 2-3 scope/history/events and local assignment mock; preserve approved old/new IDs and requester visibility override |
| [CHANGE-078](../changes/CHANGE-078-hourly-outbox-recovery.md) | 2026-10-08 | Implemented; static configuration checks passed; test suite not run | Hourly outbox recovery poll; preserves immediate after-commit publication, 15-minute expiry and minute auto-completion |
| [CHANGE-077](../changes/CHANGE-077-quarter-hour-ui-and-schedulers.md) | 2026-10-08 | Implemented; deterministic checks passed; visual/runtime checks pending | Quarter-hour creation/repost time picker; 15-minute expiry; the five-minute recovery setting is superseded by CHANGE-078; auto-completion remains every minute |
| [CHANGE-076](../changes/CHANGE-076-deployment-pubsub-topic-values.md) | 2026-10-08 | Configuration statically verified; cloud publication pending | Sets production Order publishers to the three prod-v1 topics and staging to the existing dev-v1 topics |
| [CHANGE-075](../changes/CHANGE-075-deterministic-ci-tests.md) | 2026-10-08 | Local tests/coverage passed; hosted CI rerun required | Fixes date-dependent acceptance tests, Jackson 3 event serialization tests, and incomplete legacy refund-event fixtures |
| [CHANGE-074](../changes/CHANGE-074-ci-compose-adc-config.md) | 2026-10-08 | Implemented; GitHub rerun required | Allows Compose static validation in CI without a developer ADC file, while keeping local ADC required |
| [CHANGE-073](../changes/CHANGE-073-real-pubsub-dev-topics.md) | 2026-10-07 | Implemented; Compose and real-cloud verification pending | Replaces the local Pub/Sub emulator with real Pub/Sub on three dev topics in the existing project; uses personal ADC locally and topic-scoped IAM |
| [CHANGE-072](../changes/CHANGE-072-48-hour-auto-completion.md) | 2026-10-07 | Source/docs implemented; focused tests blocked by local Java compiler failure | Adds a configurable scheduler that database-selects and row-locks `DELIVERED` orders after 48 hours and reuses the completion/outbox flow |
| [CHANGE-071](../changes/CHANGE-071-unify-open-order-refund-event.md) | 2026-10-06 | Implemented; Maven tests and Compose validation blocked by local toolchain | Replaces separate OPEN cancellation and expiration events/topics with one `OpenOrderRefundTaskEvent`; preserves `CANCELLED`/`EXPIRED` statuses; emulator topic initialization later superseded by CHANGE-073 |
| [CHANGE-070](../changes/CHANGE-070-confirm-credit-hold-reopen-contract.md) | 2026-10-06 | Order contract user-confirmed; Credit implementation pending | Finalizes FEEDBACK-003 as the agreed bodyless, Order-ID-based synchronous hold/reset contract; removes its “To be discussed” state |
| [CHANGE-069](../changes/CHANGE-069-order-version-local-to-credit-calls.md) | 2026-10-06 | Implemented; Maven verification blocked by local compiler failure; Credit APIs open | Minimize assignment/hold requests to Order ID and courier ID; keep Order versions local and event `orderVersion` |
| [CHANGE-068](../changes/CHANGE-068-credit-courier-assignment-contract-stub.md) | 2026-10-06 | Order-side stub implemented; Maven verification blocked by local javac failure; Credit API open | Link courier acceptance to a synchronous Credit assignment port, mock behavior, and proposed HTTP contract |
| [CHANGE-067](../changes/CHANGE-067-exclude-checkpoint-history-from-events.md) | 2026-10-06 | Implemented; Maven verification blocked by local Java compiler failure | Remove checkpoint history from published Order snapshots to keep event size bounded; preserve stored history and completion overdue calculation |
| [CHANGE-066](../changes/CHANGE-066-peer-service-contract-feedback-rewrite.md) | 2026-10-04 | Documentation updated; peer implementations remain unverified; FEEDBACK-003 later finalized by CHANGE-070 | Rewrites peer feedback with implemented HTTP request/response shapes, event payload fields and subscriber actions; originally recorded the Credit hold-for-reopen contract pending agreement |
| [CHANGE-064](../changes/CHANGE-064-accepted-cancellation-reopen-or-event.md) | 2026-10-03 | Implemented and verified; peer Credit contract open | Split accepted cancellation by expiry: synchronously hold Credit and reopen before expiry; publish after expiry for Credit refund and User penalty; document subscriber responsibilities |
| [CHANGE-062](../changes/CHANGE-062-restore-security-profile-split.md) | 2026-10-03 | Implemented; `mvn verify` passed (89 tests; coverage gates passed) | Restore anonymous local API access and production-only Firebase authentication/admin-role enforcement |
| [CHANGE-060](../changes/CHANGE-060-local-pubsub-emulator.md) | 2026-10-02 | Superseded by CHANGE-073/ADR-021 | Historical local Pub/Sub emulator setup; the current Compose stack uses real Pub/Sub dev topics and local ADC |
| [CHANGE-059](../changes/CHANGE-059-public-swagger-webjars.md) | 2026-10-02 | Implemented; `mvn verify` passed (88 tests; coverage gates passed) | Permit unauthenticated access to Swagger UI's `/webjars/**` assets while keeping protected Order APIs authenticated |
| [CHANGE-058](../changes/CHANGE-058-restclient-startup-bean.md) | 2026-10-02 | Implemented; `mvn verify` passed (87 tests; coverage gates passed) | Add the Spring Boot REST client starter so `SecurityConfiguration` receives its auto-configured `RestClient.Builder` during startup |
| [CHANGE-057](../changes/CHANGE-057-admin-paginated-order-query.md) | 2026-10-02 | Implemented; `mvn verify` passed (86 tests; coverage gates passed) | Add an admin-only paginated all-orders query with optional status filtering to support NTH1, using Supplier-style role verification; no frontend or Admin Service implementation |
| [CHANGE-001](../changes/CHANGE-001-spec-driven-workflow-setup.md) | 2026-09-23 | Completed | Established the persistent specification-driven/TDD workflow and recorded the supplied approved amendments; no production code changed |
| [CHANGE-002](../changes/CHANGE-002-sprint-1-developer-allocation.md) | 2026-09-23 | Completed | Added shared Sprint 1 developer allocation, ignored local identity, per-developer handoffs, branch/scope validation, and the non-negotiable completion gate |
| [CHANGE-003](../changes/CHANGE-003-courier-outcome-contract-split.md) | 2026-09-25 | Completed | Replaced the generic courier outcome discriminator/facts contract with explicit completed, overdue, and aborted operations; no production code changed |
| [CHANGE-004](../changes/CHANGE-004-architecture-approval-workflow.md) | 2026-09-26 | Completed | Added peer-service inspection, detailed design/API/event approval gates, approved communication boundaries, and explicit technology-conflict blocking; no production code changed |
| [CHANGE-005](../changes/CHANGE-005-per-turn-context-rehydration.md) | 2026-09-26 | Completed | Clarified that full Order Service workflow context is rehydrated before every relevant turn, including later turns in the same conversation; no product behavior changed |
| [CHANGE-006](../changes/CHANGE-006-persist-architecture-review-details.md) | 2026-09-26 | Completed | Persisted the exact D1 interaction-candidate registry, separate decision IDs, and detailed architecture-review templates; no event, broker, API, or product behavior was approved |
| [CHANGE-007](../changes/CHANGE-007-shared-nextjs-frontend-workflow.md) | 2026-09-26 | Completed | Added the shared Next.js frontend, responsive-web, application-role/mode, per-turn inspection, shared-development, vertical-slice, test, completion, and reporting workflow; no application code changed |
| [CHANGE-008](../changes/CHANGE-008-standardize-ai-usage-format.md) | 2026-09-26 | Completed | Corrected the Shared Next.js disclosure to the established project style and added one persistent AI-usage formatting authority; no application behavior changed |
| [CHANGE-009](../changes/CHANGE-009-architecture-evolution-tracking.md) | 2026-09-27 | Completed | Added implementation-discovery classification, persistent architecture-evolution/supersession tracking, artifact synchronization, and a unified post-change report; no application code changed |
| [CHANGE-010](../changes/CHANGE-010-foreign-service-api-verification.md) | 2026-09-27 | Completed | Added five-result foreign-API verification, one shared peer-feedback lifecycle, blocked/resume handoffs, and prototype-versus-verified integration rules; no application code changed |
| [CHANGE-011](../changes/CHANGE-011-per-turn-completion-reporting.md) | 2026-09-28 | Completed | Added one mandatory per-turn completion-report baseline with meaningful scenario-specific headers for advisory, partial, blocked, design, implementation, test, and verification turns; no application code changed |
| [CHANGE-012](../changes/CHANGE-012-order-service-architecture-flow-correction.md) | 2026-09-28 | Completed | Synchronized the corrected Order Service high-level diagram fingerprint and clarified that application components invoke outbound ports while domain rules return decisions/data; no external behavior or application code changed |
| [CHANGE-013](../changes/CHANGE-013-database-migration-workflow.md) | 2026-09-28 | Completed | Added the required versioned migration-file workflow, independent-local-database synchronization, peer handoff, schema verification, and migration-conflict rules; no application code or migration tool was added |
| [CHANGE-014](../changes/CHANGE-014-frontend-ui-style-baseline.md) | 2026-09-29 | Completed | Persisted the staging screenshot-informed shared frontend visual baseline, reconciled it with live Geist/shadcn/Lucide tokens, and wired it into the Order Service frontend workflow; no application code changed |
| [CHANGE-015](../changes/CHANGE-015-order-service-cloud-sql-cloud-run.md) | 2026-09-29 | Approved design; implementation in progress | Resolved the Order Service persistence/deployment conflict in favor of PostgreSQL on one Cloud SQL instance and Cloud Run with a public-IP Cloud SQL Java Connector; infrastructure provisioning and verification remain in progress |
| [CHANGE-016](../changes/CHANGE-016-beginner-learning-workflow.md) | 2026-09-29 | Completed | Added the reusable beginner learning workflow, general-versus-project-specific explanations, learning traceability, trade-off and approval guidance, and supplemental learning report details; no application code changed |
| [CHANGE-017](../changes/CHANGE-017-sprint-1-sequences-1-11-implementation.md) | 2026-09-30 | Approved; implementation in progress | Approved combined Sprint 1 sequences 1-11 implementation on `sprint-1/seq-1-to-seq-11`, single Order aggregate, Flyway, bearer-forwarding peer adapters, and deferred repost events |
| [CHANGE-018](../changes/CHANGE-018-local-compose-and-frontend-vertical-slice.md) | 2026-09-30 | In progress | Added local Order Service Docker/PostgreSQL orchestration and strengthened the rule that user-visible backend capabilities require a companion shared-frontend vertical slice or an explicitly recorded backend-only decision |
| [CHANGE-019](../changes/CHANGE-019-shared-file-boundary.md) | 2026-09-30 | Completed | Restricted Order Service work to sibling-read-only and minimal shared-file additions, requiring comment-only treatment for incompatible peer configuration and restoring non-Order User Service Compose changes |
| [CHANGE-020](../changes/CHANGE-020-small-atomic-change-practice.md) | 2026-09-30 | Completed | Persisted small atomic Git change, explicit-path staging, staged-check, commit-handoff, and peer-preserving local-stack rules; rechecked Compose without modifying sibling service folders |
| [CHANGE-021](../changes/CHANGE-021-spring-boot-flyway-runtime-fix.md) | 2026-09-30 | Completed | Added the Spring Boot Flyway auto-configuration module required for Boot 4.1.1, then verified clean local PostgreSQL migration, Order readiness, OpenAPI exposure, and unit tests; no sibling service files changed |
| [CHANGE-022](../changes/CHANGE-022-order-frontend-sequences-1-11.md) | 2026-09-30 | Implemented; verification in progress | Added the approved responsive Order Service frontend for sequences 1-11, authenticated requester/courier list queries, repost controls, mode switching, and Vitest/RTL setup; live peer and browser verification remain pending |
| [CHANGE-023](../changes/CHANGE-023-local-mongodb-compose-dependency.md) | 2026-09-30 | Completed; verification in progress | Added a temporary local MongoDB container and User Service dependency in root Compose without modifying sibling User Service code; local startup excluding the intentionally deferred Admin Service passed |
| [CHANGE-024](../changes/CHANGE-024-local-frontend-gateway-api-base.md) | 2026-09-30 | Completed | Configured the local frontend to send browser API requests to the gateway on port 8080 instead of the direct frontend port 3000; deployed configuration unchanged |
| [CHANGE-025](../changes/CHANGE-025-supplier-selection-cors-credit-registration.md) | 2026-09-30 | Implemented; verification pending | Added active Supplier Service-backed dropdowns, local gateway CORS preflight handling, and authenticated Credit Service registration-fact provisioning after signup; no sibling service source changed |
| [CHANGE-026](../changes/CHANGE-026-gateway-cors-header-deduplication.md) | 2026-09-30 | Implemented; runtime verification pending | Made the gateway the single CORS response boundary by hiding upstream duplicate CORS headers; no peer-service source changed |
| [CHANGE-027](../changes/CHANGE-027-order-card-supplier-display.md) | 2026-09-30 | Implemented; frontend/runtime verification pending | Resolved supplier references for human-readable Order-card labels and removed the user-facing Order ID; Supplier and Order contracts unchanged |
| [CHANGE-028](../changes/CHANGE-028-mode-menu-group-context-fix.md) | 2026-09-30 | Implemented; runtime retest pending | Fixed the Requester/Courier mode menu Base UI group-context crash by wrapping its label and options in the required menu group; no backend or peer-service changes |
| [CHANGE-029](../changes/CHANGE-029-dashboard-without-mode-switch-and-location-stability.md) | 2026-09-30 | Implemented; verification pending | Removed client-side mode switching, bound Order actors to User Service-confirmed identities, filtered self-orders from Browse Errands, and prevented supplier-ID flashes; no sibling service source changed |
| [CHANGE-030](../changes/CHANGE-030-order-expiry-validation.md) | 2026-09-30 | Implemented; frontend verification pending | Added client-side Order expiry validation and clear 30-minute guidance; backend/API/peer-service contracts unchanged |
| [CHANGE-031](../changes/CHANGE-031-creation-time-repost-choice.md) | 2026-09-30 | Implemented; verification pending | Made automatic repost selection and details creation-time only, rejected later configuration, and retained manual repost only for un-reposted expired orders; no peer-service source or schema changed |
| [CHANGE-032](../changes/CHANGE-032-credit-outcome-stub-exception.md) | 2026-09-30 | Superseded by CHANGE-051; historical implementation exception | Added the synchronous Credit outcome port, local validating mock, proposed HTTP settlement/release shapes, lifecycle credential forwarding, and traceability; no Credit Service source changed |
| [CHANGE-033](../changes/CHANGE-033-lifecycle-query-compile-fix.md) | 2026-09-30 | Implemented; Docker build verified | Updated automatic repost processing to use the explicit unassigned-order repository method after the lifecycle query rename; no peer-service source changed |
| [CHANGE-034](../changes/CHANGE-034-credit-mock-balance-model-and-verification.md) | 2026-09-30 | Implemented; real provider verification pending | Replaced the validation-only local Credit mock with deterministic reserve/settle/release balance behavior and recorded Java, frontend, and peer-test evidence; no peer-service source changed |
| [CHANGE-035](../changes/CHANGE-035-order-jacoco-coverage-gate.md) | 2026-09-30 | Configured; initial threshold failure resolved by CHANGE-036 | Added Order Service JaCoCo reporting and the required 80% line/branch verification gate; initial coverage was 40.25% line and 28.71% branch |
| [CHANGE-036](../changes/CHANGE-036-order-coverage-tests.md) | 2026-09-30 | Implemented; JaCoCo gate passes | Added Order Service domain, application, controller, API/error, peer-adapter contract, and local peer-credit integration coverage; 42 tests pass with 89.29% line and 83.25% branch coverage |
| [CHANGE-037](../changes/CHANGE-037-http-peer-smoke-profile.md) | 2026-09-30 | Implemented; runtime verification pending | Added a separate Compose HTTP-peer override for real User, Supplier, and Credit reservation smoke testing while preserving the default mock stack; no peer-service source changed |
| [CHANGE-038](../changes/CHANGE-038-http-peer-constructor-injection-fix.md) | 2026-09-30 | Implemented; Docker verification pending | Marked the production HTTP peer-adapter constructor for Spring injection after the HTTP-peer startup failed to find a default constructor; no peer-service source changed |
| [CHANGE-039](../changes/CHANGE-039-credit-ui-refresh-diagnosis.md) | 2026-09-30 | Diagnosed; frontend fix not yet implemented | Documented the difference between mock and HTTP reservation state and the frontend balance-refresh gap; no application or peer-service source changed |
| [CHANGE-040](../changes/CHANGE-040-credit-ui-invalidation-learning.md) | 2026-09-30 | Documented; frontend implementation pending | Recorded why a broker is unnecessary and specified post-mutation frontend credit invalidation; no application or peer-service source changed |
| [CHANGE-041](../changes/CHANGE-041-credit-ui-invalidation-implementation.md) | 2026-09-30 | Implemented; frontend verification pending | Added post-mutation credit-balance invalidation for order creation, repost, cancellation, and completion; no broker or peer-service source changed |
| [CHANGE-042](../changes/CHANGE-042-supplier-lookup-auth-race-diagnosis.md) | 2026-09-30 | Diagnosed; frontend guard fix pending | Identified a hard-refresh Firebase token race causing Supplier lookup 401 responses; no peer-service or API change |
| [CHANGE-043](../changes/CHANGE-043-supplier-lookup-auth-gate.md) | 2026-09-30 | Implemented; frontend/runtime verification pending | Blocked browser API calls until Firebase authentication and a bearer token are ready; added Supplier/Order effect guards and a token-gate unit test |
| [CHANGE-044](../changes/CHANGE-044-yao-xiang-sprint-1-handoff.md) | 2026-09-30 | Added; receiving-developer verification pending | Added the detailed Yao Xiang handoff for combined Sprint 1 sequences 1–11, including sequence flow, UI rules, real/mock boundaries, Credit feedback, tests, and completion gates; no sibling-service source changed |
| [CHANGE-045](../changes/CHANGE-045-sequence-1-gateway-learning.md) | 2026-09-30 | Added; runtime walkthrough pending | Added a beginner-friendly Sequence 1 browser-to-gateway-to-Order-Service learning note covering CORS, nginx routing, domain/application/peer layers, persistence, response flow, and Compose/Spring environment resolution; no application behavior changed |
| [CHANGE-046](../changes/CHANGE-046-order-openapi-documentation-test.md) | 2026-09-30 | Implemented; Java 21 Maven verification passed | Added the required Order Service OpenAPI documentation test with MVC-slice collaborators, generated `target/openapi.json`, and summary/2xx/path checks; no API behavior changed |
| [CHANGE-047](../changes/CHANGE-047-frontend-permissions-lint-fix.md) | 2026-09-30 | Implemented; frontend CI verification pending | Removed the synchronous supplier-permissions state reset rejected by `react-hooks/set-state-in-effect`, while associating results with the Firebase UID to prevent stale permissions; no peer-service source or contract changed |
| [CHANGE-048](../changes/CHANGE-048-on-demand-order-ci-rehearsal.md) | 2026-09-30 | Implemented | Added an explicit-trigger-only local CI rehearsal for Order Service, its approved shared frontend slice, and relevant container/configuration checks; no application or peer-service source changed |
| [CHANGE-049](../changes/CHANGE-049-openapi-springdoc-test-context.md) | 2026-09-30 | Implemented; Java 21 Maven verification passed | Scoped the MVC OpenAPI test to Springdoc's JSON API configurations, removed its unnecessary Swagger UI configuration, and verified 43 tests plus the JaCoCo gate; no runtime API or peer-service source changed |
| [CHANGE-050](../changes/CHANGE-050-java-layering-and-dto-refactor.md) | 2026-10-01 | Implemented; full suite verified in CHANGE-054 | Replaced compact record DTOs, DTO factory mapping, and application-layer Spring Data calls with named DTO classes, an explicit MapStruct response mapper, domain repository interfaces, infrastructure persistence adapters, explicit types, Lombok boilerplate, and conventional Java formatting; public behavior and schema are unchanged |
| [CHANGE-051](../changes/CHANGE-051-overall-design-update-comparison.md) | 2026-10-02 | Design source synchronized; implementation blocked pending approval | Compared the new overall design source, updated fingerprints and architecture/contract/traceability records for typed completion and cancellation events, transactional outbox, broker fan-out, independent Credit/User subscribers, and same-order accepted reopening; no application code changed |
| [CHANGE-052](../changes/CHANGE-052-messaging-publisher-layout-and-diagrams.md) | 2026-10-02 | Publisher layout and diagrams recorded; implementation contracts pending | Recorded the requested `messagingpublisher/interfaces` and `messagingpublisher/publisher` layout, four event-specific interface/class pairs, method names, subscribers, and updated Mermaid sequence/class diagrams; no application or peer source changed |
| [CHANGE-053](../changes/CHANGE-053-publish-before-order-status.md) | 2026-10-02 | User-approved design; runtime publisher implementation blocked | Records full Order snapshots, placeholder topics, four publisher pairs, publish-before-status ordering, assumed future consumers, and the post-publish database-failure risk; no Java or peer source changed |
| [CHANGE-054](../changes/CHANGE-054-google-cloud-pubsub-producer.md) | 2026-10-02 | Implemented; tests/coverage passed; live broker verification pending | Adds the Google Cloud Pub/Sub producer, four typed publishers, complete Order event mapping, and publish-first transition integration; no peer-service or frontend source changed |
| [CHANGE-055](../changes/CHANGE-055-courier-requester-authorization.md) | 2026-10-02 | Implemented and verified; full `mvn verify` passed | Enforces requester/courier roles and per-order ownership across acceptance, progress, cancellation, and completion; corrects accepted-cancellation actor |
| [CHANGE-056](../changes/CHANGE-056-unified-order-completion-event.md) | 2026-10-02 | Implemented and verified; full `mvn verify` passed | Replaces separate normal/overdue completion events with one event carrying overdue facts for User and Credit; removes the overdue-only publisher and sequence diagram |
| [CHANGE-061](../changes/CHANGE-061-accepted-cancellation-courier-ui.md) | 2026-10-03 | Implemented; frontend checks passed; authenticated browser verification pending | Adds a confirmed cancel action for assigned couriers on accepted errands in My Errands, links it to the existing versioned Order API, and removes aborted errands from the courier's active list; no backend contract or peer service changed |
| [CHANGE-063](../changes/CHANGE-063-transactional-outbox.md) | 2026-10-03 | User-approved; implemented and verified | Replaces publish-before-status with atomic Order/outbox persistence, immediate after-commit Pub/Sub dispatch, lease-based claims, bounded retry, and Spring cron recovery; Cloud Run scale-to-zero cron behavior remains an operational issue |
| [CHANGE-065](../changes/CHANGE-065-scheduled-order-expiration-event.md) | 2026-10-03 | Spring expiry behavior remains; separate event superseded by CHANGE-071 | Adds Spring-scheduled discovery of due OPEN orders and atomically persists `EXPIRED` plus checkpoint; CHANGE-071 changes its refund event to the shared `OpenOrderRefundTaskEvent` |

- CHANGE-079: Central role annotations — implemented; 134 tests passed, six Docker checks unavailable, fresh coverage gates passed; see changes/CHANGE-079-central-role-annotations.md and ADR-024.

- [CHANGE-080](../changes/CHANGE-080-retired-mongo-compose-cleanup.md): Removed the obsolete user-mongodb helper after merge; main's peer configuration and Order's storage preserved; both Compose profiles validate locally.

## Effective compact-event amendment — CHANGE-092 / ADR-031 (2026-10-09)

Yao Xiang approved the exact seven-field Order-only payload: eventId, eventType, orderId, orderStatus, creditAmount, occurredAt, courierId. This replaces full snapshots and overdue facts ONLY for OpenOrderRefundTaskEvent and OrderCompletionTaskEvent. AcceptedOrderCancellationTaskEvent retains its existing v1 envelope/snapshot. Internal outbox versions and Pub/Sub eventVersion attribute remain (compact schema v2); topic names and DB schema unchanged. Old pending snapshot rows normalize at dispatch from their saved facts, with stable IDs. Lifecycle/outbox scheduling, locks, synchronous Credit assignment/reset and ADR-025 abort behavior remain. Historical v1 descriptions below are superseded for these two bodies. Credit currently requires the old snapshot and overdue; FEEDBACK-009 is INCOMPLETE_OR_INCOMPATIBLE. User completion penalties need an agreed separate overdue source. User approved implementing Order-only and documenting peer work; live integration remains blocked, Sprint [~].

## Lifecycle per-order failure isolation — CHANGE-093 (2026-10-09)

Yao Xiang explicitly requests failed scheduled tasks be skipped while later successes continue. Due selection returns IDs filtered in the DB (latest delivery cutoff for completion), without locking a whole batch. Nontransactional lifecycle coordinator calls fresh NOWAIT-locking per-order transactions (expiry worker / existing autoComplete with REQUIRES_NEW), catches each RuntimeException including commit failures, logs order ID, counts only successful transitions, then continues. Scheduler retains independent whole-pass catches. Failed orders remain eligible next normal lifecycle pass; no new repost retry mechanism or cron/contract/schema/peer change. Previous batch transaction description is superseded by this refinement; CHANGE-092 compact payloads and FEEDBACK-009 remain unchanged.

## CHANGE-094 — Order UI polling and personal status filters (2026-10-09)

Yao Xiang explicitly authorizes five-second Order polling, Abort errand wording and My Requests/My Errands filters. ADR-032 supersedes only Order polling interval; optional status on existing mine endpoint filters current/history before DB pagination/count, retaining ownership and requester repost hiding. Existing shared frontend primitives/gateway reused. 58 frontend and22 focused backend tests pass; fresh verify 219 passed/24 Docker skips, coverage gates passed. Browser fixture checks both pages at 320/768/1440/1920; real auth/peer/DB verification remains pending. Normal frontend build blocked by Google Fonts connectivity.

## CHANGE-095 — Correct personal status options (2026-10-09)

Explicit user correction: My Requests excludes ABORTED; My Errands excludes OPEN/EXPIRED/CANCELLED. Existing mode-aware filter/callers and option/pagination tests updated; no backend change. Tests first: 2 failures / 6 passes; final full frontend 60 passes, lint zero errors (12 unrelated warnings), typecheck passes, eight isolated browser cases at 320/768/1440/1920 pass.

## CHANGE-096 — Scheduler database selection and isolation (2026-10-10)

Audited existing lifecycle isolation, repaired outbox retry-write/claim failure isolation and moved active recovery to database due-ID selection plus per-event transactions. Tests-first regression: 1 expected failure (retry database unavailable), target/change096-red.log. Focused 43 tests passed, including eight PostgreSQL lifecycle/outbox isolation tests; fresh source-only wrapper-selected Maven 3.9.16 / Java21 offline verify: 252 tests passed, 0 failures/errors/skips, including 28 PostgreSQL tests. JaCoCo 95.99% lines / 83.72% branches; unchanged >=80% gates passed. Logs: target/change096-focused.log and target/change096-verify.log; reports target/change096-source-check/target/. Docker28.4.0; isolated PostgreSQL15 Testcontainers; new isolation suites mock all cloud publishers. No application database, peer service, real topic or cloud setting changed. See changes/CHANGE-096-scheduler-database-isolation.md.

## Missing supplier references in Order cards — CHANGE-097 (2026-10-10)

CHANGE-097 repairs Order UI loading when Supplier lookup successfully reports missingIds: use the existing Location unavailable card label for terminal missing references. Orders still display; no contract/peer/auth/schema/polling change. Three hook regressions (two fail first); final63 frontend tests, lint/typecheck and Docker build pass. Rebuilt only local frontend; runtime pages/assets and corrected hook verified served. Saved supplier data remains missing; authenticated browser confirmation pending.

## Swagger current-origin server — CHANGE-098 (2026-10-10)

CHANGE-098 sets an explicit relative OpenAPI server / through OpenApiConfiguration. Swagger now resolves API calls against the origin serving the specification, retaining /api/orders paths and Firebase authorization. Live staging docs previously advertised an HTTP backend host despite HTTPS gateway UI. This is an Order-only documentation routing implementation detail; no gateway, peer, CORS allowlist, forwarded-header trust, schema, frontend or deployment-env change. Tests first: one expected server-URL failure and one existing documentation pass (target/change098-red.log). Fresh source-only wrapper-selected Maven3.9.16/Java21 offline verify:253 tests,0 failures/errors/skips, including28 PostgreSQL tests; coverage96.00% lines (1441/1501),83.72% branches (468/559), unchanged >=80% gates pass. Generated target/openapi.json servers=[{url:"/",description:"Current gateway or service origin"}];160 current POM/source/test/resource files equal the fresh tested copy. Logs/reports target/change098-verify.log and target/change098-source-check/target/, evidence target/change098-evidence.json. git diff --check passes. No local application container rebuild or real authenticated browser request; no commit/push/cloud deployment. Staging remains unchanged until Order Service redeployment.

## Main merge feedback conflict and CI checks - 2026-10-10

Main merge a641836 resolves the prior stale-branch infrastructure expectation: current Credit has three typed endpoints, and both scripts/ci/check-infra.sh and infra/gcp/configure-credit-pubsub.sh use their corresponding paths. Those incoming-main scripts were preserved byte-for-byte. Resolved the sole peer-service-api-feedback.md conflict to JsonOrderEventPayloadDecoder/typed handlers with former v1 semantics labeled; retained exactly seven compact keys and OPEN FEEDBACK-009. Corrected its removed CreditOrderEventConsumer reference. Only that conflict was staged; every other existing index entry was preserved. Earlier shared-URL cloud repair used stale branch code and was reversed: all three original event-specific staging paths are restored, including completion confirmed after the interrupted turn. This supersedes the earlier claimed shared-path root cause; Order commit86708cb changed neither these scripts/routes nor the POM/workflow.

Standard online wrapper-selected Maven3.9.16/Java21 -B -ntp verify, without -U/offline mode, passed 258 tests, zero failures/errors/skips, including isolated PostgreSQL Testcontainers; coverage gates pass. Current161 POM/src/resource files equal the fresh tested copy. ShellCheck0.11.0 on all CI/infra shell scripts, actionlint1.7.12 on workflows, staged/unstaged diff checks and conflict/index/source/contract checks pass. Logs/reports target/main-merge-ci-verify.log and target/main-merge-ci-source-check/target/. First live cloud run reported two IAM failures while showing a concrete Google IAM DNS NameResolutionError; no deleted account/removed IAM inference. Repeat live infrastructure result pending; all three typed subscription predicates passed during first run. Current Maven artifact resolution passes but arbitrary hosted runner/network failures cannot be guaranteed absent. Reverted CI/helper changes were not reintroduced.

Final merge verification: Final live scripts/ci/check-infra.sh staging production rerun PASSED with all identities, databases, access, all three event-specific push subscriptions/DLQ/OIDC and buckets; production push stays intentionally disabled. The first-run two false-negative IAM checks were transient DNS failures and cleared on rerun. The prior subscription mismatch and Maven model failure did not reproduce on the merged tree. Hosted/WIF CI must still run after the user completes/pushes the merge; no arbitrary remote-network guarantee. Merge conflict remains resolved/staged, MERGE_HEAD intentionally present; no merge commit/push or application-container rebuild. FEEDBACK-009 and other peer business/semantic gaps remain open.


CHANGE-141 / ADR-048: delivered-item report review, single Resolved status, stored delivery overdue, report-specific release and precompletion penalty waiver. See changes/CHANGE-141-delivered-reports-and-review.md and docs/decisions/ADR-048-delivered-report-review.md. No workflow or skill changes.


CHANGE-142 (2026-10-18), user-directed presentation refinement: Report detail and submission use one continuous panel, with Order summary before report metadata and aligned definition-list rows. Admin clicks the Order summary to navigate to existing /admin/orders/{id}; no separate View full order details button and no financial actions on Report pages. Only Mark report resolved remains. Existing Order page actions, API/mocks/auth/statuses/polling and DB stay unchanged. GOV.UK summary-list structure informed layout; FoC theme retained.


CHANGE-143 (2026-10-18): Report Order summary has labelled Description and requester/courier display names. Status label sits above one equal-height select/refresh row. Admin Orders live list/details resolve distinct User summary and Supplier detail IDs independently via existing gateway/token transport; never block Orders on name failure or substitute sample data. Loading labels, Deleted labels for404/empty, unavailable for transient errors; copy/navigation IDs preserved. No global name cache, DB-owned names or API/config changes. Live Reports remains Coming soon until FEEDBACK-015 provider exists.


CHANGE-144: synchronous pending/confirmation penalty replacement contract stub, per-attempt outcomes/V13 and local mock UI; live disabled pending User FEEDBACK-016. Reports Open/Closed cards, no deadline, required resolution reply. Verification in CHANGE-144.


CHANGE-145 (2026-10-18): Report card status badge aligns top-right, preserving the title/content layout. CSS-only frontend change, no new contract.


CHANGE-146 / ADR-050 (2026-10-19): retire synchronous penalty replacement and admin completion; monotonic stored report penalty, final max(policy,overdue) through existing events, admin cancellation never considers overdue. Additive V14, approved shared frontend slice. Verification pending.


CHANGE-147 (2026-10-19): submitter-only resolution replies; retire courier-unresponsive from new choices with history compatibility; single-choice cancellation; simplified/muted navigable Reports; separate account name/ID; bounded admin table text. Verification pending.

CHANGE-147 verification (2026-10-19): full root Maven verify passed 520 Order tests and12 common tests,0 failures/errors/skips; final focused verify passed45 Order plus12 common tests, including the subsequently added cancellation-retired-case test (521 current Order tests across runs). Unchanged coverage gate passed. Frontend full243 tests and final18 focused tests pass; TypeScript, final production build and lint pass (0 errors/3 existing login warnings). Order and frontend Docker images built successfully as change147-check tags; no existing containers replaced. Automated Edge preview1440x1000 and390x844 plus screenshot inspection confirmed private-reply copy, separate name/profile and ID/copy rows, muted closed cards remain navigable, three radio cases with one selected, and no unresponsive option. Extreme name/email/user-ID fixture measured columns176/224/192px; full ID remains in copy/title, no service record changed. Found/fixed existing multiline status badge clipping; final measured41px height, scrollHeight=clientHeight39. Temporary account/processes/isolated change147_preview DB removed; existing Compose data untouched. git diff --check passes. Full peer-service CI/cloud checks and real Report integration were not run; Reports remain local-only/Coming soon live. No commit or staging.


CHANGE-148 (2026-10-19), Yao Xiang: presentation-only refinement in existing Admin/reports components. Completion hold displays Yes/No. Refresh icon shares Open reports heading row; normal participant section controls remain available. Cancellation uses muted Choose one penalty case/highest-selected guidance and requested stored-penalty warning. Remove score-event/overdue-comparison implementation details from Apply Penalty description. No API, backend, data, scoring, authentication, navigation, schema or deployment behavior change. Reuse existing components/theme. Existing component tests/typecheck/build and frontend image verification pending; no new tests for reversible copy/CSS edits.


CHANGE-148 verification:18 existing focused UI tests pass; production Next build including TypeScript passes; lint0 errors/3 pre-existing login warnings; frontend Docker image foc-frontend:change148-check builds successfully; git diff --check passes. Reviewed responsive flex heading placement in source; no new browser session for this copy/layout-only change. Backend tests/image not rerun because no backend source, contract or schema changed. No existing container restarted, commit or staging. Reports remain local mock/live Coming soon.


CHANGE-149 (2026-10-19), Yao Xiang: Reports reuse existing Order-style Status/Order ID/Search/Clear form, remove manual refresh icon, retain visible five-second polling and Open/Closed groups. Status means report status (Awaiting courier response, Ready for review, Resolved). Exact trimmed Order ID plus report status filter on local mock before pagination/counts; independent page counters reset on filter changes. Preserve participant scoping/reply privacy. Extend existing gated sample GET with optional orderId/reportStatus; no real Report endpoint, sibling backend, scoring, database or deployment changes. Live Reports remain Coming soon. TDD and verification pending.


CHANGE-149 verification,2026-10-19: full root Maven verify SUCCESS,522 Order +12 common tests,0 failures/errors/skips, unchanged coverage gates pass. Frontend full245 tests plus final12 focused report/transport tests pass (final test explicitly exercises page2 -> search reset to page1). Production build/TypeScript and Order/frontend Docker image builds pass; lint0 errors/3 existing login warnings; git diff --check passes. Isolated browser HTTP checks at1440x1000 and390x844 pass exact search, report status intersection, clear restoration, no refresh button, aligned controls (0px vertical delta) and no overflow. Sample server filters before page/counts and retains privacy/scoping. Preview account/processes/verified change149_preview database removed; existing containers/data preserved. No cloud, peer backend, schema, CI configuration, commit or staging change. Real Report Service remains unavailable; live Reports remain Coming soon. Full peer CI/cloud IAM not run.


CHANGE-150 (2026-10-19), Yao Xiang: remove separate Open/Closed report sections. One server-paginated card list under the existing Order ID/report-status filters; one five-second polling query with blank grouping selector (all statuses). Preserve grey styling and View report for RESOLVED cards. Filters and participant-tab changes reset the single page. Existing backend supports this query; no backend, endpoint, data or scoring change. TDD regressions cover mixed active/resolved results, one query, filtering/page reset and retained navigation. Verification pending.


CHANGE-150 verification:245 frontend tests pass; new expectations first reproduced the two-query/grouped-list mismatch, then passed after implementation. TypeScript/production build and frontend Docker image foc-frontend:change150-check pass; lint0 errors/3 existing login warnings; git diff --check passes. Isolated sample browser1440x1000 and390x844 verified a single mixed active/resolved grid, no group headings, grey resolved card with working View link and Resolved filtering; screenshots inspected. Single page reset/search remains covered. Backend source/API/schema unchanged, backend suite not repeated. No sibling service, shared infrastructure, existing containers/data, commit or staging change. Reports remain local sample/live Coming soon.


CHANGE-151 (2026-10-19), Yao Xiang: replace floating Base UI status-filter popups with one Order-owned native HTML StatusSelect. Covers My Requests, My Errands, Admin Orders and normal/Admin Reports in mock/live modes. Existing role-specific option sets, labels, selected values, search/Clear, page resets and polling remain. Native browser keyboard/touch dropdown; consistent existing theme/height/borders. No global Select changes, creation/reason controls, sibling service, backend, API, score, schema or deployment change. Regression tests use native change events and verify actual select controls. Verification pending.


CHANGE-151 verification: full245 frontend tests pass; final8 personal-list tests also pass after removing an obsolete tuple label. Native SELECT assertions/requester-courier option sets, selected-status requests, page reset and pending-command visibility verified. Initial build exposed stale test tuple typing (fixed); separate host build encountered existing Google Fonts fetch/network failure, then network-enabled retry passed without source/config/font changes. Final TypeScript/production build, frontend Docker build and lint pass (0 errors/3 existing login warnings); git diff --check passes. Isolated Edge browser1440x1000/390x844 checked Admin Orders(10 options), Admin Reports(4), normal Reports(4), My Requests(9), My Errands(7): actual native select, keyboard End/Home changes, no phone overflow. Screenshots inspected. Preview-only account/processes/change151_preview database removed, existing application data/containers unchanged. No backend/contract/schema/shared configuration/peer service changes; backend suite not repeated for this frontend-only change. No commit or staging.


CHANGE-152 (2026-10-19), Yao Xiang: remove all normal-mode Reports UI: /reports, /reports/new, /reports/[id], normal sidebar entry, submit/response/evidence-upload forms, participant tabs/branches and unused frontend submission helpers/types. Retain only AdminReportsPage under existing RequireAuth/AdminGate layout, Admin list/search/status/pagination/polling, grey resolved cards, linked Order/user details, evidence/response viewing and resolve-with-reply. Local admin sample/live Coming soon unchanged. Backend sample fixtures/endpoints, report/hold/domain rules and future Report Service requirements remain; this is UI-scope removal only. No sibling/backend/config/data changes. User explicitly authorized removal; deleted source backed up under ignored target for recovery. Verification pending.


CHANGE-152 verification:245 frontend tests pass, including new no-normal-Reports navigation/no-submission-client-helper regressions (both reproduced failures before removal), retained admin search/page reset/mixed/resolved/details/reply tests and existing admin-role gates. Production build/TypeScript, frontend Docker image foc-frontend:change152-check, lint(0 errors/3 existing login warnings) and git diff --check pass. Built route manifest retains only /admin/reports and /admin/reports/[id]. Isolated HTTP/browser confirms /reports,/reports/new,/reports/sample-report each404, normal sidebar has no Reports, Admin Reports list/details and resolve-with-reply succeed; no courier input/upload forms. Desktop1440x1000/phone390x844 screenshots inspected. Normal navigation screenshot captured while unrelated Order data still loading; Credit balance unavailable in the Order-only preview (no Credit proxy), not an application regression claim. Preview-only account/processes/change152_preview DB removed, existing application data/containers preserved. No backend/schema/config/peer service change, so backend suite not repeated. Live Admin Reports remains Coming soon until Report Service integration. No commit or staging.


CHANGE-153 (2026-10-19), Yao Xiang: allow a NEW requester-owned report completion hold on any Order status except COMPLETED, including cancelled/expired/aborted historical states. Placing a hold preserves status and cannot undo previously committed funds. START/PICKUP/DELIVER (and existing acceptance behavior) continue; requester/automatic completion, normal cancellation, expiry and courier abort remain paused while held. Admin cancellation remains the prior explicit override. Preserve locking, report-ID binding/idempotency, release/multiple-hold history, auth, SQL exclusions and event rules. No schema, frontend, peer backend or shared config change. Report Service integration is still pending. TDD and verification next.


CHANGE-153 verification: full reactor Maven verify passed (531 Order Service tests plus 12 foc-common tests, zero failures/errors/skips; JaCoCo coverage checks passed). New eligibility cases reproduced seven old-rule failures before the implementation. Updated the obsolete delivered-only PostgreSQL regression to reject COMPLETED instead; new OPEN placement and held delivery progression are covered alongside existing funding, rollback and concurrency guards. Docker image foc-order-service:change153-check built successfully; git diff --check passed. No application containers/data changed, frontend edits, schema changes, cloud calls, staging or commits. Live Report Service integration remains pending.


CHANGE-154 (2026-10-19), Yao Xiang: documentation-only peer coordination. Clarify new penalty addition/deduction events supersede new accepted-cancellation scoring; preserve old outbox/backlog support pending owner reconciliation. Request provider-enforced Firebase/admin-role checks for admin directory/profile/promotion/deactivation and separately document Credit balance readiness. Existing self-service contracts preserved; exact new admin routes not finalized. No sibling service, runtime, frontend, schema, topic/config or cloud edits. Verification: documentation consistency review and git diff --check; no tests required for prose-only change. User consumer/live admin readiness remain pending. No commit or staging.


CHANGE-155 (2026-10-19), Yao Xiang: retire accepted-cancellation producer/replay/snapshot types and topic keys/provisioning/CI requirements under explicit cleanup approval. Preserve financial transitions, four current event channels, published history and immutable migrations. Staging user query showed eight PUBLISHED rows only; other deployment databases require backlog checks before rollout. No database/cloud/sibling backend edits; no frontend impact. TDD: bootstrap expectations failed2 cases and retired-event dispatch failed1 case before implementation. Verification in progress; no staging/commit.


CHANGE-155 verification: final full reactor verify passed: 531 Order tests +12 common tests, zero failures/errors/skips; coverage checks passed with fresh execution data and no class-mismatch warning. First full run also passed but accumulated old mapper coverage, so only jacoco.exec was backed up/cleared before the final run (no Maven clean). Local bootstrap3 tests pass; base/http-peers/http-peers+local-live Compose config checks pass; shell syntax and stubbed staging/production provisioning pass (four topics each; no live gcloud calls). AsyncAPI checker passes four channels/operations, four DTO field sets, six examples, negative schemas and source/config/cadence parity; initial stale validator/missing example attributes were corrected. AsyncAPI parses and all local refs resolve. Docker foc-order-service:change155-check built; packaged JAR contains no retired event/publisher/snapshot classes; git diff --check passes. Production backlog and deployed User scoring remain unverified. No DB/GCP modifications, app-container recreation, commit or staging.


CHANGE-159 (2026-10-28): Order reporting contract/admin integration; see changes/CHANGE-159-report-contract-and-admin-provider-integration.md and ADR-056. Verification pending.


CHANGE-159 final verification (2026-10-28): full root reactor verify PASS,654 Order +12 common tests, zero testcase failures/errors/skips, coverage gates pass. The first full run found one old OpenAPI schema assertion and one expired test fixture; both corrected and targeted38 tests passed, followed by final full verification. Added final auth/caller scoping and persisted zero-outcome checks. Surefire logs a30-second lingering fork shutdown/termination after tests (build exits0); no production shutdown issue is inferred. Frontend locked npm ci,253 tests, lint(0 errors/warnings), typecheck and production build pass; both fresh Docker images foc-order-service:change159-check/foc-frontend:change159-check build. New OpenAPI paths, exact six hold-response fields, boolean-only placement body and documentation links validated; git diff --check passes. No migration, live cloud invocation/deployment, real Report integration or authenticated deployed browser validation. Docker Desktop was started for isolated test databases; no application volumes removed. No commit or staging.


- CHANGE-160: ready-only Admin APIs, ID-only User search, independent local-only Report demo and pending-only peer contract indexes. Verification pending.

CHANGE-160 final verification (2026-10-28): native Maven exit0, full reactor verify PASS (644 Order +12 common =656 tests, zero failures/errors/skips; unchanged coverage gates pass). Frontend252 tests pass; lint0 errors/warnings, host typecheck/production build and fresh Order/frontend Docker builds pass. Both Compose configurations validate with native exit0. Same frontend image in isolated local/staging containers serves health200, always real Admin APIs, mock Reports only locally despite a stale generic mock flag; preview containers removed. Fresh Order image contains Report-only fixtures and no AdminMock classes. Initial PowerShell stderr redirection reported wrapper exit1 despite successful logs; direct native rerun confirmed Maven/tests/images/configuration exit0. No sibling backend, migration, database/GCP mutation, application-container recreation, commit or staging. Pending name search, User penalty subscribers, Supplier deactivation guard and Report integration remain explicit; deployed authenticated browser integration is unverified. Sample Report identities are not real User/Order provider records.

- CHANGE-161: narrow real User directory endpoint and frontend initial list/name/ID search; full-width Admin resolution below repost, legacy waiver fields hidden. User handoff and Report-only pending Admin HTTP contract checklist. Verification in progress.

CHANGE-161 final verification (2026-10-29): User Service native Maven verify exit0,36 tests pass with zero failures/errors/skips, including4 real Mongo directory tests and3 active-admin/security/error route tests plus OpenAPI contract checks. Frontend252 tests, lint0 errors/warnings, typecheck and production build pass. Fresh foc-user-service:change161-check and foc-frontend:change161-check image builds exit0. Real User image + isolated Mongo HTTP checks pass14 requests: initial20/25 and page2, literal/case-insensitive names, exact UID/deactivated display, empty result, query400, missing/wrong-project/expired token401, non-admin403, existing profile200 and documented secure route. Temporary test/HTTP containers and network removed; existing application data untouched. Initial failed runs were stale generated pre-refactor User classes plus missing test-slice HttpSecurity setup, an obsolete frontend capability assertion and an HTTP-harness lifetime issue; only generated outputs/test harness/fixture were corrected, production auth was not refactored. Order backend source/lifecycle/schema/compensation unchanged this turn; its already-passing CHANGE-160 suite was not repeated. User changes are limited to3 new endpoint/query/DTO production files, tests/test dependency and handoff/README. No Supplier/Credit changes, new env vars, cloud deployment, commit or staging. Report integration remains pending; separate User subscriber/Supplier guard follow-ups are retained. No authenticated deployed browser/visual screenshot claim.


CHANGE-162 (2026-10-29): approved guarded Report resolution contract stub, V18 journal/inbox, synchronous admin resolve and atomic release, durable fenced Pub/Sub compensation/result, independent recovery and direct-release guard. Default disabled; Report provider/GCP/UI activation absent. See changes/CHANGE-162-report-resolution-compensation-saga.md and docs/report-servicehandoff.md. Final verification pending.


CHANGE-162 final verification (2026-10-29): native full Order/common Maven verify exit0,661 Order +12 common =673 tests, zero failures/errors/skips, unchanged coverage gates pass (Order94.65% LINE/80.67% BRANCH). After final OpenAPI parameter annotations, targeted10 contract/security/OpenAPI tests pass; strengthened PostgreSQL saga9 tests pass, including explicit PUBLISHED-before-rearm and stable compensation identity. Fresh foc-order-service:change162-check image builds exit0. Isolated fresh-image smoke health200/schema18 and default-disabled resolve/status/result routes absent from OpenAPI; temporary test containers/network removed. Both Compose configurations validate. AsyncAPI1.5.0 validates8 channels/operations,8 DTO sets/11 examples and negative/source/default/topic parity; context TOML valid; git diff --check and conflict scan clean. Initial full-run failures were two schema/FK expectations and host/DB due-time test skew, corrected. Host Python unavailable, so Python checks used read-only disposable containers; initial inline TOML invocation had Windows quoting failure, corrected with a script. No frontend/sibling production change in162, app-data/GCP mutation, deployment, staging or commit. Real Report restore/fence/result delivery and cloud OIDC/IAM remain unverified; integration defaults disabled.


CHANGE-163 (2026-10-29), Yao Xiang: documentation-only approved Report clarification. Retain response deadline and server readiness; early admin resolution with warning/confirmation; required private admin reply/audit and ADR-059 saga requirements documented. Category remains undecided. Updated handoff/pending requests/context/ADR060/sequence/traceability; no application, SQL, env or cloud change. See changes/CHANGE-163-report-deadline-reply-and-saga-handoff.md.


CHANGE-164 (2026-10-29), Yao Xiang: fix automatic-repost permanent exclusion after safe failure. Fresh keyed attempts on later scheduler passes after no-effect/confirmed compensation; SQL eligibility/fair failure ordering/latest attempt, existing lock/pending/funding guards retained. Three production files, regression tests and context/docs only; no migration/peer/API/env/frontend/cloud change. RED3 failures reproduced, focused20 actual Order/Credit/PubSub tests pass; full verify in progress.


CHANGE-164 final verification (2026-10-29): native full Order/common Maven verify exit0,666 Order +12 common =678 tests, zero failures/errors/skips; original coverage gates pass (Order94.86% LINE/80.98% BRANCH). Actual Order/Credit/PostgreSQL/PubSub compensation suite21 tests passes, including concurrent fresh retries with one successor/reservation, pre-Credit timeout recovery on later scheduler passes, insufficient funds then recovery, lost applied Credit response/confirmed reversal before fresh attempt, pending-effect barrier, holds/expiry, refund lag and manual guards. User/Supplier eligibility checks remain explicit fixtures in that suite, not a deployed peer claim. Three regressions failed before the fix; initial focused20 passed before the final race test. Fresh foc-order-service:change164-check image builds exit0. Context TOML and git diff/conflict checks pass. No frontend/schema/API/topic/env/feature-gate/sibling production or GCP change; no application data/container recreation, deployment, commit or staging. Existing safely failed eligible plans recover without deleting/resetting old commands after rollout; unresolved compensation/FAILED publication still requires existing recovery/redrive and is never bypassed.


CHANGE-165 (2026-10-29), Yao Xiang on order-service/admin-ui-linking: user explicitly requests fixing User CI AdminUserDirectoryTest Mongo8 container-start error. Pin only that test fixture to mongo:7.0.43, matching existing Order/User integration. No production code, dependency, environment, database schema or CI workflow change. Full standalone User verify native exit0:36 tests/0 failures/errors/skips, including4 real directory cases and OpenAPI. Both test databases are disposable Mongo7 replica sets; no application data modified. Test container/image behavior on GitHub requires the CI rerun; the provided excerpt did not include the underlying Mongo crash output. See order-service/changes/CHANGE-165-user-directory-ci-mongo-image.md and user-service/user-servicehandoff.md relative to repository root for peer details. No commit, push, deployment or staging.


## CHANGE-166 - 2026-10-29 ? Report integration and reportable Orders

Yao Xiang; feat/reporting-service. Resolve main merge conflicts preserving real Report APIs. Implement Report journal/fencing/conditional compensation/result outbox and actual admin transport; exclude OPEN from SQL reporting selection and locked hold placement, preserving deletion checks. See [change record](../changes/CHANGE-166-reporting-integration-and-reportable-orders.md). Final verification in progress; no cloud activation.


## Final verification - CHANGE-166 (2026-10-29)

- Full root reactor verify: 666 Order tests plus12 common tests; zero failures/errors/skips; original coverage gates pass (BRANCH 80.98%, LINE 94.86%). Log: order-service/target/report-saga-order-final.log.
- Final Report verify:54 tests, zero failures/errors/skips; fresh coverage gates pass (BRANCH 81.20%, LINE 94.97%); complete opt-in resolution OpenAPI artifact generated. Log: order-service/target/report-saga-release-verify.log.
- Frontend:267 tests pass with --maxWorkers=2; lint, TypeScript and production build pass. A prior unconstrained parallel run timed out four existing map/date/request tests under host load; none are represented as passes, and no unrelated source/global timeout was changed. The first sandbox build could not fetch existing Google fonts; the network-enabled production build passes. Logs: report-saga-complete-frontend-bounded.log / complete-lint / complete-typecheck / complete-build under order-service/target.
- Actual current-branch Order and Report HTTP applications, separate PostgreSQL/Firestore and actual Pub/Sub push pass all six scenario groups: OPEN rejected without an orphan hold, current-snapshot retry and held delivery/completion guard, successful resolution/replay/private reply, forced final Order rollback with duplicate compensation, safe fresh command after compensation, lost Report reply, and compensation preceding a delayed original. Some related checks share a recorded group; evidence: reporting-service/target/live-order-resolution-result.json and order-service/target/report-saga-release-live.log. No resolution/compensation endpoint was replaced with a stub; User/Supplier/Credit adapters are explicitly local mocks.
- Extended harness initially disabled outbox recovery and timed out on a pending immediate-dispatch attempt; enabling the real recovery job makes lost-response/delayed-original scenarios pass. No production scheduler cadence or outbox behavior was changed.
- User approved Report-only gateway protection. Disposable gateway image build/health, eight internal-route HTTP checks (normal/encoded/matrix) and the remaining public proxy path pass via reporting-service/scripts/test-report-gateway.cjs. Local unsigned push remains gated; cloud uses Google OIDC.
- Base and HTTP-peer Compose config checks pass. Context TOML, Report index JSON and resolution OpenAPI schemas validate. No merge markers/unmerged paths remain; working diff whitespace check passes. Containers/processes created by the live/gateway harnesses were removed; no application volume or GCP resource changed.

Cloud IAM/OIDC/subscriptions/indexes, operator retention/dead-letter settings, browser visual review and explicit feature activation remain rollout work. Both saga flags remain disabled by default. Optional normal-Compose automatic Report-topic/subscription wiring was requested for approval and has not been applied; the isolated live harness is fully configured. Report creation after a confirmed/uncertain hold but failed Report save remains a separate pre-existing recovery requirement. No commit/push/deployment was performed by the assistant.


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


Report picker UI refinement (2026-10-30, Yao Xiang, CHANGE-168): the user explicitly replaced the radio-card layout with compact single-column selectable rows. Keep description, truncated Order ID, status and Created date; remove Started and the pre-submit Active report label. Existing optional credit context, selection/accessibility, photo validation and duplicate message on submission remain. This is frontend display only: no backend/API/event, schema/index, environment, permission, workflow or cloud changes. Source: frontend/src/components/reporting/report-form.tsx; existing regression tests updated. Focused verification results recorded below.


## Effective reporting simplification - CHANGE-169 (2026-10-30)

Owner: Yao Xiang on feat/reporting-service. The user revoked the optional CREDITS/Order association introduced in CHANGE-168 and requested the initial submission UI, while retaining completed/cancelled Order lookup and the red courier reply reminder. This supersedes only credit association and picker layout from CHANGE-168; active reporting/hold restrictions, duplicate feedback and the response-count behavior remain.

CREDITS and GENERAL submissions are unlinked: no Order selector or lookup, orderId null, READY_FOR_REVIEW, no reported courier, response deadline, completion hold or automatic credit adjustment. Sending a nonblank orderId for either category returns400. ORDER/COURIER keep the existing active-only associated-order dropdown. The card/row/date alternatives are removed from this form. A supplied initialOrderId is ignored for unlinked categories. Form contents/photos and the helpful active-report message remain on failure.

Retain GET /api/orders/mine/completed and /api/orders/mine/completed/{orderId}. Add the matching GET /api/orders/mine/cancelled and /api/orders/mine/cancelled/{orderId}. OrderCreditHistoryController replaces the internal CompletedReportOrderController class name without changing the completed URLs. List endpoints return the existing one-based Order page, with status/ownership/count/pagination in SQL; detail returns404 for wrong status, missing or unrelated orders. Requester/current assigned courier only, from verified principal, with any recognized Order role. Read-only history: no Credit ledger access, hold, funds or penalty changes. These APIs are independent of Report submission. Expiry also has refund behavior in the existing system; the requested retained history scope here is COMPLETED/CANCELLED, not a statement that other statuses have no Credit activity.

Remove the now-unused Report getCompletedOrder HTTP adapter/interface method and CompletedOrderContext DTO. Keep reading historical linked credit reports and resolving them locally through the existing Report journal; no database records are deleted or backfilled. The Report result/compensation contracts and topics remain unchanged. No SQL/Firestore migration or new index/env/role is required. Existing completed-query metadata, including nullable startedAt, is retained as response compatibility; the form does not display it.

Preserve GET /api/reports/mine/response-count and the red badge in normal desktop/mobile Report an Issue navigation, including five-second visible/authenticated polling, caller isolation and deadline filtering. No User/Credit/Supplier backend, CI workflow, cloud setup, running container or application database mutation is part of this change. Backend Java, Report form/tests and existing documentation are the affected slice. Tests and final evidence are recorded below after verification.

Final CHANGE-169 verification: root reactor670 Order +12 common tests, zero failures/errors/skips; coverage gates pass (Order BRANCH81.03%, LINE94.81%). Report60 tests, zero failures/errors/skips; gates pass (BRANCH81.49%, LINE95.01%). Frontend274 tests across52 files, lint and production build (including TypeScript) pass; focused form/reminder/navigation14 tests pass. All four completed/cancelled list/detail routes and retained response-count API are present in generated OpenAPI; context TOML validates. Updated actual Order/Report HTTP + PostgreSQL/Firestore + two-way Pub/Sub live integration passes all seven scenario groups, including unlinked credit creation/local resolution, rejection of supplied credit orderId, completed/cancelled ownership/status filtering and the preserved response count, plus existing rollback/duplicate/lost-response/fencing scenarios. Disposable fixtures removed. Logs: order-service/target/change169-order.log, change169-report.log, change169-frontend.log, change169-lint.log, change169-build.log, change169-live.log; reporting-service/target/live-order-resolution-result.json. No production deployment, GCP change, database cleanup or running frontend rebuild was performed. Working diff whitespace and merge checks pass.


## Effective CHANGE-170 - 2026-11-01

Yao Xiang on hfix/report-service approved Report resolution response/recovery fixes, meaningful held-action rejection messages, Report-to-Orders exact-search navigation, ORDER/GENERAL-only new submissions with legacy readability, and COURIER_BAD_ATTITUDE=2. Return fresh Report responses without forwarding downstream HTTP framing headers. Preserve business rejection messages only before possible Credit effects; retain compensation afterward. V19 expands existing deferred-penalty constraints without changing saved rows or old migrations. Existing saga, holds, event schemas/topics and production flags remain unchanged. User penalty consumer integration is still missing in the inspected checkout. See changes/CHANGE-170-report-resolution-and-feedback-hotfix.md and reporting-service/HANDOFF.md for implementation and verification evidence.

## Effective CHANGE-171 / ADR-064 — courier Errand reports (2026-11-01)

User-approved: ERRAND lets the currently assigned courier report ACCEPTED, IN_PROGRESS, PICKED_UP or DELIVERED Orders, directly READY_FOR_REVIEW without self-response/deadline/reminder. ORDER stays requester-only; GENERAL unlinked; historical COURIER/CREDITS readable. GET /api/orders/mine/active adds mode=courier (default requester). Existing hold body adds reporterRole=COURIER (default REQUESTER). Verified role/token subject and SQL current ownership/status scope are mandatory; placement remains locked/transactional and hold rows bind the actual requester. New Report requesterId is actual owner; reporterId remains submitter. Legacy linked non-ERRAND records fall back to reporterId. Frontend selects the correct scoped list and labels submitter correctly. Replies remain submitter/admin only. Existing one-active-report, funding pause, continued delivery and resolution/compensation stay unchanged. No new SQL migration, topic, GCP or User/Credit/Supplier backend change. Deploy Order/Report/frontend together; older Report binaries cannot read new ERRAND documents. See changes/CHANGE-171-courier-order-reports.md and docs/decisions/ADR-064-courier-errand-reports.md for approval, design and verification. Implementation and verification in progress; prior170 staged work preserved.

## CHANGE-172 — active-report error feedback (2026-11-01)

Yao Xiang on hfix/report-service. User clarified generic feedback occurs when submitting another report. Form now shows the specific backend/client reason as the alert title, replacing "Could not submit". Duplicate-report checks and known hold rejection/saved-command UI use "This order has an active report. Please resolve it before proceeding." Report's HTTP adapter recognizes both historical and current wording. ORDER/ERRAND stale-selection tests retain form content and never show success. The initial cancellation example also exposed a real hold-version regression: a genuine hold increments version, so authorized owners now see the hold before a stale-version rejection; unrelated-caller precedence remains unchanged. No funding, authorization scope, API/schema/topic or workflow change. Existing context/owner/PDF fingerprints match. Full verification in progress; prior staged171/170 work preserved. Evidence: changes/CHANGE-172-active-report-error-messages.md.

## CHANGE-173 — default Order category (2026-11-02)

Yao Xiang on hfix/report-service; user-authorized frontend default only. Missing/empty category now starts ORDER; explicit ERRAND/GENERAL and retired/invalid GENERAL fallback remain. Screenshot's empty Description/0 counter explains client validation stopping before POST; keep required explanation and backend rules. No backend/schema/config change. Existing reporting tests and direct default checks, lint/build planned; rebuild only local frontend. No new low-impact tests or broad backend rerun. Prior changes/staging preserved. See changes/CHANGE-173-default-order-report-category.md.


- 2026-11-02: CHANGE-174 / ADR-065 unifies participant Order reports, opposite-party24-hour response/notification, transactional legacy upgrade and saga deadline preservation. User approved; verification recorded in CHANGE-174.

- 2026-11-02: CHANGE-175 / ADR-066 restores requester Order and courier Errand new-submission categories, retaining opposite-party response and one active report per order.

- 2026-11-02: CHANGE-176 prioritizes pending replies when clicking Reports, retains zero-count default form and prevents polling-driven tab changes.

- 2026-11-02: CHANGE-177 adds Action-eligible orders switch, synchronized status/page reset and optional backwards-compatible admin list SQL filter before pagination.

- 2026-11-02: CHANGE-178 aligns Orders/Reports toggles with status/search and adds the Admin Reports Ready for review shortcut using existing status filtering.


## CHANGE-179 - Courier suspension role context (2026-11-04)

User-directed role-context suspension fix: acceptance-only refusal, existing assigned work permitted, clear browser403 feedback with authoritative command reconciliation, no-effect rejection and safe uncertain-effect reversal; successful replay retained. Changes: Order security/adapter/application/API documentation, existing/new tests, USER Courier hook and workflow records. No sibling implementation, SQL migration, environment/topic/cloud change. See CHANGE-179 and ADR-067 for evidence and limitations.


CHANGE-179 verification amendment:701Order+13common full scoped verify passes, no failures/errors/skips; branch81.28/line94.63%;321frontend tests, lint and both Docker builds/TypeScript pass. Initial environment and fixture failures are resolved; authoritative final log is target/change179-scoped-verify.log. No backend peers, schema/config/cloud change. Images built, application stack not started; browser/staging rollout pending. Full acceptance/negative-case traceability is in changes/CHANGE-179-suspended-courier-acceptance.md.


## CHANGE-180 - Admin courier suspension UI (2026-11-04)

Yao Xiang requests Suspend/Unsuspend controls for existing admin-only User PUT endpoints. Existing Admin user profile actions now use confirmations, bodyless authenticated calls, returned-profile refresh and pending/error safeguards. No backend, API contract, schema, environment, topic or cloud change. Test-first evidence and remaining local build/runtime blockers: changes/CHANGE-180-admin-courier-suspension-ui.md.


## CHANGE-181 - Supplier selection and optional image alignment (2026-11-09)

User-approved frontend fix: Order creation follows Supplier pages beyond100 with all-or-error loading; Admin creates send imageUrl:null for blank input, keep PATCH clearing; create/edit type suggestions use actual Supplier types. No backend/config/data changes. Larger-scale searchable selector/index/cursor redesign is proposed only, awaiting approval. Evidence/limits: changes/CHANGE-181-supplier-catalogue-form-alignment.md.


## CHANGE-182 - Searchable Supplier selectors (2026-11-09)

User approves bounded browse/search pickup and delivery selectors. Existing installed Base UI Combobox and Input/Button styling; no eager requests,20 active suppliers per explicitly requested page,300ms optional search, Clear reset, stable selected ID/label, cancellation/late-response protection and retry/no-match handling. Replaces CHANGE-181 interim all-page Order loader only; its image null/type fixes remain. Backend indexing/cursors are not implemented; existing provider still scans a cached catalogue. Verification: changes/CHANGE-182-searchable-supplier-selection.md.
