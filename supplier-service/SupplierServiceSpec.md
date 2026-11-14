<!--
AI Assistance Disclosure:
Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
Scope: Organized the already-decided Supplier Service architecture (SupplierServiceArchitecture.md)
       and the team's existing product backlog / GitHub issues into a phased implementation spec.
       No new requirements, architecture, schema, or API decisions were made by the AI tool; phase
       ordering reflects technical build dependencies only, not sprint prioritization.
Author review: Congchen
Scope: 2026-09-28 update — recorded the team-supplied API-gateway/CORS explanation, resolved the
       three previously open questions (uniqueness enforcement, supplier_id stability, is_active vs.
       is_deleted), and added a new open question about soft-deleted rows and the uniqueness
       constraint.
Author review: Congchen
Scope: 2026-09-28 update — recorded the team-supplied resolution that recreating a soft-deleted
       supplier's exact name/type/location reactivates and updates the existing row instead of
       inserting a new one; narrowed the remaining open question to the reactivation path's photo
       handling only.
Author review: Congchen
Scope: 2026-09-28 update — recorded the team-supplied decision that reactivation-path photos
       replace the existing supplier's photo rows; no open questions remain from this line of
       clarification.
Author review: Congchen
Scope: 2026-09-28 update — replaced the `super_admin` role literal with `super admin` (space) per
       the team's resolution of a naming mismatch against the User Service's actual `role_enum`/
       `GET /auth/verify`, discovered after merging `main` into `supplier-service`.
Author review: Congchen
Scope: 2026-09-29 update — reflected the team's recorded Phase 1 decisions (see
       SupplierServiceArchitecture.md §9 item 20) in the Phase 1 scope: the `isOpen` filter, the
       enforced `limit`, the `A-Z` default, and the `00:00`–`23:59` all-day check. Tool: Claude Code
       (model: claude-sonnet-5). No decisions were made by the AI tool.
Author review: Congchen
Scope: 2026-09-29 update — reflected the team's recorded Phase 2 decisions (see
       SupplierServiceArchitecture.md §9 item 21) in the Phase 2 scope. Tool: Claude Code
       (model: claude-sonnet-5). No decisions were made by the AI tool; items the team has not
       finished deciding are listed under "Still to be specified" and were not filled in. Also
       recorded the team's schema changes (`is_24h`, 1–7 `day_of_week`).
Author review: Congchen
Scope: 2026-09-29 update — reflected the team's revised Phase 2 decisions (see
       SupplierServiceArchitecture.md §9 item 21): hard delete of unreferenced lookup rows, the
       reactivation behavior, day-8/`is_24h` hours, the `is24h` create field and the local photo
       store fields. Tool: Claude Code (model: claude-sonnet-5). No decisions were made by the AI
       tool.
Author review: Congchen
Scope: 2026-09-29 update — reflected the team's corrections (suppliers keep soft deletion and
       reactivation; `is_24h`/day 8 records only a 24/7 supplier; the photo store holds no
       `supplier_photo_id`). Tool: Claude Code (model: claude-sonnet-5). No decisions were made by
       the AI tool.
Author review: Congchen
Scope: 2026-09-29 update — local photo storage is now a MinIO instance (not MySQL) returning the
       photo location directly. Tool: Claude Code (model: claude-sonnet-5). No decisions were made
       by the AI tool.
Author review: Congchen
Scope: 2026-09-29 update — recorded the team's choice of the AWS S3 client for the local MinIO
       adapter and marked the Phase 1 `day_of_week` follow-up as done. Tool: Claude Code (model:
       claude-sonnet-5). No decisions were made by the AI tool.
Author review: Congchen
Scope: 2026-09-29 update — recorded the team's confirmation that `supplier_hours.is_24h` is
       `BOOLEAN NOT NULL DEFAULT FALSE`. Tool: Claude Code (model: claude-sonnet-5). No decisions
       were made by the AI tool.
Author review: Congchen
Scope: 2026-09-30 update — added a Phase 3 implementation status note (Tool: Claude Code, model:
       claude-sonnet-5-5). No requirements, architecture, schema, or API decisions were made by the
       AI tool.
