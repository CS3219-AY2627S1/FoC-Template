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

# Active Sprint

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


CHANGE-134: approved admin active/held cancellation and nullable overdue read;
unresponsive courier3 added. Reuses refund/addition outbox; no new Report UI or
peer implementation. Existing Sprint/NTH completion gates remain open.


CHANGE-133: Admin profile history linked to completed Credit API; merge preserves
all current work. Balance/User management and deployed confirmation remain pending;
no Sprint-wide completion claim.

CHANGE-132: shared PenaltySystemPolicy rename/queries and Order-only adoption;
no new score or Report integration. Existing NTH2/NTH3/Sprint [~] unchanged.

CHANGE-131: D1 NTH2 six-case shared mapping only; no new report/publication
workflow. Highest-penalty and suspension requirements remain unimplemented;
this does not mark NTH2/NTH3 or the Sprint complete.

CHANGE-130 / ADR-043: approved shared penalty-policy library extraction and
root-aware Order build. No new product feature or peer readiness claim; existing
Sprint2-3 [~] and FEEDBACK-014 remain. No authentication/other shared code.

CHANGE-129 / ADR-042: approved shared-role involvement reads and existing
supplier deleted-reference labels.420 backend/129 frontend checks pass. Provider
deletion/deactivation integration and coordination remain FEEDBACK-015; no new
User-name rows/storage, schema, shared config or full Sprint completion.
CHANGE-128 / ADR-041: approved Order-side explicit courier penalties (+2/+1/-1),
new add/deduct outbox events and configured local/dev/prod topics. User subscriber
is still MISSING (FEEDBACK-014); overall penalty integration/Sprint remains[~].

CHANGE-127 / ADR-040: Yao Xiang approves requester-owned active-Order hold
placement/funding guards/UI under D1 NTH2/NTH3. Order implementation tested:
394 backend/126 frontend pass; local V9 applied preserving seven Orders. Actual
Report client and release deferred; NTH2/NTH3 remain[~], Sprint not complete.

CHANGE-125 is a presentation consistency refinement across Admin pages: shared
font/type hierarchy/theme, regular data and scoped map popup styling. Existing
provider/authorization/scheduler/backend scope and contracts unchanged.

CHANGE-124 normalizes Admin Order table body font size/weight only. Existing
copy/navigation/filter/provider behavior, contracts and scope remain unchanged.

CHANGE-123 is a presentation-only Admin Order ID table fix: bounded single-line
display, full copy/detail/navigation preserved. Existing scope/APIs unchanged.

CHANGE-122 refines Admin transport selection under explicit user approval:
base Compose mock UI, HTTP-peer override real local APIs/partial staging-like UI.
New runtime flag; genuine live admin role required. Backend HTTP peers/emulators
and peer ownership/Sprint behavior unchanged.

CHANGE-121 extends120's responsive filter pattern to all Admin search controls
using shared wrappers. Presentation-only; existing scope/contracts unchanged.

CHANGE-120 is a layout-only Admin follow-up: align Status/Order ID on phones,
with Search/Clear below. Existing119 scope/integrations and backend unchanged.

CHANGE-119 is the user-approved Admin continuation on2026-10-13: local emulator
mocks retained; matching live Order/Supplier/role/summary APIs outside local;
unfinished User/Credit features show Coming soon and do not issue calls. Backend
and peer ownership/Sprint lifecycle scope unchanged; live rollout verification
and full Admin integration remain pending.

CHANGE-116 corrects115's Order layout interpretation: restore original card/grid
dimensions; only swap Version with Item Description and keep requester first.
Other Admin changes and backend/Sprint scope remain unchanged.

CHANGE-115 is an approved presentation-only follow-up: final-row wide description,
explicit requester/courier ordering, no Supplier list overview map and status near
Location details. Existing mock milestone, APIs and lifecycle scope unchanged.

CHANGE-114 continues the Admin mock prototype with maps/address picker and
detail/table refinements. Public mapping reads are anonymous; provider SLA/live
browser checks remain separate. No backend lifecycle, schema or scope expansion.

CHANGE-113 supersedes only Admin Order/Supplier detail modals with dedicated
pages and moves User/Supplier actions near the heading. Existing mock scope,
provider integration blockers and backend/scheduler scope remain unchanged.

CHANGE-112 refines the approved Admin prototype: full user profiles/history,
selected-record routes, SupplierBadges and aligned controls. Real Credit admin
history remains missing (ADMIN-API-006); no peer implementation or schema change.

