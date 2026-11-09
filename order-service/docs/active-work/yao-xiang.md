## Completed approved local slice — CHANGE-141 (2026-10-18)

Approved: local delivered-item Report prototype, single Resolved final status, real report-specific admin hold release and delivered-only overdue penalty waiver; factual overdue stored at delivery. User accepted no reward on waived late completion. No Report Service exists: live Reports stay Coming soon; sibling backends untouched. RED tests captured for selection count and missing review domain API. Order/admin review APIs, local report UI/prototype and V12 implemented. Final common12+Order528=540 and frontend233 tests pass; coverage gates, typecheck, lint (3 existing warnings), build and1440/390 browser checks pass. Local Order DB backed up and V12 applied. Live Report integration remains blocked/MISSING (FEEDBACK-015); no integration-complete claim.

# Yao Xiang - Sprint 1 Active Work

## CHANGE-140 admin table pages verified — 2026-10-17

User requests15/20 visible table rows; choose20 for Orders and Users, retaining server paging/scroll and actual smaller result counts. Current matching owner/branch/context/PDFs/frontend inspected. Implementation detail; no new endpoint or backend/schema/config change. Existing adapter assertions updated first (3 RED failures), then58 focused admin tests pass; TypeScript/lint pass (3 existing login warnings). Orders live/mock and sample Users20; actual fewer records stay fewer; live User directory pending unchanged. No backend/browser/container/cloud checks repeated for this request-size-only detail. Rebuild frontend for rollout. See CHANGE-140.

## CHANGE-139 compact calendar toolbar verified locally — 2026-10-17

User confirms reference calendar controls without Created-from text and existing refresh icon; implement compact table-height bar and real creation-date SQL filtering per CHANGE-139. Matching owner/branch, PDF hashes unchanged, existing frontend/API inspected. No extra financial actions, peers, schema or root config. RED UI missing calendar controls; backend missing overload confirmed. Focused77 backend and20 frontend checks now pass including real PostgreSQL creation-boundary/count/page checks. Final root common12+Order499=511 verify/coverage/JAR passes; frontend224/typecheck/lint/build pass (3 existing login warnings). Desktop1440/mobile390 built-browser check passes, toolbar41px, actual sample date filtering and icon refresh verified. First full run signature fixture fixed and transient recovery failures passed unchanged on isolated/full rerun; no recovery root-cause fix claimed. No new schema; existing11. Preview processes/account removed; rebuild Order/frontend images for rollout. Cloud UI not verified. Existing user stack is running; use separate preview ports and do not restart its containers or data.

## Admin compact toolbar/date-filter advice — 2026-10-17

User requests a slimmer table-height toolbar, date filtering and ideas for useful admin actions. Read current frontend actions/table/providers and actual AdminOrderController/query/repository; matching Yao Xiang/penalty-integration, context/PDF hashes unchanged. Existing admin list supports status/paging, not dates. Discuss compact top actions + Created date range + header-aligned per-column controls; recommend View details/Refresh/Clear filters, export/history/report navigation only as future scoped work. No extra destructive business action just to fill space. Date filtering must be SQL-backed before pagination and apply display-timezone day bounds. Advisory only; UI/API implementation and additional filter contracts await agreement. No source/tests/schema/config modified; no tests run for this advice.

## CHANGE-138 admin Order actions UI verified locally — 2026-10-17

User requests row selection/top actions, retained full details, penalty/no-penalty
and preset/custom reasons in current styling. Implement Order/frontend slice with
saved optional backend explanation (required UI), policy lookup and isolated demo
counterparts; V11 additive nullable reason, legacy receipt hashes preserved. No
new credit/score rule, sibling service/root config, real event schema or bulk action.
Current owner/branch/context/PDF/frontend baseline checked; prior merge/134–137
work retained. TDD/verification/migration handoff: CHANGE-138 and ADR-047.

End evidence: common12+Order494 verify/coverage/JAR pass; final PG reason/rollback6 pass; frontend218 tests/typecheck/lint/build pass (3 existing login warnings). Built UI checked desktop1440/mobile390 with fixed action buttons, policy/reason selection, isolated sample mutation and saved details. Local Order backed up then V10->V11, all7 rows retained. CUA unavailable; hidden Edge fallback with target-only relay. Rebuild Order/frontend images for rollout; real User scoring/cloud verification remain pending. Temporary preview processes stopped after checks; no push.

## CHANGE-137 Order increment verified — 2026-10-17

User authorizes admin counterpart to cancellation, including held-order funding
and explicit penalties. Existing Credit completion consumer matches current compact
event; no new peer/topic required. Detailed proposal CHANGE-137; starting states
and explicit-only scoring were approved in both chat answers2026-10-17.
Proceed with CHANGE-137 / ADR-046 TDD. Same Yao Xiang/current branch, source fingerprints
unchanged; prior merge/134–136 work retained. No frontend/peer source changes.

End-of-turn evidence: actual Credit compact decoder/handler/service unit tests8/8
pass; current settlement checks and replay locks inspected. No new admin-completion
source/route existed at the prior stop. Both choices now approved; implement/test
admin-only state/funding override without modifying ordinary holds.

Completed: same-controller POST /api/orders/admin/{orderId}/complete; assigned
ACCEPTED/IN_PROGRESS/PICKED_UP/DELIVERED (including held) -> COMPLETED; only selected
highest penalty, null/empty waived, no automatic score/reward. Decision/checkpoint/
bound receipt/completion and optional addition intents atomically saved under
NOWAIT/pending guard; hold history and delivery facts retained. New generic advice
keeps cancellation409 text and returns completion-specific retry guidance.
RED missing-domain API first; focused53 pass; fresh common12+Order486=498 tests,
zero failures/errors/skips, both gates/JAR pass. New PostgreSQL5 verify rollback,
replay/holds, contention/retry and admin cancel-complete race. Prod/local/OpenAPI
checks pass; generated Swagger and packaged JAR verified. AsyncAPI YAML/Ajv and
TOML408-qualified-key checks pass. Exact results/contracts/ADR-046/diagrams in CHANGE-137.
No schema/topic/UI/peer/root config or local-app/cloud writes; no stage/commit/push.
Rebuild Order image; human/deployed settlement and User consumer remain pending.

## CHANGE-136 verified — 2026-10-17

User requests imported Schema/necessary JSON names and cancellation in the existing
AdminOrderController. Keep routes/contracts/admin roles/transaction service intact;
repoint current tests first, then consolidate source and verify. Same owner/branch,
no frontend/peer/schema edits, existing uncommitted merge and CHANGE-135 preserved.

Cancellation is consolidated in AdminOrderController; original route/security/
validation/principal/service and lock409 retained. JsonProperty keeps existing JSON
keys, Schema import replaces qualified annotations. Five route tests RED404 first,
then pass; fresh verify470 tests and both gates/JAR pass. OpenAPI lists both routes
under admin-order-controller. Context/diagram/disclosure updated, no source drift,
unresolved merge, app rebuild, deployment, commit or push. Human/deployed review pending.

## Current task - CHANGE-129 active involvement/deleted labels (2026-10-14)

- Workflow/profile/branch/PDF fingerprints and current peers/frontend inspected.
  User approves both endpoints for all three roles; active SQL predicate and
  minimal boolean response. Declines new name rows; names remain lookup data.
- CHANGE-129 captures exact paths/auth/relationships/statuses and snapshot race/
  pending-obligation limits. Providers currently do not check Order before delete;
  no peer edits. Supplier missing fallback becomes Deleted supplier, layout kept.
- Start TDD within Order/companion frontend only; prior127/128 work retained.
  No admin/person layout exists here; no User-name storage or invented UI.

### CHANGE-129 completion evidence

- Both new read APIs and SQL EXISTS/current relationship predicates implemented,
  including held Orders and excluding terminal/aborted history. MapStruct DTOs
  return only ID/boolean. Existing card layout retained; missing/null supplier
  lookups use Deleted supplier; transient errors keep unavailable labels.
- Final420 backend tests0failures/errors/skips, original80% coverage gates pass;
  129 frontend tests/28 files, lint0errors/3 existing warnings, typecheck/standard
  production build pass. Local worker OOM/fixture issues and successful bounded
  reruns recorded in CHANGE-129. No app/CI resource config change committed.
- ADR-042/contracts/traceability/context/peer handoff/disclosure updated.
  FEEDBACK-015: User/Supplier deletion callbacks still absent, read is not a lock,
  pending financial/command obligations need coordinated owner policy. No actual
  deletion, peer backend, new schema/config, app rebuild, cloud deployment or push.
- Prior127/128 overlapping uncommitted work preserved, no broad staging/commit.
  No User-name Order rows exist on this branch; no rows or names added/stored.
  Browser/peer/deployment confirmation pending; full integration/Sprint[~].

## Current task - CHANGE-128 explicit courier penalties (2026-10-14)

- User requests enum amounts and separate add/deduct events for abort and
  completion. Workflow/profile/branch match; CHANGE-127 edits preserved.
- Inspected actual User +2 abort/+1 overdue/-2 on-time logic, outcome HTTP APIs,
  existing Order accepted-cancellation/compact completion events and outbox.
  No penalty subscriber/separate Penalty Service exists. CHANGE-128 contains
  concrete topics/payload/recipient/TDD/atomicity and legacy migration proposal.
- Decisions received2026-10-14: +2 abort/+1 overdue/-1 successful; new addition
  replaces accepted cancellation publication, Credit events retained. Capture
  cancelling/assigned courier in one courierId field. Begin Order-side TDD;
  real subscriber remains absent. Consumer clamp ordering across two topics needs a
  provider policy; no peer/consumer implementation or cloud provisioning claim.
- Previous turn inspected/designed only. Current approved implementation retains
  the prior tested completion-hold work. No sibling backend/cloud changes.

### CHANGE-128 completion evidence

- User approves +2 accepted cancellation/+1 overdue/-1 successful and replacement
  of new accepted-cancellation emission, Credit events unchanged. Shared topic-only
  configuration approved separately. Implemented enum/facts/MapStruct/DTO/publisher
  pairs, transitions and existing outbox dispatcher; IDs bind recipient/reason.
- Final403 backend tests0failures/errors/skips and original80% coverage gates pass
  (95.06%line/80.07%branch). Three bootstrap tests, both Compose config checks,
  Bash syntax and AsyncAPI YAML/reference checks pass. RED/intermediate assertion/
  coverage failures and correction recorded in CHANGE-128; thresholds unchanged.
- No sibling backend/new frontend/migration/live cloud/app rollout/push changes.
  Existing CHANGE-127 edits preserved. CI owner must provision new topic/IAM using
  updated configure-order-pubsub.sh before infra check; User subscriber, ordering
  and legacy cutover remain FEEDBACK-014. End-to-end scoring/Sprint still[~].

## Current task - CHANGE-127 completion holds (2026-10-14)

- User confirms Yao Xiang on order-service/penalty-integration. Workflow loaded;
  initial clean tree, source fingerprints unchanged. Requested persisted hold,
  scheduler/manual completion guards, requester explanation, and Report-facing
  place/release endpoints. Other backend services remain read-only.
- D1 NTH2 PDF38 and NTH3 PDF41 require report-triggered completion hold, no
  manual/48-hour completion and no final credit action before investigation ends.
  Submission itself must not change Order status or settle money.
- Current source has no hold flag/rows/endpoints; Report Service is absent,
  Admin Service a placeholder, existing prod auth accepts Firebase caller JWTs.
  Existing shared Order locks/outbox/receipt transactions must be retained.
- Proposal: docs/completion-hold-design.md. User decisions pending for Report
  service identity vs forwarded Firebase caller, and full active-order/final-
  credit coverage vs DELIVERED/completion-only scope. No application/schema/test
  edits until these material contracts are agreed; no live integration claim.
- Decisions received: requester Firebase forwarding/ownership and active-Order
  funding freeze; release deferred. Effective contract recorded before coding.
  Implement V9 per-report placement/boolean, guards before all funding outcomes,
  query filtering and locked rechecks, requester message and negative/race tests.

### CHANGE-127 completion evidence

- Effective decisions above supersede the initial pending proposal: forwarded
  requester Firebase auth, own active Order, funding freeze, no release endpoint.
- Implemented immutable per-report records/boolean V9, transactional locked PUT,
  explicit DTO/mapper, requester message and SQL/locked lifecycle guards. Race
  tests reproduced/fixed JPA merge rebinding and stale-version report messaging.
- Final394 backend tests0failures/errors/skips and coverage gates pass;126
  frontend tests/28 files, typecheck/lint/build pass (three existing warnings).
  Intermediate RED/assertion/build failures documented in CHANGE-127.
- Dedicated local Order DB migrated8 ->9 preserving seven Orders, zero held.
  Only Order PostgreSQL started; application containers and peers not recreated,
  generic postgres-dev untouched. No secrets, cloud, deployment or push changes.
- ADR-040/design/traceability/context/contracts/migration/AI records synchronized.
  FEEDBACK-013 retains absent Report caller; release explicitly deferred. Browser
  confirmation and actual Report/cloud integration unverified; NTH2/NTH3[~].
## Current task - CHANGE-125 Admin typography/theme consistency (2026-10-13)

- Same confirmed Yao Xiang branch/workflow and source fingerprints. User asks
  shared font/size/colour consistency; scoped Admin refinement, hierarchy retained.
- Completed central Admin typography/theme policy, regular IDs/record links,
  matching table/badge values, missing-balance helper and map popup theme styling.
- Full203 frontend tests/39 files, TypeScript/final build pass; lint0 errors/3
  existing login warnings; final layout lint/patch checks pass. Prior work/shared
  normal-profile presenter retained. No API/backend/config or Docker changes.
- Authenticated mobile/desktop/light/dark visual confirmation remains pending.

## Current task - CHANGE-124 uniform Order table typography (2026-10-13)

- Same confirmed developer/branch and sources; workflow reloaded. User wants
  consistent table sizes and regular IDs. Scope to table body, preserve headers.
- Completed matching date/badge size and link weight; all123 copy/ellipsis
  behavior and earlier119..122 work retained. Existing34 Admin regressions,
  TypeScript/scoped lint/build pass; patch clean. No backend/config change or
  Docker recreation. Actual authenticated visual check pending.

## Current task - CHANGE-123 compact table Order IDs (2026-10-13)

- Same developer/branch, workflow reloaded, sources unchanged. User requests
  bounded single-line table IDs, full copy and unchanged full detail IDs.
- Completed optional CopyId compact display only in Admin Orders table;
  preserve119..122 changes and all data/handlers. Existing34 Admin tests,
  TypeScript/scoped lint/production build pass; patch clean. No API/backend/config
  change or container recreation. Actual authenticated visual confirmation pending.

## Current task - CHANGE-122 Compose Admin provider switch (2026-10-13)

- Same Yao Xiang branch/workflow, source fingerprints unchanged. User authorizes
  shared Compose selection: mock UI with base, real partial Admin UI with HTTP
  override. Backend already HTTP; preserve that existing independent setting.
- Completed request-time flag/Compose selection and documentation. Eleven new
  tests observed RED first; final203 tests/39 files, TypeScript/build pass; lint
  0 errors/3 existing login warnings. Base/HTTP Compose config and resolved-mode
  projection checks pass. Docker read-only check required sandbox retry.
- No sibling backend, credentials, cloud, data or volume changes, service restart
  or deployment. Genuine admin role required in local-live; authenticated browser
  verification pending. Existing119..121 work preserved.

## Current task - CHANGE-121 consistent Admin search layout (2026-10-13)

- Same confirmed developer/branch, workflow reloaded, fingerprints unchanged.
  User requests consistency between Orders and other Admin search controls.
- Completed shared responsive form/action wrappers for all Admin searches,
  including live UID lookup. Preserve119/120 edits and existing behavior.
- Existing34 Admin page tests, TypeScript, scoped lint and production build pass;
  patch clean. No tests/API/backend/config changes or Docker recreation. Actual
  authenticated mobile visual check remains pending.

## Current task - CHANGE-120 mobile Order filter alignment (2026-10-13)

- Same confirmed developer/branch and workflow; fingerprints unchanged. Preserve
  in-progress119 edits. User requests aligned Status/Order ID fields on phone.
- Completed layout-only fix: single form grid, equal first-row controls, mobile
  action row; desktop stays inline. Existing handlers/contracts retained.
- Existing 34 Admin page tests, TypeScript, scoped lint and production build pass;
  patch check passes. No new tests, backend/API/config changes or Docker rebuild.
- No browser is connected; actual authenticated mobile visual check unavailable.

## Current task - CHANGE-119 environment-aware Admin UI (2026-10-13)

- Confirmed Yao Xiang on order-service/admin-dashboard; workflow loaded, source
  fingerprints unchanged. Explicit user approval recorded in CHANGE-119.
- Local keeps existing mocks. Nonlocal uses completed Order/Supplier/role/summary
  APIs and placeholders/disabled controls for unfinished User/Credit features.
- Completed frontend-only integration/capability gates and API handoff. No peer
  backend/config changes. Six contract plus seven runtime/UI regressions observed
  RED first; seventeen added overall, final 192 tests / 38 files pass. Typecheck and
  production build pass; lint 0 errors / 3 pre-existing login warnings; patch clean.
- Real staging admin role required; missing User/Credit capabilities remain
  uncalled. No Docker recreation/deployment/Git history or volume changes.
  Authenticated staging and responsive visual confirmation remain pending.

## Current task - CHANGE-116 internal row correction (2026-10-12)

- Same confirmed developer/branch; workflow/context reloaded; PDFs unchanged.
- User clarifies only internal field swapping, not card resizing. Restore normal
  Order card/grid layout, keep version/description swap and requester-first People.
- Supplier changes/backend/API/config unchanged. Existing regression observed RED
  then all175 frontend tests pass; typecheck/build pass; lint0errors/3 existing
  warnings. Only frontend recreated/healthy, Order detail200, Order unchanged/
  healthy; patch check passes. No scope expansion, volume removal or commit/push.
- Authenticated visual confirmation pending; backend checks not rerun for this
  frontend-only correction. No API/models/diagrams/workflows/config change.

## Current task - CHANGE-115 Admin detail layout (2026-10-12)

- Same identity/branch. UI-only explicit user request and implementation detail.
- Design recorded in CHANGE-115: metadata then credits/description final row;
  requester before courier; no list map; supplier status beside Location details.
- Delivered requested layout; previous mock/picker/backend behavior preserved.
- Verification:175 frontend tests, typecheck and lint0errors/3 existing warnings;
  production frontend build passes, only frontend recreated/healthy, Order and
  Supplier detail routes200. Existing Order unchanged/healthy; patch check passes.
  Three initial RED regressions. No volumes removed or Git commit/push.
- No API/schema/auth/config or peer-source changes; browser visual review remains
  pending. No backend tests rerun for the narrow frontend-only adjustment.

## Current task - CHANGE-114 Admin maps/layout (2026-10-12)

- Same confirmed identity/branch. User-approved map and layout refinements;
  design in CHANGE-114. Frontend implementation and Order docs only.
- Preserve existing mocks, permissions, normal SupplierForm behavior and peers.
- Delivered: map/address picker, supplier detail-only deactivation, separated
  User columns and grouped linked Order details, preserving all returned fields.
- Verification:173 frontend tests pass plus final28 Admin regressions; native
  TypeScript, production frontend build and lint0errors/3 existing warnings.
  Leaflet synthetic drag/popup/cleanup and provider/form/race tests pass. Generic
  Photon NUS query/CORS and one OSM tile smoke succeed. Only frontend recreated;
  healthy, Admin routes200. Order container/peer source/DB volumes unchanged.
- Remaining: no browser connected for authenticated visual confirmation; public
  map-provider availability is not guaranteed and real Admin peers stay pending.
  Backend tests not rerun for frontend-only changes. No Git staging/commit/push.

## Current task - CHANGE-113 dedicated Admin details (2026-10-11)

- Same confirmed identity/branch. Approved existing mock frontend scope.
- Design in CHANGE-113: full Order/Supplier routes, actions near heading;
  reuse existing exact-ID queries and preserve permissions/confirmations.
- Delivered: dedicated Order/Supplier pages and near-heading User/Supplier
  actions. Existing ID reads, list filters, guards and confirmations retained.
- Verification:160 frontend tests pass; typecheck and production frontend image
  build pass; lint0errors/3 existing warnings. Five observed RED regressions
  before implementation. Only frontend recreated; healthy. Both dedicated routes
  serve200 through gateway. Existing Order container stayed running/healthy.
- Backend peers, actual Order lifecycle, API contracts, schema, cloud and config
  unchanged. Backend checks not rerun for UI-only refinement. Mock integration
  and authenticated responsive visual review remain pending; no Git commit/push.

## Current task - CHANGE-112 Admin UI refinement (2026-10-11)

- Same confirmed developer/branch; frontend and Order mock APIs only.
- User-approved design recorded in CHANGE-112. Existing CHANGE-111 changes
  preserved. Backend peers inspected read-only; Credit admin history missing.
- Delivered: aligned controls, header mode button, SupplierBadges, full user
  profiles/history and selected-record routes from the Orders table.
- Verification:154 frontend tests, typecheck, lint0errors/3 existing warnings,
  production Docker build;380 Order tests/coverage pass plus11 focused contracts.
  Regression assertions observed RED before implementation. Normal Profile
  history retains its caller-specific loader. Both changed images rebuilt and
  only frontend/Order containers recreated. Both healthy; selected-user/location
  routes return200 through gateway, mock history returns401 without a token and
  its new operation appears in runtime OpenAPI. Patch whitespace check passes.
