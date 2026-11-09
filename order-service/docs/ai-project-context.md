<!-- Current directory rule: CHANGE-161/ADR-058 supersedes CHANGE-160 ID-only/blank results. The real admin search API supplies initial User pages, ID and Name. Reports alone remains local sample/cloud Coming soon. -->

<!-- Current Admin boundary: CHANGE-160/ADR-057 supersedes earlier generic mock/readiness descriptions. Non-Report Admin APIs are real everywhere; Reports remains local-only mock and cloud Coming soon. -->

## Effective deferred-penalty amendment — CHANGE-146 / ADR-050 (2026-10-19)

## Effective retirement of accepted-cancellation publishing - CHANGE-155 / ADR-053 (2026-10-19)

User approved removing AcceptedOrderCancellationTaskEvent publishing AND legacy replay after inspecting staging: eight legacy rows were PUBLISHED, with no pending/failed rows shown. Preserve published history; this task does not modify any database or GCP resource. Production was not inspected: before rollout, verify no PENDING, IN_PROGRESS or FAILED legacy rows in each target database. Resolve any such rows explicitly before deployment; do not convert them into new score events or mark them PUBLISHED without broker confirmation.

Removed the legacy DTO, publisher/interface, factory/mapper methods, now-unused snapshot DTOs and dispatcher branch. The four current channels remain OpenOrderRefundTaskEvent, OrderCompletionTaskEvent, PenaltyScoreAdditionEvent and PenaltyScoreDeductionEvent. Courier abort still uses synchronous Credit hold/reopen and the existing final addition (plus refund when expired); no lifecycle, hold, penalty policy, idempotency or financial rules change. Historical database rows and immutable migrations remain intact. Other older refund/expiration normalization remains supported.

The retired topic setting is removed from Order config, deployment templates, local Compose/bootstrap, environment examples/staging/production settings, topic provisioning and CI topic checks. These scripts no longer require or create the old topic; they do not delete existing cloud topics or subscriptions. User Service consumes only the new scoring channels. Existing admin-provider authorization requests remain open. AsyncAPI1.3.0 describes four outgoing operations; earlier statements requiring accepted-cancellation replay/configuration are superseded by this amendment.

An unexpected non-published legacy row after deployment is unsupported and follows the existing bounded failure/recovery path, never automatic financial conversion. This is why the pre-deployment backlog check is required. Live User penalty processing, production backlog and cloud deletion are not verified here.


Approved Yao Xiang: remove penalty adjustment/replacement and the admin mark-completed API/UI. No synchronous User replacement call, setting, replacement topic, waiver or retroactive score modification exists in the current flow. User Service consumes only the existing final addition/deduction events. Requester and the auto-completion scheduler remain the completion actors.

Admin Apply penalty stores the highest report-case policy on the current assigned active Order, including held Orders. It cannot decrease/clear a stored penalty and emits no event or Credit/User call. New POST /api/orders/admin/{orderId}/apply-penalty accepts {commandId, courierId, expectedVersion, policy, reason}; verified admin identity comes from the principal. NOWAIT locked transaction, pending-command guard and bound command receipt protect stale/concurrent/repeated calls. OrderResponse exposes appliedPenalty, derived appliedPenaltyAmount and actor/reason/time audit. Only report cases from getCourierPenaltyCases() are selectable. Terminal/unassigned/stale/wrong-courier requests409; invalid400; unauthorized401/403; missing404.

Requester/automatic completion chooses the highest stored report penalty or factual delivery overdue (1). If neither applies, it emits SUCCESSFUL_DELIVERY deduction (1); it never emits a reward plus a penalty. Previously persisted legacy waivers suppress only their overdue candidate; they cannot erase a stored report penalty, and no new waiver is allowed. Courier abort chooses max(stored policy, accepted cancellation2); archive retains stored policy/audit and reopening clears the current fields before another courier assignment. Admin cancellation chooses max(stored policy, explicitly selected policies) and never compares overdue; no stored/selected penalty means refund only. Existing initial outbox events and final per-attempt outcome recording remain atomic with the transition. Event wire schemas/topics are unchanged.

V14 adds Order and abort-archive policy/audit columns; V1-V13 and historical adjustment data remain untouched. Retired replacement records are historical only, with no runtime coordinator/gateway. No sibling backend, shared env/topic/CI/cloud changes. Report UI Open/Closed cards, required replies, no deadline and live Coming soon remain unchanged. Live Apply penalty uses the real Order API; local mode uses the isolated mock. Details and acceptance evidence: CHANGE-146/ADR-050.

## Effective penalty replacement and Report queue amendment — CHANGE-144 / ADR-049 (2026-10-18)

Approved Yao Xiang on order-service/penalty-integration: one current outcome per courier attempt, including No penalty or successful-delivery reward. Delivery stores factual overdue; completion/auto-completion read the stored flag. Initial outcomes are recorded atomically with completion/courier abort/admin resolution and existing event intents; original initial penalty/Credit topics and schemas are unchanged. A new acceptance has a new attempt identity, and an abort archive keeps the preceding identity.

Admin replacement is synchronous, not a new Pub/Sub topic. Order commits a stable-ID PENDING adjustment, calls User Service using fresh verified admin authorization, then confirms the current outcome in a second atomic transaction only after a matching reply. Another adjustment to that attempt is blocked while pending; exact same-ID authorized retry recovers timeouts/crashes. No bearer token is stored. User replacement endpoint is MISSING (FEEDBACK-016), so order.penalty-adjustment.enabled defaults false and live UI clearly disables writes. Local mock is isolated. Initial outbox publication never proves score application. New V13 tables preserve request audit/revision and current outcome; historical outcomes are not fabricated. Existing V1-V12 stay immutable.

Old overdue-waiver HTTP/UI is removed; V12 historical audit fields and previously saved decisions remain readable. Reports use Open/Closed cards with counts/pagination and visible five-second polling. No response deadline or deadline timer: courier may respond once while unresolved, and admin may resolve any open report with a required reply saved in resolutionNote. Case detail retains Order-first layout and links to separate Order financial actions. Report Service remains MISSING; HTTP-peer/staging/production Reports remain Coming soon. No sibling backend, shared environment/topic, CI or cloud configuration changes.



## Effective delivered-report review amendment — CHANGE-141 / ADR-048 (2026-10-18)

Approved Yao Xiang: new requester reports require own DELIVERED order; one damage/wrong-location category. Reports have AWAITING_COURIER_RESPONSE, READY_FOR_REVIEW and one RESOLVED final status. Courier response window is eight hours; server owns deadlines. Report Service is MISSING: the Report UI is a local-only isolated demo; HTTP-peer/staging/production show Coming soon and never fetch sample reports. Existing real Order financial actions remain separate from resolving a report.

Order stores deliveryOverdue at actual delivery, comparing deliveredAt against stored START plus duration deadline. isOverdue remains null before delivery or if historical timing is unknown; no runtime status refresh or new overdue scheduler. Admin waiver only before completion on DELIVERED late orders preserves the true lateness and saves actor/time/reason. Normal waived-late completion funds the courier but emits neither overdue addition nor successful-delivery reward. Explicit admin-selected penalties remain separate.

AdminOrderController adds PUT /api/orders/admin/{orderId}/completion-holds/{reportId}/release (no body) and POST /api/orders/admin/{orderId}/overdue-waiver ({reason}). Both verify admin role, use the verified principal, NOWAIT locked Order and the pending-command guard; all local writes are transactional. Release retains its report binding/audit and any other active holds. It may follow admin cancellation/completion and emits no funding event. Report Service must durably retry its release intent using forwarded admin Firebase authorization; no browser-only live orchestration exists. See FEEDBACK-015. V12 backfills only known delivery facts and adds waiver/release audit fields and an active-hold index; V1–V11 remain immutable.

Frontend uses existing theme/components, compact toolbar, darker selected rows and no redundant selection count. Normal/admin Reports poll every five seconds while visible; sample ownership, deadline and evidence checks are server-side in the gated prototype, which has no production identity authority or financial effects.

# Order Service Permanent Project Context

## Current Vincent compensation integration - 2026-10-27

CHANGE-158/ADR-055: Vincent authorizes Order/Credit corrections and explicitly
approves opt-in Pub/Sub transport, separate Google OIDC result receiver and local
demo-emulator integration tests. Credit consumer/tombstones/preimages/revisions/
result outbox exist; real local provider verification passes (CHANGE-158:
Order/common596 plus Credit126, no failures/errors/skips, original coverage gates).
Default retry
and deployed settings unchanged, transport off by default. Saved command policy
owns replay/draining across cutovers. Existing pending UI/schemas retained.
No auto repost, new schema, cloud mutation, stored JWT or unrelated peer edits.

## Historical Vincent compensation fixture slice - 2026-10-26

CHANGE-156 / ADR-054 on feature/vincent-credit-compensation: user-approved
compensation-first Order implementation against explicit contract fixtures.
Safe prior-assignment restoration is required for ABORT. New policy is opt-in
and HTTP/live-disabled; default existing retry protocol is retained during rollout.
V15 extends command step/final state, adds command-owned outbox references and
result inbox. FEEDBACK-017 records missing actual Credit async/restore support.
Use the new concurrency/compensation-workflow-handoff.md; the earlier handoff is
the current live protocol, not silently superseded. No peer/cloud edits authorized.

## Admin table page size — CHANGE-140

CHANGE-140, Yao Xiang2026-10-17: Admin Orders requests20 rows in live/mock mode; local sample User table requests20. Shared frontend ADMIN_TABLE_PAGE_SIZE keeps Order exact-search metadata consistent. Server totals/pagination and scrolling retained; fewer matching records do not get blank filler rows. Supplier cards remain10 and Credit history20. Live User directory still awaits its existing provider; not enabled by this change. No backend/schema/API-shape/auth/config changes.


## Compact calendar toolbar — CHANGE-139

CHANGE-139, user-directed2026-10-17: Admin Orders toolbar is a compact41px desktop table-top row, with existing RefreshCwIcon-only refresh and two native calendar-icon date fields (DD/MM/YYYY to DD/MM/YYYY), no visible Created-from label. Wrap on mobile; keep existing Order-ID/status search and financial dialogs/navigation. Creation-date bounds are local calendar days converted to explicit instants (start inclusive, day after end exclusive). Refresh retains filters and clears stale selection. Additive admin list filters execute in SQL before sorting/count/pagination; samples filter only isolated fixtures. No schema/financial/event/peer/config change. See changes/CHANGE-139-compact-admin-toolbar-date-filter.md.