CHANGE-111 / ADR-039 is Yao Xiang's authorized Admin UI prototype on
order-service/admin-dashboard. Three views with Order-owned sample APIs;
actual peer administration is not integrated. Existing Sprint recovery/lifecycle
scope remains [~]. Exact real gaps are in admin-peer-api-request.md.

CHANGE-110: Vincent-approved frontend-only command polling race fix,
source386f58f; pause individual GET during initial submission/local Continue,
preserve same-key recovery.124 frontend tests/typecheck/build pass; lint0errors.
Backend/contracts/schema/config unchanged; browser/rollout/strict gates[~].

CHANGE-108 / ADR-038 is the approved display-only recovery extension: owned
pending command details, shared discovery and existing-order pending cards;
creation/repost summaries stay separate. Financial/peer/schema behavior unchanged.
Source9f2e054/942b790 automated verified:373 backend/103 frontend tests pass,
lint/typecheck/build pass. Browser/rollout/strict completion gates remain[~].

CHANGE-107 retires only the unused expiry HTTP/Swagger operation. Scheduled
expiry/refunds and every repost API remain; no Sprint scope expansion.

CHANGE-106 / ADR-037 durable manual repost and V8 implemented/automated verified;
367 backend/90 frontend pass. Local consuming rollout blocked by Docker engine500.
Current scope extends the earlier three commands only for manual REPOST;
automatic repost/delegation remains deferred. Sprint remains [~].

## CHANGE-105 / ADR-036: emulator and review hardening

Approved by Vincent on current branch. Real local HTTP services with local Pub/Sub
emulator, durable legacy mutation entrypoints, read/replay protections and
asynchronous retained-failure outbox. V6/V7 handed off together. Cloud timer
configuration updated only; no cloud rollout/IAM verification. Automatic repost
and delegated credentials deferred; User event consumers missing. Sprint [~].
Evidence: changes/CHANGE-105-local-emulator-and-review-hardening.md.

## CHANGE-104 / ADR-035: actual Credit command integration

Vincent approves HTTP CREATE/ACCEPT/ABORT recovery on the current branch. Same keys, candidate IDs, leases, unresolved guards and deadlines remain. Fresh user authorization is still required for Continue; trusted credentials and repost recovery remain deferred. Sprint [~] until full-stack gates pass. See CHANGE-104 for actual test evidence.

## CHANGE-102 / ADR-034: recovery-first minute scheduler

Vincent confirms `sprint-2-3-credit-service-concurrency-update-event-payload`.
One minute job runs eligible command recovery, OPEN expiry, then >=48-hour
DELIVERED completion, sequentially with independent phase failures. HTTP command
recovery remains disabled; no new repost retry or peer integration. Outbox
retains immediate publication and a separate 15-minute scan. Sprint `[~]`.

## CHANGE-100 / ADR-033: foreground command recovery stub milestone

Vincent's approved Sprint 2–3 slice on sprint-2-3-credit-service-concurrency
adds durable CREATE/ACCEPT/CANCEL_ACCEPTED recovery and companion frontend.
Local contract-stub tests only; live HTTP recovery disabled. Repost background
retries and delegated credentials remain paused. Sprint `[~]`.

## CHANGE-093 concurrency verification extension

Vincent approves the fifth real PostgreSQL race: courier acceptance versus
requester OPEN cancellation, both winner orderings, using existing unchanged
transactional locking. New pair 2/2 and all five races 10/10 pass, no skips;
49 related service/domain/transition regressions also pass, zero failures/errors/
skips (test commit 827844b). No new lifecycle/peer/schema/UI
design or overall Sprint completion; peer calls/dispatch remain mocked.
## Mode-specific status options — CHANGE-095 (2026-10-09)

Requester dropdown excludes ABORTED. Courier dropdown excludes OPEN, EXPIRED and CANCELLED; it retains ABORTED immutable-attempt history. All statuses remains the default. OrderStatusFilter requires an explicit requester/courier mode, supplied by each existing page. This is a UI-only refinement of ADR-032: existing API enum/query, authentication, ownership, pagination and five-second polling remain unchanged.

## Order personal filters and five-second polling — CHANGE-094 / ADR-032 (2026-10-09)