- No schema, actual peer, authentication or config change. Missing Credit
  other-user history documented as ADMIN-API-006. Browser visual checking remains
  pending; mock integration is not actual admin integration.

## Current task - CHANGE-111 Admin UI mock prototype (2026-10-11)

- Identity/branch confirmed: Yao Xiang, order-service/admin-dashboard.
- Request/design: changes/CHANGE-111-admin-ui-mock-prototype.md. User explicitly
  authorizes frontend mode/navigation and Order-local mock endpoints only.
- Baseline: working tree clean; latest context includes Vincent recovery changes
  through CHANGE-110. Preserve all those features and peer backend files.
- Workflow/context: parent/Order/frontend instructions, spec workflow, required
  context/ADR/sprint records and frontend baseline loaded. PDF fingerprints match
  existing records. Actual User/Supplier/Credit controllers/DTOs inspected.
- Implementation delivered: separate adapter, local-only sample store and mock
  role check; Orders, Users and Suppliers pages with confirmations/forms.
- Verified: 379 Order tests and coverage gates; final10 API/OpenAPI tests;146
  frontend tests, TypeScript and build; lint0errors/3 existing login warnings.
  Both changed Docker images built and local stack healthy. Three admin routes
  serve200; mock API remains401 without authentication; runtime OpenAPI present.
- Gate refinement: Compose uses prod security locally, so mocks require enabled
  flag + local environment + Firebase emulator instead of a non-prod profile.
  Only Order-owned Compose/env fields changed; cloud auth/settings unchanged.
- Remaining: browser automation unavailable (empty browser inventory); manual
  authenticated/responsive visual check. Real peer integration is outside the
  prototype milestone; exact pending contracts are in admin-peer-api-request.md.
  Sample updates reset on restart. No volumes removed or Git commits/pushes.

## Current request - explain authorization change scope (2026-10-08)

- Request: explain error handling and why the central role-annotation change touched many files. Advisory review only; no code change requested.
- Workflow: reloaded mandatory context, developer profile/branch, and inspected current role annotations, role provider, caller helper, adapters, security filters, handlers, tests and the 33 tracked diff paths.
- Findings: the annotations/controller placements are the wrapper itself. The broader Order-only change makes production roles come from User Service HTTP (the previous config used mock roles), validates role-context identity, reuses the same verified request principal in adapters, retains fresh courier eligibility and local mock access, and maps 401/403/503 errors. Tests and architecture/workflow documentation were updated under the Order Service process.
- Assessment: the broad scope is explained by the requested production role source and project workflow, but it is more than a wrapper-only implementation. No source changes made during this explanation.
- Verification: source/diff inspection only; no tests run this turn. Existing uncommitted implementation remains intact.


## Current request - explain separate eligibility and ownership guards (2026-10-08)

- Request: explain what preserving separate courier eligibility and locked Order ownership checks means after the annotation refactor. Explanation only; no behavior change.
- Workflow: reloaded 58 mandatory instruction/context/Sprint/decision records, developer profile/combined branch and live adapter/application/domain guards. Existing pending implementation preserved; original PDFs remain unavailable as previously recorded.
- Findings: annotations check confirmed role membership. HttpPeerAdapters still calls User Service courier-eligibility independently. Application methods lock the Order before aggregate guards compare the actor to its assigned courier or original requester and validate status/version. A valid courier role cannot authorize another courier's assigned order, and suspension can make a courier ineligible even when the role remains. Acceptance has separate OPEN/unassigned/non-self acceptance rules.
- Verification/status: inspected current source; explanation complete. No source, API, architecture, diagram, test or configuration changes; no tests/live peer calls executed this turn. Only this work record and AI disclosure updated.


## Current request - contextual role annotations (2026-10-08)

- User approved implementation of centralized User Service role verification and role annotations in our context. ADR-024 / CHANGE-079 record the detailed design before source changes.
- Scope: Order Service only plus authorized AI disclosure; local anonymous/mock behavior, HTTP courier eligibility, locked ownership guards, internal schedulers and API DTOs remain. Production Order-specific role lookup uses HTTP; shared sibling role configuration is untouched.
- Workflow: mandatory context and frontend baseline inspected; developer/profile/combined branch match. Original source PDFs remain absent; effective approved Markdown contracts apply. User role/eligibility source matches the existing contract; live peer verification remains pending.
- Implementation: three command role meta-annotations plus a shared-read role annotation; production HTTP roles once per request, response identity validation, central typed JWT caller guard, fresh courier eligibility, generic 403 and dependency 503. Traditional top-level role DTO; application/domain locked ownership guards, API/event schema and local/system behavior preserved.
- Verification: initial 7-test run had three expected failures; refined focused 37 tests pass. Full suite: 140 tests, zero failures/errors, six Docker-dependent PostgreSQL checks skipped (named-pipe access denied), 134 passed. Fresh coverage: 91.21% lines / 82.19% branches; configured 80% check passes after aligning the local check with fresh execution data. OpenAPI and diff checks pass.
- Persistent updates: ADR-024 / CHANGE-079 / ARCH-EVO-026, context/TOML, requirements/contracts/acceptance/traceability, architecture, class/sequence diagrams, README/handoff/indexes and AI usage. Root .env.example only receives an Order-specific setting/note. Frontend and sibling source/config remain unchanged.
- Status: source implementation and local non-Docker verification complete, uncommitted for review; no push/deploy requested. Live User role/eligibility calls, production admin provisioning and the six Docker checks remain unverified.


## Current request - supplied RoleAspect reference review (2026-10-08)

- Request: assess the supplied RoleAspect/SecurityHelper/BaseSecurityHelper example and recommend centralized role annotations so API methods contain application delegation instead of authentication code. Advisory-only follow-up; implementation is not requested.
- Workflow: reloaded parent/service instructions, local spec workflow, profile/allocation/combined Sprint 1 branch, mandatory context/sprint/ADR/contract records and live Order/User security source. Original PDFs remain unavailable at their referenced paths. Preserve unrelated pending work; no source/contract/profile changes are approved by this review.
- Reference finding: RoleAspect reads role metadata and checks SecurityContext through SecurityHelper; the shown role check does not call User Service. The ten-minute userInfoCache is used for display names. Reference role ordering, first-authority selection, custom-principal toString(), and anonymous local identity need adaptation to our multiple-role JWT/ownership model.
- Recommendation (PROPOSED): keep the annotation + shared security-context/helper design. Implement RequireCourierRole/RequireRequesterRole/RequireAdminRole using Spring Security @PreAuthorize meta-annotations; a handwritten RoleAspect is feasible but unnecessary because method security is already configured. Authentication validates the Firebase token first, the existing RoleProvider resolves confirmed roles, annotations check required-role membership, and API methods only bind/map/delegate. SecurityHelper/CurrentActor supplies typed JWT subject and delegated credential where needed.
- Trust boundary: User Service already exposes token-based GET /api/users/role-context; use the verified caller token and validate returned userId against JWT subject rather than trusting a supplied user ID. Reuse confirmed roles per request, retaining separate courier eligibility verification and in-transaction locked Order ownership/state guards. Courier/requester capabilities can coexist; no role ordering or automatic admin override of Order ownership is proposed.
- Refactor caveat: staging/production currently have USER_SERVICE_MODE=mock and ORDER_PEERS_MODE=http. A bare role annotation cannot replace the current HTTP action verification until authoritative role/identity and eligibility responsibilities have been aligned; do not silently switch sources or remove checks. Preserve existing local anonymous access with a mock caller identity, and keep scheduler/system authorization separate from human role annotations.
- Reference adaptation: the ten-minute cache shown is for display names; it is not evidence of safe authorization caching. Our SecurityHelper should inspect the full authority set and use Jwt.getSubject()/configured authentication name instead of first-authority selection or principal.toString().
- Verification/status: reference and live Order/User source inspected, mandatory context refreshed, official Spring Security method/JWT documentation checked, and review-record git diff --check passed. No tests/live role calls were run. Advisory review complete; only active-work and AI usage records changed. No accepted ADR, API contract, configuration, application source, peer source, or test changed.

## Current request - authorization annotations design review (2026-10-08)

- Request: explain current authentication and evaluate @RequireCourierRole/@RequireRequesterRole/@RequireAdminRole for centralizing repeated checks. Advisory/design review only; no implementation requested or approved.
- Workflow: reloaded parent/service instructions and spec workflow, local profile, allocation/current branch, current Sprint/contracts/ADRs and tracking records. Current developer is Yao Xiang on the approved combined sequences 1-11 branch; historical shared allocation remains split. Existing unrelated work is preserved. Original design PDFs remain unavailable.
- Findings: prod validates Firebase JWT and resolves authorities through RoleProvider; !prod permits anonymous requests and does not enable method security. Admin uses @PreAuthorize. HttpPeerAdapters verifies requester/courier identity against role-context, and courier verification also calls courier-eligibility. OrderAssignmentService/OrderTransitionService lock the Order before domain ownership/state guards. User Service implements both GET endpoints and grants requester/courier roles at registration. Staging/production currently set USER_SERVICE_MODE=mock but ORDER_PEERS_MODE=http, so Spring admin roles still come from the mock email list while action verification uses HTTP.
- Recommendation (PROPOSED, not approved/implemented): use Spring @PreAuthorize meta-annotations for three fixed role requirements; token validation remains in the security filter/decoder, roles in the converter/provider, and a CurrentActor helper supplies the verified JWT subject in prod. Reuse verified roles once per request rather than parse tokens/call User anew inside every annotation. Keep fresh courier eligibility distinct from role checks, and keep ownership/state validation on the locked Order inside each mutation transaction. Annotate public user-command entry points that Spring invokes through a proxy; retain a separate scheduler/system path and the local mock actor provider. Role annotations need no ID attribute.
- Refinements for a future implementation: validate the HTTP role response identity against the JWT subject; reject/remove conflicting client actor IDs in prod; review duplicated role-context calls; generalize the admin-specific denied message and map role/eligibility failures consistently. Preserve current eligibility policy until an explicit change is agreed.
- Verification: inspected actual Order/User source, existing security tests, effective profile/environment settings, and official Spring method-security/JWT/proxy documentation. No tests or live authentication calls were run.
- Status: advisory review complete; implementation remains a proposal awaiting a later user instruction. Only active-work and AI-disclosure records changed for this review.
- Boundary: retain local anonymous and production-authenticated behavior as currently approved; do not implement annotations or change role sources/peer contracts during this advisory turn.

## Current request - hourly outbox recovery poll (2026-10-08)

- Request/approval: user asked whether the outbox retry scheduler could run hourly because publish failures are expected to be rare.
- Scope: Order Service outbox scheduler cadence/configuration and its existing cadence assertion; synchronize current architecture and operating docs. No frontend, API, event schema, peer service, database, or deployment behavior change.
- Workflow: reloaded parent/service instructions, spec workflow, profile, allocation, active work, current Sprint/ADR/contracts, frontend baseline, and relevant scheduler implementation. Combined sequences 1-11 branch remains authorized by prior user direction; historical shared sequence allocation is split 1-6/7-11. Source PDFs are absent; approved Markdown records are present. Existing uncommitted frontend, CI, and Pub/Sub work preserved.
- Implementation: immediate AFTER_COMMIT dispatch remains; only recovery scan is hourly (0 0 * * * *). Expiry remains every 15 minutes; auto-completion remains every minute. Retry backoff, lease, and due-row logic unchanged.
- Design records: CHANGE-078, ADR-023, ARCH-EVO-025, current context, requirements/sequence/traceability, README/handoff, and AI usage disclosure updated.
- Trade-off: a failed publish can wait nearly an hour while the service runs; Cloud Run scale-to-zero/request-based CPU can delay recovery further while idle.
- Verification: static cadence/reference review and git diff --check; tests not run. No Docker/cloud deployment or Pub/Sub publish performed.
- Status: implementation and documentation complete, uncommitted.

## Current request - quarter-hour time inputs and scheduler cadence (2026-10-08)

- Request/approval: restrict errand creation minute choices to 00/15/30/45, run expiry every 15 minutes, event recovery every five minutes, and auto-completion every minute. User explicitly authorizes the existing shared Requester UI and Order scheduler configuration changes.
- Workflow: reloaded Order/frontend instructions and local spec skill, profile, combined Sprint 1 branch/allocation, requirements/contracts/ADRs, developer active work and live frontend. No frontend worktree overlap found; preserve existing CI/deployment changes. Referenced design PDFs remain absent.
- Implementation plan: reusable date/hour/quarter-minute control for create expiry and repost times; rounded defaults and client-side validation; existing API timestamp shape and authentication unchanged. Update expiry/outbox cron defaults and local/cloud overrides; retain immediate after-commit dispatch and DB-filtered due selection. Existing/legacy deadlines may be processed on the next 15-minute pass; auto-completion remains minute-based.
- Implementation: CHANGE-077/ADR-022/ARCH-EVO-024 deliver the shared date/hour/quarter-minute picker for creation/automatic/manual repost, rounded defaults and pre-submit guards, and synchronized expiry/outbox/auto-completion cron settings in local/cloud config. API shapes, auth, event payloads, DB operations and immediate after-commit dispatch remain unchanged.
- TDD: new frontend helpers/control failed before implementation; Spring next-run test failed at 10:02 versus required 10:15 before cron changes. Green tests cover payload conversion and manual repost invalid/future times.
- Verification: 29 frontend tests pass; route generation and TypeScript pass; full lint has only 12 existing warnings outside changed files, changed-file lint clean. Focused scheduler/outbox: 12 tests pass. Full Maven: 125 tests, zero failures/errors, six skipped Docker integration checks. Fresh coverage 90.82% lines/81.19% branches and configured gate pass. Compose config and both rendered cloud cron templates pass; git diff --check passes. Local Maven permission workaround is unchanged from CHANGE-075.
- Remaining/status: implementation complete and uncommitted; browser runtime reported no connected browser, so 320-1920px visual/authenticated walkthrough remains unverified. Cloud Run idle scheduling limits remain; no deployment or cloud publication performed. Original PDF sources and learning/ directory remain absent; no parallel learning folder was created.

## Current request - configure deployment Pub/Sub topics (2026-10-08)

- Request/approval: user asked to add the environment settings described in the preceding guidance. Scope is the three Order topic settings in production and staging deployment .env files; no cloud changes or deployment.
- Workflow: re-invoked Order Service spec-driven workflow, checked Yao Xiang's profile/combined Sprint 1 branch, existing uncommitted CI repairs, approved ADR-021, deployment rendering and frontend baseline. Original design PDFs remain absent as already recorded. No peer-owned values or frontend source will change.
- Implementation: CHANGE-076 appends the three production prod-v1 topic values and staging dev-v1 values. Existing deployment template, project, credentials, peer/database settings and production promotion workflow are unchanged.
- Verification: substituted the complete deployment YAML for both environments and parsed it; all topics match exactly with no duplicates or missing variables. Original environment settings remain intact; git diff --check passes. No Maven tests, cloud IAM validation, publish or deployment performed.
- Status: requested configuration complete, uncommitted. GCP topic-scoped publisher permission and live smoke verification remain pending; main deploys staging and production is manually promoted.

## Current request - production Pub/Sub setup guidance (2026-10-08)

- Request: user created accepted-order-cancellation-prod-v1, open-order-refund-prod-v1, and order-completion-prod-v1 and asks how deployment will publish after merging to main; no deployment or GCP mutation requested.
- Workflow: reloaded Order instructions/spec-driven skill, profile/allocation/current branch, sprint/architecture/contracts/ADR-021 and tracking records. Yao Xiang's current combined Sprint 1 branch matches the profile and prior authorization; unrelated CI repair changes remain uncommitted. Referenced original design PDFs remain absent as previously recorded.
- Findings: deploy/env.yaml already injects the three topic variables and PUBSUB_PROJECT_ID. infra/environments/production.env and staging.env omit all three topic assignments, so envsubst currently renders empty topic values. Topic configuration belongs in these environment files, not the database. The runtime identity is foc-order-service@protean-vigil-509704-q4.iam.gserviceaccount.com for both staging and production. Main triggers staging; production is manual promotion using configuration from the promoted commit.
- Guidance: add prod topic values to production.env and dev values to staging.env; grant topic-scoped Pub/Sub Publisher to the runtime identity for each intended destination. Cloud Run provides ADC without a key file. Independent Credit/User subscriptions are required for their side effects. The existing shared runtime identity means IAM alone cannot distinguish staging from production; environment topic values select the destination.
- Verification: inspected deployment workflows, env template/files, deploy script, publisher factory and project settings; checked official Google Pub/Sub IAM and Cloud Run identity docs. No runtime publish, GCP policy check, tests or deployment performed.
- Status: advisory complete. No application/configuration changes; only this work record and AI disclosure updated. Topic/IAM existence is user-reported and not independently verified.

## Current request - fix CI/CD failure (2026-10-08)

- Request: fix the failing CI checks; the user provided the Compose interpolation error and attached Maven output. Preserve unrelated work.
- Workflow: Order Service spec-driven workflow invoked before test changes; parent/service instructions, skill, developer profile, allocation, branch, sprint/contracts/decisions, active-work, and frontend baseline reviewed. Profile/current branch match Yao Xiang's approved combined Sprint 1 handoff. No peer-service or frontend changes.
- Confirmed causes: missing GOOGLE_APPLICATION_CREDENTIALS_HOST during static Compose validation; seven test failures/errors from date-dependent acceptance fixtures, Jackson 2 Instant serialization, and incomplete legacy Order event snapshots. The summary CI-passed rejection is downstream of these failures.
- Fixes: CHANGE-074 supplies an empty temporary runner path only during Compose config validation. CHANGE-075 fixes acceptance time deterministically (including the exact expiry boundary without a sleep), uses runtime-compatible Jackson 3 in event tests, and adds mandatory primitive snapshot fields in legacy routing tests. Production source/contracts/behavior and the 80% coverage threshold are unchanged.
- Verification: focused 13 tests passed; fresh full build has 123 tests, zero failures/errors, six skipped PostgreSQL Testcontainers tests due to denied Docker named-pipe access. Fresh coverage is 90.82% lines and 81.19% branches. Compose config validation passes with the placeholder path; workflow YAML parses and git diff --check passes.
- Local environment: launched cached wrapper-selected Maven 3.9.16 directly because Windows mvnw.cmd cannot start; Java 21 source/target CLI flags bypass the sandbox's denied JDK ct.sym path. Initial coverage saw obsolete compiled event classes; moved generated class output aside and reran with fresh coverage data. Neither workaround changes CI or tracked build settings.
- Status: implementation and local verification complete; changes are uncommitted. Push workflow, tests, and records to rerun hosted CI. Docker integration/image build, actionlint, and cloud infrastructure checks remain unverified here.

## Current request - use real Pub/Sub dev topics locally (2026-10-07)
- Follow-up request (2026-10-08): document the exact local `gcloud auth application-default login`, quota-project, and `GOOGLE_APPLICATION_CREDENTIALS_HOST` setup. Complete: README now provides both the persistent root `.env` entry and a one-session PowerShell form.

- Request: stop using the Pub/Sub emulator; publish locally to the actual Google Pub/Sub service using `order-completion-dev-v1`, `open-order-refund-dev-v1`, and `accepted-order-cancellation-dev-v1`. Reuse the existing GCP project; keep production topics separate; user will handle GCP resource/IAM setup and asked for instructions, not direct cloud changes.
- Workflow: reloaded parent/Order instructions, profile, shared allocation, active-work, current sprint, architecture, peer/event contracts, decision/evolution records, project context, current app/Compose config, and relevant skill. Current developer is Yao Xiang / Developer 1 / Sprint 1. Current branch is `order-service/sprint-1/yx-seq1-to-seq11`, matching the profile and this active-work record; shared allocation still lists the older `sprint-1/seq-1-to-6` branch. The earlier user-approved combined-branch handoff remains applicable. Many pre-existing uncommitted Order Service changes exist; they were preserved.
- Approval: User approved real Pub/Sub, one existing GCP project, topic-level IAM separation, the three dev topic IDs, and implementation. No GCP resources, IAM, peer service, or frontend changes are authorized or performed.
- Implementation: Replaced the root Compose emulator with real Pub/Sub and a read-only per-developer ADC mount; configured the specified dev topics/project; removed emulator channel support from the Google publisher factory; added environment-backed production topic values; documented the setup in CHANGE-073/ADR-021 and the affected workflow/context files. `ORDER_PEERS_MODE=mock` is unchanged.
- Verification: The test was changed before the factory implementation. The Maven wrapper could not start (`Cannot start maven from wrapper`), so the focused test did not execute. Docker Compose validation was unavailable because the local Docker CLI could not read `C:\Users\thamy\.docker\config.json` (access denied). Real publish verification remains pending until the GCP topics and IAM are available.
- Next: Configure Pub/Sub API/topics/topic-scoped IAM in GCP, set the local ADC path in each developer's ignored `.env`, validate Compose, run the focused/full Maven tests, then test a real dev-topic publish.

## Current request - 48-hour delivered-order auto-completion (2026-10-07)