## Current admin resolution UI — CHANGE-138

CHANGE-138 / ADR-047 (Yao Xiang,2026-10-17): Admin Orders now support single-row selection, shaded state, a top Cancel/Complete action bar and shared full-detail actions. The dialog requires an explicit penalty/no-penalty choice and a preset/custom explanation. Backend policy discovery supplies amounts; only the highest addition is selected. Optional resolutionReason is normalized, persisted atomically in V11 and bound into new receipts; absent/null preserves legacy fingerprints. OrderResponse exposes saved admin decision/time/explanation. Existing auth, active-state/held override, participant locks, credit/penalty events and ordinary hold guards remain. Mock mode mutates sample memory only; live mode calls existing protected endpoints without fallback. No sibling backend, root config or cloud change.


CHANGE-137 / ADR-046, approved Yao Xiang2026-10-17: AdminOrderController adds
POST /api/orders/admin/{orderId}/complete. Assigned ACCEPTED/IN_PROGRESS/PICKED_UP/
DELIVERED may become COMPLETED, including held Orders. Stored participant IDs must
match. Publish existing Credit completion event plus at most one highest selected
penalty addition; null/empty means WAIVED, no automatic overdue penalty or reward.
Locked atomic decision/checkpoint/receipt/outbox and bound ADMIN_COMPLETE replay;
hold history and actual timing preserved, no fabricated delivery. Ordinary hold
guards remain. Reuses V10 columns/topics; no migration, UI, peer or cloud change.
HTTP200 confirms local intents, not Credit settlement or User score application.


CHANGE-136 (Yao Xiang, 2026-10-17): AdminOrderController now owns both GET
/api/orders and POST /api/orders/admin/{orderId}/cancel. The separate cancellation
controller is removed; paths, roles, validation, transaction service and event
contracts are unchanged. OrderResponse imports Schema normally; JsonProperty
retains isCompletionHold/isOverdue and Schema documents nullable timing.


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


CHANGE-134 / ADR-044 (Yao Xiang2026-10-16): POST /api/orders/admin/{orderId}/cancel
accepts requesterId, nullable courierId and optional appliedPenalties. Admin-only;
all active/held states -> CANCELLED; locked stored participants, maximum one
addition, no successful reward; refund and optional penalty commit in outbox.
Common adds COURIER_UNRESPONSIVE=3. OrderResponse nullable isOverdue is calculated
from persisted START deadline/delivery timing under CHANGE-135. Existing
roles/topics/schedulers unchanged; Report/User integration remains pending.


Admin action refinement approved2026-10-15: remove Suspend User and its form/
state/handler. Keep Promote to Admin and Deactivate User only, with existing
capability gates and confirmation. Courier suspension standing remains read-only;
no automatic policy or peer/mock endpoint changes. ADMIN-API-002 withdrawn.

CHANGE-133,2026-10-15: merge preserves Admin dashboard and holds/penalty/involvement.
Live selected-user Credit history now uses admin-only /api/credits/users/{uid}/transactions
with paging/error/retry and existing bearer transport. Mock Compose unchanged;
balance005 pending,006 complete, global Credit tab explicitly not requested.

CHANGE-132: common enum renamed PenaltySystemPolicy. Static reward query returns
SUCCESSFUL_DELIVERY; immutable courier-case list excludes cancellation, overdue
and success; full list contains all6. Order DTO/factory/transition imports migrated,
completion/direction uses reward helper. Constants/amounts/event JSON unchanged.

CHANGE-131,2026-10-15: D1 NTH2 PDF37-39 mapping complete in foc-common: existing
+2/+1/-1 plus confirmed wrong location4, mishandling/damage4, deliberate
retention/theft10. Mapping only; no new automatic publication/schema or peer
implementation. Highest-effective penalty and theft permanent suspension need
future User/Report enforcement. No extra score invented or source PDF changed.

CHANGE-130 / ADR-043, Yao Xiang2026-10-15: approved ordinary foc-common Maven
penalty-policy extraction only; common package replaces Order domain enum.
Same +2/+1/-1, JSON/reasons/IDs/topics/transactions. Root reactor/Order Docker,
Compose/CI/staging build; shared changes select all Maven backends. No auth,
sibling implementation, schema/UI/cloud changes; User consumer remains pending.

CHANGE-129 / ADR-042, Yao Xiang2026-10-14: shared-role User/Supplier active
involvement endpoints, native EXISTS over five states/current relationships;
traditional mapped ID/boolean DTOs, no names stored. Existing supplier lookup
empty/missing fallback Deleted supplier; layout unchanged.420 backend/129 frontend,
coverage/lint/typecheck/build pass with local resource limits only. No peer
callback/deletion lock; FEEDBACK-015 race/pending-obligation integration remains.
CHANGE-128 / ADR-041, Yao Xiang2026-10-14: approved explicit courier penalty
+2 abort/+1 overdue/-1 successful. Seven-field add/deduct events; new abort
legacy emission replaced, Credit events/stored legacy dispatch retained.
Atomic outbox/stable recipient+reason ID; actual User subscriber pending.
Topic-only shared configuration approved; no peer implementation/cloud execution.

CHANGE-127 / ADR-040 (Yao Xiang, 2026-10-14): approved requester-owned active
Order holds via forwarded Firebase PUT; immutable report placement/flag V9;
manual funding guards, SQL due filters and locked rechecks, requester explanation.
394 backend/126 frontend tests pass; coverage/typecheck/lint/build pass. Local
schema9, seven Orders preserved. Report client/release/browser/rollout pending.

## Shared Admin typography/theme scope - CHANGE-125

Admin layout centralizes Geist Sans/body14px/foreground tokens, regular table
values/links/controls and badge typography. Admin technical IDs adapt shared
monospace history to the same primary-value font. Copy/record links explicitly
regular; missing balance values muted14px, actual metrics retain emphasis.
Leaflet UI/popups use the same font/card/foreground theme; imagery/attribution
and existing Supplier/Credit semantic colours retained. Headings/helpers keep
shared hierarchy and controls retain responsive sizes. Normal-page components
and all APIs/models/config untouched. Approved style baseline in frontend-ui-style-guide.

## Uniform Admin Order table body - CHANGE-124

Table body uses regular14px for record links/IDs, statuses and dates. Scoped
descendant link styling avoids changing detail cards/other tabs; badge size/weight
overrides and inherited date size match body. Headers stay distinct. No functional
change;123 compact/full-copy IDs and122 provider selection retained.

## Compact Admin table Order IDs - CHANGE-123

Order table alone enables CopyId compact display in a bounded-width cell. Long
IDs show a single-line ellipsis; title/accessible label/clipboard/View route keep
the original ID. Detail and other identifiers remain full text. Presentation-only
fix to tall rows; existing122 provider selection and121 responsive search retained.

## Effective Compose Admin provider selection - CHANGE-122

User explicitly approves shared Compose/runtime config changes. Base Compose
pins FOC_ADMIN_API_MODE=mock; HTTP-peer override pins live and disables Order
Admin sample routes. Runtime public adminApiMode is read per request; mocks only
allowed in local with Auth emulator and mock mode. Invalid flags/cloud stay live.
Live local uses real peer containers/genuine User admin role and119 placeholders;
it does not connect to staging databases. Existing Order backend HTTP peers and
Auth/PubSub emulators remain unchanged. New flag documented in .env.example.
No sibling backend/schema/credentials/IAM changes. This supersedes119's automatic
local-emulator-only UI selection; prior layouts/partial capabilities remain.

## Consistent Admin search presentation - CHANGE-121

Shared AdminFilterForm/AdminFilterActions now govern Order search, User/Supplier
directory search and live UID lookup. Mobile fields first/actions below; at640px
and above inline. This extends120's pattern without changing119 integrations or
search/filter behavior. Layout-only; no new API, model, permissions or config.

## Effective mobile Order filter alignment - CHANGE-120

User-reported phone misalignment fixed with one responsive search form: Status
and Order ID share its first grid row below640px, actions below; desktop inline.
Existing119 adapters/modes/search/status/paging remain unchanged. Layout-only;
no new API/model/architecture/config/peer changes. Actual visual check pending.

## Effective partial live Admin UI - CHANGE-119

2026-10-13, Yao Xiang on order-service/admin-dashboard: user approves mocks only
for local emulator UI; outside local use existing real role-context, Order and
Supplier APIs plus limited User summary. Unfinished User directory/actions and
cross-user Credit data use Coming soon cards, nullable values and disabled
actions without HTTP calls. Never fallback to mocks or impersonate selected
users. Real Admin role required; Order label loading cannot hide its results.
No peer backend, new env variable, persistence or cloud configuration changes.
This supersedes only111's mock-only transport restriction outside local; all
layouts/maps and local demo remain. Handoff: admin-peer-api-request.md; design
and current diagrams: ADR-039. Live authenticated rollout remains unverified.

## Effective Order layout correction - CHANGE-116

User clarifies CHANGE-115: restore original Order card widths and two-column
internal grid. Swap only Version/Item Description positions; keep requester
above courier. Supplier changes remain. Remove unused custom grid/span options.
No API/data/permission/provider change; prior wider layout is superseded.

## Effective Admin layout adjustment - CHANGE-115

Order Information spans the page: metadata first, then credits left and wider
description right in the final row. People renders requester above courier
independently of JSON key order. Supplier list overview map removed; detail map
and creation picker retained. Status badge sits beside Location details, outside
Admin actions. UI-only implementation detail; all contracts/guards unchanged.

## Effective Admin maps/layout - CHANGE-114

2026-10-12, Yao Xiang: Leaflet/OSM maps for current supplier page, selected detail
and optional Admin creation; Photon address suggestions and drag/manual coordinate
sync. Remove supplier-card deactivation only. Separate User fields; Order details
grouped with a dedicated repost card and related-name navigation / separate ID
copy. Same mocks/permissions and SupplierInput; no backend/schema/config changes.
Public mapping adapter is anonymous and replaceable; manual fallback retained.
Provider contract/limits: admin-peer-api-request.md; diagrams: ADR-039.