Yao Xiang explicitly requests five-second Order UI polling, Abort errand wording, and status filters on My Errands/My Requests. The existing /api/orders/mine adds optional status; default all, invalid status 400, existing identity/mode checks and page envelope retained. Database filters before page/count, preserving ABORTED courier attempts and hidden successfully reposted requester originals. Existing Base UI filters/pagination reset page 1 and cancel stale reads. Order-only polling is5 seconds; Credit/generic default 15 seconds; auth/visibility/no-overlap/focus/mutation protections retained. No scheduler, event, peer, schema or background-retry change. Verification and limits: CHANGE-094. Historical Order interval descriptions are superseded only by this approved amendment.

## Lifecycle per-order failure isolation — CHANGE-093 (2026-10-09)

Yao Xiang explicitly requests failed scheduled tasks be skipped while later successes continue. Due selection returns IDs filtered in the DB (latest delivery cutoff for completion), without locking a whole batch. Nontransactional lifecycle coordinator calls fresh NOWAIT-locking per-order transactions (expiry worker / existing autoComplete with REQUIRES_NEW), catches each RuntimeException including commit failures, logs order ID, counts only successful transitions, then continues. Scheduler retains independent whole-pass catches. Failed orders remain eligible next normal lifecycle pass; no new repost retry mechanism or cron/contract/schema/peer change. Previous batch transaction description is superseded by this refinement; CHANGE-092 compact payloads and FEEDBACK-009 remain unchanged.


## Effective compact-event amendment — CHANGE-092 / ADR-031 (2026-10-09)

Yao Xiang approved the exact seven-field Order-only payload: eventId, eventType, orderId, orderStatus, creditAmount, occurredAt, courierId. This replaces full snapshots and overdue facts ONLY for OpenOrderRefundTaskEvent and OrderCompletionTaskEvent. AcceptedOrderCancellationTaskEvent retains its existing v1 envelope/snapshot. Internal outbox versions and Pub/Sub eventVersion attribute remain (compact schema v2); topic names and DB schema unchanged. Old pending snapshot rows normalize at dispatch from their saved facts, with stable IDs. Lifecycle/outbox scheduling, locks, synchronous Credit assignment/reset and ADR-025 abort behavior remain. Historical v1 descriptions below are superseded for these two bodies. Credit currently requires the old snapshot and overdue; FEEDBACK-009 is INCOMPLETE_OR_INCOMPATIBLE. User completion penalties need an agreed separate overdue source. User approved implementing Order-only and documenting peer work; live integration remains blocked, Sprint [~].


## Current validation slice - CHANGE-091 / ADR-030 (2026-10-09)

Vincent approves Order/frontend field-specific creation errors and a 30-minute
minimum for new automatic plans (scheduled due to expiry) and manual submissions
(submission to expiry). Existing saved explicit-expiry plans are grandfathered;
no migration, peer, retry or scheduler change. Source/test verification in
CHANGE-091; live browser/peer gates remain and Sprint stays [~].


## One-time Credit push security repair - CHANGE-090 (2026-10-09)

Vincent approved the narrow Credit converter/test exception. Signed push no longer
uses Firebase user-role lookup; ordinary user guards and all Google validators
remain. Fifteen new regressions and fresh clean Credit verify pass: 80 tests,
no skips, 95.48% line/85.56% branch coverage. Source/test commit 198cd7c.
See the interference MD and FEEDBACK-008 READY_FOR_VERIFICATION. Credit owner
review, local image rebuild and real Google refund/transfer/duplicate/DLQ checks
remain open. This does not close Sprint [~] or other peer/repost blockers.

## Effective local-live connector — CHANGE-088 (2026-10-09)

Vincent's approved local-only deployment refinement is implemented/tested in
ADR-029; [runbook](local-live-testing.md) supplies safe Setup/build/up/Check/Pause/down.
Real HTTP peers and real cloud financial push target local Credit/database.
60 config/safety and 16 restricted-ingress fixture assertions pass, not actual
cloud/financial verification. No real stack/cloud changes performed by this run.
User consumers, Credit semantic gaps and paused background retries stay open.
No sequence/Sprint `[x]` upgrade.

## Effective Credit review — CHANGE-087 (2026-10-09)

Vincent's documentation-only review runs on sprint-2-3-credit (09e04a0).
Credit assignment/core reset and refund/completion handlers now exist in source;
do not ask peers to recreate them. Current gaps are replay authorization (003),
terminal reservation/recovery (006), legacy accepted-cancellation refund routing
(007) and delegated background auth (005). Separate push provisioning exists but
live subscriptions/IAM/ledger are not verified. Read peer feedback section 6.
User consumers remain missing; retries paused. No source/cloud changes or [x].

## Effective CHANGE-086 follow-up (2026-10-09)