- Request: add a Spring scheduler that finds `DELIVERED` orders whose delivered checkpoint is at least 48 hours old and completes them through the established completion/outbox flow.
- Workflow finding: `sprints/sprint-1/scope.md` explicitly listed 48-hour auto-completion as out of scope. The user's “continue doing” authorizes this feature and the proposed implementation on the current branch.
- Approved design: configurable Spring `@Scheduled` trigger; database-side selection of due `DELIVERED` orders from their delivered checkpoint with row locking; exact eligibility is `deliveredAt <= now - 48 hours`; complete each through a trusted lifecycle path sharing the existing completion checkpoint, overdue calculation, command receipt/idempotency, and `OrderCompletionTaskEvent` transactional outbox behavior. Normal requester completion remains available before the threshold. Scheduler actor is `lifecycle`; no peer-service or schema change expected.
- Branch discrepancy: profile/current branch are `order-service/sprint-1/yx-seq1-to-seq11`; shared `docs/work-allocation.md` lists `sprint-1/seq-1-to-6`. The user authorized proceeding on the current branch; Sequence 5 remains within Yao's assigned feature range. Shared allocation is left unchanged.
- Implementation: added the lifecycle cron, DB-filtered/locked due-order query, 48-hour recheck, automatic completion transition, and shared completion event/outbox path; updated scope, acceptance/traceability, sequence/class diagrams, ADR/change/evolution, current context, handoff, and usage disclosure. Tests were written before source changes. No peer/frontend changes or schema migration.
- Status: source and documentation updates complete. `git diff --check` passed. Focused Maven tests did not reach test execution: Java 21 failed during production compilation (`Cannot close compiler resources`); forked compilation also stopped before tests. PostgreSQL query/lock integration test is added but unverified. Run focused tests and `mvn verify` in CI or a working local Java environment.

## Current request - unify OPEN-order refund event (2026-10-06)

- Request: replace separate requester-cancellation and scheduled-expiration events with `OpenOrderRefundTaskEvent`, remove the expiration publisher/topic, and share the new refund topic for both outcomes.
- Workflow: Order Service spec-driven workflow rehydrated. Developer profile and active branch are Yao Xiang / Developer 1 / Sprint 1 / `order-service/sprint-1/yx-seq1-to-seq11`; this Sequence 6 change is within the shared allocation's sequences 1-6. Existing worktree contains prior uncommitted approved Order Service work, including CHANGE-065 expiry/outbox implementation; preserve it.
- Approval/classification: the user's direct instruction approves the Sequence 6 event-contract change. This supersedes the separate OPEN-expiration event in CHANGE-065/ADR-015; status transitions remain `CANCELLED` for requester cancellation and `EXPIRED` for scheduler expiry.
- Implementation: both requester cancellation and scheduled expiry create the shared full-Order refund event; one typed publisher and local topic are configured. Dispatcher tests cover the new route and conversion of pending legacy cancellation/expiry records while preserving stable event IDs. No schema migration or peer-service source change.
- Status: source and docs complete. `git diff --check` and current-contract/source consistency inspection passed. Focused Maven tests reached production compilation but Java 21 failed with `Fatal Error: Cannot close compiler resources`; forked compilation also stopped before tests. Compose validation is blocked by local Docker CLI/config access. Rerun focused/full tests and Compose validation in CI or a working local environment. Credit subscriber implementation remains future work.

## Current request - finalize accepted-cancellation hold contract (2026-10-06)

- Request: remove the `To be discussed` label for the synchronous hold-for-reopen flow; the user confirmed it as final.
- Workflow: Order Service spec workflow re-invoked. Profile is Yao Xiang, Sprint 1, branch `order-service/sprint-1/yx-seq1-to-seq11`; branch matches profile and active-work record. Shared allocation still lists initial split sequences 1-6/7-11, so this turn is limited to the user-directed shared contract documentation. Reviewed applicable approval, peer-feedback, ADR, current-sprint, traceability, and completion-report records. No application source or tests are in scope.
- Decision: FEEDBACK-003 is now `AGREED` for `POST /api/credits/orders/{orderId}/hold-for-reopen`, no body, synchronous `200 OK`, and transaction-state idempotency. Credit implementation remains missing; production authentication and reconciliation are still required.
- Records: CHANGE-070, FEEDBACK-003, ADR-014, service/current-sprint/traceability/architecture context, structured project context, and AI usage log.
- Status: Documentation update complete; no runtime/test behavior changed. Credit peer implementation remains unverified.

## Current request - keep Order version local to synchronous Credit calls (2026-10-06)

- Request: retain Order versions in events where they help consumers identify/order event facts, but do not send versions in synchronous requests from Order Service to Credit Service.
- Workflow: Order Service workflow invoked. Developer profile is Yao Xiang (Developer 1), Sprint 1, branch `order-service/sprint-1/yx-seq1-to-seq11`; the active-work handoff records combined sequences 1-11 on this branch, while the shared allocation table retains the earlier 1-6/7-11 split. User explicitly directed this shared Credit-contract update. Root/Order instructions, current sprint, context/ADRs, peer feedback, existing code/tests, and frontend baseline were rechecked. No frontend change is in scope.
- Approval: User clarified the rule: keep versions in events, omit versions from synchronous peer-service calls, and send Credit only the Order ID for hold/reset or Order ID plus courier ID for assignment. This supersedes the wider request fields previously proposed in FEEDBACK-003/004.
- Scope: Keep expected versions at Order API/domain boundaries and event versions in published payloads. Send only `orderId` and `courierId` for assignment, and only `orderId` (no request body) for hold/reset; remove redundant command/requester/amount fields from these Credit calls. Keep settlement versionless. Do not modify Credit Service or frontend.
- Provider finding: Credit's courier-assignment and hold/reset routes remain missing. Event consumers may use event `orderVersion`; no event contract change is approved.
- Test-first plan: update HTTP adapter and mock adapter expectations first; assert assignment serializes only courier ID, hold has no request body, and repeated identical transaction-state operations are safe; update acceptance/cancellation call assertions. Then update code and docs.
- Status: implemented in Order port, HTTP DTOs, mock behavior, and application calls; contract/docs updated. The focused Maven attempt before this final request-shape refinement failed before tests with javac's `Cannot close compiler resources`; the reduced contract still needs verification in a working Java 21 environment. Actual Credit API routes remain open.

## Current request - record Credit courier assignment on acceptance (2026-10-06)

- Request: before accepting an Order, synchronously ask Credit Service to associate the reservation/transaction with the acting courier; only persist `ACCEPTED` after Credit confirms.
- Workflow: rechecked Order Service instructions and spec-driven workflow, developer profile, work allocation, active work, branch, acceptance application/domain code, Credit controller/service/repository/model/API tests, contracts, and peer-feedback workflow. Yao Xiang's Developer 1 profile and approved combined sequences 1-11 branch match `order-service/sprint-1/yx-seq1-to-seq11`.
- Approval: user directly specified the synchronous interaction and then explicitly authorized an Order-side mock/contract-stub milestone to link acceptance, with the real Credit endpoint to replace it later. Do not represent the stub as a verified Credit integration.
- Finding/classification: `MISSING`. Credit's reservation record contains nullable `courierId`, but its controller/service exposes no operation to set it. Order now has an approved contract stub to call while provider work remains pending.
- Scope: Order Service port, mock/HTTP adapters, acceptance service/domain validation, tests, and synchronized stub/change docs. Do not modify Credit Service or frontend.
- Source drift/blocker: referenced Project D1 and updated overall-design PDFs remain absent. Credit assignment route is missing; trusted service authentication/idempotency/failure-recovery semantics remain open for the real provider.
- Status: Order-side port/mock/HTTP contract stub and acceptance sequencing implemented. FEEDBACK-004 remains `OPEN`; actual Credit integration is unverified. Focused Maven tests were blocked at compilation by `Fatal Error: Cannot close compiler resources`.
- Design: `OrderAssignmentService` holds/validates the Order, awaits `assignCourier`, then rechecks expiry and persists acceptance. Mock behavior enforces active reservation, exact command idempotency, assignment conflicts, settlement-to-assigned-courier, and assignment clearing on reopen hold. HTTP DTOs validate the proposed `200 OK` confirmation.
- Records: CHANGE-068, ADR-017, Sequence 3 contract diagram, service contracts, sprint acceptance criteria, architecture context, traceability, and AI usage log were updated. No Credit Service or frontend source changed.
- Remaining: rerun Maven in a functioning local compiler environment; Credit must implement/agree trusted service authentication, route/response, idempotency, and failure recovery before HTTP-peer use or FEEDBACK-004 verification.

## Current request - remove completed endpoints from peer feedback (2026-10-06)

- Request: keep the peer API feedback focused on endpoints that still need an adjustment or peer implementation; remove the completed Credit reservation endpoint.
- Workflow: rechecked Order Service instructions, profile, allocation, active work, current branch, peer-feedback document, and the implementation references. Yao Xiang's Developer 1 profile and combined sequences 1-11 authorization match `order-service/sprint-1/yx-seq1-to-seq11`.
- Scope: documentation-only cleanup in `docs/peer-service-api-feedback.md`; retain the Supplier response-handling gap and missing event consumers/Credit hold endpoint. No peer source or endpoint implementation changes.
- Source drift: referenced Project D1 and updated overall-design PDFs remain absent from this checkout; this cleanup changes no business behavior or approved contract.
- Status: complete. Removed completed User role/eligibility and Credit reservation endpoint descriptions; retained Supplier validation because Order must handle its `valid: false` response, plus missing event consumers and the proposed Credit hold endpoint. `git diff --check` passed; no peer source changed.

## Current request - remove checkpoint history from Order events (2026-10-06)

- Request: omit checkpoint history from published Order event payloads because it duplicates the order's history; update peer API feedback accordingly.
- Workflow: checked parent/Order instructions, profile, work allocation, active-work record, current sprint, relevant contracts/ADRs, and branch. Yao Xiang's Developer 1 profile and combined sequences 1-11 handoff match branch `order-service/sprint-1/yx-seq1-to-seq11`.
- Approval: user's direct request approves the contract change. Current peer consumer implementation is absent, so the new payload field set is the contract future subscribers should implement.
- Scope: Order event DTO/mapping and tests plus synchronized Order Service contracts, diagrams, evolution/change records, handoff, and AI disclosure. Preserve internal checkpoints and completion overdue calculation; no peer source or database schema change.
- Source drift: Project D1 and updated overall-design PDFs referenced by `docs/project-d1-reference.md` are absent from this checkout. Use approved Markdown decisions and the inspected current event implementation.
- Status: source and documentation updates complete; focused Maven verification blocked by the local Java compiler (`Fatal Error: Cannot close compiler resources`, also generic failure with forked compilation). `git diff --check` passed; CI verification remains pending.

## Current request - rewrite peer service API feedback (2026-10-04)

- Request: rewrite `docs/peer-service-api-feedback.md` to give peer teams concrete contracts and payload field formats, and add a clearly labeled “To be discussed” section for Credit's unexpired accepted-cancellation hold endpoint.
- Workflow: reloaded Order Service instructions, local developer profile, allocation, active work, current sprint, relevant contracts/decisions/diagrams, peer-feedback rules, and completion format. Current branch is `order-service/sprint-1/yx-seq1-to-seq11`, matching Yao Xiang's approved combined sequences 1-11 handoff.
- Source drift: Project D1 and updated overall-design PDF files referenced by `docs/project-d1-reference.md` are not present in this checkout, so their fingerprints could not be rechecked. This documentation rewrite follows the approved current Markdown amendments and the actual peer/Order DTO implementations.
- Scope: documentation only in Order Service plus the permitted AI usage disclosure. Preserve other in-progress scheduler/outbox work in the shared working tree; do not modify peer source.
- Peer inspection: confirmed Credit implements reservation and lookup HTTP routes but has no hold-for-reopen route or requested event consumers; User implements role-context/courier-eligibility HTTP routes but lacks the requested outcome event consumers; Supplier implements the validation route used by Order. Contract wording will distinguish current peer implementations from future requirements.
- Result: rewrote FEEDBACK-001 as superseded history, expanded FEEDBACK-002 with subscriber contracts and complete event fields, and added FEEDBACK-003 “To be discussed” with the hold-for-reopen request/success format and required behavior. Corrected ADR-014 and Vincent handoff references, and recorded CHANGE-066.
- Verification: inspected the current peer controllers/DTOs and Order event models/adapter; `git diff --check` passed for changed Markdown. No tests were run for this documentation-only change. Peer consumers and the Credit hold endpoint remain unverified.

- Developer: Developer 1
- Sprint: Sprint 1
- Scope: Approved combined Order Service sequences/features 1-11 handoff
- Branch: `order-service/sprint-1/yx-seq1-to-seq11`

## Current request - scheduled OrderExpirationTaskEvent (2026-10-03)

- Request and approval: the user confirmed that updated overall Sequence 6 combines requester-triggered OPEN cancellation and scheduler-triggered OPEN expiry, with different event types; Credit consumes the expiry event and refunds. The user explicitly selected Spring scheduler.
- Workflow findings: use the existing transactional outbox after-commit path; add a separate Spring `@Scheduled` scan because the existing outbox cron only recovers pending events and does not find expired orders.
- Source review: the updated overall PDF was located, but local PDF text/render tools and Python were unavailable. The user explicitly supplied the Sequence 6 relationship and event behavior; that direction was used for the synchronized Markdown sequence.
- Implementation: added `OrderExpirationTaskEvent`, mapper, publisher interface/implementation, dispatcher route, and a configurable `OrderExpiryScheduler`; expiry persists status, checkpoint, and outbox intent atomically. Added row-level pessimistic locking to the due-order query and removed the synchronous Credit `release` port and adapters.
- Documentation: synchronized updated overall Sequence 6, Sequence 9 requirements/acceptance, publisher class diagram, service/peer contracts, event decisions, ADR-015, CHANGE-065, architecture evolution, traceability, current sprint, and Vincent handoff. No Credit/User source or root Compose changes.
- Peer status: Credit expiration-event consumer remains future work and was not modified. Local emulator topic initialization does not include the new topic; set `ORDER_EXPIRATION_TOPIC` / initialize it before a local publish test.
- Operational limit: Cloud Run scale-to-zero with request-based CPU does not guarantee Spring scheduling while idle; the user selected Spring scheduling, but production runtime reliability remains unresolved and no deployment/billing changes were made.
- Verification: focused Maven test invocation is currently blocked during Java compilation by the local Windows toolchain's `Fatal Error: Cannot close compiler resources` / generic compilation failure. An attempted `mvn clean` could not resolve the uncached clean plugin because network access is denied. `git diff --check` passed; rerun Maven/CI in a working toolchain before marking verified.

## Current task - Pub/Sub publisher factory CI test (2026-10-03)

- Request: fix CI failure in `GoogleCloudPubSubPublisherFactoryTest.reusesPublisherForAProductionTopicAndClosesIt`.
- Scope: User explicitly authorized this focused test-only change on the current branch despite the shared allocation/profile mismatch; no wider sequence ownership was inferred.
- Change: the cache/lifecycle test now uses the emulator transport instead of building a production publisher that requires Google Application Default Credentials. Renamed the test to describe the behavior it actually verifies.
- Verification: `git diff --check` passed. Focused Maven test did not reach test execution: javac failed with `Cannot close compiler resources` while compiling production sources on the local Windows environment. Direct drive inspection showed 5.18 GB free on C: and 27.79 GB on D:, so disk space is not the cause. CI result after the change remains pending.

## Current task - accepted-cancellation hybrid flow (2026-10-03)

- Request: assigned courier cancellation reopens an unexpired accepted errand only after synchronous Credit hold confirmation; expired cancellation remains event-driven. Clarify Credit/User subscriber actions and document the missing Credit API.
- Workflow: Order Service hands-off/spec workflow, profile/work allocation/branch checks, peer feedback, architecture docs, and actual Credit/User APIs were inspected before coding. Yao Xiang is assigned Developer 1 on the combined sequences 1-11 branch.
- Approval: user supplied and approved the behavior. No Credit or User source is changed. Shared frontend cancellation feedback/list behavior is included in this vertical slice.
- Peer findings: Credit has reservation APIs but no hold/reset endpoint; neither peer has the requested event consumers. `FEEDBACK-003` records the proposed `POST /api/credits/orders/{orderId}/hold-for-reopen` contract. `FEEDBACK-002` now specifies each consumer action.
- Implementation: Order adds direct `ACCEPTED -> OPEN` after successful synchronous mock/HTTP hold when still unexpired; failed hold writes no transition/checkpoint/receipt/event. Expired cancellation skips hold and atomically writes `ABORTED` plus accepted-cancellation outbox event. Completion/open/expired-accepted subscriber responsibilities are documented. No schema change is planned.
- Verification: full Maven `verify` passed 107 tests with no failures/errors/skips and both JaCoCo gates passed. The focused cancellation/adapter suite passed 39 tests before a final HTTP-202 assertion; full verification includes the assertion. Frontend Vitest passed (11), typecheck passed, and ESLint passed for modified frontend files. Live Credit HTTP endpoint, Pub/Sub consumers, and browser verification remain pending external implementation/runtime.

## Feature status

- [x] CHANGE-056 - Unify completion publication; 62 tests and coverage gates passed
- [x] CHANGE-057 - Admin all-orders paginated query; implementation and completion checks passed

## Current task - CHANGE-057 Admin order listing

- Request: add an Order Service admin controller that lists all orders and optionally filters by status.
- Scope authority: User request is a specific exception to Sprint 1's explicit exclusion of Admin Service integration; no frontend or Admin Service code is requested.
- Workflow status: User explicitly approved this feature and Supplier-style admin verification; test-first implementation and completion checks passed.
- Existing API finding: User Service `GET /api/users/role-context` authenticates the Firebase bearer token and returns the token owner's `userId` and roles. The Admin Service repository currently contains only empty scaffolding.
- Approved shape: separate `AdminOrderController` at `GET /api/orders`; optional status plus one-based `Pageable`; return `OrderPageResponse`; authorize with `@PreAuthorize("hasRole('ADMIN')")` using User Service role-context; apply status/pagination through `OrderQueryService` -> `OrderRepository` -> `OrderPersistenceAdapter`/JPA.
- Authorization implementation will mirror the Supplier role provider, including the local mock provider/configured admin email behavior and verified Firebase identity; no caller-supplied roles are trusted.
- EV-3 uses synchronous query/read for the explicitly requested endpoint; no event, projection, schema migration, Admin Service, or frontend change is included.
- Peer API classification: User Service `GET /api/users/role-context` is `MATCHES_APPROVED_CONTRACT`; endpoint, bearer authentication, DTO, and provider pattern were inspected. Admin Service remains empty scaffolding and is outside scope.
- Frontend baseline: inspected routes/config/API clients and Git state; no admin UI exists and no frontend edits are requested.
- Implementation: complete in Order Service only. `AdminOrderController` uses `@PreAuthorize("hasRole('ADMIN')")`; authentication maps User Service roles into `ROLE_*`, with Supplier-style mock mode configured by `MOCK_ADMIN_EMAILS`.
- Pagination/filter: omitted status returns all statuses; supplied enum status filters exactly; one-based `Pageable`, default page 1/size 20, max size 100; newest-created first; existing `OrderPageResponse`.
- TDD evidence: the first escalated compile failed as expected because the controller did not exist yet. Focused tests then passed. Full `mvn verify` passed 86 tests, 0 failures/errors/skips, and line/branch coverage gates.
- OpenAPI structural test now includes the admin endpoint. User Service `GET /api/users/role-context` was inspected and component-contract tested with a mock HTTP server; live service-to-service runtime authentication is not verified.
- Frontend and sibling service source remained unchanged. NTH1 Admin dashboard implementation remains a separate follow-up.
- Final `git diff --check` passed. Scope review confirmed CHANGE-057 source/tests/config are confined to Order Service; the only permitted parent edit is `../ai/usage-log.md`. Existing branch changes for prior CHANGE-051-056 work remain present and untouched by this feature.

- [~] Sequence diagram/feature 1 - Create order
- [~] Sequence diagram/feature 2 - View available orders
- [~] Sequence diagram/feature 3 - Accept order
- [~] Sequence diagram/feature 4 - Start task
- [~] Sequence diagram/feature 5 - Mark item picked up
- [~] Sequence diagram/feature 6 - Mark delivered
- [~] Sequence diagram/feature 7 - Confirm completion
- [~] Sequence diagram/feature 8 - Cancel order
- [~] Sequence diagram/feature 9 - Expire order
- [~] Sequence diagram/feature 10 - Automatic repost
- [~] Sequence diagram/feature 11 - Manual repost

## Current task

Completed task: CHANGE-055 / ADR-010 applies the user's requester/courier authorization rules. Accepted cancellation is assigned-courier-only; acceptance requires an unassigned order; courier progress is assignment-bound; open cancellation and completion remain requester-owned. Full verification passed. The preceding Pub/Sub implementation (CHANGE-054) remains intact.

## Last completed action

Implemented the CHANGE-054 Google Cloud Pub/Sub producer, typed event publishers and snapshots, publish-first completion/cancellation orchestration, and accepted-cancellation endpoint. Added mapping, publisher, transition, controller, and API context tests. Full `mvn verify` passes all 57 tests and the configured 80% JaCoCo line/branch coverage checks.

## Latest task - CHANGE-055

Implemented the approved requester/courier ownership rules in the aggregate and application services. Added domain tests for pre-assigned acceptance and accepted-cancellation ownership; added an application test that proves requester-initiated accepted cancellation is rejected before publishing. Corrected updated overall Sequence 7 and synchronized ADR-010, requirements, acceptance tests, service contracts, traceability, architecture evolution, change log, and AI usage disclosure.

