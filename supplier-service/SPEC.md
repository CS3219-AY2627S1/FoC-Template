<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-6), date: 2026-09-25
Scope: Interpreted the supplied project, D1, and D2 reference documents and formatted decisions explicitly supplied by the Supplier workstream author, including the team's archive and single-description approvals and the User Service contract implemented in PR #14. This edit does not add new architecture or design decisions.
Author review: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-25. Scope: recorded
the Supplier workstream author's approved list defaults, verification deployment
timeout, server-owned request IDs, and bundled-asset path for issue #17.
Author review of this issue #17 edit: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-25. Scope: recorded
the author's approved 300-character trimmed search bound and request-completion
logging decision, then implemented the related issue #17 review remediation.
The decisions and implementation were reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-26. Scope: recorded
the project author's approved third-increment mutation, duplicate, timestamp,
archive no-op, and canonical strong ETag defaults for issue #20.
Author review of these contract decisions: Approved by @ron on 2026-09-26.
Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-26. Scope: updated
implementation-status wording after the administrator mutation API and live
PostgreSQL verification were completed for issues #22 and #23.
Author review of the third increment: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-26. Scope: clarified
that database serialization protects equivalent POST requests across both
statuses without extending duplicate rejection to PUT.
Author review: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-27. Scope: recorded
the Supplier workstream author's approved backend-owned Building Code metadata
endpoint for issue #33. Contract decision approved by @ron; implementation
review completed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-27. Scope: updated
frontend decisions, implementation status, and verification evidence after issue #31.
Author review: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-27. Scope: removed
stale integration-decision text after implemented session storage, client-side
logout, and same-origin routing were verified for issue #34.
Author review: Reviewed and approved by @ron.
-->

# FoC Supplier Service — D2 Specification

## 1. Scope

Supplier Service owns the catalogue of physical errand origins. A store, facility, landmark, or pickup location qualifies when a requester can select it as the origin of an errand. Its private database and independently callable HTTP APIs support authenticated member browsing and administrator management. A responsive frontend uses those APIs.

### 1.1 D2 outcome

The team is targeting a near-complete Supplier Service and a near-complete User Service for D2. The Supplier demonstration includes: a justified database and schema; working list, name/location search, building/category filters, sorting, pagination, and detail; database-backed create and update APIs; the approved deletion behavior; APIs callable with the UI stopped; authenticated requests using real User Service identity and role checks; and a responsive live frontend for members and administrators. Seed the catalogue from the repository CSV and add useful errand origins for a rich listing.

### 1.2 Out of scope

Supplier Service does not own user credentials or roles, orders, credits, payment, menus, inventory, or checkout, and never accesses another service's database. Geospatial nearest-neighbour search, image upload, and recurring opening schedules are deferred. Order Service integration is outside D2.

## 2. Decisions at a glance