Explicit automatic new expiry and persisted latest failure outcomes are
implemented in the approved Order/frontend slice. V4 disables legacy plans
without an expiry; it does not delete rows or invent deadlines. My Requests
retains safe manual/automatic attempt messages after reload and clears them on
successful repost linkage. Strict rule: expiry > due >= original expiry.
Late execution only while saved expiry is future. Verification in CHANGE-086.
All background retries/trusted credentials remain paused; peers/browser/cloud
remain gates and Sprint status remains [~]. The dated paragraphs below are
historical context, not the effective expiry/persistence status.


Current sprint: Sprint 2 and Sprint 3 (Order-owned lifecycle slice; `[~]`)

CHANGE-085 implements visible authenticated 15-second polling and current manual
EXPIRED-card failure messages. Full reload does not retain that client message;
automatic persistent outcomes remain deferred. User now PAUSES ALL background
retry implementation until peer agreement, including mock-mode jobs.
Credentials remain proposal-only. Read the rewritten service-classified
peer-service-api-feedback.md (002-006) for provider work. Historical approval
and test evidence below are retained, not current completion claims.

Latest CHANGE-083 / ADR-026: one minute-based expiry/completion job and
15-minute outbox recovery; immediate AFTER_COMMIT publication retained.
Approved target: `repostExpiresAt > repostDueAt >= original.expiresAt`.
Explicit repost expiry, durable retries and insufficient-credit-only persistent
UI feedback are NOT implemented yet. CHANGE-084 / ADR-027 records Vincent's
approval of bounded same-ID temporary retries, short permanent-failure messages
and polling. Trusted credentials are approved for documentation/peer discussion
only: DO NOT IMPLEMENT them yet. Concrete retry/security design and peer agreement
remain open; FEEDBACK-005/006 and the diagram reconciliation record the gaps.
Do not claim 100% diagram compliance.

Current developer/workstream: Vincent, `sprint-2-3`, approved on 2026-10-08 in
CHANGE-081/082. Read `changes/CHANGE-082-sprint-2-3-lifecycle-implementation.md` and the
current section of `docs/active-work/vincent.md` before implementation. The user
selected the local `Order Service Overall Doc.pdf` alongside D1. The previously
fingerprinted Updated PDF is absent; do not claim the two PDFs are equivalent.

The approved lifecycle/history/reset/repost design is implemented under ADR-025.
V3 preserves business IDs and adds internal UUID/immutable attempts; every abort
resets Credit before OPEN/EXPIRED, queues User penalty and refunds only EXPIRED.
Reposts retain both IDs and hide linked expired originals before requester pagination.
Local verification passed 162 backend tests (no skips), 34 frontend tests,
lint/typecheck/build and fresh  >=80% line/branch coverage. Peer assignment/reset
and event subscribers are missing/unverified; HTTP must fail closed, not mock-fallback.
Trusted auto-repost credentials, authenticated browser and Cloud Run scheduling
remain pending. This does not finish NTH3 Admin/report/hold/resolution features.
Read `sprints/sprint-2-3/README.md` for effective diagrams and boundaries.
Prior Sprint 1 records remain historical and must not be deleted.

## Historical Sprint 1 context

CHANGE-080 repairs post-merge Compose validation by removing the retired user-mongodb helper whose volume was undeclared. Main's MongoDB/User Service configuration and Order's PostgreSQL/PubSub configuration are preserved. Base and HTTP-peer config validation pass locally; hosted CI rerun remains pending.

CHANGE-078/ADR-023 changes only the outbox recovery poll to hourly (top of each hour). The after-commit listener still attempts publication immediately; expiry remains every 15 minutes and auto-completion every minute. Failed events may wait nearly an hour for the next scan while the service runs; Cloud Run scale-to-zero can delay recovery further.

CHANGE-077/ADR-022 adds quarter-hour minute selectors to Requester creation/repost times and rounds default/minimum suggestions upward. Expiry defaults to every 15 minutes and outbox recovery hourly under ADR-023; auto-completion stays every minute and after-commit dispatch remains immediate. Frontend tests/lint/type checks and backend tests/coverage pass locally; six Docker integration tests and browser visual/deployed scheduling checks remain unverified.

CHANGE-076 sets the three Order Pub/Sub destination variables in production.env to the user-created prod-v1 topics and in staging.env to the existing dev-v1 topics. Both deployment templates render correctly. Main triggers staging; production remains manual promotion. Topic IAM and live publishing remain team verification tasks.