Verification: the initial focused authorization/event suite passed (15 tests); two further cases passed in the final full suite. Full `mvn verify` passed all 62 tests with no failures/errors/skips; JaCoCo line and branch gates passed. C: has no free space, so Maven/Surefire temp files were redirected to `D:\tmp` on D: (53 GB free). Docker container prune did not restore space; no broader Docker cleanup was performed.

## Next action

Provision/configure topic IDs and run a live emulator or GCP delivery smoke test when available. Keep peer consumer source untouched; FEEDBACK-002 remains unverified future work.

## Files modified for CHANGE-053

- `AGENTS.md`, `.codex/skills/spec-driven-development/SKILL.md`, `skills.md`
- `changes/CHANGE-053-publish-before-order-status.md`
- `changes/CHANGE-054-google-cloud-pubsub-producer.md`
- `docs/architecture-evolution.md`, `docs/change-log.md`, this active-work file
- architecture, service contracts, event decision records, traceability, sprint contracts and diagram indexes
- `sprints/sprint-1/sequence-diagrams/updated-overall/` and `sprints/sprint-1/class-diagrams/updated-overall/`
- `../ai/usage-log.md`

## Verification state

- Workflow/profile/branch/sprint context: checked; current branch matches local profile and combined handoff.
- Credit and User source inspection: completed; no matching event consumers found.
- Frontend: inspected for workflow compliance; no frontend paths are part of the change.
- Mermaid diagrams: written but not rendered.
- `git diff --check`: passed; targeted `rg` review found only explicitly historical outbox references.
- Google Pub/Sub documentation: official Java client/BOM, publisher acknowledgment, and emulator configuration inspected.
- Maven: full `verify` passed (57 tests, 0 failures/errors/skips; JaCoCo line and branch thresholds passed).
- No sequence is marked complete because implementation and completion gates remain open.
- CHANGE-055 initial focused suite passed (15 tests); final full `mvn verify` passed (62 tests, 0 failures/errors/skips; line/branch coverage gates passed) with Maven temporary files directed to `D:\tmp` because C: had no free space.

## Dependencies on Vincent

The combined-branch handoff authorizes Yao Xiang to preserve and continue sequences 7-11. Existing Vincent implementation history remains intact.

## Latest overall design update comparison - 2026-10-02

`Order Service Overall Doc - Updated.pdf` (SHA-256 `EFBA1503C7D50B5A6C1214F09ECBCD1FF453004E0A6CA3F3F9F717C78831EA40`) informs Sequences 5-8. CHANGE-051 records that comparison. CHANGE-053 records the user's publish-before-status amendment, full snapshot, topic placeholders, and assumption of future Credit/User consumers. CHANGE-056/ADR-011 supersede the separate completion-event split with one completion event carrying overdue facts.

## CHANGE-056 - Unified completion event

- User approval: Explicit request on 2026-10-02.
- Current rule: Publish one `OrderCompletionTaskEvent` for every completion. Include full Order data, `overdue`, and `overdueAt`; User and Credit are assumed to consume every completion and select their policy from those facts.
- Source: Order Service only. No peer-service or frontend changes.
- Verification: `mvn verify` passed all 62 tests and coverage gates; `git diff --check` passed and active-file scans found no overdue-only publisher or Sequence 8 diagram references. Peer consumers and live Pub/Sub delivery remain unverified.

The implementation uses Pub/Sub for completion, open cancellation, and expired accepted-cancellation outcomes and derives overdue facts from checkpoint history. The accepted-cancellation rule in this earlier status note is superseded by CHANGE-064/ADR-014: before expiry, synchronous Credit hold precedes direct `ACCEPTED -> OPEN`; after expiry, the order becomes `ABORTED` and publishes. `ABORTED -> OPEN` remains excluded under ADR-001. No schema migration is needed. Pub/Sub topic IDs remain placeholders and runtime publishing still requires valid topics/project credentials or a configured emulator.

## Blockers

- FEEDBACK-001 is superseded for outcome processing by FEEDBACK-002; current peer work is the missing Credit/User event consumers (FEEDBACK-002) and Credit hold-for-reopen endpoint (FEEDBACK-003). The Supplier pair-validation response also requires an Order-side adapter fix because HTTP 200 with `valid: false` is currently ignored.
- CHANGE-050's full-suite test execution is now verified by CHANGE-054; its API/runtime peer contracts retain their separate integration risks.
- CHANGE-054 selected Pub/Sub. Topic IDs remain placeholders and the event path fails closed until a real topic is supplied. Full snapshots include persisted Order fields and checkpoint history; overdue facts derive from accepted/delivered checkpoints, so no new schema field is needed. Pub/Sub emulator runtime availability is unconfirmed.
- FEEDBACK-002 remains OPEN because actual peer consumers are absent/unverified, but their future implementation is assumed and does not block this Order-only milestone.

## CHANGE-058 - REST client startup bean

- User reported Order Service startup failure because `SecurityConfiguration.roleProvider` could not inject `RestClient.Builder`.
- Root cause: Spring Boot 4.1.1's REST client auto-configuration was not on the application's classpath; `pom.xml` included MVC and used `RestClient` without `spring-boot-starter-restclient`.
- Added that starter and `RestClientBuilderAutoConfigurationTest`, which asserts Boot's auto-configuration supplies the builder. Existing `AdminOrderControllerSecurityTest` also starts the Spring test context successfully with the security configuration active.
- Verification: focused regression test passed; `mvn verify` passed all 87 tests with no failures/errors/skips and JaCoCo line/branch gates met. Live Docker image rebuild/startup remains for the developer to run.
- No application behavior, API contract, persistence, frontend, or peer-service source changed. Existing unrelated working-tree edits were preserved.

## CHANGE-059 - Public Swagger webjar assets

- User reported HTTP 401 for `/webjars/swagger-ui/index.html` after opening the Swagger UI workaround URL.
- Root cause confirmed in `SecurityConfiguration`: the public path allowlist exposed Order docs and swagger-ui routes, but omitted the `/webjars/**` static resource path used by Swagger UI.
- Added `/webjars/**` to the public security allowlist and an unauthenticated MockMvc regression test. This only exposes Swagger's static resources; admin/order APIs remain authenticated and role-protected.
- TDD evidence: the new test first failed with the same 401 response; after the allowlist change, all five security tests passed.
- Verification: full `mvn verify` passed all 88 tests with no failures/errors/skips and JaCoCo line/branch gates passed. `git diff --check` passed. Docker image rebuild/live container validation remains pending.

## Request creation runtime diagnosis - 2026-10-02

- Browser console showed `/api/credits/me` 404 plus `/api/orders` 400/500 responses. Recent Docker logs confirmed the Order Service's 500 was caused by Credit Service returning `ACCOUNT_NOT_FOUND` for the authenticated Firebase UID during credit reservation.
- Credit Service exposes authenticated `POST /api/credits/registration-facts`; its controller requires `request.userId` to match the bearer token, and its repository creates the initial account only when it is absent. The frontend signup flow provisions both User and Credit records, but signing in or manually creating a Firebase Auth emulator user does not run that signup flow.
- Running services are healthy. No source or peer-service files changed. The four 400 response bodies were not present in the pasted console output and remain unidentified; inspect Network response JSON if they continue after provisioning.
- Follow-up comparison confirmed the default `compose.yaml` selects `ORDER_PEERS_MODE=mock`, while `compose.http-peers.yaml` explicitly overrides it to `http`. The user confirmed the HTTP-peer profile worked previously, so that profile alone is not established as the regression cause. HTTP mode routed credit reservation to the real Credit Service, whose `ACCOUNT_NOT_FOUND` response explains the observed create failure; unfinished settlement/release operations are not on the create path. No relevant source or Compose-profile edits caused the account to be absent.

## Mock peer mode restored - 2026-10-02

- User requested that local Order Service use its mock peer adapter again.
- No adapter implementation or `compose.yaml` source change was needed: the base Compose file already sets `ORDER_PEERS_MODE=mock`; the optional `compose.http-peers.yaml` overlay selects HTTP peers.
- Recreated only the Order Service from the base Compose file, without the HTTP override: `docker compose -f compose.yaml up -d --build --force-recreate --no-deps order-service`.
- Verification: the running container reports `ORDER_PEERS_MODE=mock` and Docker reports it `healthy` on port 8083. No other service container was recreated.

## Local Pub/Sub authentication diagnosis - 2026-10-02

- The local Compose stack does not define a Pub/Sub emulator or set `PUBSUB_EMULATOR_HOST`. `GoogleCloudPubSubPublisherFactory` uses the emulator only when that property is nonblank; otherwise it creates a normal Google Cloud Pub/Sub publisher using ADC.
- Therefore `ORDER_PEERS_MODE=mock` does not stub event publication. The completion event still targets the configured Google Cloud project/topic.
- `gcloud auth application-default login` on the host can provide local user ADC, but the Order Service is running in Docker; the container cannot read host ADC unless explicitly mounted and `GOOGLE_APPLICATION_CREDENTIALS` points to it. This is suitable only for a deliberate real-cloud smoke test with a development project/topic and least-privilege publisher access.
- Recommended local development direction: run the Pub/Sub emulator and point the Order container to it. The existing Java publisher factory already configures plaintext transport and no credentials for a nonblank emulator host. Topics must be created in the emulator before publishing; the emulator does not provide production IAM validation.
- No implementation/configuration change was made in this advisory turn. Emulator integration and real-cloud smoke-test workflow remain design options, not approved implementation changes.

## CHANGE-060 - Local Pub/Sub emulator (superseded by CHANGE-073/ADR-021)

- User approved using only the emulator for local publishing while keeping the configured Google Cloud project/topic defaults for deployment.
- Root `compose.yaml` now starts Google's Cloud SDK emulator image, waits for its port, initializes all three Order event topics, and starts Order Service only after topic setup succeeds. Local Order Service gets `PUBSUB_EMULATOR_HOST=pubsub-emulator:8085`, `PUBSUB_PROJECT_ID=demo-foc`, and the three local topic IDs. `ORDER_PEERS_MODE=mock` remains unchanged.
- `application.yaml` now allows project/topic environment overrides while preserving the configured cloud project and topic IDs as defaults when local variables are absent. No Firebase, peer service, consumer, or business flow changed.
- Updated Order Service README, CHANGE-054 follow-up, CHANGE-060, change log, and AI usage disclosure.
- Verification: Compose config passed; emulator and Order Service started; topic initializer created all three topics and idempotently recognized them on a second run; emulator topic listing confirmed all topics; Order Service reports healthy and its environment points to the emulator/local project; a local test publish returned message ID `1`. Docker package build and Spring startup passed. Maven tests were unavailable because the wrapper fails in this PowerShell environment and system Maven could not create its configured local repository, including with a temporary repository override. `git diff --check` passed.
- Emulator messages are ephemeral and emulator success does not verify Google Cloud IAM or production delivery. The real-cloud defaults remain configured for deployment.

## Dual local/emulator and real-cloud test recommendation - 2026-10-02

- Recommendation only; no implementation approval or configuration change: make the Pub/Sub emulator the normal local Compose path, and provide a separate explicit cloud-smoke override. Keep the mock peer adapter choice independent from Pub/Sub transport selection.
- Emulator path: start a local Pub/Sub emulator container, set `PUBSUB_EMULATOR_HOST` inside Order Service to the emulator's Compose DNS name and port, use a non-production project ID, and initialize all configured topics in the emulator before publishing. No ADC mount is needed; this exercises serialization and publish success without sending events to cloud subscribers.
- Cloud-smoke path: explicitly unset the emulator host, set the intended development project ID, and expose host ADC to the Order container read-only through a local-only override. Use synthetic orders and topic-level `roles/pubsub.publisher`; never use a production topic for local lifecycle tests. Verify the intended transport/project at startup to prevent accidental cloud publication.
- Emulator publication success does not verify Google Cloud IAM, project/topic configuration, or real subscriptions; keep one deliberate real-cloud smoke test for those checks. Real-cloud publication can trigger any subscriptions attached to the topic.

## Accepted-task cancellation frontend review - 2026-10-03

- User request: check for a courier-facing action to cancel an accepted errand; add it if missing, available only while the order is `ACCEPTED`.
- Finding: `frontend/src/components/orders/order-actions.tsx` offers the courier “Start errand” for `ACCEPTED` but no cancellation action. The existing Order API is `POST /api/orders/{id}/cancel-accepted` with the standard `commandId`, `actorId`, and `expectedVersion` payload. Backend/domain checks restrict it to the assigned authenticated courier and current `ACCEPTED` state, then set `ABORTED` and clear `courierId` after Pub/Sub confirms publication.
- Frontend ownership: shared Next.js app; this is the existing `USER` Courier mode on `/my-errands`. Initial Git inspection found no frontend paths modified or untracked; Order Service and shared project changes already exist and were left untouched.
- Approved and implemented UI (user confirmed on 2026-10-03): add a destructive `Cancel errand` action only beside `Start errand` for `ACCEPTED` courier cards; require confirmation; call the existing cancel-accepted endpoint with the current version; on success remove the errand from the courier's list (the backend clears its assignment) and show a success toast; report API/status conflicts through the existing error toast. Keep authorization in the backend.
- Workflow status: user confirmed the missing frontend and existing API, and explicitly directed implementation with consistent UI. Approved scope is the existing accepted-cancellation behavior and its frontend link; no backend contract or peer-service change. Implementation and verification are complete as recorded in CHANGE-061. The required local Next.js guide was read after installing the locked frontend dependencies.

## Accepted-task cancellation frontend implementation - 2026-10-03

- Completed CHANGE-061 after the user confirmed the frontend was missing and approved linking the existing API with consistent UI.
- Added a destructive confirmation action beside `Start errand` only for `ACCEPTED` courier errands. The action uses the existing authenticated `useApi()` client and versioned `POST /api/orders/{id}/cancel-accepted` contract. On success, the returned `ABORTED` task is removed from the courier's list; failures retain it and use existing error feedback.
- Updated the frontend status union for `ABORTED`, Sequence 7 acceptance criteria, traceability, change log, and AI usage disclosure. No backend, API contract, sibling-service, or shared auth/permission files changed.
- TDD: new component tests failed first because the action was absent. Final verification passed `npm test` (18 tests), `npm run typecheck`, `npm run lint` (12 existing warnings outside changed files, zero errors), `npm run build` (network-enabled retry for existing Google Fonts), and `git diff --check` for changed files.
- Authenticated browser and live Pub/Sub verification remain pending. CHANGE-061 contains detailed implementation and verification evidence.

## Current task - restore local/production authentication split (2026-10-03)

- Request: restore the original profile split: local APIs require no authentication; production requires authentication, and the admin role is enforced for admin endpoints.
- Scope: Order Service security configuration and focused tests; preserve unrelated working-tree changes.
- Workflow status: hands-off, service/repository instructions, developer profile, work allocation, branch, this active-work record, CHANGE-057/059, and existing security tests inspected. The user's explicit request resolves local-versus-production behavior.
- Baseline: the committed security configuration had `@Profile("!prod")` with `permitAll()` and `@Profile("prod")` with OAuth2 bearer authentication. Current uncommitted configuration removed this split and added global authentication plus admin method security.
- Implementation: restored a `!prod` `permitAll()` security chain, a `prod` Firebase bearer chain, and production-only method security so `@PreAuthorize("hasRole('ADMIN')")` does not block local calls.
- Verification: focused Maven tests passed (10 tests; zero failures/errors/skips) for anonymous local admin-list access, production anonymous rejection, production non-admin rejection, admin pagination/filter access, Swagger webjar access, role-provider configuration, and JSON security handlers. Full `mvn verify` passed 89 tests with no failures/errors/skips and passed both JaCoCo gates. `git diff --check` passed. The initial pre-implementation test run was unavailable because Maven's default local repository was unwritable and dependency downloads were blocked in the sandbox; the escalated focused and full runs succeeded using `order-service/target/m2-repository`.
- No API contract, business behavior, diagrams/data model, persistence, Compose, frontend, or peer-service source changed. Docker/runtime profile checks have not been run.

## Current task - transactional outbox for Order outcome events (2026-10-03)

- Request: replace publish-before-status behavior with a transactional outbox. Persist each outcome event atomically with its Order transition; dispatch immediately after commit; retain a Spring cron recovery poller for pending deliveries.
- Scope: Order Service only. Do not change peer consumers, shared Compose, or deployment billing settings.
- Approval: user explicitly approved the transactional outbox and immediate-after-commit dispatch with a scheduled recovery mechanism in the preceding conversation turn.
- Workflow: invoked the Order Service hands-off/spec-driven workflow; Flyway is already selected and configured. The existing worktree contains extensive unrelated pending changes, which must be preserved.
- Implementation status: complete. V2 Flyway migration, persistent outbox model/repository, after-commit dispatcher/listener, lease-based cron recovery, transition event snapshots, and architecture records are implemented.
- Verification: `mvn -B -ntp '-Dmaven.repo.local=target/m2-repository' verify` passed 102 tests with zero failures/errors/skips; JaCoCo line and branch gates passed. PostgreSQL Testcontainers checks exercise Flyway from clean and V1 schemas, Hibernate validation, `FOR UPDATE SKIP LOCKED`, persisted publish/retry state, and atomic rollback of Order plus outbox intent. `git diff --check` passed.
- Operational note: Cloud Run currently scales to zero with request-based CPU; a Spring scheduler cannot provide continuous recovery under that setting. No cost-affecting deployment change is authorized; this will be reported as a remaining deployment decision.
- Handoff: prepared `hands-off/CHANGE-063-transactional-outbox-to-vincent.md` for Vincent and linked it from `hands-off/README.md`. It summarizes the three event flows, implementation locations, 102-test verification, consumer deduplication requirement, Cloud Run cron limitation, retained-row growth, and the uncommitted-worktree caution. Vincent's active-work record was not edited.


## Previous production authentication behavior — 2026-10-08

Reviewed the committed pre-refactor security configuration and current production environment settings to explain how authentication and role checks previously worked. Production required a valid Firebase JWT globally; Spring authorities came from the configured mock role provider in the staging/production env files, with ADMIN granted by the configured email allowlist. Separately, selected requester/courier application operations used the HTTP User Service adapter for identity, role, and courier eligibility checks. Local profile permitted requests. No source behavior changed.


## Staging/production real-peer configuration review — 2026-10-08

- Request: confirm whether staging/production automatically uses actual endpoints and reserves mocks for local testing.
- Context: parent/service instructions, Order workflow skill, profile/allocation, active Sprint 1 documents, architecture/contracts/traceability/decisions and AI disclosure context loaded. Yao Xiang, combined sequences 1–11 on the user-approved branch order-service/sprint-1/yx-seq1-to-seq11; the historical allocation mismatch is already covered by the branch-specific approval. Referenced PDF/image sources remain absent, so their fingerprints cannot be rechecked.
- Review started: tracing environment rendering, service URLs/identity and conditional adapter selection; preserving pending CHANGE-079 source/configuration work.

- Outcome: deployment automatically renders real peer URLs, sets SPRING_PROFILES_ACTIVE=prod and ORDER_PEERS_MODE=http, injects Cloud SQL configuration/password secret, and attaches foc-order-service@protean-vigil-509704-q4.iam.gserviceaccount.com. Pending CHANGE-079 application-prod.yaml defaults Order role lookup to HTTP despite the shared USER_SERVICE_MODE=mock. Staging uses dev topics and production prod topics; local ADC is not used by Cloud Run.
- Gaps: shared staging/production role mode remains mock (confirmed Supplier consumes it); mock adapters are selected by flags rather than strictly excluded by prod. Credit courier-assignment and hold-for-reopen routes and Credit/User Pub/Sub consumers remain missing from inspected source. HTTP mode does not fall back to the mock. Successful health checks do not verify these peer flows. The existing idle Cloud Run scheduling limitation remains recorded.
- Verification: inspected deploy workflows/script/templates, Order configurations/adapter conditions, Supplier role configuration, actual Credit/User routes and source searches for consumers. No live deployment, tests, cloud IAM or subscription validation was performed. Source artifacts remain unavailable for fingerprint checks. No application/infrastructure behavior changed; only this record and the AI usage disclosure were updated.


## CHANGE-080: Remove retired local Mongo helper after merge — 2026-10-08

- Request: fix CI Compose validation after accepting main's User Service MongoDB configuration. The user authorized this shared Compose repair and requires preserving peer-owned configuration.
- Context: parent/service instructions, skill, profile/allocation, active sprint/decisions/contracts and current source loaded. Yao Xiang on order-service/sprint-1/yx-seq1-to-seq11 under the recorded combined-sequence approval. Original reference PDFs remain absent; no new business/schema/contract/architecture decision is required.
- Cause: main's mongodb service and UserServiceDB connection are retained, but the obsolete user-mongodb service still mounts undeclared user-mongodb-data. CI fails during Compose validation, after creating its empty ADC placeholder.
- Status: in progress; remove the obsolete helper only, preserve main's peer blocks and Order's PostgreSQL/PubSub configuration, then validate base and HTTP-peer Compose configurations.

