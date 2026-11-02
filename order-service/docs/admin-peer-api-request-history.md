# Archived feedback through CHANGE-159

Historical evidence, including superseded requests. For current pending work see [admin-peer-api-request.md](admin-peer-api-request.md). Archived routes and readiness statements are not current contracts.

# Admin Peer API Requests

## Current provider authorization request - CHANGE-154 (2026-10-19)

For admin-related operations, provide provider-enforced admin authorization, not only an Admin UI gate. User search/directory and cross-user profile access (001), promotion (003) and safe deactivation (004) must validate the Firebase caller and authoritative admin role; return401 for invalid authentication and403 for a non-admin. Reuse/harden compatible existing routes without silently breaking ordinary self-service callers; agree a dedicated admin route where necessary. Exact new route names remain proposals until provider agreement. No manual suspension or penalty-replacement endpoint is requested. Credit history already has an admin route; cross-user balance005 remains pending. Never substitute a caller's own balance or ordinary mutation endpoint for missing admin capabilities.

User penalty scoring must use the explicit addition/deduction subscribers, not new legacy accepted-cancellation scoring. These are authenticated broker deliveries, not human-admin HTTP calls. FEEDBACK-014 and the current CHANGE-154 section in peer-service-api-feedback.md specify topics, payload, duplicate handling and legacy backlog reconciliation. This request changes no provider, UI wiring, cloud subscription or runtime behavior.


## Calendar filters are Order-owned — CHANGE-139

Admin list date filtering extends existing Order GET endpoints; no new Credit/User/Supplier API required. Existing peer gaps are unchanged. Real SQL search and isolated demo fixture filtering are linked through the existing environment-selected frontend adapter.


## Order admin actions linked — CHANGE-138

Order-owned cancellation/completion are linked in the Admin Orders list and details. No missing peer API for these actions. Real mode uses POST /api/orders/admin/{orderId}/cancel or /complete with stored participant IDs, optional selected enum cases and saved resolutionReason; selection does not bypass backend admin checks. GET /api/orders/admin/penalty-policies supplies scores from foc-common. Demo mode uses isolated local admin-mock mutations. Existing balance/User-management requests remain pending; this change does not mark them completed. Credit and User event schemas/topics are unchanged (User subscriber FEEDBACK-014 remains pending).


CHANGE-134 (2026-10-16): Order-owned POST /api/orders/admin/{orderId}/cancel
is implemented with admin verification, active/held state checks and optional
highest penalty/refund outbox. See ADR-044 and Swagger for its request. This is
not a missing peer API. Existing balance005 and User management gaps below remain.
Order detail responses now expose nullable isOverdue for authorized Report reads.

Date: 2026-10-15. Owner: Yao Xiang. Scope: CHANGE-111 prototype, CHANGE-119 partial live integration, CHANGE-122 Compose selection and CHANGE-133 selected-user Credit history.
Evidence: current repository controllers, request/response models and services;
source inspection and automated provider/adapter/UI verification (results in
CHANGE-133), not deployed authenticated integration verification.

Base Compose UI with Firebase Auth emulator retains Order-owned sample endpoints
under /api/orders/admin-mock, including sample role lookup. HTTP-peer override and staging/production use
completed real providers; unfinished capabilities show Coming soon. No sibling
backend implementation was changed. Do not interpret sample fields, placeholders
or successful adapter tests as completed peer implementation/live verification.

## Effective partial live rollout - CHANGE-119