## Effective dedicated Admin details - CHANGE-113

Orders/Suppliers now use full detail pages. User/Supplier actions sit below the
heading, before details/history. Existing adapter sends exact-ID sample Order
query page1/size1; Supplier GET by ID unchanged. No new endpoint/backend/schema/
config or provider changes. CHANGE-113 records this approved UI-only refinement.

## Effective Admin refinement - CHANGE-112

User-approved 2026-10-11, Yao Xiang on order-service/admin-dashboard. Full
Users-tab profile/credit history; separate Order columns with related-record
links to Admin detail routes; normal supplier badges; equal-height controls;
header mode switch only. Same local mock milestone/gate as ADR-039. New local
GET users/{id}/transactions matches Credit history wire fields. Real admin
other-user history is missing (ADMIN-API-006). No peer/auth/schema/config change.
Verification and limits: changes/CHANGE-112-admin-ui-profile-navigation.md.

## Admin UI prototype - CHANGE-111 / ADR-039

Yao Xiang confirms order-service/admin-dashboard on 2026-10-11 and requests
Orders/Users/Suppliers Admin UI, mode switching and Order-owned sample APIs.
Shared shell/navigation changes are authorized only for this slice. Existing
normal/recovery UI and peer backend implementation remain unchanged.
Sample APIs require explicit flag + local environment + Firebase emulator,
including local prod-security Compose. No real DB/cloud/role/peer mutation.
Dedicated frontend adapter enables later provider replacement without page
changes or automatic sample fallback. Real gaps: admin-peer-api-request.md.
This is a prototype, not completed NTH1 or verified real admin integration.

CHANGE-110 (Vincent, 2026-10-11): source/test386f58f pauses individual command
polling during initial submission/local Continue, with an active-ref stale
callback guard. Frozen-key uncertainty/reload recovery and five-second polling
after POST settles remain.124 frontend tests/typecheck/build pass; lint0errors/
3 existing warnings. No backend/peer/API/schema/config change; rollout[~].

CHANGE-109 (2026-10-11, Vincent): narrow merged profile frontend compatibility
repaird7f72a8; current AuthProvider/backend retained, useApi GET/PUT/me, verified
email save with fresh token, safe account-keyed local form and Edit navigation.
116 frontend tests/typecheck/build pass, lint0errors/3 existing login warnings.
No Order recovery/role/schema/config changes; live/browser/strict gates[~].

CHANGE-108 / ADR-038 approved by Vincent 2026-10-11: owned pending displayDetails,
shared discovery and existing accept/abort card recovery without IndexedDB;
create/repost submitted-detail summaries. Source9f2e054/942b790;373 backend/103
frontend tests pass, lint/typecheck/build pass. Browser/rollout/strict gates open[~].

Effective CHANGE-107 / ARCH-EVO-043 (Vincent, 2026-10-11): unused expiry HTTP
trigger removed from controller and OpenAPI. Minute scheduler/direct expiry and
refunds unchanged. Retain every repost route; automatic peer work still deferred.

Effective 2026-10-11 ADR-037 / CHANGE-106: manual REPOST is approved for durable
coordination, V8 original/candidate IDs, existing minimal RESERVE protocol, atomic
successor/link/result and same-key pending UI. Automatic/delegation remain deferred.
Implemented/automated verified:367 backend,90 frontend; coverage94.76%line/
80.23%branch. Source2c021b6. Local V8 rollout/manual Compose smoke blocked by
Docker engine500; strict workflow-format/human/browser/cloud gates open. [~].

Effective 2026-10-11, CHANGE-105 / ADR-036 / ARCH-EVO-041: local Docker uses
emulator-only Pub/Sub (demo-foc-local) and actual HTTP peers; no ADC/tunnel/cloud
local setup. Cloud retains its injected staging/prod topics and Google OIDC.
Legacy CREATE/ACCEPT/ABORT now enter durable coordination; pending returns 202.
GET-by-ID enforces relationships. Receipts bind actor/order/input (V7); new event
IDs include order/actor. Immediate bounded asynchronous outbox plus 15-minute
recovery retains FAILED after 10 attempts (V6), ADMIN explicit redrive. Cloud
Order config min1/always CPU; external lifecycle hooks disabled. No cloud deploy.
Automatic repost/delegation remains deferred; User consumers missing. This section
supersedes earlier guarantees only where stated. See CHANGE-105 for exact tests.

Effective 2026-10-11: CHANGE-104 / ADR-035 supersedes the mock-only recovery gate. HTTP mode selects HttpCreditCommandGateway for CREATE/ACCEPT/ABORT, paired key/generation headers, owned historical lookup and conditional compensation against actual Credit 497a8f9. Minimal bodies remain unchanged. Tokenless recovery defers to AUTHORIZATION_REQUIRED; no persisted tokens/service credentials, repost recovery, schema or event change. Earlier stub-only descriptions are historical. Evidence: changes/CHANGE-104-live-credit-command-recovery.md.

Effective 2026-10-10: Vincent approves CHANGE-103 documentation-only AsyncAPI
for current Pub/Sub: `docs/asyncapi/asyncapi.yaml` and its reading guide. Three
send operations; refund/completion compact v2, accepted abort snapshot v1.
No application, peer, schema, topic/IAM or deployment change. Source/example
validation does not complete live financial/User integration or Sprint `[~]`.

Effective 2026-10-10: CHANGE-102 / ADR-034 merges command recovery into the
minute lifecycle scheduler, sequential recovery -> OPEN expiry -> DELIVERED
>=48-hour completion. Capture lifecycle time after recovery; isolate phase
errors and retain item locks/guards/leases. No independent command timer;
`order.lifecycle.cron` controls the merged job. Outbox remains immediate plus
15-minute recovery. Vincent confirms branch
`sprint-2-3-credit-service-concurrency-update-event-payload`. HTTP command
recovery remains disabled; no repost/peer/frontend/schema scope extension.
CHANGE-101 documents JWT signing locally in excluded learning, not a security
implementation change. Older timer descriptions are superseded by ADR-034.

Effective 2026-10-10: Vincent approves CHANGE-100 / ADR-033 foreground
CREATE/ACCEPT/CANCEL_ACCEPTED durable command recovery against a documented
contract stub. Live HTTP recovery remains disabled pending Credit historical
key/result/fencing/compensation verification. No peer source changes or stored
credentials. Scoped latest-effective context loading is approved for this slice.
Historical recovery-deferred statements below are superseded only within this
boundary; paused repost recovery is not resumed.

CHANGE-093 extends the approved Order database concurrency verification with
courier acceptance versus requester OPEN cancellation, both winner orderings.
New pair 2/2 and full five-race class 10/10 pass; combined acceptance/service
run 23/23 passes; actual domain/transition follow-up 36/36 passes, no failures/
errors/skips. Test commit 827844b; results and workflow limitations in CHANGE-093.
Existing locking/source/contracts unchanged; peers/dispatch mocked, no fresh
full-suite coverage or live financial verification claim. Sprint remains [~].

Current verification branch: Vincent explicitly requests four real PostgreSQL
race tests on sprint-2-3-credit-service-concurrency (CHANGE-092, 2026-10-09).
Order test-only scope; no new lifecycle policy, peer or schema changes.
Cross-service recovery remains deferred. Eight real PG race cases and full
215-test verify pass with no failures/errors/skips; fresh JaCoCo 95.67% lines /
84.70% branches. Peers/delivery mocked; no production/schema/frontend change or
live financial verification. Historical branch references below are dated
context, not current allocation. Full Sprint remains [~].
## Mode-specific status options — CHANGE-095 (2026-10-09)

Requester dropdown excludes ABORTED. Courier dropdown excludes OPEN, EXPIRED and CANCELLED; it retains ABORTED immutable-attempt history. All statuses remains the default. OrderStatusFilter requires an explicit requester/courier mode, supplied by each existing page. This is a UI-only refinement of ADR-032: existing API enum/query, authentication, ownership, pagination and five-second polling remain unchanged.

## Order personal filters and five-second polling — CHANGE-094 / ADR-032 (2026-10-09)

Yao Xiang explicitly requests five-second Order UI polling, Abort errand wording, and status filters on My Errands/My Requests. The existing /api/orders/mine adds optional status; default all, invalid status 400, existing identity/mode checks and page envelope retained. Database filters before page/count, preserving ABORTED courier attempts and hidden successfully reposted requester originals. Existing Base UI filters/pagination reset page 1 and cancel stale reads. Order-only polling is5 seconds; Credit/generic default 15 seconds; auth/visibility/no-overlap/focus/mutation protections retained. No scheduler, event, peer, schema or background-retry change. Verification and limits: CHANGE-094. Historical Order interval descriptions are superseded only by this approved amendment.

## Lifecycle per-order failure isolation — CHANGE-093 (2026-10-09)

Yao Xiang explicitly requests failed scheduled tasks be skipped while later successes continue. Due selection returns IDs filtered in the DB (latest delivery cutoff for completion), without locking a whole batch. Nontransactional lifecycle coordinator calls fresh NOWAIT-locking per-order transactions (expiry worker / existing autoComplete with REQUIRES_NEW), catches each RuntimeException including commit failures, logs order ID, counts only successful transitions, then continues. Scheduler retains independent whole-pass catches. Failed orders remain eligible next normal lifecycle pass; no new repost retry mechanism or cron/contract/schema/peer change. Previous batch transaction description is superseded by this refinement; CHANGE-092 compact payloads and FEEDBACK-009 remain unchanged.


## Effective compact-event amendment — CHANGE-092 / ADR-031 (2026-10-09)

Yao Xiang approved the exact seven-field Order-only payload: eventId, eventType, orderId, orderStatus, creditAmount, occurredAt, courierId. This replaces full snapshots and overdue facts ONLY for OpenOrderRefundTaskEvent and OrderCompletionTaskEvent. AcceptedOrderCancellationTaskEvent retains its existing v1 envelope/snapshot. Internal outbox versions and Pub/Sub eventVersion attribute remain (compact schema v2); topic names and DB schema unchanged. Old pending snapshot rows normalize at dispatch from their saved facts, with stable IDs. Lifecycle/outbox scheduling, locks, synchronous Credit assignment/reset and ADR-025 abort behavior remain. Historical v1 descriptions below are superseded for these two bodies. Credit currently requires the old snapshot and overdue; FEEDBACK-009 is INCOMPLETE_OR_INCOMPATIBLE. User completion penalties need an agreed separate overdue source. User approved implementing Order-only and documenting peer work; live integration remains blocked, Sprint [~].