| Area | D2 choice | Status |
| --- | --- | --- |
| Backend | NestJS + TypeScript with default Express adapter | Selected |
| Database | PostgreSQL, private to Supplier Service, instantiated in a Docker Instance | Selected |
| Database access | Drizzle ORM and versioned migrations | Selected |
| Frontend | Shared responsive React + TypeScript app using Vite | Implemented for Supplier D2 scope |
| Browser routing | Same-origin nginx in Compose and matching Vite development proxies | Implemented |
| Browser session | Bearer token isolated in per-tab `sessionStorage`; logout clears it client-side | Implemented by the shared frontend |
| User credential | Short-lived HS256 JWT access token returned by login and sent as `Authorization: Bearer` | Implemented by User Service in PR #14 |
| User validation | `GET /auth/verify` with the caller's bearer header, including a live account lookup | Implemented by User Service in PR #14; no separate service credential |
| Verification deployment | Configurable User Service base URL; Compose uses `http://user-service:3001`; 1,000 ms timeout | Approved by Supplier workstream author |
| Roles | MEMBER browses; ADMINISTRATOR browses and manages | Selected |
| List defaults | `status=ACTIVE`, `page=0`, `size=12` (minimum 1, maximum 100), `sort=name,asc` | Approved by Supplier workstream author |
| List search bound | Trimmed `q` is at most 300 characters, matching the longest searched field (`location_description varchar(300)`) | Approved by Supplier workstream author on 2026-09-25 |
| Request correlation | Server generates each request ID and does not trust a client-supplied ID | Approved by Supplier workstream author |
| Request completion logging | Nest middleware plus the built-in JSON `ConsoleLogger`; no tracing/APM SDK or external exporter in this increment | Approved by Supplier workstream author on 2026-09-25 |
| Bundled images | Supplier serves repository `data/images` at `/assets/suppliers` | Approved by Supplier workstream author |
| Building options | Authenticated `GET /api/v1/suppliers/metadata` returns backend-owned `{ code, label }` options | Approved by Supplier workstream author on 2026-09-27 |
| Description | Use `locationDescription` as the only displayed Supplier description | Approved by team; replaces the separate D1 general-description field |
| Removal | Archive, retain record, allow administrator restoration | Approved by team; replaces the D1 deletion restriction |
| Edit conflicts | DB integer version exposed as ETag; `If-Match` and 412/428 | Selected |
| Mutation defaults | Strict editable-field bodies; canonical single strong `"vN"` ETags; archived Suppliers remain editable | Approved by Supplier workstream author on 2026-09-26 |
| Order integration | Deferred | Outside D2 |

## 3. Ownership and boundaries

Supplier Service owns supplier metadata and ACTIVE/ARCHIVED state under the approved archive model. User Service owns identity, role, account status, and access-token issuance and validation. The browser UI is a client: hiding an administrator control cannot substitute for backend access control. Supplier Service does not need public-profile lookup or User status events in D2.

A Supplier ID identifies one physical errand origin. Moving an outlet to another building creates a new Supplier record and archives the old record. Correcting directions within the same physical location retains the ID.

User Service supports configured frontend origins through CORS. After login, the browser stores the access token in per-tab `sessionStorage` and sends it in the `Authorization` header on protected Supplier requests. Logout clears that local token because User Service has no revocation endpoint. Development and Compose use matching same-origin Vite/nginx gateway rules; final deployed TLS routing remains an infrastructure decision. These browser choices do not alter Supplier's bearer-token backend contract.

## 4. Data model and seed data

### 4.1 Schema

**`suppliers`**

| Column | Type / rule | Purpose |
| --- | --- | --- |
| `id` | UUID primary key, generated once | Stable reference; never reused |
| `name` | varchar(120), nonblank | Display/search |
| `building_code` | varchar(120), nonblank; controlled canonical code | Location filter/display |
| `floor` | varchar(20), nullable | Floor or named level |
| `location_description` | varchar(300), nonblank | Only displayed Supplier description; includes directions within the location |
| `latitude`, `longitude` | decimals, nullable together; valid ranges | Optional map coordinates |
| `hours_kind` | `UNKNOWN`, `ALL_DAY`, or `INTERVAL`, not null | Explicit hours interpretation |
| `opens_at`, `closes_at` | times, nullable together | Required only for `INTERVAL`; closing before opening means next day |
| `image_path` | varchar(500), nullable | Optional seed-managed display asset |
| `status` | ACTIVE or ARCHIVED, not null | Archive state and catalogue visibility |
| `version` | nonnegative integer/bigint, not null | Optimistic concurrency |
| `created_at`, `updated_at` | timestamptz, not null | Audit/sorting |
| `archived_at` | timestamptz, nullable | Current archive time; cleared on restoration |