CHANGE-075 repairs the seven test failures/errors in the supplied CI attachment. Local verification now passes 117 tests; six PostgreSQL Testcontainers checks were skipped because this sandbox cannot access Docker. Fresh coverage is 90.82% lines and 81.19% branches. CHANGE-074 Compose config validation also passes with an empty temporary ADC path. Hosted CI, including PostgreSQL integration and image/infrastructure checks, must still run on the pushed fixes.

CHANGE-073/ADR-021 replaces the default Pub/Sub emulator with real Pub/Sub in the existing GCP project. Local Compose uses the three dev topic IDs, personal ADC, and topic-scoped publisher permissions; production topic IDs are environment-configured and Cloud Run uses its service identity. GCP topic creation/IAM and live publish verification remain pending. CHANGE-074 supplies a temporary empty ADC path to the CI-only Compose config check; the local stack still requires each developer’s personal ADC mount.

CHANGE-072/ADR-020 amends the earlier 48-hour auto-completion exclusion: a configurable Spring scheduler completes due `DELIVERED` orders using database cutoff selection, a row lock, and the existing completion event/outbox. The user authorized this Sequence 5 work on the profile's current branch; the shared allocation branch label remains inconsistent and was not changed.

CHANGE-069/ADR-018 keeps expected Order versions within Order's own commands and validation. Credit assignment sends only Order ID and courier ID; hold/reset sends only Order ID with no body. Event payloads retain `orderVersion`. CHANGE-070 finalizes FEEDBACK-003 as an agreed synchronous flow and request contract; the Credit endpoint remains unimplemented. FEEDBACK-004's assignment contract and endpoint also await Credit.

CHANGE-068/ADR-017 adds the user-approved Order-side Credit courier-assignment stub to Sequence 3. The service calls Credit synchronously after validating the locked order and persists `ACCEPTED` only after a matching successful response and a post-call expiry recheck. The mock is available in mock-peer mode; the proposed HTTP path has no matching Credit provider endpoint yet. See FEEDBACK-004. The earlier local compiler blocker was bypassed for verification in CHANGE-075 by launching the wrapper-selected Maven directly and using Java 21 source/target flags; the POM and hosted CI toolchain are unchanged.

Implementation authorization: the user approved combined sequences 1-11 on the current handoff branch on 2026-09-30. CHANGE-053 approves the publisher/event payload direction; CHANGE-054 selects Google Cloud Pub/Sub; CHANGE-056 unifies completion events; CHANGE-063/ADR-013 approves transactional outbox delivery with immediate after-commit dispatch and cron recovery. Peer consumers are assumed future work and must not be edited in this scope.

Shared developer allocation: `docs/work-allocation.md`.

- Developer 1, Yao Xiang: sequences/features 1-6 on `sprint-1/seq-1-to-6`.
- Developer 2, Vincent: sequences/features 7-11 on `sprint-1/seq-7-to-11`.

Determine the current developer from the ignored `docs/local/developer-profile.md`, then validate that profile against the shared allocation, the developer's active-work file, and the current Git branch. This file does not identify a permanent current developer.

Authoritative scope:

- `sprints/sprint-1/scope.md`
- `sprints/sprint-1/requirements.md`
- `sprints/sprint-1/architecture-context.md`
- `sprints/sprint-1/contracts.md`
- `sprints/sprint-1/acceptance-tests.md`
- `sprints/sprint-1/class-diagrams/README.md`
- `sprints/sprint-1/sequence-diagrams/README.md`

Source implementation pack: `../../../Sprint 1/Order Service Sprint 1 Doc.pdf`.

Mandatory pre-implementation workflow references:

- `docs/architecture-review-playbook.md`
- `docs/architecture-evolution.md`
- `docs/peer-service-api-feedback.md`
- `docs/frontend-integration-workflow.md`
- `docs/event-candidates.md`

Shared frontend context: reuse `../frontend/`, the existing Next.js 16 App Router responsive web application. Sprint work with approved UI impact must identify `ADMIN`, `USER` Requester mode, or `USER` Courier mode and be coordinated against current frontend Git/active-work state. The role/client context does not authorize a detailed UI, shared-file change, or Sprint implementation.

For this branch-only approval, sequences 1-11 are in progress as one combined implementation. The normal two-developer allocation remains unchanged on other branches.

## Updated overall design reconciliation - 2026-10-02

CHANGE-057/ADR-012 adds an explicitly user-approved Order-side admin query supporting NTH1: `GET /api/orders` is admin-only, paginated, and optionally filtered by status. It does not implement the Admin Service or dashboard UI.