| Capability | Base Compose mock demo | HTTP-peer Compose / staging / production |
|---|---|---|
| Admin role check | Existing mock role-context | Real GET /api/users/role-context; returned UID must match caller and roles contain admin |
| Orders list / status / paging / exact ID / detail | Existing sample pages | Real Order list/detail; current provider authorization applies |
| Order related user/supplier labels | Fixture names | Existing User summary / Supplier detail, independently loaded; ID links remain visible on delay/failure |
| Supplier search / detail / create / deactivate | Sample operations | Existing Supplier q/status=all paging, exact detail, POST create and DELETE soft deactivation |
| User directory / name search / pagination | Sample pages | User directory card: Coming soon; no unprotected/unpaged real list call |
| Selected user / exact UID lookup | Complete sample profile | Existing UserSummary only: userId, username, email, roles, penalty, isCourierSuspended, suspensionEndDate |
| Profile ID / phone / address / account active | Sample projections | Null placeholders: Coming soon; unavailable is never represented as inactive |
| Promotion / safe user deactivation | Sample mutations | Disabled; no calls to missing endpoints or existing hard-delete operation |
| Another user's Credit balance | Sample numbers | Available/reserved/total each Coming soon; never substituted with zero or caller balance |
| Another user's Credit history | Sample history page | Real admin-only GET /api/credits/users/{userId}/transactions?page=1&size=20; independent loading/error/retry and server pagination |

Under CHANGE-122, runtime ConfigProvider selects mocks only when the requested
FOC_ADMIN_API_MODE is mock, FOC_ENVIRONMENT is local and an Auth emulator URL is
configured. Missing flag retains local demo compatibility; invalid flags select
live. Base Compose pins mock; HTTP-peer override pins live and disables Order
demo routes. Cloud always selects live even with a stray mock flag. An actual
admin account is required in every live mode, including local HTTP-peer testing.
Backend authentication/role checks are not relaxed. Live local mode uses local
services/data through the gateway; capabilities match staging, records do not.
Live errors remain errors; there is no fallback to mocks. Exact-ID searches adapt
one record into a page and only a provider404 into empty results; 401/403/5xx
remain visible. Supplier q search also matches building/location, as its existing
contract specifies. No client fetch-all/filter directory workaround is used.

ADMIN-API-001/003/004/005 below remain requests to the owning teams;002 was
withdrawn when the user removed manual suspension from the dashboard. Completing their
contracts later allows the central adapter/capability flags to replace the
placeholders; no page-layout redesign is required. Source/adapter/UI tests pass
as recorded in CHANGE-119; deployed authenticated integration is not yet verified.

## Already implemented: reuse these, do not create duplicates

| Service | Existing endpoint | Contract / use |
|---|---|---|
| User | GET /api/users/role-context | Caller bearer token; returns userId and roles. Compare returned UID with signed-in UID and require admin. |
| User | GET /api/users/{userId} | Existing User profile, currently no explicit admin guard in this controller. Reuse the path; privacy/authorization needs hardening before admin integration. |
| User | GET /api/users/summary/{userId} | Existing name/identity summary for resolving requester/courier labels. |
| Order | GET /api/orders?status=COMPLETED&page=1&size=10 | Admin-authorized paginated all-orders query. Omit status for all current statuses. Newest created first. |
| Order | GET /api/orders/{id} | Existing detail lookup; adapter can use exact ID search without another endpoint. Apply selected status to this single result when presenting the search page. Current read authorization remains in force. |
| Supplier | GET /api/suppliers?q=Deck&status=all&page=1&size=10 | Existing paginated name search, admin-only inactive/all views. Name search also matches building/location; adapter must document this broader match. |
| Supplier | GET /api/suppliers/{id} | Existing exact ID lookup including inactive suppliers; adapt the result to a one-item search page. |
| Supplier | POST /api/suppliers/lookup | Existing bulk name resolution: body ids array; returns items and missingIds. |
| Supplier | POST /api/suppliers | Admin-only creation; 201 SupplierResponse. Reuse existing CreateSupplierRequest. |
| Supplier | DELETE /api/suppliers/{id} | Admin-only soft deactivation; 200 SupplierResponse with active false. |
| Supplier | PATCH /api/suppliers/{id} | Existing admin field/active update; not a missing API. |
| Credit | GET /api/credits/users/{userId}/transactions?page=1&size=20 | Completed ADMIN-API-006; selected profile history, administrator's bearer token, no body. User-filtered DB paging; missing account is 404, not an empty success. |
| Credit | GET /api/credits/all/transactions?page=1&size=20 | Completed system-wide history API, with userId per item. No global UI tab requested; not called by this dashboard change. |