**`supplier_categories`** has `supplier_id` (UUID FK to `suppliers.id`) and controlled `category` (`FOOD`, `COFFEE`, `PRINTING`, `SHOPPING`, or `PICKUP_POINT`), with composite primary key (`supplier_id`, `category`). A category describes what the errand origin offers. Application validation requires at least one category and stores category changes in the same transaction as supplier edits. A Supplier can have multiple categories; map the seed's `Food/Coffee` value to `FOOD` and `COFFEE`. A foyer used only for pickup is `PICKUP_POINT`, irrespective of whether it is also a landmark.

**Controlled buildings**

| Stored code | Display label | Accepted seed aliases |
| --- | --- | --- |
| `COM2` | COM2 | `Com 2`, `Com2` |
| `COM3` | COM3 | `COM3` |
| `CENTRAL_LIBRARY` | Central Library | `Central Library` |
| `ENG_E3` | Engineering Block E3 | `Engineering Block E3` |
| `ENG_E4` | Engineering Block E4 | `Engineering Block E4` |
| `ENG_EA` | Engineering Block EA | `Engineering Block EA` |
| `FRONTIER` | Frontier | `Frontier` |
| `TERRACE` | Terrace | `Terrace` |
| `THE_RIDGE` | The Ridge | `The Ridge` |
| `YIH` | Yusof Ishak House | `Yusof Ishak House` |
| `PGP` | Prince George's Park | `Prince George's Park`, `Prince George’s Park` |
| `HSSML` | Hon Sui Sen Memorial Library | `Hon Sui Sen Memorial Library` |
| `MED_SCI_LIBRARY` | Medicine + Science Library | `Medicine+Science Library` |
| `AS8` | Block AS8 | `Blk AS8` |
| `INNOVATION_4_0` | innovation4.0 | `innovation4.0` |

Reject an unknown building code with 400 for D2. Add a new building to this controlled mapping deliberately rather than accepting free text.

Requests identify a building using `buildingCode` only. Responses return both `buildingCode` and the corresponding `buildingLabel`; clients do not maintain their own code-to-label mapping.

For long-term client consistency, the Supplier workstream author approved an authenticated metadata endpoint as the runtime source of every selectable Building Code and label. `GET /api/v1/suppliers/metadata` returns `{ "buildingCodes": [{ "code": "COM2", "label": "COM2" }, ...] }`, sourced from the same backend registry used for request validation and response labels. Both MEMBER and ADMINISTRATOR may call it. It exposes no seed aliases or mutable configuration.

Index the primary key, status/building code, and category membership. Sort names with ID as a stable tiebreaker. Use ordinary case-insensitive substring search over the small catalogue; measure before adding specialist indexes. Do not create cross-service foreign keys.

Keep archived records for future restoration with the same ID. Physical purging and any long-term retention policy are beyond D2.

The API requires `hoursKind: UNKNOWN | ALL_DAY | INTERVAL` on create and full update. `UNKNOWN` and `ALL_DAY` require `opensAt` and `closesAt` to be absent. `INTERVAL` requires both times in `HH:mm`. Equal opening and closing times are invalid; a closing time before its opening time means the interval ends the next day. Reject contradictory fields rather than ignoring them. Interpret all clock values in `Asia/Singapore`.

Reject creation with 409 when an existing ACTIVE or ARCHIVED Supplier is an exact match on name, Building Code, floor, and Location Description after duplicate-key normalization. Normalize the three text fields by trimming, Unicode NFC normalization, and case-insensitive comparison; internal whitespace remains meaningful. Use the canonical Building Code without further normalization, and treat a blank floor as null. Serialize same-normalized-key creation checks in PostgreSQL so concurrent equivalent POST requests cannot both insert, checking existing rows across both statuses. This duplicate rule applies to creation only; full PUT remains governed by its ETag precondition and does not perform duplicate rejection. Return `code: SUPPLIER_ALREADY_EXISTS` and `existingSupplierId` so the administrator can open the existing record. The same name remains valid at a genuinely different location.

### 4.2 Seed import

The repository contains `data/csv/supplier-seed-data.csv` with 21 rows and six image files. Create a repeatable seed process using stable seed IDs or guarded upsert; restarts must not duplicate suppliers. APIs must query PostgreSQL, not hard-coded arrays.

- Map the CSV's **Location Description** to `location_description` and display it as the Supplier's only description.
- Normalize building aliases to the controlled codes above during import, including straight and curly apostrophes in `Prince George's Park`; map `Food/Coffee` to `FOOD` and `COFFEE`.
- Parse `0900hrs` as an `INTERVAL` starting at `09:00`. `11:00`–`02:00` crosses midnight. Keep `0000hrs`–`2359hrs` as `INTERVAL` from `00:00` to `23:59` until the source is verified as meaning 24-hour operation. Label these *typical hours*; weekdays are not specified.
- Serve repository `data/images` through Supplier at `/assets/suppliers`, rather than using GitHub `blob` pages; the frontend shows a fallback when an asset is missing.
- Review suspect coordinates and add useful facilities/landmarks. Attribute externally sourced text/images.