`../../../Order Service Overall Doc - Updated.pdf` informs Sequences 5-7. `CHANGE-053` records the full-Order event payload and topic placeholders; `CHANGE-054` selects Google Cloud Pub/Sub; `CHANGE-056` unifies completion events; `CHANGE-063/ADR-013` supersedes publish-before-status with atomic state/outbox commits, immediate after-commit dispatch, and cron recovery. Delivery is at least once and consumers deduplicate stable event IDs. Peer consumers remain future work and out of scope. Same-order `ABORTED` reopening remains outside this implementation.

`CHANGE-055` / `ADR-010` clarifies lifecycle authorization: accepted cancellation is performed by the assigned courier; acceptance requires a null courier assignment; courier progress remains assignment-bound; open cancellation and completion remain requester-owned. Role verification precedes idempotent receipt replay.

`CHANGE-064` / `ADR-014` adds a deadline split to accepted cancellation: before expiry, wait synchronously for Credit's hold/reset confirmation before changing `ACCEPTED` to `OPEN`; at/after expiry, transition to `ABORTED` and publish the cancellation event for Credit refund and User courier penalty. Open-cancellation, expired accepted-cancellation, and completion subscriber actions are detailed in `docs/peer-service-api-feedback.md`.

`CHANGE-065` / `ADR-015` originally added a separate expiration event. `CHANGE-071` supersedes that event contract: the Spring `@Scheduled` job still discovers due unassigned OPEN orders and atomically persists `EXPIRED` plus its checkpoint, then records `OpenOrderRefundTaskEvent`. Requester-triggered OPEN cancellation records the same event with `CANCELLED`. Credit consumes the single event/topic and refunds/releases based on the resulting Order status. The synchronous Credit release call is removed. Cloud Run's current scale-to-zero/request-based CPU does not guarantee in-process scheduled execution while idle.

`CHANGE-067` / `ADR-016` removes checkpoint history from all published Order event snapshots to avoid growing message bodies. Order still stores and serves checkpoint history, and completion still derives `overdue`/`overdueAt` from it. The event contract stays at version 1 because peer consumers are future work and none were found in the inspected implementations.

The Order Service persistence/deployment conflict is resolved by user-approved ADR-008: PostgreSQL on one Cloud SQL instance with separate staging/production databases, deployed through Cloud Run using a public-IP Cloud SQL Java Connector. This infrastructure decision does not authorize Sprint 1 business implementation or select a migration tool.

Open frontend contract blocker: the frontend application model is `ADMIN`/`USER` with Requester/Courier `USER` modes, while current backend conventions name requester/courier/admin authorities. The actual User Service contract and mapping must be inspected and approved before role-sensitive implementation.


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


CHANGE-142 (2026-10-18), user-directed presentation refinement: Report detail and submission use one continuous panel, with Order summary before report metadata and aligned definition-list rows. Admin clicks the Order summary to navigate to existing /admin/orders/{id}; no separate View full order details button and no financial actions on Report pages. Only Mark report resolved remains. Existing Order page actions, API/mocks/auth/statuses/polling and DB stay unchanged. GOV.UK summary-list structure informed layout; FoC theme retained.


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

## Effective real User directory and resolution display — CHANGE-161

CHANGE-161 / ADR-058 (Yao Xiang,2026-10-29) supersedes CHANGE-160 ID-only/blank-directory behavior: GET /api/users/admin/search supplies the initial real User page and optional exact Firebase ID/literal case-insensitive username search, Mongo count/filter/sort/paging, size1..100 and active-admin authorization. User Service edits are explicitly limited to this endpoint/DTO/query, tests/test dependency and maintainer handoff; legacy routes/model/role/penalty/deactivation behavior unchanged. Frontend requests20, keeps ID default and enables Name, with no generic mock fallback. Admin resolution is full-width below Repost information; retired waiver fields/empty admin values are hidden in UI only. No Order lifecycle/schema/saga/config/cloud change. Only Report remains a missing Admin HTTP integration; separate subscriber/Supplier guard follow-ups remain.

Contract/handoff: ../../user-service/user-servicehandoff.md. Verification: CHANGE-161.


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


Report picker UI refinement (2026-10-30, Yao Xiang, CHANGE-168): the user explicitly replaced the radio-card layout with compact single-column selectable rows. Keep description, truncated Order ID, status and Created date; remove Started and the pre-submit Active report label. Existing optional credit context, selection/accessibility, photo validation and duplicate message on submission remain. This is frontend display only: no backend/API/event, schema/index, environment, permission, workflow or cloud changes. Source: frontend/src/components/reporting/report-form.tsx; existing regression tests updated. Focused verification results recorded below.