Supplier creation already accepts name, type, building, floor,
locationDescription, latitude, longitude, openingTime, closingTime, imageUrl.
SupplierResponse additionally has id, active, openNow, createdAt, updatedAt
and optional distanceMeters. The demo reuses these wire fields and existing form.
No Supplier API work is requested for the current prototype.

## ADMIN-API-001: User search, paging and trusted profile reads

- Responsible service: User Service.
- Status: adjustment required; existing endpoints must be reused.
- Actual: GET /api/users returns List<User> without search or pagination.
  GET /api/users/{userId} returns one User. Neither controller operation verifies
  an admin; the current listing implementation calls repository.findAll().
- Required: server-side name or exact UID search, bounded pagination and
  authoritative admin verification for cross-user profiles/listing.
- Proposed extension: GET /api/users?searchBy=name&q=Alex&page=1&size=10.
  searchBy is name or id, q trimmed; empty q lists all. Page is one-based,
  size 1..100; filter/count before paginating, stable username/userId ordering.
  GET /api/users/{userId} remains the exact profile path.

Expected paged response:

~~~json
{
  "items": [{
    "id": "mongodb-profile-id",
    "userId": "firebase-uid",
    "username": "Alex Tan",
    "email": "alex@u.nus.edu",
    "roles": ["requester", "courier"],
    "penalty": 1,
    "isCourierSuspended": false,
    "suspensionEndDate": null
  }],
  "page": 1,
  "size": 10,
  "totalItems": 1,
  "totalPages": 1
}
~~~

This envelope changes the existing unpaged array contract. Coordinate the
existing callers' migration (or an explicitly versioned/opt-in paged response);
do not silently break them. No new duplicate list/detail API is required.
Errors: 400 invalid query, 401 invalid token, 403 non-admin, 404 unknown UID for
detail; standard repository error envelope. Never trust a body-supplied admin role.

### Profile fields requested by the UI

The current User model stores id, userId, username, email, roles, penalty,
isCourierSuspended and a java.sql.Date suspensionEndDate. It does NOT store
phoneNumber, address or active, and a SQL date cannot represent an exact
suspension ending time. Demo phone/address/active values are sample extensions.

If these fields are available in a later User-owned model, return them from the
existing profile endpoint. Otherwise return null/Not provided until the owner
agrees the model, privacy and migration. Credit balances must come from Credit,
not be invented or independently maintained by User Service.

## ADMIN-API-002: Manual suspension request withdrawn (2026-10-15)

The user removed Suspend User from the Admin dashboard. Only Promote to Admin
and Deactivate User remain as user actions, so no manual-suspension API is
requested for this UI. Existing courier suspension status/end-time fields stay
read-only in profiles. Automatic penalty/suspension rules and the retained mock
endpoint are unchanged; the dashboard no longer calls that endpoint.

## ADMIN-API-003: Promote an existing user to administrator

- Responsible service: User Service.
- Status: not present in this checkout. Reconcile any newer main implementation
  before adding an API; historical FEEDBACK-011 discussed a subsequently reverted
  user-promotion route, and is not evidence of a working route here.
- Current PUT /api/users/{userId} accepts username/email only; it cannot promote.
- Proposed operation: PUT /api/users/{userId}/user-promotion.
- Expected request: no body; this operation adds only the admin role.
- Expected response: 200 existing User profile with admin added to roles,
  retaining all existing roles. Repeating the request must not duplicate roles.
- Caller: authenticated existing administrator, verified by User Service;
  401 invalid token, 403 not admin, 404 unknown user, 409 inactive user.

The returned role must become visible through existing role-context; frontend
must never supply a trusted role directly. Coordinate last-admin and recovery
policies with the owner. No real promotion happens in the prototype.

## ADMIN-API-004: Safe user deactivation

- Responsible service: User Service.
- Status: existing DELETE /api/users/{id} performs a hard Mongo deletion and
  returns the string User removed, without an explicit controller admin check.
  That is unsuitable for the requested safe deactivate operation.