## Current validation amendment - CHANGE-091 / ADR-030

Vincent explicitly approved field-specific creation errors and 30-minute new
repost windows on sprint-2-3-credit, 2026-10-09. New automatic expiry >= scheduled
due + 30 minutes; due >= original expiry. Manual expiry >= submission + 30 minutes.
Existing saved explicit-expiry plans are grandfathered; no silent disable/update.
Late automatic execution still uses its saved future expiry, not execution +30.
Reuse existing field-error envelope; local creation checks precede Supplier and
Credit calls after requester verification. Backend remains authoritative. Existing
responsive Order controls only; no shared auth/client, peer, schema, retry or event
changes. Prior V4 disable-without-expiry decision remains. Verification tracked in
CHANGE-091; Sprint remains [~] pending live/browser/cloud and existing peer gates.


## One-time Credit push security exception - CHANGE-090 (2026-10-09)

Vincent explicitly approved isolating the existing Google push converter from
Firebase role lookup and regression tests. See the interference record under
changes/CHANGE-090-credit-push-security-interference.md. This task-specific
exception does not authorize Credit business/contract/schema changes or other
peer edits. Annablee owns Credit; FEEDBACK-008 is READY_FOR_VERIFICATION: fresh
Java 21 clean verify passes 80 tests/no skips, 95.48% line/85.56% branch coverage;
real Google/ledger/backlog checks and local application rebuild remain open.
Source/test commit 198cd7c. Existing event architecture and paused repost retries
are unchanged. The dated documentation-only scope below is historical.

## Local real broker connector — CHANGE-088 (2026-10-09)

Vincent approved isolated local-live testing, implemented by ADR-029. Use base +
HTTP + `compose.local-live.yaml`, personal ADC, unique test namespace and
`scripts/local-live.ps1` Setup/Check/Pause. Financial push goes through restricted
HTTPS into local Credit; current Google OIDC retained. Existing Order authenticated
profile selects HTTP roles, not cloud DB. Staging/base Compose/peer source unchanged.
60 config/safety and 16 actual nginx/fixture assertions pass; actual cloud/ledger/
browser tests await user's gcloud/ADC/permissions. [Runbook](local-live-testing.md).
No User penalty consumer added, no accepted-cancellation Credit subscription.
Background credentials/retries paused; previous feedback gaps/Sprint `[~]` retained.

## Integrated Credit inspection — CHANGE-087 (2026-10-09)

Current review branch: Vincent, `sprint-2-3-credit`, user explicitly requested
documentation-only review of integrated revision 09e04a0. Source now has Credit
courier assignment/core hold and refund/completion push consumers. Earlier
missing-route/consumer statements are historical, not the current source state.
Follow-up ran 27 existing focused Credit tests successfully (including 12 isolated
PostgreSQL tests) from read-only copied source. Refund and completion transfer/
duplicate behavior verified at Credit's layers; no deployed/end-to-end verification.
Normal Order abort is locked/status-version checked and waits for Credit 200;
completed command receipt replay prevents repeating Credit reset. The earlier
short stale-clear example did not describe that protected normal sequence.
Feedback section 6 records implemented capabilities without claiming live
verification. Remaining Credit gaps: 003 reset replay authorization; 006 terminal
reservation replay/cross-database recovery; 007 superseded ABORTED refund consumer
on the now User-only accepted-cancellation topic. Separate provisioning script
exists but deployed delivery/IAM/ledger effects remain unverified. Production
provisioning is disabled; local Compose is not a public cloud push subscriber.
005 delegated background auth is still missing/proposal-only; inbound Pub/Sub
OIDC does not provide outbound requester delegation. ALL retries remain paused.
No approved architecture, peer source, app code, schema or cloud setting changed.
Sprint remains [~]. Read peer feedback for remaining provider work, not old
dated missing-route paragraphs. D1/selected Overall hashes remain unchanged.

## Effective follow-up — CHANGE-086 (2026-10-09)

Vincent requested and approved explicit automatic `repostExpiresAt` and latest
manual/automatic failure persistence. Both are now implemented in Order's source;
the prior limitation paragraphs below are historical. UI uses 00/15/30/45 slots.
Domain/API require `repostExpiresAt > repostDueAt >= original.expiresAt`;
late execution uses the saved expiry and cannot run at/after it. V4 disables
legacy enabled plans without an explicit expiry, per Vincent's chosen migration,
rather than inventing deadlines. Existing orders/history/refund intents remain.

Eligible authorized failures save only safe code/message/time on the original
EXPIRED row after rollback, overwrite an older result, and clear on success.
UI reads those fields after reload/polling and refetches the original version
after a failed foreground POST. No new repost order is saved on peer rejection.
Background retries and trusted credentials remain PAUSED/not implemented in
every mode. Peer feedback 002-006 and live browser/cloud gates remain open.
CHANGE-086 owns this task's actual tests/migration evidence; Sprint stays [~].

## Historical implementation and approval context


CHANGE-085 (2026-10-09): authenticated visible-page 15-second Order-list and Credit
polling implemented with focus/mutation refresh, no overlap and stale/session
response guards. Manual repost shows short semantic insufficient/permanent errors
inside its EXPIRED card; message is client-local, not persisted across reload.
Credit reservation errors are mapped without guessing delayed refund status.
Latest explicit user instruction PAUSES ALL background retry implementation
(including mock mode) until peers agree; credentials remain documentation ONLY.
Peer feedback was replaced by service at user request; historical versions remain
in Git. Explicit auto next-expiry and durable automatic failure state remain
unimplemented. The approval-only paragraphs below describe the earlier turn,
not the current polling/manual-message implementation status.

Latest decision CHANGE-084 / ADR-027 (2026-10-09): Vincent approved polling and
same-candidate-ID temporary repost retries bounded by new expiry, stopping
confirmed insufficient credits, invalid details and authorization/permanent
rejection with short appropriate messages while the original stays EXPIRED.
The balance error cannot distinguish a delayed refund. Trusted peer credentials
are approved for documentation/discussion ONLY; DO NOT IMPLEMENT them yet.
Polling, durable retries and persistent failure UI remain unimplemented. Peer
acceptance, the concrete security/task design and FEEDBACK-005/006 remain open.

Latest implemented CHANGE-083 / ADR-026: one minute expiry/completion job, 15-minute outbox
recovery and retained immediate dispatch; retired timer settings do not apply.
Supplier valid:false handling repaired on Order side. Explicit repost expiry,
durable retries and insufficient-credit-only card feedback remain incomplete.
Read ADR-027, the diagram reconciliation gap table, Vincent active-work and
FEEDBACK-005/006 before continuing; do not confuse user design approval with
peer contract acceptance, implemented code or verified integration.

This is the canonical permanent context for `order-service`. Detailed requirements remain authoritative in their source documents; this file records stable boundaries, decisions, and navigation.

## Current workstream - CHANGE-081/082 (2026-10-08)

Vincent is working on `sprint-2-3`, scoped to Order-owned Sprint 2-3 behavior.
Read CHANGE-082 / ADR-025, the current-sprint pointer and Vincent's current active-work
section before using the historical Sprint 1 context below. The user selected
`../../../Order Service Overall Doc.pdf` for this work alongside D1; the previously
recorded Updated PDF is absent locally. Existing approved ADRs remain effective
except where current explicit approvals supersede them; do not equate the PDFs.

The user approved one current Order plus immutable courier-attempt history,
an internal UUID separate from business orderId, ACCEPTED-only abortion,
User penalty signaling for every abort and Credit refund signaling for expired
outcomes. The missing courier-assignment API may be mocked locally, not silently
in HTTP mode. Every abort synchronously calls the approved bodyless hold/reset
route to clear Credit courierId, then resolves current state OPEN/EXPIRED and
saves separate ABORTED history. Every abort queues User penalty; EXPIRED also
queues Credit refund. Repost retains the old EXPIRED row and new row/new business
ID; the implemented requester query hides linked expired originals before
pagination/counting. Refund/history references retain the old ID. V3 adds an
internal row UUID and immutable attempt IDs without changing business references.
The local source/migration/UI test gates passed; live provider/subscriber retry
safety and trusted auto-repost credentials remain pending in peer feedback.
Editable effective diagrams/traceability: `sprints/sprint-2-3/README.md`.
Do not interpret historical Sprint 1 flags as blocking this approved Sprint 2-3
slice, or passing local tests as production completion of every overall capability.

## Repository state at workflow setup

On 2026-09-23, the repository contained only empty `AGENTS.md`, `README.md`, and `Dockerfile` files. No Spring Boot source, React source, tests, PostgreSQL configuration, Docker implementation, Kubernetes manifests, CI/CD workflow, or service-local documentation existed. The approved stack is therefore a constraint for later setup, not an installed implementation.

No production code was created as part of the workflow setup.

## Source documents

The following source paths are relative to the repository root.

- Product backlog and platform NFRs: `../../../Project-D1.pdf`
- User-selected current workstream overall design: `../../../Order Service Overall Doc.pdf` plus approved amendments (CHANGE-081/082).
- Historical updated design (currently absent locally): `../../../Order Service Overall Doc - Updated.pdf`; do not assume equivalence.
- Overall platform architecture: `../../../High Level Architecture Diagram - FOC.png`
- Order Service architecture: `../../../High Level Architecture Diagram - Order Service.png`
- Overall Order Service class diagram: `../../../Class Diagram - Order Service.png`
- Sprint 1 implementation pack and sequences: `../../../Sprint 1/Order Service Sprint 1 Doc.pdf`
- Sprint 1 core class diagram: `../../../Sprint 1/S1 Class Diagram - Order Service.png`
- Sprint 1 core plus NTH4 class diagram: `../../../Sprint 1/S1 Class Diagram - Order Service + NTH 4.png`

See `docs/project-d1-reference.md` for version fingerprints and known document conflicts.

## Specification authority