## Effective reporting simplification - CHANGE-169 (2026-10-30)

Owner: Yao Xiang on feat/reporting-service. The user revoked the optional CREDITS/Order association introduced in CHANGE-168 and requested the initial submission UI, while retaining completed/cancelled Order lookup and the red courier reply reminder. This supersedes only credit association and picker layout from CHANGE-168; active reporting/hold restrictions, duplicate feedback and the response-count behavior remain.

CREDITS and GENERAL submissions are unlinked: no Order selector or lookup, orderId null, READY_FOR_REVIEW, no reported courier, response deadline, completion hold or automatic credit adjustment. Sending a nonblank orderId for either category returns400. ORDER/COURIER keep the existing active-only associated-order dropdown. The card/row/date alternatives are removed from this form. A supplied initialOrderId is ignored for unlinked categories. Form contents/photos and the helpful active-report message remain on failure.

Retain GET /api/orders/mine/completed and /api/orders/mine/completed/{orderId}. Add the matching GET /api/orders/mine/cancelled and /api/orders/mine/cancelled/{orderId}. OrderCreditHistoryController replaces the internal CompletedReportOrderController class name without changing the completed URLs. List endpoints return the existing one-based Order page, with status/ownership/count/pagination in SQL; detail returns404 for wrong status, missing or unrelated orders. Requester/current assigned courier only, from verified principal, with any recognized Order role. Read-only history: no Credit ledger access, hold, funds or penalty changes. These APIs are independent of Report submission. Expiry also has refund behavior in the existing system; the requested retained history scope here is COMPLETED/CANCELLED, not a statement that other statuses have no Credit activity.

Remove the now-unused Report getCompletedOrder HTTP adapter/interface method and CompletedOrderContext DTO. Keep reading historical linked credit reports and resolving them locally through the existing Report journal; no database records are deleted or backfilled. The Report result/compensation contracts and topics remain unchanged. No SQL/Firestore migration or new index/env/role is required. Existing completed-query metadata, including nullable startedAt, is retained as response compatibility; the form does not display it.

Preserve GET /api/reports/mine/response-count and the red badge in normal desktop/mobile Report an Issue navigation, including five-second visible/authenticated polling, caller isolation and deadline filtering. No User/Credit/Supplier backend, CI workflow, cloud setup, running container or application database mutation is part of this change. Backend Java, Report form/tests and existing documentation are the affected slice. Tests and final evidence are recorded below after verification.


## Effective CHANGE-170 - 2026-11-01

Yao Xiang on hfix/report-service approved Report resolution response/recovery fixes, meaningful held-action rejection messages, Report-to-Orders exact-search navigation, ORDER/GENERAL-only new submissions with legacy readability, and COURIER_BAD_ATTITUDE=2. Return fresh Report responses without forwarding downstream HTTP framing headers. Preserve business rejection messages only before possible Credit effects; retain compensation afterward. V19 expands existing deferred-penalty constraints without changing saved rows or old migrations. Existing saga, holds, event schemas/topics and production flags remain unchanged. User penalty consumer integration is still missing in the inspected checkout. See changes/CHANGE-170-report-resolution-and-feedback-hotfix.md and reporting-service/HANDOFF.md for implementation and verification evidence.

CHANGE-170 final evidence: Report62 full verify and frontend280 full suite pass; affected Order42+common13 verify/coverage passes after latest-version fixture updates (current source-matched Order reports676 green). Backend coverage, frontend lint/build, OpenAPI, TOML and whitespace verified. Uncommitted work awaits user PR and staging smoke check; no deployment. See CHANGE-170 for the complete failure/rerun account.

## Effective CHANGE-171 / ADR-064 — courier Errand reports (2026-11-01)