- Completed: removed only the retired user-mongodb helper from compose.yaml. Main's mongodb and user-service blocks exactly match origin/main; Order Service/PostgreSQL blocks and all remaining volume declarations are preserved.
- Verification: original missing-volume failure reproduced (exit 1); base and HTTP-peer Compose config checks pass (exit 0) with an empty temporary ADC fixture. Normalized config has nine services, three declared named volumes, and no dangling mounts. No containers or cloud calls started; no source/schema/frontend change. Local Docker configuration read-warning did not prevent validation; full hosted CI remains pending.
- Persistent records: CHANGE-080, current-sprint, change-log and AI disclosure updated. Original reference PDFs remain unavailable; this cleanup changes no approved business/architecture behavior.


## CHANGE-092: Compact Order event payloads — 2026-10-09

Yao Xiang confirmed ownership on order-service/sprint-1/yx-sprint-2-and-3 and explicitly approved the seven-field Order-only contract despite Credit incompatibility. ADR-031/CHANGE-092 define exact fields, unchanged accepted event, internal metadata, legacy pending-row conversion and test plan. Source fingerprints match (including Updated PDF now available under ../). FEEDBACK-009 blocks live Credit/User integration. Implementation/testing in progress; no sibling/cloud/schema/frontend writes authorized.

- Completed Order implementation: exact seven-key compact refund/completion, JsonIgnore operational metadata, explicit MapStruct fields, pending saved-snapshot conversion and unchanged accepted envelope. Final focused 32/32 pass; fresh wrapper-selected offline verify 212 total, 195 passed, 17 Docker-dependent skips, 0 failures/errors. Coverage 91.33% lines / 81.77% branches; original  >=80% gates passed. Exact source evidence and requirement/test table in CHANGE-092. No schema, scheduler, peer/frontend/config/cloud change.
- Remaining blocker: FEEDBACK-009, Credit needs compact parsing and Credit-owned transaction lookup; User needs an agreed authoritative overdue source before completion penalties. Do not report integrated flows complete. Next: re-read changed provider schemas/tests and verify isolated refund/transfer/penalty/dedup behavior; run 17 PostgreSQL tests once Docker is available. Existing Credit/User files and all cloud state unchanged. Sprint [~], no commit/push/deploy performed.

## Accepted-cancellation event count review — 2026-10-09

- Request: explain the number of events created by cancelAccepted; advisory/source review only. Current Yao Xiang profile and branch match. Order context rehydrated; no code or contract change requested.
- Verified source: successful reset followed by OPEN queues one AcceptedOrderCancellationTaskEvent (User penalty); EXPIRED queues that event plus OpenOrderRefundTaskEvent (Credit refund). Expiry is checked after synchronous Credit reset. Failed validation/reset/transaction creates no committed new events; command-receipt replay returns before enqueue. AFTER_COMMIT listener dispatches each durable intent; broker delivery remains at least once.
- Inspected current OrderTransitionService, OrderOutboxAfterCommitListener and OrderAbortTransitionTest source. No tests executed this turn, no runtime broker confirmation. Count explanation complete; existing FEEDBACK-009 integration blocker remains. Only this active-work entry and AI disclosure updated; pending implementation untouched.

## CHANGE-093: Scheduler per-order failure isolation — 2026-10-09

User explicitly requests skip failed scheduled orders and continue successes. Branch/profile match; mandatory context and frontend baseline reloaded, D1/Overall/Updated hashes match. Existing whole-pass catch is insufficient due to shared batch transactions. CHANGE-093 records ID-only DB selection, separate per-item transaction/lock/rechecks and outside-transaction catch. Implementation/testing in progress; preserve CHANGE-092 and paused repost work; no peer/frontend/schema/config change.

- Order-side implementation and deterministic verification completed: per-item REQUIRES_NEW worker/proxy, NOWAIT lock/recheck, DB-only eligible ID selection; outside catch skips failures and counts only committed transitions. Tests-first 2 expected failures; final focused 44 pass; fresh verify 232 total / 211 passed / 21 Docker skips / 0 failures/errors, BUILD SUCCESS; line91.44% / branch82.10%, unchanged coverage gates pass. Exact test/traceability evidence in CHANGE-093.
- Remaining: 4 new PostgreSQL isolation/locking/query tests (within 21 total skipped) require Docker; mock transaction-manager proxy evidence is not live DB verification. FEEDBACK-009 unchanged; Sprint [~], no integrated-completion claim. No peer/frontend/schema/config/cron/cloud edits. Changes remain uncommitted because existing CHANGE-092 overlaps source/doc paths; no mixed staging, push or deployment. Next: start Docker and run the isolated PostgreSQL integration suite, then review separate change concerns before staging.

## Scheduler versus expiry worker clarification — 2026-10-09

- Request: why a new scheduler was added. Verified Git diff shows OrderLifecycleScheduler unchanged; the only new application class for CHANGE-093 is OrderExpiryProcessingService, a Spring @Service with REQUIRES_NEW and no @Scheduled. Existing scheduler -> coordinator -> per-order transactional worker isolates expiry rollback/commit; separate bean enables Spring proxy interception. Same-class self-invocation would bypass the transactional proxy. No new timer or cadence change. Source-only inspection; no tests rerun. Only active-work/disclosure updated; pending implementation preserved.

## CHANGE-094: Order UI polling, abort wording and status filters — 2026-10-09

- Started on confirmed current branch; user explicitly authorizes this Order/shared-frontend scope. Mandatory context reloaded, three PDF hashes match, frontend clean/no recorded overlap. ADR-032/CHANGE-094 record optional status on existing mine API, DB-before-pagination/history-aware filtering, five-second Order-only polling and Abort errand labels. Existing layout/auth/peer/source work preserved. Tests-first verification in progress.

- Implementation/deterministic checks finished: optional mine status, DB-before-pagination content/count/history and identity guards retained;5-second Order reads, Abort errand labels, All/select/empty/pagination UI.58 frontend and22 focused backend pass; full backend 219passed/24 Docker skips,0 failures/errors, original coverage gates92.36%/82.41% pass; lint0 errors / 12 unrelated existing warnings, typecheck passes.8 actual-component isolated browser width/mode scenarios pass at 320-1920, fallback fonts; no real auth/peer guarantee.
- Remaining gates:3 new DBfilter regressions within 24skips require Docker; normal production build blocked by Google Fonts connection; FEEDBACK-009 unchanged. Exact changed uncommitted paths/test evidence in CHANGE-094. No mixed staging with existing CHANGE-092/093, no push/deployment; Sprint [~]. Next: run isolated PostgreSQL filters and normal network-enabled frontend build, then real authenticated personal-list/browser checks.

## CHANGE-095: Correct personal status options — 2026-10-09

- Started: explicit user correction of requester/courier options under CHANGE-094/ADR-032. Current Yao Xiang branch matches; existing frontend modifications are this session's pending changes. Shared frontend/current workflow and source hashes inspected; preserve existing source/peer work. No API/backend change required. Tests first in progress.

- Implemented CHANGE-095: OrderStatusFilter receives explicit mode; My Requests excludes ABORTED; My Errands excludes OPEN/EXPIRED/CANCELLED. Existing default/reset/page/poll/API semantics preserved. Two exact-option regressions failed first (6 other page cases passed); final full frontend 60 passed / zero failures/skips, lint passes with 12 unrelated existing warnings, typecheck passes. Eight isolated actual-component Edge checks verify exact options, selection/paging and no overflow at 320/768/1440/1920 for both modes.
- No backend/peer/auth/schema/event/scheduler/deployment changes or backend retesting this turn. Existing live PostgreSQL/peer/Google Fonts build gates remain; browser fixtures are not real auth/financial integration. Exact paths/results in CHANGE-095. Changes remain uncommitted with prior overlapping frontend work; no staging/push/deployment, Sprint [~].

## CHANGE-096: Scheduler database selection and per-item transaction audit — 2026-10-10

User requests DB-filtered scheduled candidates, independent transactions, rollback/skip failed items and continue successes. Current Yao Xiang branch/profile match, workflow/ADRs/frontend baseline and source hashes rechecked. CHANGE-093 already meets lifecycle requirements. Outbox retry-record failure can abort later events; approved user invariant authorizes the narrow Order-only refinement: due-ID SQL scan, individual REQUIRES_NEW claim/mark/retry, outer per-event catch. Enqueue stays in the Order transaction; Pub/Sub is irreversible and stays outside it. Docker now available; isolated PostgreSQL verification planned. Preserve pending changes and paused repost scope.

- Implemented Order-only CHANGE-096: due-ID SQL selection and per-event REQUIRES_NEW claim/mark/retry; catch includes claim/commit/retry-record failure. Lifecycle implementation already met request and remains unchanged. Tests-first regression: 1 expected failure (retry database unavailable), target/change096-red.log. Focused 43 tests passed, including eight PostgreSQL lifecycle/outbox isolation tests; fresh source-only wrapper-selected Maven 3.9.16 / Java21 offline verify: 252 tests passed, 0 failures/errors/skips, including 28 PostgreSQL tests. JaCoCo 95.99% lines / 83.72% branches; unchanged >=80% gates passed. Logs: target/change096-focused.log and target/change096-verify.log; reports target/change096-source-check/target/. Docker28.4.0; isolated PostgreSQL15 Testcontainers; new isolation suites mock all cloud publishers. No application database, peer service, real topic or cloud setting changed.
- Prior Docker skips are now cleared for the current source. FEEDBACK-009, real authenticated peer/cloud/browser verification and earlier frontend Google Fonts build limitation remain; no Sprint completion claim. No frontend retesting, CI rehearsal, production/cloud action, staging/commit/push/deploy. Four production paths, three test paths and records enumerated in CHANGE-096 remain uncommitted because dispatcher/tests/docs overlap pending CHANGE-092–095; preserve separate concerns before staging.

- Final consistency check: 159 POM/source/test/resource files exactly match the successful fresh build. Corrected three trailing blank lines in documentation; no application change after verify.

## Concurrency audit — 2026-10-10

User requests review of whether row locks prevent concurrent API overwrites. Current Yao Xiang branch/profile match; workflow/context and source hashes rechecked. Review-only, no application/contract/schema/peer edits. Existing mutations use transactional PESSIMISTIC_WRITE plus domain expectedVersion, ordinary locks wait and lifecycle locks NOWAIT. Suspected gaps: concurrent duplicate CREATE before receipt uniqueness, outbox marker/retry writes lacking locking/version/lease-owner checks, database exceptions not mapped to standard conflicts, and remote Credit changes surviving local rollback. Temporary ignored audit tests will exercise current behavior with isolated PostgreSQL and mocked peers; proposals stay unapproved.

- Audit outcome: same-row Order mutations protected by transaction/lock/version/state guards; actual two-courier race preserves one winner and rejects loser. Reproduced two concrete gaps: concurrent same-command creates invoke Credit twice with distinct IDs before local receipt uniqueness rollback; concurrent outbox retry snapshot overwrites committed PUBLISHED to PENDING/null marker. Final16 temporary/selected checks pass with no skips, but two probes assert current defects, not fixes. Initial outbox hook timeout corrected in ignored harness only. Source-only findings: ordinary API locks wait (lifecycle NOWAIT only), DAO lock/uniqueness exceptions lack explicit conflict handlers, synchronous peer success survives local rollback (existing FEEDBACK-006), receipt replay checked before lock. Detailed evidence/recommendations in CHANGE-096 follow-up.
- Next: obtain a detailed approved command-idempotency/remote-recovery and outbox claim-generation conditional-update design before source/schema/contract changes; decide API lock wait policy and error mapping. No application/committed-test/frontend/peer/config/schema edits, no full verify/CI rehearsal or production/cloud action this review; no source fix claimed. Preserve uncommitted CHANGE-092–096; no staging/commit/push/deploy.

## Command ID versus Order ID clarification — 2026-10-10

User asks why same-command creates conflict despite different order IDs. Verified CreateOrderRequest, frontend buildCreateOrderPayload/crypto.randomUUID, Order.open generated UUID, OrderCreationService receipt precheck and Credit-before-receipt ordering, CommandReceipt mapping and V1 unique(operation, command_id). Command ID identifies an action/retry; Order ID identifies the errand. Sequential same-command replay returns original Order. Concurrent same-command requests can both miss the precheck, reserve distinct generated IDs and compete on the same CREATE/command key; loser local transaction rolls back. New intentions need new command IDs; retries of the same intention should reuse one. Current frontend rebuilds payload with a fresh UUID; do not imply it automatically reuses IDs across user retries. Explanation only, no source/test/schema/contract/peer changes or tests rerun; previous race audit remains evidence. Existing concurrency fixes unimplemented.

## Publication timing verification — 2026-10-10

User asks whether event publication is at the end of transactional methods to reduce rollback after publish. Review/verification only on current Yao Xiang branch. Source distinguishes outbox enqueue/internal Spring signal from actual Pub/Sub. All outcome paths enqueue and signal within transaction; audit code follows. Listener is AFTER_COMMIT; dispatcher/network publish run after successful commit. Prepare isolated PostgreSQL probes for error after signal, no publish before commit, and failed publish preserving committed state; no application changes, real cloud/peer calls or schema/config changes.

- Publication timing outcome: Verified existing AFTER_COMMIT flow: business methods write Order/checkpoint/receipt/outbox and send only an internal Spring signal; audit code follows that signal. Actual typed publisher is invoked after successful Order commit; dispatcher then marks the outbox PUBLISHED in a separate transaction. Eight focused checks passed, 0 failures/errors/skips: three temporary PostgreSQL timing probes, four existing PostgreSQL lifecycle-isolation checks and one listener test. Probes verify error after signal rolls back without publisher invocation, publisher sees committed state in an independent transaction, and publish failure preserves CANCELLED plus durable retry intent. All peer/cloud publishers mocked; no real Pub/Sub verification. Temporary setup initially had three context errors from a multi-interface mock, corrected by mocking all peer ports; next run had one boundary-fixture failure, corrected by using expiry sixty seconds in the past rather than a PostgreSQL timestamp-rounding boundary. Final log: target/publication-timing-verified.log; ignored copied-source harness: target/publication-timing-source/. Current159 POM/source/test/resource files still equal the previously verified source; git diff --check passes. No application/committed-test/schema/config/peer/frontend change, no full verify/coverage rerun or staging/commit/push/deploy. Publication is irreversible; a failed post-publish marker can cause duplicate delivery. Previously reproduced outbox stale-worker overwrite and CREATE idempotency gaps remain unfixed.

## Post-rebuild login/preload diagnostic — 2026-10-10

User reports repeated unused-preload warning and incomplete post-login loading symptom. Current Yao Xiang profile/branch confirmed; review only, preserve overlapping changes, no shared auth/layout or peer edits. Asked for exact visible symptom and additional red console/network errors. Inspect live Docker services, login HTML/static assets, frontend auth/navigation/font/polling source and gateway error sample.

- Outcome: Docker frontend/gateway/backend services healthy at inspection. GET http://127.0.0.1:8080/login returns200; all17 distinct linked Next static assets returned200. Observed document preload is a script with as=script. No >=400 access requests found in the sampled gateway logs (last12m, up to500lines); this does not prove the browser login/API flow succeeds. Source also defines Geist/Geist Mono via next/font/google, whose default preload is documented by Next.js. Warning means early-fetched resource not used promptly, not proof it failed to download; exact warning URL unknown. Browser stale assets after rebuild are a possibility, not a confirmed root cause. Actual authenticated browser behavior not reproduced; await blank/spinner/missing-data description plus red error/failed request. No source/configuration/data changes or tests/build rerun; existing statuses unchanged. Ignored HTTP/log diagnostic target/login-loading-audit.cjs only.

## CHANGE-097: Missing supplier names block Order cards — 2026-10-10

User confirms /mine200 and supplies requester UID. Read-only PostgreSQL: five owned Orders (2OPEN,2COMPLETED,1DELIVERED); seven unique referenced supplier IDs, five return404 and two200 from the configured Firestore emulator. Supplier lookup returns terminal missingIds; useSupplierNames ignores those and keeps ready=false, hiding cards. Narrow Order UI bug fix within approved existing Location unavailable fallback: treat missingIds as resolved unavailable labels, preserve retrieved names, no peer/contract/auth/schema/configuration changes. TDD targeted hook regressions before modification; existing shared frontend edits preserved.

- CHANGE-097 outcome: CHANGE-097 repairs Order UI loading when Supplier lookup successfully reports missingIds: use the existing Location unavailable card label for terminal missing references. Orders still display; no contract/peer/auth/schema/polling change. Three hook regressions (two fail first); final63 frontend tests, lint/typecheck and Docker build pass. Rebuilt only local frontend; runtime pages/assets and corrected hook verified served. Saved supplier data remains missing; authenticated browser confirmation pending. Exact artifacts/results and limitations in changes/CHANGE-097-missing-supplier-order-cards.md. No backend/peer/config/data changes, staging/commit/push/cloud action. Earlier unauthenticated probe503 is not the reported authenticated200; optional Firebase diagnostic405 unavailable, temporary JSON parser corrected. No account identifiers logged in shared records.

## CHANGE-098: Staging Swagger advertises wrong server origin — 2026-10-10

User reports network/CORS failure and provides gateway-staging Swagger URL. Public live HTML/docs/config all200. OpenAPI servers contains http://order-service-staging-374055363871.asia-southeast1.run.app while UI is HTTPS gateway. Repository gateway rewrites Host to backend and forwards internal scheme; OpenAPI has no explicit server. Narrow Order-only documentation/runtime implementation detail: explicit relative server /, preserve API paths/security/auth and gateway configuration. TDD existing MVC OpenAPI test for current-origin server; new Order config bean, fresh full backend verification planned. No cloud mutation/deploy/peer/frontend edits; preserve pending092–097.

- CHANGE-098 outcome: CHANGE-098 sets an explicit relative OpenAPI server / through OpenApiConfiguration. Swagger now resolves API calls against the origin serving the specification, retaining /api/orders paths and Firebase authorization. Live staging docs previously advertised an HTTP backend host despite HTTPS gateway UI. This is an Order-only documentation routing implementation detail; no gateway, peer, CORS allowlist, forwarded-header trust, schema, frontend or deployment-env change. Tests first: one expected server-URL failure and one existing documentation pass (target/change098-red.log). Fresh source-only wrapper-selected Maven3.9.16/Java21 offline verify:253 tests,0 failures/errors/skips, including28 PostgreSQL tests; coverage96.00% lines (1441/1501),83.72% branches (468/559), unchanged >=80% gates pass. Generated target/openapi.json servers=[{url:"/",description:"Current gateway or service origin"}];160 current POM/source/test/resource files equal the fresh tested copy. Logs/reports target/change098-verify.log and target/change098-source-check/target/, evidence target/change098-evidence.json. git diff --check passes. No local application container rebuild or real authenticated browser request; no commit/push/cloud deployment. Staging remains unchanged until Order Service redeployment. Exact artifact manifest and staging verification steps in changes/CHANGE-098-swagger-current-origin.md. One new config and existing MVC test only; frontend/peer/gateway/security code preserved. No Sprint completion or live fix claim.

## CHANGE-099: Direct API expiry minimum regression — 2026-10-10

User requests backend enforcement of expiry >= current time + 30 minutes when frontend validation is bypassed. Current Yao Xiang profile/branch agree; scope is Order-owned creation validation verification. CHANGE-091 already enforces this in Order.open using server Instant.now from OrderCreationService, before Supplier/Credit/persistence. Existing domain tests cover 1799-second rejection and inclusive 1800-second acceptance. Add direct HTTP regression using real OrderController/OrderCreationService/domain/error handler and mocked providers: reject past/current/short windows with field-specific 400 and no financial/persistence writes; retain successful valid creation. No duplicate production check or clock/contract/schema/auth/peer/frontend change. Rehydrated applicable workflow/context/decision/sprint records and frontend baseline; three PDF hashes match. Large historical command outputs were truncated; do not claim the entire historical context-completion gate. Existing FEEDBACK-009/integrated/browser/cloud gates and concurrent-create/outbox lease audit gaps remain outside this task; Sprint [~]. No artificial red test expected because production behavior already exists. Fresh copied-source verification planned; preserve all pending work.

- Finished: new OrderCreationExpiryApiTest has five direct API cases; focused19 and full258 tests pass, zero failures/errors/skips. Initial fixture failure (missing disabled-repost primitive values) diagnosed and corrected; not a production RED. Coverage96.00% lines/83.72% branches, existing gates unchanged;161 files equal tested fresh copy; git diff --check passes. Existing backend rule retained, no application logic/DTO/frontend/peer/schema/auth/deployment edits. CHANGE-099, README/contract/traceability/context/sprint/index and AI disclosure record this finding. No image rebuild, live authenticated API, commit/push/deployment or application DB reset; existing integrated gates/concurrency audit gaps unchanged. Next: review tests/docs and verify the deployed Order version if live behavior differs.

## Supplier reference mismatch clarification — 2026-10-10

User asks why five saved location references were missing despite no Supplier changes. Read-only Order diagnosis/configuration/provider inspection on confirmed Yao Xiang branch; preserve all pending work. Current Supplier log at 2026-10-10T02:49:59Z reports 21 created, 0 updated, 0 unchanged, 0 deactivated, 0 skipped. Seeder reuses existing IDs by natural key; creation uses Firestore auto-generated document IDs. Therefore this startup created a fresh catalogue instead of reusing matching supplier records. Order PostgreSQL and Firebase data are separate named volumes, so prior Order references can survive a catalogue reset/namespace/import mismatch. Emulator logs report importing an export, which does NOT establish that supplier-local's earlier documents were restored. Exact reason matching old records were unavailable remains unverified; do not claim a particular reset, user deletion, failed shutdown or named-database export bug. Normal preserved/reused catalogue seeding does not regenerate existing IDs. Default Order mock validation also checks only nonempty/distinct supplier IDs, not existence, so invalid mock-created references are a separate possible source. No Supplier source/data/configuration mutation; the earlier frontend-only rebuild did not recreate emulator/backend volumes. No tests or rebuild this advisory turn. Next: inspect export/namespace history before proposing a persistent restoration fix.