Use the authority order in `AGENTS.md`. Project D1 is the default behavioral source unless an approved persistent amendment supersedes it. Sprint documents may narrow implementation scope but must not silently alter permanent requirements.

## Technology and deployment status

- Backend: Spring Boot.
- Frontend: the existing shared top-level `../frontend/` application, implemented with Next.js 16 App Router and React 19.
- The user-approved Order Service infrastructure uses PostgreSQL on Google Cloud SQL and Cloud Run. The parent repository's Firestore convention remains applicable to other services unless their owners approve a separate decision.
- Order Service uses one shared Cloud SQL instance in `asia-southeast1` with separate `order_staging` and `order_production` databases. Cloud Run connects through a public-IP Cloud SQL Java Connector. Automated backups, point-in-time recovery, deletion protection, and possible Cloud SQL charges are accepted decisions.
- The full decision and trade-offs are recorded in `docs/decisions/ADR-008-order-service-cloud-sql-cloud-run.md` and `changes/CHANGE-015-order-service-cloud-sql-cloud-run.md`.
- Client: one responsive web application used from desktop and mobile browsers. No separate native mobile application or `mobile-client/` is currently included.
- Frontend application roles are `ADMIN` and `USER`. Requester and Courier are modes/functions of the same `USER` account, not separate applications or accounts. Do not assume `ADMIN` can use either mode.
- The shared Order dashboard does not provide a client-side Requester/Courier mode switch. Both user functions are exposed through the shared navigation; backend authorization and authenticated User Service identity remain authoritative.
- The parent backend convention currently names requester/courier/admin authorities. The exact mapping between those authorities and the frontend `ADMIN`/`USER` plus mode model is unresolved and must be inspected and approved before role-sensitive implementation.
- Each microservice exclusively owns and writes its own database.
- Cross-service behavior uses explicit authenticated contracts and stable identifiers.
- The architecture uses inbound contracts, application services, Order-owned domain rules, outbound ports, Order-owned persistence, and typed task-event publishers for completion, accepted cancellation, and shared OPEN refunds. CHANGE-063/ADR-013 specifies an atomic transactional outbox with immediate after-commit dispatch and cron recovery; CHANGE-054 selects Google Cloud Pub/Sub; CHANGE-056 unifies completion into one event type with overdue facts; CHANGE-065/ADR-015 adds Spring-scheduled OPEN expiry and CHANGE-071/ADR-019 makes it share the refund event/topic with requester cancellation.
- The corrected Order Service high-level diagram establishes that application components orchestrate and invoke persistence/external-service/publication ports. Order-owned domain rules validate and return decisions/status/flag/checkpoint data; they do not invoke outbound ports directly.

## Detailed architecture approval workflow

- Rehydrate the applicable repository context before every Order Service workflow, architecture, design, implementation, test, verification, resumption, or completion turn, including later turns in the same conversation. Repository records, not chat history, are authoritative.
- Overall architecture is the long-term blueprint; active Sprint architecture is its approved implementation subset. Neither silently replaces the other.
- Before any application code or implementation tests, produce a feature-level component/class/sequence/contract/data/failure/security/observability/test design and obtain explicit user approval for every interaction.
- Before designing integrations, inspect the real User, Supplier, Credit, and Admin service repositories and recheck each relevant provider for the feature. The implemented API, authentication, errors, retries, idempotency, configuration, and tests take part in the comparison but do not silently override the specification.
- Any expected-versus-actual API mismatch requires an explicit adapter/change/reject decision. An unapproved mismatch blocks implementation; a rejected, missing, unsuitable, incomplete, or incompatible API is recorded in `docs/peer-service-api-feedback.md`.
- Every foreign API is classified as matching, different but potentially usable, similar but unsuitable, missing, or incomplete/incompatible after comparing the actual implementation's operation, request/response, authorization, errors/statuses, communication style, semantics, tests, and sequence fitness.
- `docs/peer-service-api-feedback.md` is the single shared append-only record for missing, unsuitable, incomplete, or incompatible dependencies. ADR-006 supersedes the unused planned `docs/integration-api-gaps.md` location; no prior gap entry required migration.
- Peer confirmation is not verification. Re-read the actual provider code/tests before setting feedback `VERIFIED` or resuming integration. Approved prototypes/stubs retain an explicit unimplemented-contract risk unless the user approves a contract-stub milestone.
- For event candidates, compare synchronous request-response, query/polling, in-process events, and durable broker events. Updated overall Sequence 6 includes requester-triggered OPEN cancellation and Spring-scheduled OPEN expiry using the shared `OpenOrderRefundTaskEvent`; CHANGE-063/ADR-013 approves transactional outbox dispatch and recovery, CHANGE-054 selects Pub/Sub, CHANGE-056 unifies completion event routing, and CHANGE-065/ADR-015 approves scheduled expiry publication.
- `docs/event-candidates.md` is the persistent decision registry for D1-supported candidates. Its `EV-1` through `EV-7` IDs are stable; architecture decisions use separate `EV-DEC-NNN` IDs. CHANGE-053/054/056/063/065/067/071 record the typed event flows, resulting Order snapshots without checkpoint history, Pub/Sub transport, at-least-once outbox delivery, and Spring-scheduled OPEN expiration using the shared refund event.
- `docs/architecture-review-playbook.md` preserves the peer-inspection, API-mismatch, detailed-proposal, deviation, AI-disclosure, required-response, and post-approval templates used at the feature gate.
- Label proposal content as approved architecture, existing peer implementation, proposed design, unresolved decision, or user-approved deviation. Record approvals before implementation.

## Architecture evolution during implementation

- `docs/architecture-evolution.md` is the persistent register for design discoveries, classifications, proposal/approval state, current rules, supersession, and artifact synchronization.
- Read it on every implementation-affecting turn and follow the latest approved effective design rather than superseded source or chat memory.
- Classify a discovery as an implementation detail, design refinement, or architecture/specification change before acting. Material refinements are documented; architecture/specification changes require explicit user approval.
- The proposal must preserve the original design, explain the discovered insufficiency, compare viable alternatives and trade-offs where appropriate, recommend without treating that recommendation as approval, and enumerate all affected artifacts/files.
- An approved evolution is not `IMPLEMENTED` until requirements, architecture/class/sequence diagrams, data model, contracts, tests, implementation, traceability, change/decision records, and supersession links are synchronized or explicitly blocked.

## Per-turn completion reporting

- `docs/completion-reporting.md` is the single response-format authority for every Order Service chat turn, including advisory-only, status, planning, partial, blocked, decision-request, workflow, design, implementation, test, and verification turns.
- Every final response retains the required Added/Updated/Removed/Design Decisions/Affected Artifacts/Verification/Remaining Issues audit sections and uses `None.` where empty.
- The audit sections are a baseline, not the entire response. Add meaningful task-specific headers and details before, between, or after them while preserving the required sections' relative order.
- Do not create a separate per-turn Markdown summary; update the durable record that owns the information.

## Shared frontend workflow

- `docs/frontend-integration-workflow.md` is the persistent authority for Order Service work affecting `../frontend/`.
- Reuse the existing Next.js App Router structure, gateway-based `useApi()`, Firebase authentication, runtime configuration, shadcn/Base UI components, and current routing conventions where suitable. Do not create a competing frontend or migrate the routing model without approval.
- Before every coding turn, re-read applicable frontend instructions/configuration, inspect routes/layouts/components/styles/API/auth/permissions/tests, check current Git state and overlapping developer work, and confirm scope.
- Frontend UI checks are never authoritative security. Backend services enforce every protected operation.
- Design affected backend and frontend work together. Identify `ADMIN`, `USER` Requester mode, or `USER` Courier mode; actual API contracts; desktop/mobile-web behavior; shared-file impact; and required frontend/contract tests before implementation.
- The approved role/client context is not a detailed UI specification. Do not invent layouts, navigation, a mode switcher, controls, messages, or feature behavior.

## Approved communication boundaries

- Credit reservation before `OPEN` and synchronous hold/reset before unexpired accepted-order reopening remain synchronous. Under CHANGE-063/ADR-013, event-producing transitions commit with their outbox rows; an after-commit listener tries immediate publication and cron retries due rows. A publish failure does not undo a committed Order transition; delivery is at least once and no event subscriber reply is awaited. CHANGE-064/ADR-014 defines the accepted-cancellation expiry split.
- Under CHANGE-068/ADR-017, acceptance synchronously asks Credit to associate the active reservation with the courier before Order persists `ACCEPTED`. An Order-side mock and proposed HTTP adapter exist; the provider route, trusted service authentication, and recovery agreement remain open in FEEDBACK-004.
- Order Service owns lifecycle/status. Credit Service owns balances, reservations, releases, transfers, settlement, deductions, and credit policy.
- Penalty policy remains in User Service. Under CHANGE-063/ADR-013, Order Service commits factual event intent with the corresponding outcome, then publishes through Google Cloud Pub/Sub; it does not decide points, scores, or suspension. Stable event IDs support consumer deduplication.
- Immediate validation, courier acceptance/concurrency, authoritative transitions, and operations needing immediate success/failure are synchronous.
- Dashboards, history, available-order queries, and ordinary internal queries do not require a broker. The updated design specifically assigns typed broker events to completion/cancellation consequences in Sequences 5-7.

## Service ownership

- User Service owns accounts, identity, roles, courier eligibility, penalties, penalty policy, suspension, and unsuspension.
- Supplier Service owns supplier records, activation, approved campus locations, and catalogue details.
- Order Service owns errand creation, lifecycle/status, assignment, transitions, checkpoints/history, supplier references, repost relationships, order flags, and publication of order facts/outcomes.
- Credit Service owns balances, reservations, release, transfers, settlement, deductions, and credit policy.
- Admin Service independently owns monitoring, reports/cases, administrative decisions, user administration, and supplier/catalogue administration.

Nice-to-have ownership: NTH1 and NTH3 belong to Admin Service; NTH2 belongs to User Service; NTH4 belongs to Order Service; NTH5 belongs to the platform/deployment process.

- CHANGE-057/ADR-012 explicitly approve an Order-owned, admin-authorized, paginated `GET /api/orders` query to support future NTH1 dashboard integration. The Admin Service still owns the dashboard; its implementation and frontend UI are not included.

## Persistent approved amendments