- Proposed adjustment: reuse DELETE /api/users/{userId} as an admin-authorized
  soft deactivation (or agree a separate activation resource if existing hard
  deletion must remain compatible). This is a proposal, not a completed change.
- Expected request: no body; confirmation occurs in UI.
- Expected response: 200 updated profile with active=false, preserved identity,
  roles and history. Repeat deactivation should be safe.
- Errors: 401 invalid token, 403 non-admin, 404 unknown user, 409 when deactivation
  would strand active orders/unresolved commands unless a safe recovery policy
  has been agreed.

User owns login/token revocation and eligibility decisions. Agree how inactive
users can resolve existing Order/Credit obligations; do not delete/revoke first
and assume remote effects roll back. The mock flips only its sample active flag.

## ADMIN-API-005: Administrator reads another user's credit balance

- Responsible service: Credit Service.
- Status: missing. Existing GET /api/credits/me is caller-only and must remain so.
- Proposed operation: GET /api/credits/users/{userId}/balance.
- Request: userId path variable, caller's bearer token; no body.
- Purpose: profile displays authoritative Credit-owned balance without
  impersonating another Firebase user.

Expected response, reusing existing BalanceResponse:

~~~json
{
  "userId": "firebase-uid",
  "usableBalance": 100,
  "reservedBalance": 5,
  "totalBalance": 105,
  "asOf": "2026-10-11T12:00:00Z"
}
~~~

Verify an authoritative admin role; 401 invalid token, 403 non-admin,
404 no credit account, 503 role provider unavailable. A unavailable credit
projection should not hide the user profile; show Credits unavailable and retry.
No balance mutation is requested.

### Credit team implementation request (confirmed source review, 2026-10-15)

The remaining Credit API gap for the current Admin profile is **selected-user
balance only**. Both selected-user and system-wide transaction history endpoints
are already implemented; do not recreate them. The selected-user history card
is already linked under CHANGE-133.

Please add the admin-protected read to the existing Credit administrative API:

~~~http
GET /api/credits/users/{userId}/balance
Authorization: Bearer <signed-in-administrator-firebase-id-token>
Accept: application/json
~~~

- `userId` is the selected user's Firebase UID in the path. No JSON body or
  balance query parameter is needed.
- Validate the caller's Firebase token and require the authoritative `ADMIN`
  role, consistent with `AdminCreditController`'s transaction-history endpoints.
  The selected user's token is not supplied.
- Reuse `BalanceResponse` and Credit's existing account lookup. Return the
  selected account's `userId`, `totalBalance`, `reservedBalance`, `usableBalance`
  and `asOf`, as shown above. Existing `asOf` means the account's last-update
  instant (`updatedAt`), not an invented current query timestamp.
- Use existing error envelopes:400 invalid selected UID,401 missing/invalid
  token,403 non-admin,404 account not provisioned,503 role lookup unavailable.
  This read must not initialize an account or change balances.
- Keep `GET /api/credits/me` caller-only. Calling it with the administrator's
  token returns the administrator's balance and cannot populate another profile.
- Provider tests should verify admin access to another account, correct selected
  UID/balances, rejection of non-admin/unauthenticated calls, invalid UID and
  missing account. Preserve existing caller-only `/me` behavior.

Until this endpoint is implemented and verified, live Admin balance fields remain
**Coming soon**. Base Compose keeps its clearly sample balances. Do not derive
balances from transaction pages, substitute the administrator's balance or turn
an unavailable balance into zero. Linking this new read is future work; this
documentation update does not implement it or modify Credit Service.

## Completed selected-user Credit history — CHANGE-133

ADMIN-API-006 is removed from the open requests: Credit now implements the
required operation, and the existing Admin profile card calls it in live mode.

- GET /api/credits/users/{userId}/transactions?page=1&size=20, no body.
- The signed-in administrator's Firebase bearer token authorizes the request;
  selected userId is only the record selector. Credit enforces ADMIN itself.
- Response: {items,page,size,totalItems,totalPages}; items contain transactionId,
  type, amount, direction, occurredAt and nullable orderId. There is no per-item
  userId in this selected-user response. Existing shared history presentation fits.