## Main merge feedback conflict and CI verification - 2026-10-10

User reverted the prior CI repair and merged main a641836. Yao Xiang identity/branch still match. Rehydrated workflow/context/ADRs/sprint and frontend baseline; PDF fingerprints match. One conflict in peer-service-api-feedback.md: removed legacy CreditOrderEventConsumer versus new typed decoder/handlers. Resolve to actual main class references, label v1 snapshot semantics historical, preserve CHANGE-092 seven-field contracts/FEEDBACK-009. Main now has event-specific push URLs in both checker and provisioner, matching deployed Credit image a641836; prior shared-URL repair was based on stale checkout and has been undone. This corrects the earlier diagnosis; Order commit86708cb did not modify the POM, CI workflow, provider routes or subscription scripts. Existing default-CLI auth invalid_grant is bypassed with existing ADC for read-only checks. No application/peer/schema/payload edits or reintroduction of reverted CI helper/diagnostic files. Verify current standard Maven command and live infrastructure, preserve other staged main changes, stage only the resolved document; do not finish the merge or push.

- Merge conflict resolved: Main merge a641836 resolves the prior stale-branch infrastructure expectation: current Credit has three typed endpoints, and both scripts/ci/check-infra.sh and infra/gcp/configure-credit-pubsub.sh use their corresponding paths. Those incoming-main scripts were preserved byte-for-byte. Resolved the sole peer-service-api-feedback.md conflict to JsonOrderEventPayloadDecoder/typed handlers with former v1 semantics labeled; retained exactly seven compact keys and OPEN FEEDBACK-009. Corrected its removed CreditOrderEventConsumer reference. Only that conflict was staged; every other existing index entry was preserved. Earlier shared-URL cloud repair used stale branch code and was reversed: all three original event-specific staging paths are restored, including completion confirmed after the interrupted turn. This supersedes the earlier claimed shared-path root cause; Order commit86708cb changed neither these scripts/routes nor the POM/workflow.
- Verification so far: Standard online wrapper-selected Maven3.9.16/Java21 -B -ntp verify, without -U/offline mode, passed 258 tests, zero failures/errors/skips, including isolated PostgreSQL Testcontainers; coverage gates pass. Current161 POM/src/resource files equal the fresh tested copy. ShellCheck0.11.0 on all CI/infra shell scripts, actionlint1.7.12 on workflows, staged/unstaged diff checks and conflict/index/source/contract checks pass. Logs/reports target/main-merge-ci-verify.log and target/main-merge-ci-source-check/target/. First live cloud run reported two IAM failures while showing a concrete Google IAM DNS NameResolutionError; no deleted account/removed IAM inference. Repeat live infrastructure result pending; all three typed subscription predicates passed during first run. Current Maven artifact resolution passes but arbitrary hosted runner/network failures cannot be guaranteed absent. Reverted CI/helper changes were not reintroduced.

- Finished merge/CI verification: Final live scripts/ci/check-infra.sh staging production rerun PASSED with all identities, databases, access, all three event-specific push subscriptions/DLQ/OIDC and buckets; production push stays intentionally disabled. The first-run two false-negative IAM checks were transient DNS failures and cleared on rerun. The prior subscription mismatch and Maven model failure did not reproduce on the merged tree. Hosted/WIF CI must still run after the user completes/pushes the merge; no arbitrary remote-network guarantee. Merge conflict remains resolved/staged, MERGE_HEAD intentionally present; no merge commit/push or application-container rebuild. FEEDBACK-009 and other peer business/semantic gaps remain open.

## CHANGE-130 start - 2026-10-15
User approves ordinary root foc-common Maven penalty-policy extraction and necessary build/CI/Docker integration. Yao Xiang/current branch match; no auth or sibling backend implementation changes. Existing127/128/129 work preserved. Shared RED tests precede enum extraction; ADR-043 records design. No schema/API/UI or cloud change planned.

## CHANGE-130 completion - 2026-10-15
Extracted only CourierPenaltyCase to root foc-common Maven JAR; root reactor/wrapper and Order build imports/Docker/Compose/CI/staging/conventions updated. Existing +2/+1/-1 and event JSON remain. Common4 plus Order420 tests pass, original gates; root validation image includes common JAR and no old Order enum. Compose base/HTTP, isolated selection regression, ShellCheck/actionlint, AsyncAPI and patch checks pass. Docker Desktop started hidden for tests; no app recreation/deploy/cloud/schema/peer/auth/frontend edits this task. User consumer still pending. Existing127/128/129 work retained; no stage/commit/push. Details/evidence in CHANGE-130; human/hosted CI pending.

## CHANGE-131 start - 2026-10-15
User requests all D1 NTH penalty mappings in foc-common. NTH2 PDF37-39 and NTH3 PDF40-41 read; PDF39 table visually verified. Add confirmed wrong location4, mishandling/damage4, deliberate retention/theft10. Existing +2/+1/-1 retained. No report workflow, User suspension/scoring, event contract, schema, auth or deployment change. Policy RED first; D1 highest-case/permanent-suspension requirements documented as future enforcement, not implemented by enum.

## CHANGE-131 completion - 2026-10-15
D1 NTH2 shared mapping now complete: existing +2/+1/-1 plus wrong location4, mishandling/damage4 and deliberate retention/theft10. D1 PDF37-41 read;39 rendered/checked. Three missing cases RED, full reactor427 tests GREEN (common7/Order420), gates unchanged/pass. Current automatic reason set/JSON and AsyncAPI unchanged; validation/patch checks pass. No peer/auth/schema/UI/infra/cloud edits or image rebuild/deploy. Highest-effective penalty and one-month/permanent suspension remain future User/Report logic; no extra score invented. Evidence/change record CHANGE-131; previous127-130 work retained, no stage/commit/push.

## CHANGE-132 start - 2026-10-15
User approves PenaltySystemPolicy rename and three policy lookup methods, Order adoption first. Shared test rename/helper tests precede source change; exact immutable report subset excludes original3. All amounts/reason names/wire/schema remain; no peer/auth/UI/build/cloud change. Existing127-131 work preserved.

## CHANGE-132 completion - 2026-10-15
PenaltySystemPolicy rename and3 static queries complete; reward returns SUCCESSFUL_DELIVERY, report list excludes original3, full list all6, immutable/order tested. Order imports/DTOs/completion/direction migrated; wire/amount/identity unchanged. RED compile then11 common tests; first full run hit stopped Docker/malformed PATH (6 errors/31 skipped). Started Desktop hidden and excluded only bad entry for new test process; no machine PATH/config edits. Final431 tests (11+420), zero failures/errors/skips, original gates pass. JAR/javap confirms new class/API and no old enum. AsyncAPI/patch checks pass. No peer/auth/UI/build/schema/deploy/image recreation this task; previous work retained; no stage/commit/push. Hosted CI/review and existing Report/User integration pending. Details CHANGE-132.
# Current task — CHANGE-133, 2026-10-15

Yao Xiang on `order-service/penalty-integration`: resolve the nine merge conflicts
without losing either workstream, verify Credit's completed administrative history
API and link only the existing selected-user profile history. No global Credit tab,
no sibling backend edits. Implementation/verification in progress; balance remains
unavailable. See `../../changes/CHANGE-133-admin-credit-history-merge.md`.


## CHANGE-133 completion — 2026-10-15

Nine conflicts resolved preserving Admin/Credit incoming changes and current
holds/penalty/involvement. Current identity stays Yao Xiang/penalty-integration;
incoming admin-dashboard profile historical. Both Git versions had orphan AI-log
markers; removed markers only, retaining history. OpenAPI MVC slice includes all
seven controllers and collaborator mocks, asserts both sets of endpoints.

Existing selected-user profile history only linked to real admin Credit history;
no global tab. Base mocks retained, selected balances pending,005 still open and
006 removed from outstanding requests. Independent provider errors/retry, no mock
fallback. Four red assertions then45 focused passing; final212 frontend tests,
production build/typecheck pass; lint0errors/3 pre-existing login warnings.
Root common11/Order427=438 and Credit clean102 tests pass, no skips; coverage gates
pass. Initial Credit run failed53 contexts from stale generated Firestore class;
clean verify resolved without peer edits. Initial full frontend run hit one stale
error-copy expectation, updated and reran successfully. Python unavailable, so
TOML key-uniqueness check only. No deployed/browser or full strict workflow-gate
claim. Nine conflict files staged to mark resolution; no commit/push. Incoming
staged Credit changes preserved byte-for-byte, no sibling backend edits by task.
Application images/data volumes untouched; only isolated test containers used.
CHANGE-133/handoff/current-context/API-gap records updated; human review pending.

Final checks: no unmerged index entries or conflict markers;403 qualified TOML
keys unique. Task whitespace check passes; staged incoming Credit handoff has
one existing blank-line-at-EOF warning, left unchanged. Provider source matches
the incoming staged version; no task edits. Build/typecheck processes exit0.

## CHANGE-133 documentation follow-up — 2026-10-15

User requests updating the peer API request after balance-read clarification.
Yao Xiang/current penalty-integration identity retained; workflow/context and
unchanged D1/Overall hashes rechecked. Documentation-only scope: clarify005 as
the remaining Credit gap, with GET/path/admin bearer/no-body contract, existing
BalanceResponse/account.updatedAt meaning, errors and provider test obligations.
History remains implemented/linked; /me remains caller-only. No new endpoint,
frontend, schema, peer source or configuration changes. Source/request-document
comparison and scoped whitespace checks performed; no tests rerun for prose.
Credit implementation and authenticated deployed verification remain pending.

## Admin suspension action removal — 2026-10-15

Yao Xiang/current penalty-integration branch. User explicitly requests removing
Suspend User from the dashboard, retaining Deactivate and Promote to Admin.
Use existing Admin profile layout; remove only suspension form/state/handler and
obsolete UI expectations. Read-only courier standing remains. Peer/mock APIs and
automatic suspension policy remain unchanged. Existing merge/history work retained.
Frontend component tests/lint/typecheck and affected request docs pending.

Completed: removed button/form/state/handler/reset, updated existing UI tests
(35 pass), retained promotion/deactivation and read-only courier standing.
Typecheck passes. API request002 withdrawn; ADR039/current context clarified.
No new tests for this reversible removal; updated existing expectations and
removed obsolete suspension cases. No backend/peer/schema/config changes or
container rebuild. Lint result recorded below; browser review pending.

Final checks: lint exits0 (0 errors,3 existing login unused-variable warnings),
typecheck exits0, scoped Admin suite35/35 and whitespace check pass. No commit/push.

## CHANGE-134 start — 2026-10-16

User requests admin cancellation with participant IDs and highest applied policy
penalty, plus nullable OrderResponse compatibility advice. Current Yao Xiang/
penalty-integration branch confirmed; mandatory context/helper and unchanged
source hashes checked. Detailed proposed contract/components/replay/transaction/
provider findings/test plan saved in changes/CHANGE-134-admin-cancellation-proposal.md.
Three text questions pending: allowed active/held states, penalty subset and
the unspecified response field. No application/tests/schema/frontend/peer edits
before these business decisions. Credit inspected accepts CANCELLED refund with
matching assigned courier; preserve courier. User penalty consumer still pending
under FEEDBACK-014. Existing merge/Admin history/UI-removal work preserved.

## CHANGE-134 approval and completion — 2026-10-16

User answers confirm active including held Orders; all additions excluding reward;
new COURIER_UNRESPONSIVE3; response field is overdue. Implemented canonical JSON
isOverdue (nullable), accepted-deadline/delivered-or-current comparison, cancellation
freeze, grouped bounded timing SQL and batched MapStruct enrichment. Report uses
existing authorized GET Order; no service identity bypass. Shared full policy7.

New separate admin cancellation controller/traditional request DTO/application
service: locked stored participant checks, active-only domain behavior, held
funding exception with original hold history retained. Refund and one maximum
optional addition committed with checkpoint/receipt. Stable per-order operation
key + canonical policy binding makes exact replay no-op, changed replay409.
Existing NOWAIT lifecycle lock path used; pending-command guard preserved.

Final467 common/Order tests (12+455) pass with no skips and coverage gates; new
real PG4 rollback/replay/timing/contended-lock tests pass. Frontend211 tests pass,
typecheck passes, lint0 errors/3 existing login warnings. AsyncAPI YAML/Ajv positive
and negative schema checks pass;404 TOML keys unique, not full parser. Task patch
and no-unmerged-entry checks pass. Initial common RED3 errors, assertion-type
errors, Docker-off failure and first full-run2 integration failures recorded in
CHANGE-134. Actual blocking API lock was unsuitable for this new NOWAIT path;
fixed new admin caller only. No peer or original command lock behavior changed.

ADR044/CHANGE134/context/contracts/diagrams/AsyncAPI/peer handoff/common docs and
workflow instruction amendment updated. Only frontend optional type, no new UI
control. User penalty consumer/Report caller, historical score reconciliation/
suspension and deployed authenticated verification pending. No new migration,
topics/root config, sibling backend edits, application rebuild/deploy/commit/push.

Final scoped error-handling review: added AdminOrderCancellationExceptionHandler
so this endpoint's translated pessimistic lock failure returns409/retry guidance;
other API handlers unchanged. PG test asserts actual exception family; route
tests5/5 include contention. Final complete verify467 tests passes with gates.

## CHANGE-135 implementation verified — 2026-10-17

- Persisted START+duration deadline and actual deliveredAt; response and completion
  use identical facts without checkpoint reads. SQL due selection uses those
  fields, held rows excluded and independent locked transaction rechecks retained.
- Admin cancellation persists WAIVED/ADDITION_REQUESTED, highest reason/amount and
  resolution timestamp atomically with existing refund/optional addition intents.
  Receipt replay/rollback tested; no APPLIED claim or new UI callback/feedback.
- Common12 + Order458 =470 tests pass, no failures/errors/skips; gates/JAR build
  pass. Fresh coverage-only rerun also passes470 tests and both gates/JAR without
  mapper mismatch warnings; final evidence belongs to CHANGE-135. Frontend optional
  types/typecheck and AsyncAPI checks pass.
- V10 clean/V9 upgrade2/2; actual local DB9 ->10 after ignored backup, all7 Orders'
  IDs/statuses/versions retained and3 timing records backfilled. Only Order DB
  started; no app image rebuild/cloud mutation. Rebuild matching Order before use.
- Existing merge and peer sources preserved. Human/deployed/peer scoring checks
  pending; missing legacy timing needs reviewed repair, Report release and point5
  immediate feedback remain deferred. See CHANGE-135 / ADR-045 for handoff.


## Completed — CHANGE-142 (2026-10-18)

User approved direct UI refinement: single long report panel, Order first/clickable to Admin Order route, aligned summary rows, report-only resolution action. Existing contracts/mock gating preserved. Reference GOV.UK summary list inspected; RED-to-GREEN report regression and full233 frontend tests pass. TypeScript/lint/build pass;1440/390 browser checks verify single panel, order navigation and resolution. No backend changes. Existing Report provider blocker unchanged.


## Completed frontend slice — CHANGE-143 (2026-10-18)

Approved UI refinement and live User/Supplier name reads via inspected existing APIs. Implement labelled description, participant names, deduplicated nonblocking name resolution, report filter/icon alignment. Live Reports stays Coming soon; no backend/config changes. RED-to-GREEN and238 frontend tests pass; final focused checks, TypeScript/build and lint (3 existing warnings) pass. Sample1440/390 browser confirms32px aligned filter/icon and named Description summary. Actual peer smoke not verified with preview account (Supplier503, User fixture unavailable); do not claim live end-to-end. No backend/config changes.


## In progress — CHANGE-144 (2026-10-18)

Verified delivery-stored overdue and completion flag read. Implementing independently authorized report open/closed cards, removal of response deadline and required admin reply in local prototype. Penalty adjustment/record schema and transport await three user answers: per-attempt vs global uniqueness; Order/event-side or mock-only missing User consumer; reward replacement. Do not claim User score applied from outbox intent. No sibling backend edits.


CHANGE-144 current approval: per-attempt outcomes/reward replacement; synchronous User call with durable PENDING and same-ID recovery explicitly approved. Event draft was withdrawn after automatic review rejection, then replaced under the new approved design. No shared .env/topic edits approved or made. User replacement missing (FEEDBACK-016); live disabled. Report Open/Closed/no-deadline/reply changes independently implemented. Full verification in progress; no commit, staging, cloud resources, sibling backend or existing DB reset.


CHANGE-144 handoff: Order-side approved contract-stub/UI slice implemented and verified; no unfinished coding within this milestone. Final verification 2026-10-18: the full run executed544 Order +12 common tests; all have passing results after the corrected six-test rerun, with no skips. Full run passed all except one new multi-courier fixture that omitted its mock Credit reservation; after fixture correction, all six PenaltyAdjustmentJpaIntegrationTest cases and Maven verify/unchanged coverage gate pass. No production logic changed for that final rerun. 241 frontend tests pass; final focused16 tests pass after final text/label changes. TypeScript and production build pass; lint0 errors/3 pre-existing login warnings. Visual isolated preview at1440x1000 and390x844 confirms Open/Closed cards, required reply/resolved movement, old waiver removal, reward -> No penalty and retained revision/reason. No real User score was changed. Temporary processes, emulator-only account and change144_preview DB were removed; existing Compose services/application DBs retained. git diff --check passes. No commit/staging/push/cloud action or sibling backend/shared environment edits. Live User replacement and Report provider integration remain MISSING, deliberately disabled/Coming soon.

Peer stopping point: FEEDBACK-016 User team implements the exact synchronous replacement endpoint, contribution ledger, stable replay and delayed-initial suppression; inspect provider DTO/auth/errors/recovery tests and run an actual score integration before enabling order.penalty-adjustment.enabled. Report team implements FEEDBACK-015 amended contract. Do not enable by assuming the existing fixed outcome PUTs are compatible.


CHANGE-145: user-approved Report card status alignment in progress; only the existing status-row justification changes, across admin/user Open/Closed cards. No backend/API/config change; existing Report tests pending.


CHANGE-145 verification: all6 existing Report component tests pass; git diff --check passes. CSS-only class change, no new test or backend/config change. Existing running frontend was not rebuilt; browser visual confirmation after rebuild remains pending.


CHANGE-145 follow-up, explicitly requested2026-10-18: title is now first at the upper-left and status at the upper-right in one flex row aligned to the title first line. The separate badge-only row is superseded. Badge is limited to half the row and wraps on narrow cards, so title/status remain alongside each other without horizontal overflow. Source-only layout refinement; existing Report tests pending.


CHANGE-145 same-row follow-up complete: all6 existing Report tests and git diff --check pass. Frontend container not rebuilt; browser confirmation pending rebuild.


CHANGE-146 in progress2026-10-19: user explicitly replaces synchronous penalty adjustment with monotonic stored report penalty, finalized through existing addition/deduction events; removes admin completion API/UI. Detailed approved semantics in CHANGE-146/ADR-050. Preserve applied V13 migration/history; additive V14, no sibling/shared config changes. TDD next.


CHANGE-146 completed for the approved Order/frontend slice. CHANGE-146 verification,2026-10-19: full root Maven verify passes517 Order tests and12 common tests,0 failures/errors/skips; unchanged coverage gate passes. Final focused API/security/OpenAPI verify also passes after documentation clarification and adding an admin hold-release authorization test. Frontend full241 tests pass, then final11 focused tests include the additional stored-penalty cancellation regression (242 total current frontend tests across those runs). TypeScript and final production build pass; lint0 errors/3 existing login warnings. Local sample preview at1440/390 confirms no admin completion/adjustment, Apply4 then3 keeps4 and original reason, cancellation cannot waive it, and terminal Apply is disabled. Visual screenshots were inspected; a final cancellation summary copy refinement explicitly displays the stored policy/amount and omits overdue timing, with a passing regression/build. Preview processes/account/change146_preview database removed; existing services/application databases preserved. No cloud/sibling/shared-env/CI action or commit/staging. V14 is verified on isolated clean/V13 upgrade databases; existing application DB not migrated. Historical V13 rows retained, no replacement runtime remains. LINE 94.91%, BRANCH 81.99%.
Rebuild matching Order/frontend images to use the new flow; no User replacement API or new topic is required. Existing initial event consumer/provider verification and missing Report Service remain independent of this change.


## Effective CHANGE-147 — Report reply privacy and active policy choices (2026-10-19)

Approved Yao Xiang: admin resolution reply is visible only to the submitter and reviewing admins; courier participants still see resolved status/time and other existing case information. Local prototype list/detail responses redact resolutionNote on copied snapshots, and UI hides the reply in courier views. Production Report Service is still missing and must enforce this with verified caller identity, never client-supplied roles. Live Reports remain Coming soon.

COURIER_UNRESPONSIVE is retired from active policy lists and new admin apply/cancel choices. Its enum/amount remain only for historical persisted rows and existing outbox events; immutable migrations and saved penalties are not rewritten or waived. Six active policies; three selectable report penalties (wrong location4, damage4, theft10). Cancellation UI selects one radio case and sends the existing one-element list; stored maximum semantics and existing penalty topics remain unchanged.