Author review: Congchen
Scope: 2026-09-30 update — recorded the Phase 4 status note and the team's Phase 4 decisions of
       2026-09-30 in the Phase 4 scope; replaced the reactivation photo wording and the deferred
       photo-cleanup bullet in the Phase 2 scope and the enqueue status note in the Phase 3 scope.
       Tool: Claude Code (model: claude-sonnet-5-5). No requirements, architecture, schema, or API
       decisions were made by the AI tool; the change records the team's decisions of 2026-09-30.
Author review: Congchen
Scope: 2026-10-20 update — aligned the Phase 0 authentication task with cached JWKS retrieval and
       local RS256 verification. No requirements, architecture, schema, or API decisions were made
       by the AI tool.
Author review: tng wen xi
Scope (2026-11-02, Codex, model: GPT-6): Recorded Phase 5 verification status.
       No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: Congchen
-->

# Supplier Service Implementation Spec

This spec turns the decided [SupplierServiceArchitecture.md](./SupplierServiceArchitecture.md) into
phased, actionable implementation work. It does not introduce new architecture, schema, or API
decisions — every deliverable below cites the architecture section it implements and the backlog
requirement / GitHub issue it satisfies.

**Phase ordering.** Phases are ordered by technical build dependency (schema before reads, reads
before writes, writes before the soft-delete/downstream workflow, core endpoints before
cross-cutting hardening) — not by sprint priority. `docs/FoC-ProductBacklog.md`'s Priority/Planned
Week columns remain the team's authoritative scheduling reference; this ordering only sequences
work _within_ the Supplier Service so that later phases can build on working earlier ones.

**Issue mapping.** Supplier Service backlog items are tracked as GitHub issues in
`AY2627S1-CS3219-P18/FoC`:

| Issue                                                       | Backlog ID | Title                                                   |
| ----------------------------------------------------------- | ---------- | ------------------------------------------------------- |
| [#40](https://github.com/AY2627S1-CS3219-P18/FoC/issues/40) | F6.1       | Persist campus supplier details                         |
| [#41](https://github.com/AY2627S1-CS3219-P18/FoC/issues/41) | F7.1       | List active suppliers in requester mode                 |
| [#42](https://github.com/AY2627S1-CS3219-P18/FoC/issues/42) | F7.2       | Display supplier details                                |
| [#43](https://github.com/AY2627S1-CS3219-P18/FoC/issues/43) | F8.1       | View and manage campus suppliers (admin)                |
| [#44](https://github.com/AY2627S1-CS3219-P18/FoC/issues/44) | F8.2       | Create campus suppliers (admin)                         |
| [#45](https://github.com/AY2627S1-CS3219-P18/FoC/issues/45) | F8.3       | Update campus suppliers (admin)                         |
| [#46](https://github.com/AY2627S1-CS3219-P18/FoC/issues/46) | F8.4       | Soft-delete campus suppliers (admin)                    |
| [#60](https://github.com/AY2627S1-CS3219-P18/FoC/issues/60) | NFR6.1     | Protect supplier records from unauthorized modification |
| [#61](https://github.com/AY2627S1-CS3219-P18/FoC/issues/61) | NFR7.1     | Maintain supplier-list performance at scale             |

No GitHub issue exists yet for the infrastructure in Phase 0 (schema, auth wiring, error/rate-limit
middleware) — it is a prerequisite for every issue above rather than its own backlog item.

---

## Phase 0 — Foundations

**Governing issues:** none directly; prerequisite for all issues below. Partially satisfies
[#60](https://github.com/AY2627S1-CS3219-P18/FoC/issues/60) (NFR6.1) at the middleware level.
**Governing architecture:** §2–§5 (tiered layers), §6.4 (MySQL DDL), §7 intro (auth contract,
versioning), §7.1 (status codes/error envelope), §7.5 (rate limiting), §3 (same-origin/CORS).

### Scope

- Project scaffold: config/env loading, MySQL connection pool, Redis client, `/api/v1` route
  prefix (§7 intro).
- Run the full MySQL DDL from §6.4 as migrations: `faculties`, `supplier_locations`, `supplier`,
  `supplier_categories`, `supplier_category_map`, `supplier_hours`, `supplier_photos`,
  `dead_letter_jobs`.
- Presentation-layer auth middleware: fetch and cache the User Service's JWKS, verify the bearer JWT
  locally with RS256, attach the resolved identity/role to the request, and
  reject unauthenticated requests. This is the core of NFR6.1 (#60) — "every modification request
  shall undergo token verification; non-administrative requests shall be rejected without
  modifying persistent state."
- Role-guard middleware for `user` / `admin` / `super admin` per endpoint (§7's per-endpoint role
  column).
- Global error handler emitting the fixed error envelope (§7.1: `status_code`, `error`, `message`,
  `timestamp`, `details`) for `400`/`401`/`403`/`404`/`409`/`422`/`429`/`500`.
- Rate-limit middleware: `PER_IP_RATE_LIMIT` requests/minute/IP (default 30) → `429 Too Many Requests` (§7.5).
- Confirm same-origin deployment via the shared API gateway that fronts all FoC services (no CORS
  middleware needed) (§3).
- Persistence-layer scaffolding (repository/DAO pattern) so Phase 1+ business logic depends on
  persistence interfaces, not raw SQL (§5).

**Status (2026-11-02):** The 36 authorization cases for mutating endpoints pass, including
checks that rejected requests do not call the mocked MySQL or Redis interfaces. Removing the
lookup role guard caused nine cases to fail; the guard was restored. Endpoint-specific wording,
performance verification, the API-only transcript and cross-role demonstration remain pending
the team decisions listed in the Phase 5 plan.

### Acceptance criteria

- All tables in §6.4 exist with the documented constraints (foreign keys, unique keys, checks).
- A request with no bearer token, or a token that fails RS256 verification, receives
  `401 Unauthorized` with the standard error envelope, for every route registered so far.
- A request exceeding the rate limit receives `429 Too Many Requests`.
- No supplier-related route is reachable yet without authentication (there are no routes yet beyond
  the middleware chain itself — this phase has no user-facing acceptance criteria of its own beyond
  the above; it is verified indirectly by Phase 1's tests).

### Out of scope / deferred

- Redis job _processing_ (worker, retry, dead-letter insertion) — wired up in Phase 4, though the
  `dead_letter_jobs` table is created now since it's part of the same migration set.
- Health-check endpoints (§7.5: explicitly deferred per the architecture document).

---

## Phase 1 — Supplier Read APIs (Requester Mode)

**Governing issues:** [#40](https://github.com/AY2627S1-CS3219-P18/FoC/issues/40) (F6.1),
[#41](https://github.com/AY2627S1-CS3219-P18/FoC/issues/41) (F7.1),
[#42](https://github.com/AY2627S1-CS3219-P18/FoC/issues/42) (F7.2). Also begins satisfying
[#61](https://github.com/AY2627S1-CS3219-P18/FoC/issues/61) (NFR7.1 — fixed 50-entry pagination).
**Governing architecture:** §6.2–§6.3 (supplier data model, `is_open` calculation), §7 table rows
for `GET /api/v1/suppliers`, `GET /api/v1/suppliers/:id`, and the two reference endpoints, §7.2
(pagination/search/sort), §7.3 (response envelopes).

### Scope

- Business-layer persistence functions to read supplier rows joined with location/faculty/category/
  hours/photo data (§6.2).
- `GET /api/v1/suppliers` — paginated (50/page, any other `limit` rejected), search
  (name/location/category, case-insensitive, `supplier_desc` intentionally excluded), filter by
  `location_id`/`category_id`/`isOpen`, sort `A-Z`/`Z-A` defaulting to `A-Z` (§7.2); response uses the `SupplierSummary` envelope (§7.3).
- `GET /api/v1/suppliers/:id` — detail view adding `desc` and `openingHours` (§7.3).
- `is_open` computation: current day/time vs. `supplier_hours`, Singapore time (UTC+8), overnight
  intervals continuing into the next day, an hours entry of `00:00`–`23:59` (the 24-hour convention, e.g. Facilities) is open for any time of
  that day via a dedicated check (§6.2).
- `GET /api/v1/suppliers/reference/location` and `GET /api/v1/suppliers/reference/categories` —
  needed by the requester-mode filter UI (§7.3).
- Visibility rule: exclude suppliers where `is_deleted` is true or `is_active` is false (§7 body
  text after the endpoint table).

### Acceptance criteria (from backlog, verbatim IDs)

- F6.1.1 / F6.1.2: Facility suppliers persist Name/Location/Description; Store suppliers
  additionally persist Opening Hours.
- F7.1.1: list responses include a real-time Open/Closed indicator and closing time derived from
  current system time and store hours.
- F7.1.2: list supports search/filter by name, location, or current open status.
- F7.2.1: detail view returns all F6.1 fields.
- F7.2.2: detail view has a defined fallback for unpopulated optional fields (e.g., no photos, no
  description) — the architecture doesn't prescribe the fallback _content_; this is a UI-layer
  concern the SPA implementation should define, since the API simply omits/nulls empty fields.

### Out of scope / deferred

- Photo upload (nothing to upload yet — creation lands in Phase 2). Photo _read_ (returning
  `photos[]` with signed `photoLocation` URLs) is in scope since it's part of the summary/detail
  envelope, but will return an empty array until Phase 2 exists.
- Admin-only fields (`isActive`, `isDeleted`, `createdOn`, `createdBy`, `updatedOn`, `version`) —
  Phase 2.

---

## Phase 2 — Admin Visibility, Lookup Management, and Supplier Creation

**Governing issues:** [#43](https://github.com/AY2627S1-CS3219-P18/FoC/issues/43) (F8.1),
[#44](https://github.com/AY2627S1-CS3219-P18/FoC/issues/44) (F8.2).
**Governing architecture:** §7 table rows for `GET /api/v1/admin/suppliers`,
`GET /api/v1/admin/suppliers/:id`, the `faculties`/`locations`/`categories` management rows, and
`POST /api/v1/admin/suppliers`; §7.5 (idempotency key), §8.2 (photo upload saga, create-only path).

### Scope

- `GET /api/v1/admin/suppliers` and `GET /api/v1/admin/suppliers/:id` — same shape as Phase 1 plus
  `isActive`, `isDeleted`, `createdOn`, `createdBy`, `updatedOn`, `version`; no visibility filtering
  (admins see everything) (§7).
- Lookup-table management endpoints (admin/super admin only), mirroring the read-only reference
  endpoints: `POST`/`PUT`/`DELETE` for `/api/v1/admin/reference/faculties`, `.../locations`,
  `.../categories` (§7 table). These exist so an admin can create suppliers against real
  location/category IDs rather than only pre-seeded ones.
- `POST /api/v1/admin/suppliers` — `multipart/form-data` create, 0–10 JPEG/PNG photos ≤5 MB each
  (§8.2 steps 1–3, create path only — no excluded-photo deletion applies to a brand-new supplier).
  Uses the `Idempotency-Key` header / Redis-cached-response pattern (§7.5) so a retried create
  request doesn't produce duplicate suppliers.
- `version` initialized server-side on create (§7.3).
- Duplicate-supplier check (F8.2.2): an application-level pre-check query before insert, backed by
  the database-level `UNIQUE` constraint on `supplier(supplier_name, supplier_type, location_id)`
  (§6.2, §6.4) as a race-condition backstop.
  - No matching row → insert as normal.
  - Matching row, not soft-deleted → reject with `422 Unprocessable Entity` (F8.2.2).
  - Matching row, soft-deleted → reverse the soft delete on that row and apply the submitted fields
    to it as an update, reusing the existing `supplier_id` instead of inserting a new row (§6.2).
    The submitted details and photos are applied through the edit cycle, and `is_deleted = false` and
    `is_active = true` are restored in the same transaction (Phase 4). The response is `200 OK`, and
    `updated_on` and `version` change (§6.2).
- Request handling and responses (§7, §7.1.1, §7.5, §8.2):
  - `multer` parses the multipart body.
  - The create response returns photos as `photoId`/`photoLocation` only.
  - `Idempotency-Key` is mandatory (`400` if absent), cached in Redis per user and key, with a 60 s
    in-flight TTL and a 24 h completed-response TTL.
  - For a Facility the server fills in the `00:00`–`23:59` hours; a Store must supply hours.
  - Photo `display_order` follows the admin's UI arrangement.
  - Lookup `DELETE` is a hard delete allowed only for an unreferenced row (references from
    soft-deleted suppliers count) and returns `200 OK`; an unknown id returns `404`; lookup
    foreign-key and `UNIQUE` violations return `422`.
  - Hours: `day` runs 1–7 plus a reserved `8`, which records a supplier open 24/7 and is valid only
    with `is_24h` true and `00:00`–`23:59` (`is_24h` is true only on day `8`). A Facility gets one
    server-filled day-`8` entry (any other day is `422`). A 24/7 Store is recorded the same way, as a
    single day-`8` entry. A Store that is 24-hour on only some days uses `00:00`–`23:59` entries on
    those days with `is_24h` false. A create request carries `is24h`, with a single day-`8`
    `openingHours` entry. Responses have no `is24h` field.
  - `is_open` returns `true` whenever the supplier has a day-`8` entry.
- Photo storage interface with upload, update, delete, and view operations; for local testing and
  unit tests a local MinIO instance simulates the cloud object storage. MinIO returns the photo
  location directly and it is stored in `supplier_photos.photo_location`; business and persistence
  logic use no provider SDK (§8.2).
- Schema changes (migrations, §6.4): the lookup foreign keys use `ON DELETE RESTRICT` (no lookup
  `is_deleted` column); `supplier_hours.day_of_week` becomes 1–8 (8 reserved for 24-hour operation) and
  `supplier_hours` gains `is_24h` (a supplier open 24/7). Photo `display_order` starts at 0.
- Migration (done 2026-09-29): `npm run migrate:phase2` upgrades an existing database's
  `supplier_hours` (adds `is_24h`, converts Sunday 0 to 7, widens the check to 1–8); it is safe to
  re-run. New databases get the same schema from `init.sql`.
- Phase 1 follow-up (done 2026-09-29): `is_open` now uses `day_of_week` 1–7, checks for a day-`8`
  entry first, and `init.sql` has `is_24h` and the 1–8 check. Existing databases created from the
  old `init.sql` (`CREATE TABLE IF NOT EXISTS`) and any existing hours rows still need migrating
  (Sunday 0 becomes 7).
- Library: the local MinIO adapter uses the AWS S3 client (`@aws-sdk/client-s3`), chosen by the team;
  MinIO is S3-compatible.

### Acceptance criteria

- F8.1.1: admin list shows active, inactive, and soft-deleted suppliers with full F6.1 fields and
  current status.
- F8.1.2: admin list supports filtering on the available fields (same `location_id`/`category_id`/
  `search` params as Phase 1, per §7.2).
- F8.2.1: creation validates and requires non-empty name, location, type, and (for Store) operating
  hours before persisting.
- F8.2.2: creation rejects a duplicate supplier with an identical name/type/location combination
  among active suppliers, enforced at both the application and database layers (§6.2); a match
  against a soft-deleted supplier instead reactivates and updates that row rather than rejecting.

### Out of scope / deferred

- Editing/reordering existing photos, and the `version`-based concurrency check — Phase 3.
- Soft-delete and its downstream workflow — Phase 4.

---

## Phase 3 — Admin Update

**Governing issues:** [#45](https://github.com/AY2627S1-CS3219-P18/FoC/issues/45) (F8.3).
**Governing architecture:** §7 table row for `PUT /api/v1/admin/suppliers/:id`, §7.5 (optimistic
concurrency), §8.2 full saga (steps 1–7, including photo edit semantics).

### Scope

- `PUT /api/v1/admin/suppliers/:id` — partial update of any supplier field, current `version`
  required in the request and validated against the stored value (`409 Conflict` on mismatch)
  (§6.2, §7.5).
- Photo edit semantics: `isPhotoDirty`, ordered `photo_ids` (existing IDs retained, placeholder IDs
  for new uploads), `placeholder_ids` resolution, full saga (upload → transactional DB edit
  including `display_order` reorder → post-commit cloud-object deletion enqueue) (§8.2).
- `updated_on` and `version` bumped on every successful update (§6.4).
- `is_active` toggling needs no dedicated endpoint: it is one of the generic supplier fields `PUT`
  already accepts (§7 table row), independent of `is_deleted`/soft-delete (§6.2, confirmed).

- Status (done 2026-09-30): `PUT /api/v1/admin/suppliers/:id` is implemented, including the
  photo saga. One excluded-photo cleanup task (`task_name` `image_cleanup`) per excluded photo is
  written to the `outbox` table in the update transaction (Phase 4) and processed by the worker.

### Acceptance criteria

- F8.3.1: admins can modify name, location, category, or operating schedule without leaving F8.2.1's
  mandatory fields blank.
- F8.3.2: historical completed request records are preserved when supplier metadata changes.
  Confirmed: `supplier_id` is a stable cross-service foreign reference, so the Supplier Service
  satisfies this passively by never hard-deleting or renumbering it; the Order Service references
  suppliers by ID rather than duplicating mutable fields into its own records.

### Out of scope / deferred

- Soft-delete and its downstream cancellation/notification workflow — Phase 4.

---

## Phase 4 — Admin Soft-Delete and Downstream Workflow

**Governing issues:** [#46](https://github.com/AY2627S1-CS3219-P18/FoC/issues/46) (F8.4).
**Governing architecture:** §7 table row for `DELETE /api/v1/admin/suppliers/:id`, §8.1 (soft-delete
workflow), §7.5/§8.1/§8.2 (Redis job contract, retries, dead-letter).

### Scope

- `DELETE /api/v1/admin/suppliers/:id` — sets `is_deleted` (`is_active` untouched) and bumps
  `updated_on` and `version`. It responds `200` with `{ id, isDeleted: true }`, and `404` for an
  unknown or already deleted supplier. The delete and its outbox row commit in one transaction
  (§8.1). All API responses use `id`.
- Transactional outbox: table `outbox (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, task_name
VARCHAR(255) NOT NULL, payload JSON NOT NULL, version BIGINT UNSIGNED NOT NULL)`, where `version`
  is the supplier version. All background tasks (the suspension job, and the excluded-photo cleanup
  from `PUT` and reactivation) are written to it inside the write transaction. A relay, driven by a
  BullMQ job scheduler every second in the worker, reads rows ordered by `version` then `id`, adds
  each to BullMQ (job id `outbox-<outbox id>`, job name = `task_name`, data = `payload`) and deletes
  the row once it has been added. Ordering is enqueue order only (decided by the team, 2026-09-30).
- Suspension job `supplier_suspension` on queue key `queue:supplier:suspension`, payload
  `{supplier_id}`: one job calls the (mocked, per §9 item 17) Order Service delete and then the
  (mocked) Message Service notify.
- Background worker as a separate process and container (`npm run worker`, compose service
  `supplier-worker`); standard shutdown signals apply and the active job is allowed to finish.
  Retries are BullMQ delayed jobs, max 5 attempts, delays 5 s / 25 s / 125 s / 625 s. A bad job or an
  outbox row with no queue goes straight to `dead_letter_jobs` (§8.1).
- Queue keys map to BullMQ as prefix + name split at the last colon (`queue:supplier:suspension` is
  prefix `queue:supplier`, name `suspension`; `queue:image:cleanup` is `queue:image` / `cleanup`;
  relay queue `queue:outbox:relay`).
- Same worker mechanism handles the excluded-photo cloud-object deletion job from Phase 3 (§8.2).
- Reactivation of a soft-deleted supplier applies the submitted details and photos through the edit
  cycle and restores `is_deleted = false` and `is_active = true` in the same transaction. New photos
  replace the existing ones; no photos submitted leaves them; `version` is bumped once.
- `PHOTO_STORE_ENDPOINT` is `http://host.docker.internal:9000` in development and is the same string
  in the API and the worker.
- Status (done 2026-09-30): the delete endpoint, the `outbox` table and writer, the relay, the
  BullMQ worker with mock Order/Message clients and dead-lettering, the reworked reactivation and
  the `supplier-worker` compose service are implemented. Verified: `npx vitest run` (38 files, 343
  tests), `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test:minio` (2 files, 9
  tests), `docker compose config --quiet` and `docker compose build supplier-worker` passed. Run by
  hand on 2026-09-30 against MySQL 8, Redis, MinIO and the API/worker containers (a local stub stood
  in for the User Service JWKS endpoint): delete, Redis outage, worker down, delayed retry,
  bad rows and reactivation behaved as described above; with the worker idle, `docker stop`
  completed in about 3 s with the graceful-shutdown log lines. Not verified: stopping the worker
  during an in-flight job.

### Acceptance criteria

- F8.4.1: soft-delete hides the supplier from new-request creation immediately. Confirmed:
  `is_active` and `is_deleted` are independent flags — `is_active` toggling (Phase 3) is a separate,
  purely visibility-driven admin action, unrelated to soft-delete. `DELETE` only ever sets
  `is_deleted`; it does not also need to set `is_active`, since either flag alone already hides a
  supplier from user-facing results (§6.2, §9 item 18).
- F8.4.2: uncollected requests (open/accepted, not yet picked up) are cancelled via the Order
  Service delete entrypoint in the enqueued job.
- F8.4.3: affected requesters/couriers are notified via the Message Service entrypoint in the same
  job.

### Out of scope / deferred

- The concrete Order Service and Message Service request contracts remain mocked until those
  services exist (§9 item 5/17 — an explicit, continued deferral, not a gap in this phase).

---

## Phase 5 — Cross-Cutting Hardening and Verification

**Governing issues:** [#60](https://github.com/AY2627S1-CS3219-P18/FoC/issues/60) (NFR6.1, full
verification), [#61](https://github.com/AY2627S1-CS3219-P18/FoC/issues/61) (NFR7.1, full
verification).
**Governing architecture:** §7.1.1 (status-code mapping template — team to complete
endpoint-specific `message`/`details` content), §9 (traceability notes).

### Scope

- Fill in the project-specific `message`/`details` content per endpoint in the §7.1.1 mapping
  template (the template's literal status-code meanings are already fixed; only the per-endpoint
  wording is open).
- End-to-end tests proving NFR6.1: every mutating endpoint rejects non-admin/unauthenticated
  requests without a persistent-state change.
- Load/pagination tests proving NFR7.1: list endpoints stay within acceptable latency at the fixed
  50-entry page size as supplier count scales.
- Live API-call transcript and an independent (no-UI) API demonstration, per §9 item 10, showing the
  Supplier Service is fully usable through its API alone (course requirement point 3).
- End-to-end demonstration across roles (course requirement point 4): user vs. admin access to the
  same underlying operations.

### Acceptance criteria

- NFR6.1.1 (#60): confirmed via the Phase 0 middleware plus explicit tests per endpoint.
- NFR7.1.1 (#61): confirmed — list endpoints paginate at the fixed size of 50 (already structurally
  guaranteed by §7.2's fixed `limit`; this phase adds the performance verification).

---

## Summary of open questions raised for the team

Resolved by the team (2026-09-28):

1. ~~F8.2.2's duplicate-supplier check~~ — application-level pre-check plus a database `UNIQUE`
   constraint on `supplier(supplier_name, supplier_type, location_id)` (§6.2, §6.4).
2. ~~Order Service / `supplier_id` stability~~ — confirmed as a stable cross-service reference.
3. ~~F8.4.1's "toggling active status"~~ — confirmed as the independent `is_active` field, unrelated
   to soft-delete (`is_deleted`); `DELETE` need not touch `is_active`.
4. ~~Recreating a soft-deleted supplier's exact name/type/location~~ — `POST` reverses the soft
   delete and applies the request as an update to the existing row instead of inserting a new one,
   preserving the `UNIQUE` constraint without needing to exclude soft-deleted rows from it (§6.2,
   Phase 2).
5. ~~Photo handling on the reactivation path~~ — newly submitted photos replace the reactivated
   supplier's existing photo rows entirely, rather than being appended alongside them (§6.2, Phase 2).

No open questions remain from this line of clarification.