### 4.3 Approved D1 description change

The team approved using the required `locationDescription` as the Supplier's only displayed description, with no separate general-description field. This replaces the separate general `description` required by the earlier D1 SS-F1.1.2 and SS-F2.1.1 text. The D1 requirements and their acceptance criteria must record this approved revision before the team claims the documents are aligned.

Supplier schema and APIs therefore use `locationDescription` only and do not add a `description` field.

## 5. Supplier lifecycle — approved D1 change

The team approved archive in place of the deletion restriction in the earlier D1 SS-F2.2.3 text. The D1 requirement and its acceptance criteria must record this approved revision before the team claims the documents are aligned.

An administrator can archive a supplier after a confirmation modal. Archive hides it from ordinary member list/detail results while retaining its record and ID. Administrator management can inspect archived records and restore them to ACTIVE; the UI shows an actionable success/error result.

`DELETE /api/v1/suppliers/{id}` archives an ACTIVE row, sets `archived_at`, advances `updated_at`, and increments `version`. Repeating archive on an ARCHIVED row returns 204 without changing its archive time, update time, or version. `POST /api/v1/suppliers/{id}/restore` returns an ARCHIVED row to ACTIVE, clears `archived_at`, advances `updated_at`, and increments `version`. Repeating restore on an ACTIVE row with the current `If-Match` returns its current representation without changing its update time or version; a stale `If-Match` still returns 412. All these actions require ADMINISTRATOR.

This revises D1 SS-F2.2.3, which blocks deletion while an active errand exists. The approved product rule is that archiving prevents new errand selection while existing errands keep the pickup details they need. Order Service behaviour is **not implemented or tested in D2**. Demonstrate catalogue visibility, retention, and restoration without claiming Order Service integration.

## 6. Authentication and authorisation

### 6.1 Permissions

| Caller | ACTIVE list/detail | Create/edit/archive/restore | ARCHIVED list/detail |
| --- | --- | --- | --- |
| Missing/invalid access token | 401 | 401 | 401 |
| Active MEMBER | Allowed | 403 | 403 for explicit archive query; archived detail concealed as 404 |
| Active ADMINISTRATOR | Allowed | Allowed | Allowed |
| Expired token or inactive/suspended/closed account | 401 | 401 | 401 |

**401** means no valid bearer token or no active account. **403** means a verified active user lacks permission. Never trust a client-supplied role header or body value. Apply backend role checks before every mutation.

### 6.2 Implemented User Service contract

PR #14 establishes the User Service contract that Supplier builds against:

1. `POST /auth/login` accepts JSON `identifier` and `password`. On success, User Service returns HTTP 200 `{ "accessToken": "<jwt>", "tokenType": "Bearer", "expiresIn": 1800 }`, where `expiresIn` follows `JWT_ACCESS_TOKEN_TTL` and defaults to 1,800 seconds.
2. The access token is an HS256 JWT whose payload contains the account ID in `sub` plus `iat` and `exp`. It deliberately does not contain the role. The client sends it as `Authorization: Bearer <jwt>` on protected Supplier requests; never accept it from a URL or request body and never log it.
3. For every protected request, Supplier's `SessionVerifier` implementation calls `GET /auth/verify` on User Service and forwards the caller's `Authorization` header unchanged. PR #14 does not require or implement a separate Supplier service credential on this endpoint.
4. User Service verifies the token signature and expiry, then performs a live database lookup. It returns HTTP 200 `{ "id": "<user-uuid>", "role": "MEMBER" }` (or `ADMINISTRATOR`) only when the account exists and has status `ACTIVE`. Missing, malformed, invalid, or expired tokens and missing or non-active accounts return HTTP 401 `{ "error": "UNAUTHENTICATED", "message": "..." }`.
5. Supplier maps a User Service 401 to client 401, a verified user with the wrong role to 403, and timeout, unavailability, non-401 downstream errors, or malformed success bodies to fail-closed 503. Use a bounded timeout and do not cache verification for D2 so current role and status remain authoritative.

Encapsulate the call in a NestJS guard plus the planned `SessionVerifier` interface seam. Local tests may use a verifier test double, but the integrated environment and D2 demo use the real User Service endpoint. Do not deploy a bypass.

The bearer token is manually attached rather than browser-managed cookie authentication, so the earlier cookie-specific CSRF-token proposal does not apply to this implemented contract. The shared frontend stores it in per-tab `sessionStorage`, preserving the session across refreshes while clearing it when the tab closes.

PR #14 does not implement refresh tokens, logout, an access-token revocation list, or a separate service credential for `/auth/verify`. Account role/status changes take effect on the next verification call because the endpoint reads the User database. The `JWT_REFRESH_TOKEN_TTL` example variable is currently unused by User Service.

The Supplier-to-User base URL remains runtime-configurable. The integrated Compose deployment uses `http://user-service:3001` with a 1,000 ms verification timeout. Deployed TLS routing remains an environment concern rather than a hard-coded application URL.

The shared frontend implements client-side logout by clearing `sessionStorage`, because User Service has no revocation endpoint. Development and Compose use the implemented same-origin Vite/nginx gateway rules. Final deployed TLS routing remains an infrastructure decision. Supplier does not consume AccountActivated events or call `GET /users/{id}/public` in D2.

## 7. HTTP API contract (implemented backend v1)

Base path: `/api/v1/suppliers`. All business endpoints require a verified active user. JSON bodies; UTC ISO 8601 timestamps; UUID string IDs. Server controls IDs, timestamps, status, and versions. Commit successful mutations before responding.

| Method and path | Behaviour | Success |
| --- | --- | --- |
| `GET /api/v1/suppliers` | Search/filter/sort/page; ACTIVE by default; admin can request ARCHIVED | 200 page |
| `GET /api/v1/suppliers/metadata` | Complete backend-owned Building Code options; both roles | 200 `{ "buildingCodes": [{ "code", "label" }] }` |
| `GET /api/v1/suppliers/{id}` | Detail; archived detail for admin only | 200 body and `ETag` |
| `POST /api/v1/suppliers` | Validate and create ACTIVE row | 201 body, `Location`, `ETag` |
| `PUT /api/v1/suppliers/{id}` | Replace editable fields, require `If-Match` | 200 body, new `ETag` |
| `DELETE /api/v1/suppliers/{id}` | Archive; require `If-Match` when ACTIVE | 204; repeat archive 204 |
| `POST /api/v1/suppliers/{id}/restore` | Restore; always require `If-Match` | 200 body and `ETag`; repeat restore with current tag returns unchanged body/tag |
| `GET /health` | Non-sensitive container readiness | 200 when ready |