Report cards omit Order descriptions; closed cards are muted but remain navigable. Requester/courier names link to admin profiles, IDs have separate copy rows. Admin table names, email, roles and IDs truncate visually while full values remain in titles/copy/details. No sibling backend or shared runtime/CI/cloud configuration changes. See CHANGE-147.

CHANGE-147 verification (2026-10-19): full root Maven verify passed 520 Order tests and12 common tests,0 failures/errors/skips; final focused verify passed45 Order plus12 common tests, including the subsequently added cancellation-retired-case test (521 current Order tests across runs). Unchanged coverage gate passed. Frontend full243 tests and final18 focused tests pass; TypeScript, final production build and lint pass (0 errors/3 existing login warnings). Order and frontend Docker images built successfully as change147-check tags; no existing containers replaced. Automated Edge preview1440x1000 and390x844 plus screenshot inspection confirmed private-reply copy, separate name/profile and ID/copy rows, muted closed cards remain navigable, three radio cases with one selected, and no unresponsive option. Extreme name/email/user-ID fixture measured columns176/224/192px; full ID remains in copy/title, no service record changed. Found/fixed existing multiline status badge clipping; final measured41px height, scrollHeight=clientHeight39. Temporary account/processes/isolated change147_preview DB removed; existing Compose data untouched. git diff --check passes. Full peer-service CI/cloud checks and real Report integration were not run; Reports remain local-only/Coming soon live. No commit or staging.


CHANGE-148 (2026-10-19), Yao Xiang: presentation-only refinement in existing Admin/reports components. Completion hold displays Yes/No. Refresh icon shares Open reports heading row; normal participant section controls remain available. Cancellation uses muted Choose one penalty case/highest-selected guidance and requested stored-penalty warning. Remove score-event/overdue-comparison implementation details from Apply Penalty description. No API, backend, data, scoring, authentication, navigation, schema or deployment behavior change. Reuse existing components/theme. Existing component tests/typecheck/build and frontend image verification pending; no new tests for reversible copy/CSS edits.


CHANGE-148 verification:18 existing focused UI tests pass; production Next build including TypeScript passes; lint0 errors/3 pre-existing login warnings; frontend Docker image foc-frontend:change148-check builds successfully; git diff --check passes. Reviewed responsive flex heading placement in source; no new browser session for this copy/layout-only change. Backend tests/image not rerun because no backend source, contract or schema changed. No existing container restarted, commit or staging. Reports remain local mock/live Coming soon.


CHANGE-148 follow-up,2026-10-19: user requested removal of the entire lower cancellation warning paragraph beginning Only the highest selected amount is requested. Removed that paragraph only; the separate Choose one penalty case helper stays. No backend/penalty/contract behavior change. OpenAI Codex (GPT-6), Yao Xiang; verification pending.


CHANGE-148 warning-removal verification:9 cancellation UI tests pass; frontend Docker build including TypeScript/production build passes; git diff --check passes. No new tests for copy-only removal; no running containers replaced. No backend change or backend verification needed.


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


CHANGE-159 (2026-10-28), Yao Xiang confirmed on order-service/admin-ui-linking: align active list and atomic requester report holds to external HANDOFF.md; explicit admin No penalty overrides stored policy, selected penalty still uses max; preserve held delivery progression and pause ordinary refund/penalty outcomes per clarification. Verify/link ready Credit balance and User profile/promotion/deactivation; directory remains pending. Reporting source absent; synchronous resolution integration explicitly deferred pending non-callback resolve/restore contracts. Snapshot migration V18 awaiting answer after purpose explanation. No sibling backend edits. Work in progress.


CHANGE-159 final verification (2026-10-28): full root reactor verify PASS,654 Order +12 common tests, zero testcase failures/errors/skips, coverage gates pass. The first full run found one old OpenAPI schema assertion and one expired test fixture; both corrected and targeted38 tests passed, followed by final full verification. Added final auth/caller scoping and persisted zero-outcome checks. Surefire logs a30-second lingering fork shutdown/termination after tests (build exits0); no production shutdown issue is inferred. Frontend locked npm ci,253 tests, lint(0 errors/warnings), typecheck and production build pass; both fresh Docker images foc-order-service:change159-check/foc-frontend:change159-check build. New OpenAPI paths, exact six hold-response fields, boolean-only placement body and documentation links validated; git diff --check passes. No migration, live cloud invocation/deployment, real Report integration or authenticated deployed browser validation. Docker Desktop was started for isolated test databases; no application volumes removed. No commit or staging.


CHANGE-160 (2026-10-28), Yao Xiang, order-service/admin-ui-linking: user authorizes ID-only Admin Users search with category dropdown retained, ready APIs only in all environments, removal of Admin mock endpoints/transport/config and dependent local Report demo API, and concise pending-only peer contracts with completed history archived. Keep Report UI design gated Coming soon until ready. No sibling backend changes or database/cloud mutation. Existing CHANGE-159 work preserved. Regression-first verification in progress.

CHANGE-160 scope clarification: user explicitly preserves Admin Reports mock endpoint/UI locally, with staging/production Coming soon. Generic mock Admin HTTP routes and transport are removed; internal sample fixtures remain solely for Reports. This supersedes the initial removal of the dependent Report demo in the start note above.

CHANGE-160 final verification (2026-10-28): native Maven exit0, full reactor verify PASS (644 Order +12 common =656 tests, zero failures/errors/skips; unchanged coverage gates pass). Frontend252 tests pass; lint0 errors/warnings, host typecheck/production build and fresh Order/frontend Docker builds pass. Both Compose configurations validate with native exit0. Same frontend image in isolated local/staging containers serves health200, always real Admin APIs, mock Reports only locally despite a stale generic mock flag; preview containers removed. Fresh Order image contains Report-only fixtures and no AdminMock classes. Initial PowerShell stderr redirection reported wrapper exit1 despite successful logs; direct native rerun confirmed Maven/tests/images/configuration exit0. No sibling backend, migration, database/GCP mutation, application-container recreation, commit or staging. Pending name search, User penalty subscribers, Supplier deactivation guard and Report integration remain explicit; deployed authenticated browser integration is unverified. Sample Report identities are not real User/Order provider records.

CHANGE-161 started2026-10-29: same confirmed Yao Xiang/admin-ui-linking context. User explicitly authorizes narrow User Service endpoint implementation plus user-servicehandoff.md, real Admin directory integration and full-width Admin resolution cleanup. New GET /api/users/admin/search, existing auth/admin checks, bounded DB paging/ID/name filters and safe display DTO; legacy routes preserved. Reports remains sole pending Admin HTTP API integration; independent User scoring/Supplier deletion behavior not silently declared complete. No lifecycle, compensation, schema, cloud or existing data changes. Regression-first verification in progress.

CHANGE-161 final verification (2026-10-29): User Service native Maven verify exit0,36 tests pass with zero failures/errors/skips, including4 real Mongo directory tests and3 active-admin/security/error route tests plus OpenAPI contract checks. Frontend252 tests, lint0 errors/warnings, typecheck and production build pass. Fresh foc-user-service:change161-check and foc-frontend:change161-check image builds exit0. Real User image + isolated Mongo HTTP checks pass14 requests: initial20/25 and page2, literal/case-insensitive names, exact UID/deactivated display, empty result, query400, missing/wrong-project/expired token401, non-admin403, existing profile200 and documented secure route. Temporary test/HTTP containers and network removed; existing application data untouched. Initial failed runs were stale generated pre-refactor User classes plus missing test-slice HttpSecurity setup, an obsolete frontend capability assertion and an HTTP-harness lifetime issue; only generated outputs/test harness/fixture were corrected, production auth was not refactored. Order backend source/lifecycle/schema/compensation unchanged this turn; its already-passing CHANGE-160 suite was not repeated. User changes are limited to3 new endpoint/query/DTO production files, tests/test dependency and handoff/README. No Supplier/Credit changes, new env vars, cloud deployment, commit or staging. Report integration remains pending; separate User subscriber/Supplier guard follow-ups are retained. No authenticated deployed browser/visual screenshot claim.

CHANGE-162 started2026-10-29: same Yao Xiang/admin-ui-linking identity. User explicitly approves guarded Order-only Report contract-stub saga, additional operation/event/admin IDs and fence generation, authenticated compensation result, new migration/configurable topics and default-off live integration. No Report backend/GCP changes. ADR-059 records detailed sequence/assumptions. Existing Credit saga inspected; reuse outbox factory/retry/transport verifier and minute recovery style, separate Report journal/inbox. New migration tests reproduced2 missing-schema failures before V18. Implementation/TDD verification in progress; prior161 User work preserved.


CHANGE-162 implementation2026-10-29: approved guarded saga implemented with V18, journal/ports/adapters, admin APIs/result security, existing outbox/scheduler integration and persistent release guard. Regression-first migration, PostgreSQL HTTP/broker fixture tests and route/security checks added. Initial suite found schema/FK fixture expectations and publication due-time skew, corrected; final verify/image/schema documentation checks in progress. Report remains absent/default disabled; no app DB/GCP/source sibling edits, commit or staging.


CHANGE-162 final verification (2026-10-29): native full Order/common Maven verify exit0,661 Order +12 common =673 tests, zero failures/errors/skips, unchanged coverage gates pass (Order94.65% LINE/80.67% BRANCH). After final OpenAPI parameter annotations, targeted10 contract/security/OpenAPI tests pass; strengthened PostgreSQL saga9 tests pass, including explicit PUBLISHED-before-rearm and stable compensation identity. Fresh foc-order-service:change162-check image builds exit0. Isolated fresh-image smoke health200/schema18 and default-disabled resolve/status/result routes absent from OpenAPI; temporary test containers/network removed. Both Compose configurations validate. AsyncAPI1.5.0 validates8 channels/operations,8 DTO sets/11 examples and negative/source/default/topic parity; context TOML valid; git diff --check and conflict scan clean. Initial full-run failures were two schema/FK expectations and host/DB due-time test skew, corrected. Host Python unavailable, so Python checks used read-only disposable containers; initial inline TOML invocation had Windows quoting failure, corrected with a script. No frontend/sibling production change in162, app-data/GCP mutation, deployment, staging or commit. Real Report restore/fence/result delivery and cloud OIDC/IAM remain unverified; integration defaults disabled.


CHANGE-163 completed2026-10-29: same confirmed Yao Xiang/admin-ui-linking scope. User corrects no-deadline proposal, approves early admin resolve warning and asks to document private reply and saga support; category undecided. Documentation/ADR060/handoff/feedback/sequence/context synchronized without changing Report/local UI/Order source, tests, SQL or env. Real Report implementation remains missing/default-disabled. Documentation checks recorded in change record; no application test rerun, commit or staging.


CHANGE-164 started2026-10-29: same confirmed Yao Xiang/admin-ui-linking context. User explicitly requests retry automatic repost until success. Reproduced permanent SQL exclusion with3 RED actual-integration checks; implemented safe fresh attempts preserving terminal histories and waiting for confirmed no-effect/compensation. SQL fair due selection and original-row/unique pending guard retained. Focused20 actual Order/Credit/PostgreSQL/PubSub tests pass; extra concurrent-retry case/full verify pending. No migration or peer/API/config/frontend/cloud edits; existing159–163 preserved.


CHANGE-164 final verification (2026-10-29): native full Order/common Maven verify exit0,666 Order +12 common =678 tests, zero failures/errors/skips; original coverage gates pass (Order94.86% LINE/80.98% BRANCH). Actual Order/Credit/PostgreSQL/PubSub compensation suite21 tests passes, including concurrent fresh retries with one successor/reservation, pre-Credit timeout recovery on later scheduler passes, insufficient funds then recovery, lost applied Credit response/confirmed reversal before fresh attempt, pending-effect barrier, holds/expiry, refund lag and manual guards. User/Supplier eligibility checks remain explicit fixtures in that suite, not a deployed peer claim. Three regressions failed before the fix; initial focused20 passed before the final race test. Fresh foc-order-service:change164-check image builds exit0. Context TOML and git diff/conflict checks pass. No frontend/schema/API/topic/env/feature-gate/sibling production or GCP change; no application data/container recreation, deployment, commit or staging. Existing safely failed eligible plans recover without deleting/resetting old commands after rollout; unresolved compensation/FAILED publication still requires existing recovery/redrive and is never bypassed.


CHANGE-165 (2026-10-29), Yao Xiang on order-service/admin-ui-linking: user explicitly requests fixing User CI AdminUserDirectoryTest Mongo8 container-start error. Pin only that test fixture to mongo:7.0.43, matching existing Order/User integration. No production code, dependency, environment, database schema or CI workflow change. Full standalone User verify native exit0:36 tests/0 failures/errors/skips, including4 real directory cases and OpenAPI. Both test databases are disposable Mongo7 replica sets; no application data modified. Test container/image behavior on GitHub requires the CI rerun; the provided excerpt did not include the underlying Mongo crash output. See order-service/changes/CHANGE-165-user-directory-ci-mongo-image.md and user-service/user-servicehandoff.md relative to repository root for peer details. No commit, push, deployment or staging.


## Current reporting integration ? 2026-10-29

Owner: Yao Xiang; branch feat/reporting-service. User explicitly requests Report frontend/API linking, Report-owned resolution journal/compensation consumer/result outbox, live Order integration, and exclusion of OPEN orders from reporting. Main has now been merged by the user; resolve only the three Report UI conflicts in favor of the approved real APIs. Scope includes the two Order reporting queries/hold validation, shared Report-only configuration, Report/frontend tests and documentation. No sibling business behavior, cloud mutation, commit or deployment is authorized. Verification is in progress.


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