### 48-hour automatic completion (CHANGE-072 / ADR-020)

- A configurable Spring scheduler finds `DELIVERED` orders by database query once their delivered checkpoint is at least 48 hours old.
- Recheck the cutoff and status under a pessimistic no-wait row lock; record `COMPLETED`, lifecycle checkpoint, idempotent receipt, overdue facts, and the existing `OrderCompletionTaskEvent` outbox intent atomically.
- Requester-confirmed completion remains available earlier. No new event, peer integration, or schema is introduced. Cloud Run scale-to-zero can pause this in-process scheduler.

### OVERDUE

- `OVERDUE` is a flag, not a status.
- Evaluate it once when an order reaches completion by comparing actual delivery duration with the configured delivery time limit.
- Do not introduce continuous overdue monitoring or a scheduled overdue scanner.
- Order Service records/publishes the fact; User and Credit Services apply their own policies.
- This amendment supersedes the continuous monitoring language in Project D1 F12.1-F12.1.4.

### Accepted-order cancellation and reopening

- Under CHANGE-064/ADR-014, only the assigned courier may cancel an accepted order. Before `expiresAt`, Order synchronously waits for Credit to hold/reset the transaction without refund; only success permits direct `ACCEPTED -> OPEN` with the same order ID and cleared courier assignment.
- At/after expiry, Order changes `ACCEPTED -> ABORTED` and emits the accepted-cancellation event; Credit refunds and User applies the courier penalty. If expiry passes during the hold request, recheck and use this event path.
- This does not implement `ABORTED -> OPEN`; ADR-001 continues to prohibit that separate transition. NTH4 reposting creates a distinct linked order.
- Completion and open cancellation remain event-driven: Credit transfers completion credits/refunds open-cancellation reservation; User handles completion overdue penalty or on-time score reduction. User does not subscribe to open cancellation.

### Penalty ownership

- User Service alone calculates and applies penalties.
- Order Service publishes relevant facts; Admin Service investigates and issues decisions.
- Order Service and Admin Service must not calculate penalty points.

### Typed outcome event contracts

- The current Order design defines three typed Order events: `OpenOrderRefundTaskEvent` for requester cancellation or scheduled OPEN expiry, `AcceptedOrderCancellationTaskEvent`, and one `OrderCompletionTaskEvent` carrying `overdue` and `overdueAt` for every completion.
- CHANGE-053 directs each event to carry the Order snapshot and use a configured topic. CHANGE-054 selects Google Cloud Pub/Sub. CHANGE-067/ADR-016 clarifies the snapshot contains the current Order/repost fields but omits checkpoint history; completion overdue facts are computed from checkpoints internally. CHANGE-073/ADR-021 configures three dev topics in the existing GCP project, personal ADC locally, and production topics through Cloud Run environment configuration/service identity. The user authorizes Order Service-only changes and assumes peer consumers will be implemented later; the peer assumption is not a verified integration.
- Each payload carries `eventId`, `eventVersion`, `orderId`, `orderVersion`, event-specific facts, actor IDs, and `occurredAt`; consumers deduplicate at-least-once delivery.
- Credit refunds `OpenOrderRefundTaskEvent` for both OPEN outcomes, distinguishing requester cancellation (`order.status=CANCELLED`) from scheduler expiry (`order.status=EXPIRED`); it refunds `AcceptedOrderCancellationTaskEvent` only for expired accepted cancellation and transfers credits for every `OrderCompletionTaskEvent`. User applies a courier penalty for expired accepted cancellation and, for every completion, an overdue penalty or the existing on-time score reduction. User does not consume OPEN-refund events. Subscribers own independent acknowledgments and retries. This follows CHANGE-056/ADR-011, CHANGE-064/ADR-014, CHANGE-065/ADR-015, and CHANGE-071/ADR-019.
- Each event carries the resulting Order and repost fields, without checkpoint history, and publishes to the environment-configured topic. The outbox commits event intent with the lifecycle transition, then dispatches after commit and recovers due rows through cron. Delivery is at least once and consumers must deduplicate by stable event ID. No generic outcome discriminator or open-ended facts bag is permitted.

### Supplier ownership

- Supplier Service is the source of truth for supplier names, status, locations, and catalogue details.
- Order Service stores supplier IDs and resolves current details through Supplier Service contracts, including for historical orders.

### Reposting

- An unaccepted `OPEN` order becomes `EXPIRED`.
- Automatic or requester-reviewed manual reposting may create at most one new linked order.
- The repost has a distinct identity and lifecycle and is linked both ways with the original.
- Credits are reserved only when the repost is created and before it becomes `OPEN`; configuring a future repost does not reserve credits.
- Automatic and manual paths must be idempotent.

## Cross-cutting contract rules

- Carry authenticated actor context or trusted service identity.
- Carry command IDs for idempotent create/reserve/transition/expiry/repost operations and globally unique event IDs/versions for published event delivery.
- Include expected order version for status-changing commands; stale requests produce a conflict.
- Distinguish validation, unauthorized, not found, conflict, dependency unavailable, reservation rejection, and accepted-for-processing outcomes.
- Published facts contain event ID and order version for deduplication and ordering.
- Completion/cancellation event types are distinct contracts; payloads carry event/version/order correlation and event-specific facts, with no generic `facts` map or outcome discriminator.

## Quality rules

- TDD is mandatory.
- Project D1 NFR3 requires automated unit and acceptance tests, at least 80% line and branch coverage, deployment only after tests pass, positive and negative cases, equivalence partitions, and boundary values.
- Project D1 NFR4 requires machine-readable local service logs for cross-service calls, automated actions, and user/admin actions, including timestamp, action, and actor.
- Performance targets are deferred to their planned sprint unless active scope says otherwise, but design must not contradict them.

## Current work navigation

- Active sprint pointer: `docs/current-sprint.md`
- Shared Sprint 1 allocation: `docs/work-allocation.md`
- Local current-developer identity: ignored `docs/local/developer-profile.md`
- Per-developer unfinished work/handoff: `docs/active-work/`
- Approved decisions: `docs/decisions/`
- Detailed approved changes: `changes/`
- Human-readable workflow index: `skills.md`
- Project AI disclosure log: `../ai/usage-log.md`
- Detailed architecture review playbook: `docs/architecture-review-playbook.md`
- Architecture-evolution register: `docs/architecture-evolution.md`
- Per-turn completion reporting: `docs/completion-reporting.md`
- Peer-service API feedback: `docs/peer-service-api-feedback.md`
- D1-supported event proposal registry: `docs/event-candidates.md`
- Shared Next.js frontend integration workflow: `docs/frontend-integration-workflow.md`
- AI usage log formatting authority: `docs/ai-usage-format.md`

At every task boundary, validate the local developer profile, shared allocation, matching active-work file, and Git branch. The local identity is intentionally not stored in committed shared context.

CHANGE-069/ADR-018 defines the Order/Credit contract boundary: Order validates versions, ownership, and amount locally; assignment sends only `orderId` plus `courierId`, and hold/reset sends only `orderId` with no body. Published events retain `orderVersion` for consumers that need it. This leaves Order API concurrency checks and event schemas unchanged.

CHANGE-070 finalizes the unexpired accepted-cancellation hold contract: Order calls `POST /api/credits/orders/{orderId}/hold-for-reopen` without a request body and waits synchronously for `200 OK` before reopening. The contract is agreed, but Credit's endpoint is still missing; trusted service authentication and failure-window reconciliation remain production requirements.


## Current time-selection and scheduler defaults (CHANGE-077 / ADR-022)

USER Requester creation/repost clock minutes remain 00/15/30/45; suggestions
round up and existing 30-minute creation expiry validation remains. API/legacy
timestamps are not rounded. ADR-026 replaces ADR-022/023 cadence with one shared
minute expiry/completion job and 15-minute all-event recovery; immediate dispatch
retained. Application/Compose/env/deployment timer configuration is synchronized.
Browser/idle Cloud Run scheduling is unverified; execution-model limits unchanged.


## CHANGE-079 / ADR-024: Central role annotations (approved 2026-10-08)

Production Firebase validation resolves User Service roles once per request, verifies response identity against JWT subject, and enforces RequireRequesterRole/RequireCourierRole/RequireAdminRole. Order-specific production role mode defaults to HTTP; local anonymous/mock behavior remains. Adapters reuse verified roles/identity, retaining fresh courier eligibility and locked domain ownership/state guards before mutation. Shared reads accept any confirmed requester/courier/admin role; /mine uses its selected mode. Internal lifecycle/scheduler authorization, API bodies, event payloads and schema remain unchanged. See ADR-024 for endpoint policy, inspected peer contracts and positive/negative test obligations.

## Scheduler DB selection and independent outbox dispatch — CHANGE-096 (2026-10-10)

The active lifecycle paths retain CHANGE-093: DB-filtered IDs, separate REQUIRES_NEW expiry/completion workers, fresh NOWAIT locks and outside-proxy catch. Outbox recovery now selects bounded eligible event IDs in SQL (due PENDING or expired IN_PROGRESS lease), then individually claims/rechecks with SKIP LOCKED. Claim, markPublished and scheduleRetry use separate REQUIRES_NEW transactions; enqueue remains REQUIRED with Order/checkpoint/receipt. Dispatcher catches each event's claim/commit/retry-write errors, logs its ID and continues later events. A failed retry write leaves the committed lease recoverable after expiry. Neither scheduler nor batch coordinator is transactional. Pub/Sub publication stays outside DB transactions and is irreversible; stable-ID deduplication remains required. Legacy claimDue is retained for compatibility, unused by the active scheduler. No cadence, schema, event body, peer, frontend or paused repost change.

## Missing supplier references in Order cards — CHANGE-097 (2026-10-10)

CHANGE-097 repairs Order UI loading when Supplier lookup successfully reports missingIds: use the existing Location unavailable card label for terminal missing references. Orders still display; no contract/peer/auth/schema/polling change. Three hook regressions (two fail first); final63 frontend tests, lint/typecheck and Docker build pass. Rebuilt only local frontend; runtime pages/assets and corrected hook verified served. Saved supplier data remains missing; authenticated browser confirmation pending.

## Swagger current-origin server — CHANGE-098 (2026-10-10)