**List query:** `q` is the free-text search term for `name` and `locationDescription`, matched case-insensitively; `buildingCode` accepts a controlled building code; `category` is controlled text; `status=ARCHIVED` is admin-only and omitted `status` defaults to `ACTIVE`; `page` is zero-based (default 0); `size` defaults to 12 (minimum 1, maximum 100); `sort` allowlist: `name,asc`, `name,desc`, `updatedAt,desc`, with omitted `sort` defaulting to `name,asc`. Trim `q`; blank means no search. The trimmed value has a maximum of 300 Unicode code points, aligning with PostgreSQL character counting and the longer searched field, `location_description varchar(300)`; 301 or more returns the existing 400 validation shape with a `q` field error. Reject other invalid values with 400. Filter before pagination; break ties by ID. Admins can request ACTIVE or ARCHIVED explicitly, not an unspecified all-status view.

Example list response (illustrative values only):

```json
{
  "items": [
    {
      "id": "c9b17a24-0400-43c6-9d0b-40368f1884cf",
      "name": "Printer @ Com 2",
      "categories": ["PRINTING"],
      "buildingCode": "COM2",
      "buildingLabel": "COM2",
      "floor": "1",
      "locationDescription": "Next to LT19",
      "latitude": 1.2938347,
      "longitude": 103.7744572,
      "hoursKind": "INTERVAL",
      "opensAt": "00:00",
      "closesAt": "23:59",
      "imagePath": "/assets/suppliers/PRINTER_COM2.jpeg",
      "status": "ACTIVE",
      "version": 0,
      "createdAt": "2026-09-24T08:00:00Z",
      "updatedAt": "2026-09-24T08:00:00Z",
      "archivedAt": null
    }
  ],
  "page": 0,
  "size": 12,
  "totalItems": 21,
  "totalPages": 2
}
```

**Create/update body:** create and full update use the same strict contract containing editable fields only: `name`, nonempty `categories`, `buildingCode`, optional `floor`, required `locationDescription`, optional paired coordinates, and required `hoursKind` with its conditional interval fields. Reject unknown keys, including server-owned fields such as IDs, status, versions, timestamps, `buildingLabel`, and `imagePath`. Trim text; blank floor becomes null. Floor and both coordinate fields accept omission or explicit null; non-null coordinates must be JSON numbers and must be supplied together. Reject missing/blank required fields, duplicate or invalid category values, unknown building codes, out-of-range coordinates, inconsistent hours fields, and oversized values. `UNKNOWN` and `ALL_DAY` require the time keys to be omitted; `INTERVAL` requires both times in exact 24-hour `HH:mm` form. Full PUT may edit an ACTIVE or ARCHIVED Supplier, preserves its existing status/archive state, and advances `updatedAt` only when the update succeeds.

**Concurrency:** DB `version` is an integer. Detail/create/update/restore responses return a strong quoted `ETag`, e.g. `ETag: "v3"`. An admin sends that ETag in `If-Match` for PUT and restore, and for archive of an ACTIVE record. Accept exactly one canonical strong tag in the form `"vN"`, where `N` is a nonnegative base-10 integer with no leading zero except `"v0"`. Reject weak tags, lists, wildcards, missing quotes, leading-zero versions, and other malformed values with 400. The server atomically updates with `WHERE id = ? AND version = ? AND status = ?` and increments the version in the same transaction. Only one edit of a stale screen commits. Missing `If-Match` on a state-changing operation returns **428**; stale returns **412** with no mutation. Repeating archive on an already ARCHIVED row is a no-op returning 204 after authorisation, even without `If-Match`; it ignores any supplied `If-Match`, including a malformed or stale value. Repeating restore requires the current `If-Match` and returns 200 without changing the row. Fetch detail before editing a list item to obtain its ETag. Mutation bodies have no version field.

**Error response:**

```json
{
  "code": "SUPPLIER_VALIDATION_FAILED",
  "message": "Please correct the highlighted fields.",
  "fieldErrors": { "name": "Name is required." },
  "requestId": "server-generated-uuid"
}
```