User-approved: ERRAND lets the currently assigned courier report ACCEPTED, IN_PROGRESS, PICKED_UP or DELIVERED Orders, directly READY_FOR_REVIEW without self-response/deadline/reminder. ORDER stays requester-only; GENERAL unlinked; historical COURIER/CREDITS readable. GET /api/orders/mine/active adds mode=courier (default requester). Existing hold body adds reporterRole=COURIER (default REQUESTER). Verified role/token subject and SQL current ownership/status scope are mandatory; placement remains locked/transactional and hold rows bind the actual requester. New Report requesterId is actual owner; reporterId remains submitter. Legacy linked non-ERRAND records fall back to reporterId. Frontend selects the correct scoped list and labels submitter correctly. Replies remain submitter/admin only. Existing one-active-report, funding pause, continued delivery and resolution/compensation stay unchanged. No new SQL migration, topic, GCP or User/Credit/Supplier backend change. Deploy Order/Report/frontend together; older Report binaries cannot read new ERRAND documents. See changes/CHANGE-171-courier-order-reports.md and docs/decisions/ADR-064-courier-errand-reports.md for approval, design and verification. Implementation and verification in progress; prior170 staged work preserved.


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

Suspension fix [~]: latest explicit user amendment requires suspended couriers rejected for new errands but allowed to finish assigned work. User role-context flag/role retention inspected in actual provider. Order adapter/security/recovery and companion USER Courier intent handling updated; no admin layout, peer business logic or financial rule change. CHANGE-179/ADR-067; final verification pending.


CHANGE-179 verification amendment:701Order+13common full scoped verify passes, no failures/errors/skips; branch81.28/line94.63%;321frontend tests, lint and both Docker builds/TypeScript pass. Initial environment and fixture failures are resolved; authoritative final log is target/change179-scoped-verify.log. No backend peers, schema/config/cloud change. Images built, application stack not started; browser/staging rollout pending. Full acceptance/negative-case traceability is in changes/CHANGE-179-suspended-courier-acceptance.md.


## CHANGE-180 - Admin suspension controls (2026-11-04)

[~] User-approved Admin Users profile suspension/unsuspension UI implemented against ready User endpoints. Automated frontend checks pass:331 tests, lint and TypeScript. Docker engine unresponsive and direct production build hit Windows OutOfMemoryException; no new image/runtime verification. Existing local User image lacks Unsuspend until rebuilt. Human/browser/staging verification pending. No backend scope expansion; see CHANGE-180.


## CHANGE-181 - Supplier frontend API alignment (2026-11-09)

[~] Yao Xiang, hfix/suppplier-not-showing-up: user-approved missing supplier/optional image/types fixes implemented. Existing Supplier GET list/types and POST/PATCH only; Order backend and all peers unchanged. Follow-up requires explicit null on create, implemented. All-pages loading fixes the current catalogue; search-based large-scale design is a proposal, not approved implementation. Verification and production-build limitations in CHANGE-181; browser/actual record verification pending.


CHANGE-181 final verification (2026-11-09): explicit null create image implemented; initial7 expected RED failures, focused82 pass, explicit-null refinement RED1/12 pass, final343 frontend tests across56 files pass. Full lint and Next route generation/tsc pass. Docker stopped (engine pipe absent); direct production build failed host memory allocation. No image/browser/live account or Supplier writes verified/performed. No backend/source/auth/schema/config/cloud changes. Large-scale searchable selector/backend index/cursor design remains proposed only, pending developer approval. No commit/push; frontend and required documentation changes remain for user review. See changes/CHANGE-181-supplier-catalogue-form-alignment.md for exact scope and logs.


## CHANGE-182 - Supplier selection UI approved (2026-11-09)

[~] Yao Xiang continues on hfix/suppplier-not-showing-up. Approved browse20/search300ms/Show more design implemented in USER Requester Order form using installed Base UI and existing Supplier GET. No supplier reads before opening. Abort/late-response/selected-label/error/keyboard tests and existing creation validation verified; final full suite/build evidence follows CHANGE-182. No backend/schema/auth/index/shared config changes. Preserves CHANGE-181 optional-image/type fixes. Backend100million-scale indexing remains separately proposed; browser/runtime verification pending.


CHANGE-182 final verification (2026-11-09):18 focused tests and354 full frontend tests across57 files pass; full lint and Next route generation/tsc pass. Initial browse tests reproduced2 failures; whitespace-query edge separately reproduced/fixed. The only final change after the full run was a responsive popup max-height/overflow class using the existing available-height convention; no behavior logic changed. Bounded production build attempt still failed native process out-of-memory despite heap/Rust-thread caps. Docker stopped; image/browser/320px/staging verification pending. Current SupplierSelector is integrated in USER Requester Order creation; no backend/API/schema/dependency/config/index/cloud/data changes. Earlier CHANGE-181 Admin null image/type patches retained, fetch-all Order loader superseded. No commit/push; current source/tests/docs left for user review. See CHANGE-182 for file/contract/sequence and verification evidence.