CHANGE-098 sets an explicit relative OpenAPI server / through OpenApiConfiguration. Swagger now resolves API calls against the origin serving the specification, retaining /api/orders paths and Firebase authorization. Live staging docs previously advertised an HTTP backend host despite HTTPS gateway UI. This is an Order-only documentation routing implementation detail; no gateway, peer, CORS allowlist, forwarded-header trust, schema, frontend or deployment-env change. Tests first: one expected server-URL failure and one existing documentation pass (target/change098-red.log). Fresh source-only wrapper-selected Maven3.9.16/Java21 offline verify:253 tests,0 failures/errors/skips, including28 PostgreSQL tests; coverage96.00% lines (1441/1501),83.72% branches (468/559), unchanged >=80% gates pass. Generated target/openapi.json servers=[{url:"/",description:"Current gateway or service origin"}];160 current POM/source/test/resource files equal the fresh tested copy. Logs/reports target/change098-verify.log and target/change098-source-check/target/, evidence target/change098-evidence.json. git diff --check passes. No local application container rebuild or real authenticated browser request; no commit/push/cloud deployment. Staging remains unchanged until Order Service redeployment.

## Backend expiry minimum verified — CHANGE-099 (2026-10-10)

The user requests backend protection when frontend expiry validation is bypassed.
Existing OrderCreationService/Order.open already enforce server now + 30 minutes,
with expiry-specific HTTP 400 before Supplier/Credit/persistence. Added direct API
regression coverage, preserving the inclusive domain boundary and all repost rules.
Focused 19 tests pass; full result and fixture diagnostic recorded in CHANGE-099.
No production/frontend/peer/schema/deployment change; live integration/Sprint gates
remain unchanged.

## Main typed Credit handlers merge - 2026-10-10

Merged main a641836 provides typed Credit routes and matching CI/provisioning paths. Peer feedback now references its decoder/handlers while retaining CHANGE-092 compact payloads and FEEDBACK-009. No consumer compatibility claim. Conflict resolved/staged, all other main index entries untouched. Standard Order verify passed258 tests and coverage; ShellCheck/actionlint pass. Existing restored staging URLs match three typed routes; live recheck result recorded in Yao Xiang active work. Former shared-path repair was based on stale branch state and is superseded. Previous reverted CI helper/-U edits remain reverted.

Final live staging/production infrastructure rerun passed after a transient IAM DNS failure; all typed subscription configurations match merged main. Prior two failures did not reproduce. Merge commit/push and hosted CI remain pending; peer compact consumers remain incompatible.

CHANGE-130 verification: root reactor424 tests (common4/Order420), gates pass; separate root-context Docker image bundles common JAR. Compose/selection/ShellCheck/actionlint/AsyncAPI/patch checks pass. No app recreation/cloud/schema/peer/auth/frontend changes this task; human/hosted CI and User consumer pending.

CHANGE-131 verified:427 tests (common7/Order420), coverage gates and AsyncAPI/patch checks pass. Three report cases remain mapping-only; no new automatic publication or suspension enforcement. No container rebuild/deploy or peer implementation change.

CHANGE-132 verification:431 tests (common11/Order420), gates/AsyncAPI/patch checks pass. New shared class and3 methods verified in JAR; obsolete enum absent. Initial Docker/PATH setup failure recovered by background Desktop startup and process-only exclusion; no machine setting or app deployment.


CHANGE-142 (2026-10-18), user-directed presentation refinement: Report detail and submission use one continuous panel, with Order summary before report metadata and aligned definition-list rows. Admin clicks the Order summary to navigate to existing /admin/orders/{id}; no separate View full order details button and no financial actions on Report pages. Only Mark report resolved remains. Existing Order page actions, API/mocks/auth/statuses/polling and DB stay unchanged. GOV.UK summary-list structure informed layout; FoC theme retained.


CHANGE-143 (2026-10-18): Report Order summary has labelled Description and requester/courier display names. Status label sits above one equal-height select/refresh row. Admin Orders live list/details resolve distinct User summary and Supplier detail IDs independently via existing gateway/token transport; never block Orders on name failure or substitute sample data. Loading labels, Deleted labels for404/empty, unavailable for transient errors; copy/navigation IDs preserved. No global name cache, DB-owned names or API/config changes. Live Reports remains Coming soon until FEEDBACK-015 provider exists.


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

CHANGE-160 verification:656 backend/common tests plus252 frontend tests, coverage/lint/typecheck/build/images/Compose/runtime gates pass. No cloud/browser deployment claim. Pending-only API contracts are in peer-service-api-feedback.md; full result in CHANGE-160.

## Effective real User directory and resolution display — CHANGE-161

CHANGE-161 / ADR-058 (Yao Xiang,2026-10-29) supersedes CHANGE-160 ID-only/blank-directory behavior: GET /api/users/admin/search supplies the initial real User page and optional exact Firebase ID/literal case-insensitive username search, Mongo count/filter/sort/paging, size1..100 and active-admin authorization. User Service edits are explicitly limited to this endpoint/DTO/query, tests/test dependency and maintainer handoff; legacy routes/model/role/penalty/deactivation behavior unchanged. Frontend requests20, keeps ID default and enables Name, with no generic mock fallback. Admin resolution is full-width below Repost information; retired waiver fields/empty admin values are hidden in UI only. No Order lifecycle/schema/saga/config/cloud change. Only Report remains a missing Admin HTTP integration; separate subscriber/Supplier guard follow-ups remain.

Contract/handoff: ../../user-service/user-servicehandoff.md. Verification: CHANGE-161.

CHANGE-161 complete: User36 tests +frontend252 tests; lint/typecheck/production build, User/frontend images and14 isolated real User HTTP checks pass. Only Report missing Admin HTTP contracts remain; no cloud/browser deployment claim. User handoff records exact source scope.


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


CHANGE-165 (2026-10-29), Yao Xiang on order-service/admin-ui-linking: user explicitly requests fixing User CI AdminUserDirectoryTest Mongo8 container-start error. Pin only that test fixture to mongo:7.0.43, matching existing Order/User integration. No production code, dependency, environment, database schema or CI workflow change. Full standalone User verify native exit0:36 tests/0 failures/errors/skips, including4 real directory cases and OpenAPI. Both test databases are disposable Mongo7 replica sets; no application data modified. Test container/image behavior on GitHub requires the CI rerun; the provided excerpt did not include the underlying Mongo crash output. See order-service/changes/CHANGE-165-user-directory-ci-mongo-image.md and user-service/user-servicehandoff.md relative to repository root for peer details. No commit, push, deployment or staging.


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


Report picker UI refinement (2026-10-30, Yao Xiang, CHANGE-168): the user explicitly replaced the radio-card layout with compact single-column selectable rows. Keep description, truncated Order ID, status and Created date; remove Started and the pre-submit Active report label. Existing optional credit context, selection/accessibility, photo validation and duplicate message on submission remain. This is frontend display only: no backend/API/event, schema/index, environment, permission, workflow or cloud changes. Source: frontend/src/components/reporting/report-form.tsx; existing regression tests updated. Focused verification results recorded below.


## Effective reporting simplification - CHANGE-169 (2026-10-30)

Owner: Yao Xiang on feat/reporting-service. The user revoked the optional CREDITS/Order association introduced in CHANGE-168 and requested the initial submission UI, while retaining completed/cancelled Order lookup and the red courier reply reminder. This supersedes only credit association and picker layout from CHANGE-168; active reporting/hold restrictions, duplicate feedback and the response-count behavior remain.

CREDITS and GENERAL submissions are unlinked: no Order selector or lookup, orderId null, READY_FOR_REVIEW, no reported courier, response deadline, completion hold or automatic credit adjustment. Sending a nonblank orderId for either category returns400. ORDER/COURIER keep the existing active-only associated-order dropdown. The card/row/date alternatives are removed from this form. A supplied initialOrderId is ignored for unlinked categories. Form contents/photos and the helpful active-report message remain on failure.

Retain GET /api/orders/mine/completed and /api/orders/mine/completed/{orderId}. Add the matching GET /api/orders/mine/cancelled and /api/orders/mine/cancelled/{orderId}. OrderCreditHistoryController replaces the internal CompletedReportOrderController class name without changing the completed URLs. List endpoints return the existing one-based Order page, with status/ownership/count/pagination in SQL; detail returns404 for wrong status, missing or unrelated orders. Requester/current assigned courier only, from verified principal, with any recognized Order role. Read-only history: no Credit ledger access, hold, funds or penalty changes. These APIs are independent of Report submission. Expiry also has refund behavior in the existing system; the requested retained history scope here is COMPLETED/CANCELLED, not a statement that other statuses have no Credit activity.

Remove the now-unused Report getCompletedOrder HTTP adapter/interface method and CompletedOrderContext DTO. Keep reading historical linked credit reports and resolving them locally through the existing Report journal; no database records are deleted or backfilled. The Report result/compensation contracts and topics remain unchanged. No SQL/Firestore migration or new index/env/role is required. Existing completed-query metadata, including nullable startedAt, is retained as response compatibility; the form does not display it.

Preserve GET /api/reports/mine/response-count and the red badge in normal desktop/mobile Report an Issue navigation, including five-second visible/authenticated polling, caller isolation and deadline filtering. No User/Credit/Supplier backend, CI workflow, cloud setup, running container or application database mutation is part of this change. Backend Java, Report form/tests and existing documentation are the affected slice. Tests and final evidence are recorded below after verification.


## Effective CHANGE-170 - 2026-11-01

Local follow-up corrects the default RETRY validation catch and frontend explanations for older immutable hold rejections. Both recovery policies retain financial safeguards. User's fresh local POST returned404 from disabled resolution routes; local Compose now enables both existing endpoints, timeout nesting and two-way emulator compensation wiring. Order/Reporting/frontend recreated and healthy; gateway OpenAPI confirms registration. Final677 Order+13 common verify/coverage, affected38 frontend tests/lint/Docker build/types and eight real Nginx/saga scenarios pass. No user report resolved or volume removed; authenticated retry and staging checks remain. Original502 cause is not proven by the newer404; current gateway integration succeeds.