- One-based page, size1..100; SQL filters selected user and visibility before
  counting/paging, newest occurredAt/createdAt/transactionId first.
- Types: INITIAL_ALLOCATION, RESERVATION, PAID, RECEIVED, REFUNDED_CANCELLATION,
  REFUNDED_EXPIRY, REFUNDED. Positive amount; CREDIT or DEBIT direction; UTC instant.
- Errors:400 invalid request,401 invalid token,403 non-admin,404 unprovisioned
  account,503 role provider unavailable. Show error/retry without hiding profile
  or presenting an empty success. Real errors never fall back to sample history.
- Provider contract: [Credit handoff](../../credit-service/docs/admin-transaction-api-handoff.md).
  Source and automated checks do not imply deployed authenticated verification.
- Base Compose keeps sample history. Selected balances still require005.
  GET /api/credits/all/transactions also exists; user explicitly chose no global tab.

## Prototype contracts and replacement checklist

### CHANGE-114 mapping boundary: no new service endpoint required

Existing Supplier create/detail fields `latitude`, `longitude` and
`locationDescription` cover map placement. The create JSON contract is unchanged;
the frontend sends numeric coordinates, not a Google/Photon result or token.
An address selection shows its full label in the form and can prefill an empty
locationDescription within its current200-character limit. Existing manually
entered description is preserved. The address label is a reference, not a
reverse-geocoded guarantee after dragging; coordinates are the exact placement.
No structured/persisted `address` field or additional backend API is requested.

Administrative operations use the gateway and the environment-selected adapter.
Public map rendering/search are separate, isolated in frontend/src/lib/map-provider.ts:

- Tiles: HTTPS OpenStreetMap tiles via Leaflet1.9.4, with visible attribution,
  normal browser cache/referrer behavior and no background/bulk downloads.
- Suggestions: GET https://photon.komoot.io/api/?q={address}&limit=5&lang=en&lat=1.2966&lon=103.7764.
  Requests are debounced650ms, require3 characters, timeout8s, and omit cookies/
  Authorization/Firebase UID. NUS coordinates bias the search; they do not
  prohibit results outside Singapore. Query changes abort and ignore old replies.
- Photon returns GeoJSON features with geometry.type=Point and coordinates
  ordered [longitude, latitude], plus properties such as name/street/housenumber/
  district/city/postcode/country. The adapter validates types/ranges, deduplicates
  and bounds suggestions; it never silently fabricates locations on failure.
- Selected pins/manual coordinate fields stay synchronized. Public-search errors
  retain map/manual entry; tile errors retain coordinates and Google Maps links.
- CHANGE-115 removes the list overview map. Detail map loads the selected supplier
  by ID; creation picker remains. No provider/backend contract change.