Final CHANGE-167 checks: all 10 credential-free cloud wiring regression tests pass; full CI ShellCheck scope (scripts/ci/*.sh and infra/gcp/*.sh) passes after explicitly expanding Windows wildcards; both Compose config checks pass; context TOML parses; working diff whitespace check passes and no unmerged paths remain. No Maven/frontend application tests were repeated because CHANGE-167 changes provisioning/configuration/docs only. No real provisioning script, IAM mutation, subscription update, application deployment or feature activation was executed.


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

Picker-row refinement verification: all8 existing ReportForm tests pass, including optional credit selection, prefill, uploads/retries and duplicate feedback on submit; scoped ESLint and working diff whitespace checks pass. No backend tests or full build repeated for this display-only change. Running application containers were not rebuilt.


## Effective reporting simplification - CHANGE-169 (2026-10-30)

Owner: Yao Xiang on feat/reporting-service. The user revoked the optional CREDITS/Order association introduced in CHANGE-168 and requested the initial submission UI, while retaining completed/cancelled Order lookup and the red courier reply reminder. This supersedes only credit association and picker layout from CHANGE-168; active reporting/hold restrictions, duplicate feedback and the response-count behavior remain.

CREDITS and GENERAL submissions are unlinked: no Order selector or lookup, orderId null, READY_FOR_REVIEW, no reported courier, response deadline, completion hold or automatic credit adjustment. Sending a nonblank orderId for either category returns400. ORDER/COURIER keep the existing active-only associated-order dropdown. The card/row/date alternatives are removed from this form. A supplied initialOrderId is ignored for unlinked categories. Form contents/photos and the helpful active-report message remain on failure.

Retain GET /api/orders/mine/completed and /api/orders/mine/completed/{orderId}. Add the matching GET /api/orders/mine/cancelled and /api/orders/mine/cancelled/{orderId}. OrderCreditHistoryController replaces the internal CompletedReportOrderController class name without changing the completed URLs. List endpoints return the existing one-based Order page, with status/ownership/count/pagination in SQL; detail returns404 for wrong status, missing or unrelated orders. Requester/current assigned courier only, from verified principal, with any recognized Order role. Read-only history: no Credit ledger access, hold, funds or penalty changes. These APIs are independent of Report submission. Expiry also has refund behavior in the existing system; the requested retained history scope here is COMPLETED/CANCELLED, not a statement that other statuses have no Credit activity.

Remove the now-unused Report getCompletedOrder HTTP adapter/interface method and CompletedOrderContext DTO. Keep reading historical linked credit reports and resolving them locally through the existing Report journal; no database records are deleted or backfilled. The Report result/compensation contracts and topics remain unchanged. No SQL/Firestore migration or new index/env/role is required. Existing completed-query metadata, including nullable startedAt, is retained as response compatibility; the form does not display it.

Preserve GET /api/reports/mine/response-count and the red badge in normal desktop/mobile Report an Issue navigation, including five-second visible/authenticated polling, caller isolation and deadline filtering. No User/Credit/Supplier backend, CI workflow, cloud setup, running container or application database mutation is part of this change. Backend Java, Report form/tests and existing documentation are the affected slice. Tests and final evidence are recorded below after verification.

Final CHANGE-169 verification: root reactor670 Order +12 common tests, zero failures/errors/skips; coverage gates pass (Order BRANCH81.03%, LINE94.81%). Report60 tests, zero failures/errors/skips; gates pass (BRANCH81.49%, LINE95.01%). Frontend274 tests across52 files, lint and production build (including TypeScript) pass; focused form/reminder/navigation14 tests pass. All four completed/cancelled list/detail routes and retained response-count API are present in generated OpenAPI; context TOML validates. Updated actual Order/Report HTTP + PostgreSQL/Firestore + two-way Pub/Sub live integration passes all seven scenario groups, including unlinked credit creation/local resolution, rejection of supplied credit orderId, completed/cancelled ownership/status filtering and the preserved response count, plus existing rollback/duplicate/lost-response/fencing scenarios. Disposable fixtures removed. Logs: order-service/target/change169-order.log, change169-report.log, change169-frontend.log, change169-lint.log, change169-build.log, change169-live.log; reporting-service/target/live-order-resolution-result.json. No production deployment, GCP change, database cleanup or running frontend rebuild was performed. Working diff whitespace and merge checks pass.
## CHANGE-170 verified locally - 2026-11-01

CHANGE-171 proposal pending: user requests courier reporting of assigned Orders. Inspected current requester-only SQL/hold authorization, Report submission/self-response and resolution's reporter=requester assumption. Proposed participant-scoped active list/locked hold, actual requesterId distinct from submitter, historical fallback, unchanged funding/saga/private replies, and courier reports direct to admin without self-response. Asked whether to use direct review or add requester responses; detailed design approval required by AGENTS before implementation. No application source/tests changed for171. See changes/CHANGE-171-courier-order-reports.md; prior170 dirty work preserved.

Local follow-up completed: PostgreSQL RED reproduced default RETRY's generic hold message; corrected it and frontend historical reason-code notifications. Full reactor677 Order+13 common verify/coverage passes; affected38 frontend tests, ESLint and Docker build/types pass. Eight real Nginx/Order/Report/PostgreSQL/Firestore/PubSub scenario groups pass, including rollback/duplicate/lost-response/fencing. User's fresh local retry returned404: both saga routes were disabled. Completed existing local integration with both flags, timeout nesting and two emulator topics/subscriptions; bootstrap twice and both Compose configs pass. Rebuilt Order/frontend, recreated only Order/Reporting/frontend; all healthy and both resolution routes appear in gateway OpenAPI. No volumes removed, no user report resolved by assistant, no cloud change. User should refresh and retry the same saved resolution in their authenticated browser; the inspected report remains awaiting response. Original502 cause not independently proven by this404; current gateway harness succeeds. See CHANGE-170 for exact evidence and remaining browser/staging checks.

Owner confirmed Yao Xiang on hfix/report-service. Implemented Report response framing fix and saved-command recovery, meaningful held-action messages, exact Orders-table navigation, ORDER/GENERAL-only new submissions with legacy readability and COURIER_BAD_ATTITUDE=2 plus V19 constraints. Four frontend failures and a real PostgreSQL constraint failure reproduced before their fixes. Report62 and frontend280 full tests pass; final affected backend verify42 Order+13 common passes after latest-version fixture updates; current source-matched reports total676 Order+13 common with no failures/errors/skips. Both backend coverage gates, frontend lint/production build, context TOML and whitespace checks pass. No source drift, sibling backend/cloud mutation, application stack reset or deployment. Uncommitted source/tests/docs are intentionally left for the user's PR; no commit/push performed. Deploy matching Order/Report/frontend; Flyway applies V19, then smoke-test resolution/hold release in staging. User penalty consumer remains absent. Full evidence and exact paths: changes/CHANGE-170-report-resolution-and-feedback-hotfix.md.

CHANGE-170 final evidence: Report62 full verify and frontend280 full suite pass; affected Order42+common13 verify/coverage passes after latest-version fixture updates (current source-matched Order reports676 green). Backend coverage, frontend lint/build, OpenAPI, TOML and whitespace verified. Uncommitted work awaits user PR and staging smoke check; no deployment. See CHANGE-170 for the complete failure/rerun account.

## Effective CHANGE-171 / ADR-064 — courier Errand reports (2026-11-01)

User-approved: ERRAND lets the currently assigned courier report ACCEPTED, IN_PROGRESS, PICKED_UP or DELIVERED Orders, directly READY_FOR_REVIEW without self-response/deadline/reminder. ORDER stays requester-only; GENERAL unlinked; historical COURIER/CREDITS readable. GET /api/orders/mine/active adds mode=courier (default requester). Existing hold body adds reporterRole=COURIER (default REQUESTER). Verified role/token subject and SQL current ownership/status scope are mandatory; placement remains locked/transactional and hold rows bind the actual requester. New Report requesterId is actual owner; reporterId remains submitter. Legacy linked non-ERRAND records fall back to reporterId. Frontend selects the correct scoped list and labels submitter correctly. Replies remain submitter/admin only. Existing one-active-report, funding pause, continued delivery and resolution/compensation stay unchanged. No new SQL migration, topic, GCP or User/Credit/Supplier backend change. Deploy Order/Report/frontend together; older Report binaries cannot read new ERRAND documents. See changes/CHANGE-171-courier-order-reports.md and docs/decisions/ADR-064-courier-errand-reports.md for approval, design and verification. Implementation and verification in progress; prior170 staged work preserved.

CHANGE-171 final verification:681 Order+13 common full verify and66 Report full verify pass, coverage gates/packaging pass (Order branch80.70/line94.67%; Report branch81.61/line95.09%). Final9 Firestore saga checks confirm legacy requester fallback and courier-report actual-owner compensation. Frontend284 full tests plus final affected32, lint and Docker build/types pass. Nine actual Nginx/Order/Report/PostgreSQL/Firestore/PubSub scenario groups pass. Rebuilt/recreated local Order/Report/frontend; all healthy, live OpenAPI exposes ORDER/ERRAND/GENERAL, requesterId, mode and reporterRole. Volumes preserved; no user report submitted/resolved, cloud/peer backend/index/commit/push changes. Authenticated browser use and cloud rollout remain unverified. Evidence and fixture-failure corrections: order-service/changes/CHANGE-171-courier-order-reports.md. This completion supersedes the in-progress status above.

## CHANGE-172 — active-report error feedback (2026-11-01)

Yao Xiang on hfix/report-service. User clarified generic feedback occurs when submitting another report. Form now shows the specific backend/client reason as the alert title, replacing "Could not submit". Duplicate-report checks and known hold rejection/saved-command UI use "This order has an active report. Please resolve it before proceeding." Report's HTTP adapter recognizes both historical and current wording. ORDER/ERRAND stale-selection tests retain form content and never show success. The initial cancellation example also exposed a real hold-version regression: a genuine hold increments version, so authorized owners now see the hold before a stale-version rejection; unrelated-caller precedence remains unchanged. No funding, authorization scope, API/schema/topic or workflow change. Existing context/owner/PDF fingerprints match. Full verification in progress; prior staged171/170 work preserved. Evidence: changes/CHANGE-172-active-report-error-messages.md.

CHANGE-172 verified locally:683 Order+13 common and66 Report full verify/coverage pass;42 affected frontend tests, lint and Docker build/types pass. Nine actual gateway/saga scenario groups pass, including exact duplicate-report text and stale held-abort reason before any possible Credit effect. Local Order/Report/frontend rebuilt/recreated and healthy; volumes preserved, no direct user-report edits or cloud/commit/push changes. Report form displays the specific reason as its heading, retains content on failure, and supports client-known/server-discovered active reports. Original interrupted run and existing Surefire shutdown warning documented accurately in CHANGE-172; final full verify succeeds. Browser confirmation after hard refresh remains. See changes/CHANGE-172-active-report-error-messages.md.

## Advisory review — courier holds and concurrent admin resolution

Read-only implementation review requested by user. ERRAND placement uses the same report-specific completion/funding hold: courier progress allowed, normal completion/refund/abort paused; deliberate admin cancellation remains available. Report resolution begins under the Order NOWAIT row lock and records PENDING; a partial unique index permits only one active resolution per report. A second command is rejected while pending/recovering or after its hold is released; exact same-admin/input/key retries replay. Firestore transaction prevents another reply overwriting RESOLVED. No new two-admin test executed for this advisory turn. Existing UI limitation confirmed by source: Report masks409 details and the dialog treats all409 as uncertain; a losing admin may see checking/Resume resolution and then404 for its unregistered command rather than a clear already-resolving/resolved explanation. Backend guards remain; no application/test/schema/config changes made. Follow-up UI handling is a finding, not an implemented fix.

## CHANGE-173 — default Order category (2026-11-02)

Yao Xiang on hfix/report-service; user-authorized frontend default only. Missing/empty category now starts ORDER; explicit ERRAND/GENERAL and retired/invalid GENERAL fallback remain. Screenshot's empty Description/0 counter explains client validation stopping before POST; keep required explanation and backend rules. No backend/schema/config change. Existing reporting tests and direct default checks, lint/build planned; rebuild only local frontend. No new low-impact tests or broad backend rerun. Prior changes/staging preserved. See changes/CHANGE-173-default-order-report-category.md.

CHANGE-173 completed:16 existing reporting tests,8 direct default checks, lint and frontend Docker build/types pass. Actual built /reporting carries initialCategory=ORDER; explicit ERRAND/GENERAL links remain their categories. Recreated only local frontend, healthy; no backend/data/cloud/config/volume change or new low-impact tests. The screenshot's Description is empty (0/2000), so no POST is expected until an explanation is entered; grey text is a placeholder. See CHANGE-173 for evidence and startup-probe retry. User browser refresh/input remains the final manual check.

CHANGE-174 (2026-11-02): approved unified Order reports, opposite-party24-hour reply and one-time unresolved Errand upgrade. Implementation in progress; preserve staged work.

CHANGE-174 verification:685 Order+13common and69Report full verify pass,287frontend tests/full lint/build/types pass; three local changed containers healthy. Final isolated real saga rerun in progress after timestamp fixture precision correction; no production logic change for that correction.

CHANGE-174 complete locally: nine actual gateway/Order/Report/PostgreSQL/Firestore/PubSub scenario groups pass, including requester reply/badge, exact persisted response deadline after compensation, duplicates, safe retry, lost HTTP reply and delayed-original fencing. Disposable fixtures removed; local application volumes preserved. No staging/cloud rollout, commit or push. Authenticated browser confirmation after refresh remains. Evidence: reporting-service/target/change174-live-final.log and target/live-order-resolution-result.json.

CHANGE-175 (2026-11-02): user restores separate requester ORDER/courier ERRAND categories with opposite-party24-hour reply and cross-category one-active-report rule. Preserve saved replies/deadlines and saga. No Order application/shared/cloud change. In progress; see CHANGE-175.


CHANGE-175 verified locally:70 Reporting tests pass with zero failures/errors/skips; branch81.17%, line95.12%, OpenAPI/packaging/coverage gates pass.41 affected frontend tests and full lint pass. Reporting/frontend production Docker builds pass, including TypeScript. Nine real gateway/Order/Report/PostgreSQL/Firestore/PubSub scenario groups pass: restored role-scoped ERRAND, requester incoming case/reminder/reply, Order/Errand duplicates in both directions, wrong actor/category rejection without orphan hold, resolution/replay/private reply, final rollback and duplicate compensation, safe retry, lost reply and delayed-original fencing. Existing Order application/jar unchanged; previous full Order/common verification is retained and not claimed as rerun. Recreated only local Reporting/frontend; Order/Report/frontend healthy. Live OpenAPI exposes ORDER/ERRAND/GENERAL and built Errand route returns200. Databases/volumes preserved. No new schema/topic/index/config/cloud, staging/commit/push changes. Browser confirmation after refresh and cloud rollout remain. Logs: reporting-service/target/change175-red.log, change175-verify.log, change175-live.log; order-service/target/change175-frontend.log, change175-lint.log, change175-docker-build.log, change175-local-start.log. Initial RED reproduced rejected ERRAND and window reset; no failed final checks. Human review pending.

2026-11-02 advisory navigation review: user asks whether clicking Report an Issue should open Against me when response count is positive, otherwise the existing report form. Existing shell displays count but link stays /reporting; route supports tab=against-me. Recommendation only: conditional navigation on click, no forced switch while user is reading/writing; awaiting user instruction before implementation. No application/config/test change.

CHANGE-176 (2026-11-02): user approved pending-response navigation. Report link uses Against me for positive count, existing form otherwise; reporting tabs follow explicit URL navigation. No polling-driven switching or backend change. In progress; preserve staged work.


Verified CHANGE-176:22 affected frontend tests pass; full lint and frontend production Docker build including TypeScript pass. Initial navigation regression failed for the old href before implementation. Tests confirm positive/zero count destinations, unchanged ADMIN navigation, draft preservation with count updates, explicit same-page query navigation and existing forms/responses. Recreated only frontend; healthy. Built /reporting returns200 with initialTab=create; /reporting?tab=against-me returns200 with initialTab=against-me. TOML/whitespace checks pass. No backend tests rerun or backend/API/schema/auth/shared-config/deployment-settings/workflow/skill changes; only existing frontend source/tests and documentation/AI context changed. No database/volume/cloud/Git publication changes. User browser confirmation and staging rollout remain. Evidence: order-service/target/change176-red.log, change176-final-tests.log, change176-lint.log, change176-build.log and change176-local-start.log.

2026-11-02 advisory UI review: user asks whether Report-to-filtered-Order navigation is enough to explain admin action availability and whether Reports has next-page controls. Inspected actual Orders/action bar, Report cards/status filter, Report client/controller/repository and shared pagination. Both admin and normal Reports request20 per page and render Previous/Next for totalPages>1. Existing admin regression with21 results clicks Next/page2 and verifies filter reset/page1:1 passed,14 intentionally not selected (targeted test), log target/report-pagination-review.log. No application/test/config changes. Recommendation only: retain exact-order redirect/status badges, add active-order/ready-review shortcuts and inline disabled-action reasons; distinguish report review status from Order lifecycle. No product/UI implementation approved in this advisory turn.

2026-11-02 clarification only: confirmed normal Suppliers Open now uses the existing Switch, changes query.openNow and resets page1. Proposed Active orders only / Ready for review only shortcuts can reuse that style; off restores all matching records. Existing status filter must stay synchronized rather than conflict. No implementation approved or performed.

2026-11-02 advisory clarification: user notes Active orders is not explained in UI. Backend action gate defines OPEN/ACCEPTED/IN_PROGRESS/PICKED_UP/DELIVERED, but this is ambiguous product copy. Refine proposal to an Action filter (All orders / Can cancel / Can apply penalty), matching existing cancellation state and assigned-courier penalty rules. Reports Ready for review already names a defined report status. No new lifecycle status or implementation approved/performed.

CHANGE-177 (2026-11-02): approved Action-eligible orders toggle. Reuse Supplier Switch; existing five actionable statuses including held, SQL-filter before pagination, optional backwards-compatible admin-list flag. Status synchronization/page reset; Admin Orders only. No migration/shared config/peer edits. TDD/verification in progress; preserve existing staged work.


## Final verification

Full root ./mvnw verify rerun passes:687 Order +13 common tests, zero failures/errors/skips; OpenAPI, packaging and coverage gates pass (Order branch80.96%, line94.71%). Initial full run failed only the old reflection signature in OrderSecurityConfigurationTest; updated that fixture without weakening its one-based/100-row-cap assertions, then reran the complete suite successfully. No application change was required for that correction. Logs: target/change177-confirmed-verify.log (final), change177-verify.log (superseded initial failure).

All291 frontend tests pass, full lint passes, Order/frontend Docker builds including frontend TypeScript pass. Recreated only local Order/frontend with --no-deps --wait; both healthy. Running OpenAPI exposes optional boolean actionEligibleOnly=false; anonymous filtered list remains401 and Admin Orders page returns200. PostgreSQL mixed-state tests cover eligibility across all statuses, held rows, exact ID/status/date intersection, totals and multiple pages before filtering; MVC covers admin/anonymous/non-admin/malformed flag, with false/default compatibility tests preserved. Switch tests verify page reset, terminal-status synchronization and Clear. No database/volume removal or sibling service restart. TOML and whitespace checks pass.

| Reference | Requirement | Implementation / test | Result |
| --- | --- | --- | --- |
| User-approved CHANGE-177 | Existing action-eligible state set including holds | SQL specification; AdminOrderDateFilterJpaTest | Pass |
| Existing admin authorization | Filter remains admin-only | AdminOrderControllerSecurityTest | Pass |
| Existing paginated API contract | Accurate totals/pages and backwards-compatible false default | Query/controller/SQL tests; generated/live OpenAPI | Pass |
| NFR3.1.1 | Line/branch coverage gate | Full verify,94.71/80.96% | Pass |
| NFR3.1.3 | Positive/negative scenarios | Mixed states, invalid boolean, unauthorized, conflicting filters | Pass |
| Existing frontend style/responsive amendment | Reuse Supplier Switch/Label and scrollable table | Shared components, w-fit label, frontend tests/build | Automated pass; browser visual confirmation pending |

Affected artifacts: requirement amendment/traceability/current sprint/context/contracts and architecture-evolution records, existing source/tests, learning and AI disclosure. No new ADR/technology/diagram/data-model/table, migration, index, env/shared deployment/persistence config, workflow/skill, topic, cloud resource or peer backend change. No Git staging/commit/push. Remaining: user browser confirmation after refresh and coordinated staging rollout of Order/frontend. Reports shortcut remains unimplemented as explicitly scoped.

CHANGE-178 (2026-11-02): user requests inline Orders status/search/toggle row and corresponding Admin Reports Ready for review switch. Reuse existing status API; optional shared layout leaves other admin forms unchanged. Frontend only, preserve prior changes; verification in progress.


Verified CHANGE-178:54 affected existing Orders/Reports/admin page tests pass, including inline form containment, toggle/status synchronization, page reset, retained search and Clear; existing grey resolved-card/history and resolution tests remain green. Initial targeted tests reproduced detached Orders toggle and absent Reports toggle. Full lint and frontend production Docker build/TypeScript pass; TOML and whitespace checks pass. Recreated only frontend with --no-deps --wait; healthy. Built Admin Orders/Reports routes return200. Backend tests not rerun for this UI-only change; API/data/schema/index/env/topic/shared config, backend/business/saga/workflow/skill unchanged. No data/volume deletion, cloud/Git publication or sibling restart. Browser visual confirmation after refresh and staging frontend rollout remain. Logs under order-service/target:change178-red.log, change178-tests.log, change178-lint.log, change178-build.log and change178-local-start.log. Existing test React act warnings remain; no failed final checks.

CHANGE-179 (2026-11-04), Yao Xiang / hfix/suspended-courier-acceptance: user approves new role-context suspension contract and requests implementation. Clean initial checkout; earlier partial patch discarded. Verified peer retains role and returns isCourierSuspended; reuse per-request verified response, guard ACCEPT only, preserve existing work and durable recovery, fix browser403 pending. Order/frontend-only work; no peer/schema/config/cloud changes. TDD in progress; see changes/CHANGE-179-suspended-courier-acceptance.md.


Verified CHANGE-179 (2026-11-04): Final automated verification: root wrapper -pl order-service -am verify passes701 Order +13 common tests, zero failures/errors/skips, packaging/OpenAPI and coverage gates. Order coverage: branch81.28%, line94.63%. All321 frontend tests and lint pass; both Order/frontend Docker images build successfully, including frontend TypeScript. TOML/whitespace checks pass. Backend first RED:3 expected failures (discarded suspension and old eligibility call); frontend first RED:2 expected false-pending failures. Initial focused DB run was blocked by stopped Docker and malformed PATH; started Docker and removed only that entry in test-process PATH. DB rerun found one DTO-reference-equality fixture assertion; corrected to compare complete serialized saved responses, then full scoped verify passed. An initial unscoped reactor run was stopped after discovering User is now a root module; final evidence is the scoped Order/common run. Existing delayed Surefire fork-shutdown diagnostic appears but final verification exits0 and all coverage checks pass. No sibling backend source, shared config, environment, migration, topic, cloud resource or Git publication changed. Built images only; local application stack was not started. User browser/staging confirmation and deployment of the updated User role-context remain operational checks. Logs: target/change179-backend-red.log, change179-ui-red.log, change179-backend-focused.log, change179-recovery.log, change179-scoped-verify.log, change179-ui-focused.log, change179-frontend.log, change179-lint.log and change179-build.log.


2026-11-04 local penalty verification:10 disposable checks passed using actual Order/User images, private PostgreSQL/Mongo replica-set databases, the local Pub/Sub emulator and fresh Auth-emulator identities. Financial Credit/Supplier peers were explicitly mocked in the private Order instance; this verifies penalty integration, not Credit settlement. Tested abort addition, duplicate ID/single effect, successful-delivery deduction, deferred/highest admin policy, no-penalty and highest-selected admin cancellations, cap10/suspension/new-accept403/existing-delivery, overdue completion, held auto-completion/release, and transaction rollback followed by same-ID retry. First probe expected500 for missing User but actual404 was correct; adjusted only the verification expectation and reran all10 successfully. Live audit defect: ProcessedPenaltyEvent constructor receives courierId/eventType swapped. Score effect and deduplication remain correct. Updated FEEDBACK-014 and archived superseded missing-consumer request; did not modify User or other application source. Disposable instances/databases/topics/subscriptions/Auth test accounts cleaned; existing application data and scores untouched. Sources and cloud/config unchanged this turn; earlier CHANGE-179 source patch preserved. Evidence target/penalty-local-check-final.log and penalty-local-result.json. Remaining: User audit metadata fix; existing ordering/theft/legacy-policy coordination; cloud delivery unverified.


2026-11-04 reported local completion failure: exact Order9ce2e006-a150-45f0-b35a-4356b6bc5be7 became COMPLETED during inspection; final addition814db288-c038-3230-af76-02689d0e3ee0 is PUBLISHED10, User processed marker absent/score0. Source/data reveal legacy courier missing status; Java defaults ACTIVE but raw saveActive query excludes missing status. Disposable real User/Mongo transaction reproduction returns403/rolls back, and the same event applies10 once after test-only ACTIVE backfill. This explains why fresh-account verification passed but existing account fails. Running images/config match tested builds; no missing endpoint/topic, no Order transition/event-generation fault. Asked explicit permission for a narrow User compatibility fix/tests/restart under prior sibling-scope boundary. No real User/Order/credit data mutated; staged CHANGE-179 retained. Evidence target/penalty-legacy-repro.log; FEEDBACK-014 updated. Awaiting scope answer.

CHANGE-180 (2026-11-04): Yao Xiang on feat/suspend-unsuspend; user explicitly requests existing User suspension/removal Admin UI, superseding earlier button removal. Verified bodyless admin PUT/User response and one-month10point suspend / score-preserving unsuspend semantics. Frontend-only code/tests with required Order docs; no peer implementation or legacy account backfill. Existing-source User runtime rebuild required for missing local Unsuspend route. TDD in progress; see changes/CHANGE-180-admin-courier-suspension-ui.md.


### CHANGE-180 implementation handoff (2026-11-04)

Admin Suspend/Unsuspend UI implemented in existing frontend admin components/API and test files; promotion/deactivation retained.11 expected RED failures then52 focused/331 full frontend tests pass; lint/typecheck pass. Docker API unavailable; stopped only own two stalled builds, services not restarted. Direct frontend production build hit Windows OutOfMemoryException. Current User container predates Unsuspend; rebuild existing User/frontend images and browser-verify once Docker/resources recover. No backend/data/schema/config/cloud changes or legacy-account fix. Source/docs remain uncommitted for user review; no commit/push requested. See CHANGE-180 for exact paths/contracts and limits. Task code complete; packaging/live verification pending.


CHANGE-181 (2026-11-09): Yao Xiang continued ownership on hfix/suppplier-not-showing-up. User approves diagnosed frontend Supplier pagination/optional image/types alignment. Initial tree clean; sibling backends/data/config remain read-only. Test-first underway; see changes/CHANGE-181-supplier-catalogue-form-alignment.md.


CHANGE-181 final verification (2026-11-09): explicit null create image implemented; initial7 expected RED failures, focused82 pass, explicit-null refinement RED1/12 pass, final343 frontend tests across56 files pass. Full lint and Next route generation/tsc pass. Docker stopped (engine pipe absent); direct production build failed host memory allocation. No image/browser/live account or Supplier writes verified/performed. No backend/source/auth/schema/config/cloud changes. Large-scale searchable selector/backend index/cursor design remains proposed only, pending developer approval. No commit/push; frontend and required documentation changes remain for user review. See changes/CHANGE-181-supplier-catalogue-form-alignment.md for exact scope and logs.


## CHANGE-182 active work (2026-11-09)

Continued Yao Xiang ownership, hfix/suppplier-not-showing-up. User explicitly approves optional Supplier browsing/search and bounded pagination. Known existing CHANGE-181 source/docs patch preserved except its interim Order fetch-all loader/tests intentionally superseded. Added Order-feature Base UI SupplierSelector/test; integrated requests/new;18 focused tests/lint/typecheck pass. Full frontend suite and feasible production build pending. No backend/index/auth/env/schema/config/data/cloud/commit/push change. Source/doc paths remain uncommitted for user review. See CHANGE-182 for scope and evidence.


CHANGE-182 final verification (2026-11-09):18 focused tests and354 full frontend tests across57 files pass; full lint and Next route generation/tsc pass. Initial browse tests reproduced2 failures; whitespace-query edge separately reproduced/fixed. The only final change after the full run was a responsive popup max-height/overflow class using the existing available-height convention; no behavior logic changed. Bounded production build attempt still failed native process out-of-memory despite heap/Rust-thread caps. Docker stopped; image/browser/320px/staging verification pending. Current SupplierSelector is integrated in USER Requester Order creation; no backend/API/schema/dependency/config/index/cloud/data changes. Earlier CHANGE-181 Admin null image/type patches retained, fetch-all Order loader superseded. No commit/push; current source/tests/docs left for user review. See CHANGE-182 for file/contract/sequence and verification evidence.