Supplier generates a new request ID for every request, returns it in `X-Request-Id`, and includes it in JSON error responses. It does not trust or echo a client-supplied request ID.

The same HTTP middleware emits exactly one JSON completion event for a normally finished or prematurely closed request. The application `message` payload contains only the stable event name `supplier.http.request.completed`, `requestId`, method, pathname without the query string, numeric status, `completed`/`aborted` result, and duration in milliseconds. Nest's JSON `ConsoleLogger` adds its normal non-sensitive envelope metadata (`level`, process ID, timestamp, and `SupplierHttp` context). Neither payload nor envelope includes the `Authorization` header or token, `q` or any query value, the full URL, request/response bodies, or user identity. The dedicated Nest built-in logger uses JSON mode so each structured event is one machine-readable stdout line. This increment does not add `@nestjs/observe`, a microservices SDK, `AsyncLocalStorage`, Pino, tracing/APM, or an external exporter.

| Status | Meaning |
| --- | --- |
| 400 | Invalid payload/query, malformed ETag, or unsupported sort/category |
| 401 | Missing/invalid/expired bearer token or inactive account |
| 403 | Valid user lacks permission |
| 404 | Unknown supplier; archived detail hidden from members |
| 409 | Exact normalized duplicate creation, including an archived match |
| 412 | Stale `If-Match`, no mutation |
| 428 | Required `If-Match` missing |
| 503 | User Service validation unavailable/invalid; no mutation |

There is no alternate version-in-request-body concurrency contract. Status 409 is reserved for exact duplicate creation; stale writes use 412.

## 8. Responsive UI specification

React + Vite follows the D1 prototype's shared navigation while using live APIs.

### 8.1 Member view

Show name, category, building label/floor, `locationDescription`, typical hours, and the seed-managed image or fallback. Search, filters, sort, and pagination call the API. Detail uses `locationDescription` as the displayed Supplier description and shows coordinates where present. A Request Errand action appears only when connected to a future Order Service. Show useful loading, empty, network-error, and expired-token states. Mobile controls/cards stack without horizontal overflow; desktop may use a denser layout. Keep keyboard focus and controls usable.

### 8.2 Administrator view

Show Add/Edit/Archive to admins; an ARCHIVED management view includes Restore. Forms guide users, while the API is the final validation authority. Refresh server data after a successful action. Archive/Restore show confirmation and actionable result feedback. On 412 preserve unsaved edits and offer reload/compare; distinguish 401, 403, and 503 feedback.

## 9. Operations, quality, and verification

- **Deployment:** Compose runs NestJS Supplier and its private PostgreSQL container with health checks and secret-free environment examples. The integrated demo includes React/Vite and User Service.
- **Migrations/seed:** clean checkout applies versioned Drizzle migrations and seeds once; restart creates no duplicates.
- **Performance:** Measure D1's p95 under two seconds using 100 Suppliers, 20 concurrent clients, approximately 10 requests per second for five minutes, with an 80% list and 20% detail mix. Include synchronous User Service validation in the measured response time.
- **Security:** parameterized Drizzle queries, sort allowlist, bounded input, bearer-token and role guards, least-privilege DB user, bounded User timeout, and no token logging.
- **Observability:** server-generated request ID returned in `X-Request-Id` and error bodies; one request-correlated, query-redacted JSON completion event with status/result/duration; and non-sensitive `/health`.
- **Responsive verification:** Playwright exercises the production nginx frontend with real User/Supplier services and fresh PostgreSQL volumes at representative 1280-pixel desktop and 390-pixel mobile widths. Both document and body scroll widths must remain within their viewport widths.

### 9.1 Acceptance scenarios