Replace the public provider adapter when production traffic needs a contracted
or self-hosted geocoder/tile service. Public Photon allows reasonable use but
offers no availability guarantee. Primary documentation:
[Photon](https://github.com/komoot/photon),
[OSM tile policy](https://operations.osmfoundation.org/policies/tiles/),
[Leaflet stable release](https://leafletjs.com/download.html).

Supplier deactivation exists only in detailed view, using confirmed sample
operations locally or real Supplier DELETE outside local; no contract change.
Order detail user/supplier names navigate
to Admin routes; separate ID copy controls use existing IDs. Grouped Order cards
preserve all returned fields, including a separate repost card and unknown fields.

CHANGE-113's dedicated Order/Supplier pages require no additional endpoint:
Order details reuse GET /orders?orderId={id}&page=1&size=1 in this sample surface;
Supplier details reuse GET /suppliers/{id}. Existing real Order/Supplier detail
reads remain listed above. Actions only moved in the UI; their contracts stay.

All prototype routes live inside Order Service, behind an explicit local-only
condition: ORDER_ADMIN_MOCK_ENABLED=true, FOC_ENVIRONMENT=local and configured
Firebase Auth emulator. Local Compose uses prod authentication; this condition
does not disable JWT verification or replace real production role guards.
Cloud configs omit the flag and emulator, so sample controllers are not registered.

| Mock path (prefix /api/orders/admin-mock) | Method | Sample contract |
|---|---|---|
| /role-context?userId={uid} | GET | Existing User role-context shape, roles=["admin"]; compare UID in browser. |
| /orders?status=OPEN&orderId={id}&page=1&size=10 | GET | Existing OrderResponse fields plus resolved names, paged. |
| /users?searchBy=name&q=Alex&page=1&size=10 | GET | Paged sample User fields plus clearly sample-only profile/credit projections. |
| /users/{id} | GET | One sample profile. |
| /users/{id}/transactions?page=1&size=20 | GET | Selected sample user's TransactionPageResponse wire format, newest first. |
| /users/{id}/suspend | POST | Future suspensionEndDate JSON -> sample profile. |
| /users/{id}/promote | POST | No body -> sample profile with admin. |
| /users/{id}/deactivate | POST | No body -> sample active=false profile. |
| /suppliers?searchBy=name&q=Deck&page=1&size=10 | GET | Paged SupplierResponse fields. |
| /suppliers | POST | Existing SupplierInput JSON -> 201 sample SupplierResponse. |
| /suppliers/{id} | GET | One sample SupplierResponse, including inactive records. |
| /suppliers/{id}/deactivate | POST | No body -> sample inactive SupplierResponse. |

Mock pagination is in-memory because this is a small isolated fixture, not the
real Order database or scheduler. All real lifecycle DB queries remain unchanged.
The immutable copy mapper prevents HTTP readers from altering stored fixtures.

CHANGE-119 implements environment-selected transport/normalizers in
frontend/src/lib/admin-api.ts for the matching operations above. Replace remaining
unsupported operations/capability flags when their provider contracts are ready,
not the page controls. Use real role-context, validate UID/admin membership, then
real provider calls with their actual HTTP methods and bodies. The frontend role
check only controls UI: every actual backend operation must enforce admin too.
Do not fall back to sample data when a real dependency fails. Verify actual
contracts, errors, authorization, mutation semantics and integration tests before
calling real Admin UI complete. No sibling backend implementation was changed.


## Delivered report review — pending Report Service (FEEDBACK-015)

See peer-service-api-feedback.md FEEDBACK-015 for full proposed Report APIs and evidence schema. Local sample lists/cases/response/resolution are implemented, but live Reports remain Coming soon. Admin financial actions and overdue waiver use real Order APIs separately. Report Service must call the report-specific admin hold release after durably recording resolution, with forwarded resolving-admin Firebase authorization and durable retry/continuation. Do not clear a shared boolean without verifying remaining active report holds.


CHANGE-144: User replacement requires the synchronous admin-authorized PUT contract and exact confirmation in FEEDBACK-016; no new adjustment topic. Existing fixed score PUTs are unsuitable. Live Admin adjustment is disabled pending provider verification. Report APIs remain missing; FEEDBACK-015 amendment removes response deadline, adds Open/Closed grouping and required reply on resolution.


CHANGE-146 supersedes CHANGE-144: no User penalty replacement endpoint is requested now. Apply penalty is supplied by Order Service and only stores highest policy; final addition/deduction events use the existing contract. Admin completion is removed. Report resolution still needs report-specific hold release; Report Service remains missing. Existing Credit/profile API requests are unchanged.


## Effective CHANGE-147 — Report reply privacy and active policy choices (2026-10-19)

Approved Yao Xiang: admin resolution reply is visible only to the submitter and reviewing admins; courier participants still see resolved status/time and other existing case information. Local prototype list/detail responses redact resolutionNote on copied snapshots, and UI hides the reply in courier views. Production Report Service is still missing and must enforce this with verified caller identity, never client-supplied roles. Live Reports remain Coming soon.

COURIER_UNRESPONSIVE is retired from active policy lists and new admin apply/cancel choices. Its enum/amount remain only for historical persisted rows and existing outbox events; immutable migrations and saved penalties are not rewritten or waived. Six active policies; three selectable report penalties (wrong location4, damage4, theft10). Cancellation UI selects one radio case and sends the existing one-element list; stored maximum semantics and existing penalty topics remain unchanged.

Report cards omit Order descriptions; closed cards are muted but remain navigable. Requester/courier names link to admin profiles, IDs have separate copy rows. Admin table names, email, roles and IDs truncate visually while full values remain in titles/copy/details. No sibling backend or shared runtime/CI/cloud configuration changes. See CHANGE-147.


CHANGE-149 (2026-10-19), Yao Xiang: Reports reuse existing Order-style Status/Order ID/Search/Clear form, remove manual refresh icon, retain visible five-second polling and Open/Closed groups. Status means report status (Awaiting courier response, Ready for review, Resolved). Exact trimmed Order ID plus report status filter on local mock before pagination/counts; independent page counters reset on filter changes. Preserve participant scoping/reply privacy. Extend existing gated sample GET with optional orderId/reportStatus; no real Report endpoint, sibling backend, scoring, database or deployment changes. Live Reports remain Coming soon. TDD and verification pending.


## Report list filters — CHANGE-149

The local Report list GET accepts optional orderId (exact related Order ID, trimmed, max128) and reportStatus (AWAITING_COURIER_RESPONSE, READY_FOR_REVIEW, RESOLVED). Existing status=OPEN or RESOLVED remains the grouping selector; reportStatus intersects it. Empty filters mean all within the group. Scope/filters apply before pagination and totals; filters reset both page counters. The future Report Service must support equivalent filtering on its existing list contract and derive participants/admin from verified identity; this prototype's sample identity flags are never production authority. UI uses the same shared AdminFilterForm/Actions, Select and Input as Order search; normal user and Admin Reports retain their respective scopes. No refresh icon; existing visible five-second polling and error retry remain. HTTP-peer/staging/production Reports still show Coming soon, with no mock fallback.


CHANGE-150 (2026-10-19), Yao Xiang: remove separate Open/Closed report sections. One server-paginated card list under the existing Order ID/report-status filters; one five-second polling query with blank grouping selector (all statuses). Preserve grey styling and View report for RESOLVED cards. Filters and participant-tab changes reset the single page. Existing backend supports this query; no backend, endpoint, data or scoring change. TDD regressions cover mixed active/resolved results, one query, filtering/page reset and retained navigation. Verification pending.


CHANGE-152 (2026-10-19), Yao Xiang: remove all normal-mode Reports UI: /reports, /reports/new, /reports/[id], normal sidebar entry, submit/response/evidence-upload forms, participant tabs/branches and unused frontend submission helpers/types. Retain only AdminReportsPage under existing RequireAuth/AdminGate layout, Admin list/search/status/pagination/polling, grey resolved cards, linked Order/user details, evidence/response viewing and resolve-with-reply. Local admin sample/live Coming soon unchanged. Backend sample fixtures/endpoints, report/hold/domain rules and future Report Service requirements remain; this is UI-scope removal only. No sibling/backend/config/data changes. User explicitly authorized removal; deleted source backed up under ignored target for recovery. Verification pending.


## Effective CHANGE-153 — Hold eligibility and paused funding (2026-10-19)

Yao Xiang approved placing a requester-owned completion hold on any Order status except COMPLETED. This supersedes delivered-only placement and the old blanket terminal-state rejection for new holds. Preserve status, ownership/role checks, bound report IDs, locked transaction and release history. A hold placed after cancellation/expiry records a hold only; it does not restore lifecycle state or reverse settled funding.

The user explicitly clarified that ordinary cancellation, expiry and courier abort (and their refunds/penalties) must remain paused, in addition to requester/automatic completion. START, PICKUP and DELIVER continue normally; acceptance keeps its existing behavior. Admin cancellation remains the previously approved explicit override. Auto-completion and expiry retain held-row SQL exclusion. Report mock submission fixtures remain delivered-item samples; this change broadens the real Order hold endpoint, not a production Report Service implementation.

No schema, event/topic, frontend, shared configuration or sibling backend change. This is eligibility validation only. See CHANGE-153 and ADR-052.


## Effective HANDOFF alignment - CHANGE-159 / ADR-056 (2026-10-28)

See [reporting-order-integration.md](reporting-order-integration.md) for the current active-requester list/atomic report hold contracts, approved current-snapshot retry clarification (no new migration), explicit admin No penalty override, ready User/Credit admin links and deferred synchronous resolution design. New public hold placement is PUT /api/orders/mine/active/{orderId}/report-holds/{reportId} with requireAssignedCourier; caller identity comes from the token. SQL list is GET /api/orders/mine/active. Holds still pause ordinary funding/penalty outcomes and allow START/PICKUP/DELIVER. Existing admin cancellation overrides held funding.

Admin null/empty cancellation selections now suppress scoring even when provisional appliedPenalty was stored; selected additions compete with the stored maximum. Prior claims that No penalty cannot waive stored scoring are superseded for ADMIN CANCELLATION only. The provisional audit remains; requester/auto completion and Apply Penalty policy are unchanged.

Credit selected-user balance and User admin profile/promotion/deactivation are source-ready and linked with independent balance error handling. User paginated directory remains missing. Reporting source and non-callback resolve/result/conditional-restore contracts are missing; coordinator/live report resolution is explicitly deferred, not mocked as completed. No sibling backend, shared config, topic, migration or GCP edit.

## CHANGE-161 closure of Admin User directory request

GET /api/users/admin/search implemented and linked, replacing ID-only adaptation/blank results with a bounded initial real directory and name/ID search. Explicit narrow User-service authorization; legacy routes unchanged. User36 tests pass. Supplier deactivation guard is an existing-operation integration follow-up in peer-service-api-feedback.md, not a missing new Admin HTTP endpoint.


## Completed Report API request - CHANGE-166 (2026-10-29)

# Pending Admin API requests

Updated2026-10-29, CHANGE-163. **Only Report integration remains a missing Admin HTTP API contract.** Completed User directory/search work is documented in [User Service handoff](../../user-service/user-servicehandoff.md); older requests remain in [history](admin-peer-api-request-history.md).

| Report operation | Required contract |
|---|---|
| Synchronous resolve without Order callback | Proposed PUT /api/reports/internal/order-resolutions/{commandId}; verified admin token; command/report/order/requester/courier/admin IDs, generation1, reply. Durable bound APPLIED or definite NO_EFFECT response; exact replay; Report journals revision/preimage internally. |
| Compensation consumer | ReportResolutionCompensationRequested generation2; atomically deduplicate, fence delayed resolve and restore only this operation's unchanged revision. |
| Durable result producer | ReportResolutionCompensationResult through Report outbox; bound COMPENSATED/RECONCILIATION_REQUIRED result; duplicate requests republish saved result; dedicated authenticated push to Order. |

The user approved this guarded Order contract stub; Report-owner implementation and real integration remain pending. This broker-compensation protocol supersedes the earlier proposed HTTP restore/result-query requirement. Do not call the handoff's callback-based status route from Order. Exact payloads/status/security/recovery: [Report handoff](report-servicehandoff.md). No live coordinator is enabled; Reports uses local sample data and cloud Coming soon.

Approved Report requirements (CHANGE-163): keep/expose the server-owned responseDeadlineAt; timely courier response or deadline expiry makes READY_FOR_REVIEW. Allow admin resolution while still awaiting after a UI warning/confirmation. Persist required reply as resolutionNote with resolvedBy/resolvedAt; reply visible only to submitter/admin. Resolution and its deduplication/preimage/revision journal must commit atomically; implement fenced conditional compensation/result outbox as above. Violation category remains undecided. Report/UI implementation is pending; no deadline duration is changed here.

Existing User profile/promotion/deactivation, new initial directory/name/ID search, Credit balance/history and Order/Supplier Admin operations use real APIs in both local Compose variants and cloud. Generic Admin mock endpoints remain removed. User penalty consumers and the Supplier deactivation/admission guard are separate outstanding integrations, retained in [peer feedback](peer-service-api-feedback.md), not completed by the directory endpoint.