Yao Xiang on hfix/report-service approved Report resolution response/recovery fixes, meaningful held-action rejection messages, Report-to-Orders exact-search navigation, ORDER/GENERAL-only new submissions with legacy readability, and COURIER_BAD_ATTITUDE=2. Return fresh Report responses without forwarding downstream HTTP framing headers. Preserve business rejection messages only before possible Credit effects; retain compensation afterward. V19 expands existing deferred-penalty constraints without changing saved rows or old migrations. Existing saga, holds, event schemas/topics and production flags remain unchanged. User penalty consumer integration is still missing in the inspected checkout. See changes/CHANGE-170-report-resolution-and-feedback-hotfix.md and reporting-service/HANDOFF.md for implementation and verification evidence.

CHANGE-170 final evidence: Report62 full verify and frontend280 full suite pass; affected Order42+common13 verify/coverage passes after latest-version fixture updates (current source-matched Order reports676 green). Backend coverage, frontend lint/build, OpenAPI, TOML and whitespace verified. Uncommitted work awaits user PR and staging smoke check; no deployment. See CHANGE-170 for the complete failure/rerun account.

## Effective CHANGE-171 / ADR-064 — courier Errand reports (2026-11-01)

User-approved: ERRAND lets the currently assigned courier report ACCEPTED, IN_PROGRESS, PICKED_UP or DELIVERED Orders, directly READY_FOR_REVIEW without self-response/deadline/reminder. ORDER stays requester-only; GENERAL unlinked; historical COURIER/CREDITS readable. GET /api/orders/mine/active adds mode=courier (default requester). Existing hold body adds reporterRole=COURIER (default REQUESTER). Verified role/token subject and SQL current ownership/status scope are mandatory; placement remains locked/transactional and hold rows bind the actual requester. New Report requesterId is actual owner; reporterId remains submitter. Legacy linked non-ERRAND records fall back to reporterId. Frontend selects the correct scoped list and labels submitter correctly. Replies remain submitter/admin only. Existing one-active-report, funding pause, continued delivery and resolution/compensation stay unchanged. No new SQL migration, topic, GCP or User/Credit/Supplier backend change. Deploy Order/Report/frontend together; older Report binaries cannot read new ERRAND documents. See changes/CHANGE-171-courier-order-reports.md and docs/decisions/ADR-064-courier-errand-reports.md for approval, design and verification. Implementation and verification in progress; prior170 staged work preserved.

CHANGE-171 final verification:681 Order+13 common full verify and66 Report full verify pass, coverage gates/packaging pass (Order branch80.70/line94.67%; Report branch81.61/line95.09%). Final9 Firestore saga checks confirm legacy requester fallback and courier-report actual-owner compensation. Frontend284 full tests plus final affected32, lint and Docker build/types pass. Nine actual Nginx/Order/Report/PostgreSQL/Firestore/PubSub scenario groups pass. Rebuilt/recreated local Order/Report/frontend; all healthy, live OpenAPI exposes ORDER/ERRAND/GENERAL, requesterId, mode and reporterRole. Volumes preserved; no user report submitted/resolved, cloud/peer backend/index/commit/push changes. Authenticated browser use and cloud rollout remain unverified. Evidence and fixture-failure corrections: order-service/changes/CHANGE-171-courier-order-reports.md. This completion supersedes the in-progress status above.

## CHANGE-172 — active-report error feedback (2026-11-01)

Yao Xiang on hfix/report-service. User clarified generic feedback occurs when submitting another report. Form now shows the specific backend/client reason as the alert title, replacing "Could not submit". Duplicate-report checks and known hold rejection/saved-command UI use "This order has an active report. Please resolve it before proceeding." Report's HTTP adapter recognizes both historical and current wording. ORDER/ERRAND stale-selection tests retain form content and never show success. The initial cancellation example also exposed a real hold-version regression: a genuine hold increments version, so authorized owners now see the hold before a stale-version rejection; unrelated-caller precedence remains unchanged. No funding, authorization scope, API/schema/topic or workflow change. Existing context/owner/PDF fingerprints match. Full verification in progress; prior staged171/170 work preserved. Evidence: changes/CHANGE-172-active-report-error-messages.md.

CHANGE-172 verified locally:683 Order+13 common and66 Report full verify/coverage pass;42 affected frontend tests, lint and Docker build/types pass. Nine actual gateway/saga scenario groups pass, including exact duplicate-report text and stale held-abort reason before any possible Credit effect. Local Order/Report/frontend rebuilt/recreated and healthy; volumes preserved, no direct user-report edits or cloud/commit/push changes. Report form displays the specific reason as its heading, retains content on failure, and supports client-known/server-discovered active reports. Original interrupted run and existing Surefire shutdown warning documented accurately in CHANGE-172; final full verify succeeds. Browser confirmation after hard refresh remains. See changes/CHANGE-172-active-report-error-messages.md.

## CHANGE-173 — default Order category (2026-11-02)

Yao Xiang on hfix/report-service; user-authorized frontend default only. Missing/empty category now starts ORDER; explicit ERRAND/GENERAL and retired/invalid GENERAL fallback remain. Screenshot's empty Description/0 counter explains client validation stopping before POST; keep required explanation and backend rules. No backend/schema/config change. Existing reporting tests and direct default checks, lint/build planned; rebuild only local frontend. No new low-impact tests or broad backend rerun. Prior changes/staging preserved. See changes/CHANGE-173-default-order-report-category.md.

CHANGE-173 completed:16 existing reporting tests,8 direct default checks, lint and frontend Docker build/types pass. Actual built /reporting carries initialCategory=ORDER; explicit ERRAND/GENERAL links remain their categories. Recreated only local frontend, healthy; no backend/data/cloud/config/volume change or new low-impact tests. The screenshot's Description is empty (0/2000), so no POST is expected until an explanation is entered; grey text is a placeholder. See CHANGE-173 for evidence and startup-probe retry. User browser refresh/input remains the final manual check.


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

User-approved Yao Xiang on hfix/suspended-courier-acceptance: use User role-context {userId,roles,isCourierSuspended}, retain courier role and check suspension only for new ACCEPT. Verified per-request context is reused by role authorization and acceptance; no cross-request cache. Existing assigned courier transitions/history/reporting retain role/ownership/status/version/hold guards without courier-eligibility calls. Browser403 reconciles owned status before clearing; saved possible Credit effects require confirmed reversal/compensation. No peer/backend schema/topic/config change. CHANGE-179/ADR-067 own implementation and verification evidence.


CHANGE-179 verification amendment:701Order+13common full scoped verify passes, no failures/errors/skips; branch81.28/line94.63%;321frontend tests, lint and both Docker builds/TypeScript pass. Initial environment and fixture failures are resolved; authoritative final log is target/change179-scoped-verify.log. No backend peers, schema/config/cloud change. Images built, application stack not started; browser/staging rollout pending. Full acceptance/negative-case traceability is in changes/CHANGE-179-suspended-courier-acceptance.md.


## Current amendment - CHANGE-180 Admin suspension UI (2026-11-04)

Yao Xiang on feat/suspend-unsuspend: ADMIN Users profile has confirmed Suspend Courier/Unsuspend Courier, existing promotion/deactivation retained. Bodyless PUT suspension/suspension-removal through existing useApi, immediate returned-profile update, safe pending/error/inactive controls. No backend/auth/contracts/schema/env/topics changed.331 frontend tests, lint and TypeScript pass; Docker engine unavailable, host production build hit Windows OutOfMemoryException, local User image still lacks Unsuspend until rebuild. Browser/staging/human review pending. Legacy missing-status compatibility fix/backfill is not authorized or performed. Details: changes/CHANGE-180-admin-courier-suspension-ui.md.


## CHANGE-181 - Supplier frontend repair and scale proposal (2026-11-09)

Owner Yao Xiang continues on hfix/suppplier-not-showing-up. User approves diagnosed supplier list/image/type fixes, then specifies null for blank creation image and asks for scalable selection proposal. Order creation now reads all active pages for current catalogue; failure never installs partial options. Admin create imageUrl:null; edit empty-string clearing retained; real GET types suggestions on form open with manual fallback. Supplier backend/API/schema/auth/config/data unchanged. Searchable bounded combobox/indexed backend/cursor redesign is proposed only, pending approval. See CHANGE-181 for evidence, test outcomes and resource/runtime limits.


CHANGE-181 final verification (2026-11-09): explicit null create image implemented; initial7 expected RED failures, focused82 pass, explicit-null refinement RED1/12 pass, final343 frontend tests across56 files pass. Full lint and Next route generation/tsc pass. Docker stopped (engine pipe absent); direct production build failed host memory allocation. No image/browser/live account or Supplier writes verified/performed. No backend/source/auth/schema/config/cloud changes. Large-scale searchable selector/backend index/cursor design remains proposed only, pending developer approval. No commit/push; frontend and required documentation changes remain for user review. See changes/CHANGE-181-supplier-catalogue-form-alignment.md for exact scope and logs.


## CHANGE-182 current behavior (2026-11-09)

Yao Xiang on hfix/suppplier-not-showing-up: approved browse20/300ms optional-search selectors are implemented for pickup and delivery. Opening fetches one active alphabetical page; Show more fetches the next; blank browses,2+characters query, Clear resets, chosen ID/label retained, late/closed requests ignored, errors retry same page. Installed Base UI/Input/Button; no dependency or global UI/auth/client changes. CHANGE-181 eager/all-page loading is superseded; its imageUrl:null/create and real Admin type suggestions remain.18 focused tests/lint/typecheck pass; final verification in CHANGE-182. Backend findAll/in-memory search/indexing limitation remains; no backend/schema/env/cloud change.


CHANGE-182 final verification (2026-11-09):18 focused tests and354 full frontend tests across57 files pass; full lint and Next route generation/tsc pass. Initial browse tests reproduced2 failures; whitespace-query edge separately reproduced/fixed. The only final change after the full run was a responsive popup max-height/overflow class using the existing available-height convention; no behavior logic changed. Bounded production build attempt still failed native process out-of-memory despite heap/Rust-thread caps. Docker stopped; image/browser/320px/staging verification pending. Current SupplierSelector is integrated in USER Requester Order creation; no backend/API/schema/dependency/config/index/cloud/data changes. Earlier CHANGE-181 Admin null image/type patches retained, fetch-all Order loader superseded. No commit/push; current source/tests/docs left for user review. See CHANGE-182 for file/contract/sequence and verification evidence.