| ID | Expected result |
| --- | --- |
| A1 | Clean deployment serves seeded PostgreSQL catalogue, not hard-coded arrays. |
| A2 | Member can search name/location, filter building/category, sort, page, and view detail on mobile/desktop. |
| A3 | Member's direct create/edit/archive/restore calls return 403 without mutations. |
| A4 | Missing/invalid/expired token or inactive account returns 401; unavailable User Service returns 503 without mutation. |
| A5 | Admin creates a valid ACTIVE supplier visible in the list. |
| A6 | Invalid input returns useful 400 and preserves prior values. |
| A7 | Admin edit appears in refreshed list/detail. |
| A8 | Two admins edit version N; one succeeds, other receives 412; missing If-Match receives 428. |
| A9 | Archive hides from member list/detail but retains same ID and admin ARCHIVED visibility. |
| A10 | Restore returns same ID to member catalogue and increments version; repeats are harmless. |
| A11 | API works while frontend process is stopped. |
| A12 | Real login, role checks, mutation, database state, and responsive UI appear in integrated demo. |
| A13 | Creating an exact normalized duplicate of an ACTIVE or ARCHIVED Supplier returns 409 and identifies the existing record without mutation. |
| A14 | Authenticated members and administrators receive every canonical Building Code and label from Supplier metadata; unauthenticated access returns 401. |

### 9.2 D2 demo

1. Start clean containers and show seeded suppliers.
2. Log in as MEMBER: demonstrate search, filters, sort, pagination, detail, mobile UI, and direct mutation rejection.
3. Log in as ADMINISTRATOR: create and edit; if the D1 change is approved, archive, inspect ARCHIVED, and restore; inspect API/database effects.
4. Show validation error, stale edit 412, missing If-Match 428; stop frontend and call API independently.
5. Explain User validation, private Supplier DB, and D1 backlog revisions. Do not claim Order integration.

## 10. Coordination and implementation sequence

**External decisions remaining:** publish the team's approved description and archive revisions in the D1 requirements and acceptance criteria, and decide final deployed TLS routing. The shared frontend has implemented per-tab `sessionStorage`, client-side logout, and matching same-origin Vite/nginx gateway rules. The Supplier verification deployment timeout is approved at 1,000 ms. PR #14 is the implemented backend auth contract; it has no separate service credential for `/auth/verify`. NestJS/Express, PostgreSQL/Drizzle, Vite React, and ETag/If-Match are selected for the Supplier workstream.

**Implementation status:** the Supplier backend implements the NestJS/Drizzle schema, migrations, repeatable seed, real User Service `SessionVerifier` and bearer/role guard, authenticated Building Code metadata and list/detail, and administrator create/full-update/archive/restore with atomic version and duplicate handling. The shared frontend implements responsive MEMBER catalogue/search/filter/sort/page/detail and ADMINISTRATOR create/edit/archive/archived/restore screens using live APIs. Unit/component/contract tests, the API-only isolated Compose check, and the real-browser isolated Compose check cover the implemented backend, database, gateway, and responsive UI. The performance workload, manual presentation rehearsal, D1 document alignment, and deployed TLS routing remain outstanding; no Order integration is claimed.

### Sources

- `CS3219-ProjectDocument-FoC.pdf`, pp. 2–3 and 9–10; `CS3219-Instructions-MilestoneD2.pdf`, pp. 3–4; `Project-D1-Group-5.pdf`, pp. 12–14 and 25–26.
- Team template and seed data: <https://github.com/Y2627S1-CS3219-P5/FoC>.
- HTTP conditional requests: <https://www.rfc-editor.org/rfc/rfc9110.html>; precondition-required status: <https://www.rfc-editor.org/rfc/rfc6585.html>.
- Implemented User Service contract: <https://github.com/Y2627S1-CS3219-P5/FoC/pull/14>.
- JSON Web Tokens and bearer authentication: <https://www.rfc-editor.org/rfc/rfc7519.html> and <https://www.rfc-editor.org/rfc/rfc6750.html>.
- NestJS middleware/logger and Drizzle: <https://docs.nestjs.com/middleware>, <https://docs.nestjs.com/techniques/logger>, and <https://orm.drizzle.team/docs/update>.
