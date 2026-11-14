<!--
AI Assistance Disclosure:
Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-10-01
Scope: Bootstrapped this project-state document (Orientation, Workstreams, Architecture map, Known
       Gaps, Needs a Human, Decisions, Deviations, Assumptions) from the Supplier Service spec and
       architecture documents, the phase plans, the git history, ai/usage-log.md and the transcripts
       of the sessions listed in § Assumptions (A8). Every "Why / who asked" cell records only what
       the team stated in those sources; where no reason was found the cell says "unknown — no
       record". No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: Congchen
Scope (2026-11-05, Claude Code, model: claude-sonnet-5-5): Added workstream W8 (supplier bookmarking) and
       updated the Branch and Last updated lines. No requirements, architecture, schema, or API
       decisions were made by the AI tool.
Author review:
Scope (2026-11-05, Claude Code, model: claude-sonnet-5-5): Recorded decision C53; W8 moved to Building, then In review; Progress updated after the D1 browser check.
       No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review:
Scope (2026-11-04, Codex, model: GPT-6): Updated Phase 5 status from the recorded tests and decisions.
       No requirements, architecture, schema, or API decisions were made by the AI tool.
Scope (2026-11-02, Codex, model: GPT-6): Updated current authentication descriptions to match
       the implemented JWKS verification; preserved dated historical records.
Author review: Congchen
Scope (2026-11-09, Claude Code, model: claude-sonnet-5): Added workstream W9 (Supplier-Order-Service-Key
       access on GET /suppliers/:id and GET /suppliers/reference/location, for order-service's
       scheduled-errands worker per its instructions.md Stage 28 c1); recorded decision C54; added the
       Done ledger line. This is a branch/PR for Congchen to review, not merged. No requirements,
       architecture, schema, or API decisions were made by the AI tool.
Author review:
-->

# Project State — Supplier Service (FoC)

**Living document — the source of truth for this project.** Read it in full before doing
anything, then run `git log --oneline -20` to confirm it still matches reality. Update it at
every boundary, not at the end of the session.

- **Phase:** Phases 0–4 implemented; Phase 5 is in progress. Authorization and response tests exist; the recorded local load run missed targets; the no-UI and cross-role suites were recorded as passing. See W6 and Q1.
- **Stack:** TypeScript, Node.js, Express 4, MySQL 8 (`mysql2`), Redis (`ioredis`) with BullMQ, `zod`, `multer`, `@aws-sdk/client-s3` (MinIO locally), Vitest + Supertest
- **Branch:** `feat/stage-c1-supplier-service-key-access` (created from `main` 2026-11-09; W9, an order-service-initiated PR for Congchen to review). Earlier: `supplier-bookmarking` (created from `main` 2026-11-05; W8); `supplier-phase-5` (observed 2026-11-04).
- **Method:** Spec → plan (`docs/superpowers/plans/`) → subagent-driven development, one implementer per task with reviewer subagents (see C49); every change disclosed per root `AGENTS.md`
- **Last updated:** 2026-11-09 — W9 Supplier-Order-Service-Key access added (In review); other sections retain their earlier dates.
- **Last verified against repo:** 2026-10-01
- **Developer guide:** not created (the `update-documentation` skill is not installed in this repo; Guide column is `—` throughout)

Sections are ordered by how often they are needed: **1–3 say where we are, 4–5 say what the
system is, 6–7 say what not to touch and what is stuck, 8–10 are the record.** Cite sections by
name (`§ Known Gaps`), not by number, so they can be reordered without breaking references.

This file covers **only the Supplier Service** — each FoC service (`user-service`,
`supplier-service`, `credit-service`, `order-service`, `frontend`) is treated as its own project
(A1). Cross-service facts are recorded here where the Supplier Service depends on them.

---

## 1. Orientation

The Supplier Service is FoC's independent backend for campus supplier information (Stores and
Facilities): who they are, where they are, when they are open, their categories and photos. Users
(`user` role) read suppliers; admins (`admin`, `super admin`) create, edit and soft-delete them.
It is reachable only through its HTTP API (the UI is a consumer, never a dependency), and it
cancels uncollected requests and notifies users when a supplier is soft-deleted (the Order and
Message Service calls are mocked). It exists to satisfy the CS3219 supplier-management
requirements, backlog items F6.1–F8.4 and NFR6.1/NFR7.1.

**Repo map** — where documents live. Code layout is in § Architecture. Paths are relative to
`supplier-service/` unless they start with `../`.

| Path | What lives there |
|---|---|
| `SupplierServiceArchitecture.md` | Team-decided architecture (tiers, schema DDL, API inventory, saga/outbox flows, §9 traceability and unresolved items). **Serves as the spec's architecture source (A2)** |
| `SupplierServiceSpec.md` | Phased implementation spec (Phases 0–5) mapping architecture sections to backlog items and GitHub issues #40–#46, #60, #61 |
| `../docs/superpowers/plans/` | Phase plans: `2026-09-28-supplier-service-phase-0.md`, `2026-09-28-…-phase-1.md`, `2026-09-29-…-phase-2.md`, `2026-09-29-…-phase-3.md`, `2026-09-30-…-phase-4.md`. The [Phase 5 plan](../docs/superpowers/plans/2026-09-30-supplier-service-phase-5.md) is present. D14 is historical. |
| `../docs/FoC-ProductBacklog.md` | Product backlog (requirement IDs cited by the spec) |
| `docs/project-state/done-ledger.md` | The Done ledger — every change, newest first |
| `../ai/usage-log.md`, `../README.md` (§ AI Use Summary / Log index) | Course-mandated AI disclosure log; **every supplier-service change gets an entry and an index row** |
| `AGENTS.md`, `../AGENTS.md` | Service and root AI-usage rules. Root rules bar the agent from requirements, architecture/design decisions and decision rationales |
| `openapi.yaml` | OpenAPI 3.0.3 description of every endpoint (uncommitted, D17) |
| `README.md` | Setup, endpoint table, background-worker and photo-store instructions |
| `src/` · `test/` | Source; tests mirror `src/` (moved 2026-09-29, C6). `test/seed/` is the seed-as-test (uncommitted) |
| `compose.photo-store.yaml` | Local MinIO for development — deliberately **not** in the root `compose.yaml` (C23) |
| `../compose.yaml` | Root compose: `supplier-db`, `supplier-redis`, `supplier-service`, `supplier-worker` |

---

## 2. How to Resume

```bash
# from the repo root
docker compose up -d supplier-db supplier-redis            # MySQL 8 (host 5436) + Redis
docker compose -f supplier-service/compose.photo-store.yaml up -d   # MinIO: S3 9000, console 9001

cd supplier-service
npm install --force          # plain `npm install` / `npm ci` fail: pre-existing peer conflict (D4)
npm run migrate              # applies src/db/init.sql (safe to re-run; creates `outbox`)
npm run migrate:phase2       # ONLY for a DB created before Phase 2 (D10)
npm run dev                  # API (compose maps it to host port 3004)
npm run worker:dev           # background worker (or: docker compose up -d supplier-worker)

npx vitest run               # default suite: 38 files / 343 tests at last full run (no Docker needed)
npx tsc --noEmit && npm run lint && npm run build
npm run test:minio           # needs MinIO running
npm run seed                 # seed-as-test: creates the 14 mock suppliers through the real creation service
```

The API fetches the User Service public keys from `GET /auth/.well-known/jwks.json` using
`USER_SERVICE_URL` and caches them for local RS256 verification. If no matching cached key is
available and the JWKS cannot be fetched, authentication fails with `401`. Earlier manual checks
used a local stub of the former `/auth/verify` endpoint (D9).

**Sessions in flight** — only sessions whose work has not fully landed are listed; sessions S1–S6
(the Phase 0–4 build sessions) landed entirely in git and the ledger, so their rows were pruned
(A5). IDs are never reused.

| Session | Started | Agent(s) | Branch | Workstream | Status | Doing | Last touched |
|---|---|---|---|---|---|---|---|
| S7 | 2026-09-30 | Claude Sonnet 5.5 | (historical) | W6 | Superseded | Phase 5 plan is present; see W6 for current status | 2026-11-04 |
| S8 | 2026-09-30 | Claude Sonnet 5.5 | supplier-service-ui-integration | W7 | Paused | Frontend integration; uncommitted files: Q5; seed run by operator: D13 | 2026-09-30 |
| S9 | 2026-10-01 | Claude Sonnet 5.5 | supplier-service-ui-integration | — | Active | Bootstrapped this file; next: operator review of A-entries and Q-list | 2026-10-01 |

---

## 3. Workstreams

One row per feature-level-or-larger unit of work. `Done` here means **implemented, committed and
passing the automated suite** (A4); it does not mean author-reviewed (Q3) or verified against the
real User Service (Q9). The spec calls the units "Phases" and orders them by build dependency, not
priority (C47).

| ID | Workstream | Status | Spec | Plan | Progress | Guide |
|---|---|---|---|---|---|---|
| W1 | Phase 0 — Foundations (scaffold, schema migration, auth/role/error/rate-limit middleware) | Done | [spec](SupplierServiceSpec.md) | [plan](../docs/superpowers/plans/2026-09-28-supplier-service-phase-0.md) | 11/11 tasks; MySQL/Redis smoke checks not run at the time (D5) | — |
| W2 | Phase 1 — Read APIs (list, detail, reference) | Done | [spec](SupplierServiceSpec.md) | [plan](../docs/superpowers/plans/2026-09-28-supplier-service-phase-1.md) | 9/9 tasks; live check passed 2026-09-29 (D9) | — |
| W3 | Phase 2 — Admin reads, lookup management, supplier create/reactivate, photo storage | Done | [spec](SupplierServiceSpec.md) | [plan](../docs/superpowers/plans/2026-09-29-supplier-service-phase-2.md) | 10/10 tasks; migrate:phase2 not run on the real DB (Q9) | — |
| W4 | Phase 3 — Admin update (`PUT`, version check, photo saga) | Done | [spec](SupplierServiceSpec.md) | [plan](../docs/superpowers/plans/2026-09-29-supplier-service-phase-3.md) | 9/9 tasks; live check not run at the time (D2, D6) | — |
| W5 | Phase 4 — Soft delete, transactional outbox, BullMQ worker, reactivation rework | Done | [spec](SupplierServiceSpec.md) | [plan](../docs/superpowers/plans/2026-09-30-supplier-service-phase-4.md) | 17/17 tasks; live check passed except in-flight shutdown (D11, D18) | — |
| W6 | Phase 5 — Hardening and verification (NFR6.1, NFR7.1, no-UI demo, cross-role demo) | Blocked — needs human | [spec](SupplierServiceSpec.md) | [plan](../docs/superpowers/plans/2026-09-30-supplier-service-phase-5.md) | Authorization tests and no-UI/cross-role suites run; response tests partial; local load targets missed (Q1) | — |
| W7 | OpenAPI description, seed-as-test, response ids (`location_id`, `faculty_id`, category ids) | In review | [architecture §7.3, §9 item 23](SupplierServiceArchitecture.md) | — | Ids committed (`05a0386`); openapi/seed uncommitted: Q5 | — |
| W8 | Supplier bookmarking — `ids` filter and `unavailable` array (bookmarks themselves live in the user-service) | In review | [spec](../docs/superpowers/specs/2026-11-05-supplier-bookmarking-design.md) | [plan](../docs/superpowers/plans/2026-11-05-supplier-bookmarking.md) | Tasks A1–C5 done; D1 browser check run (admin UI soft-delete path not run) | — |
| W9 | Supplier-Order-Service-Key access on `GET /suppliers/:id` and `GET /suppliers/reference/location`, for order-service's scheduled-errands worker | In review | [`../instructions.md`](../instructions.md) Stage 28 c1 | — | 444/444 tests pass; branch pushed, PR opened for Congchen's review, not merged | — |

Cross-project (not a supplier workstream): the **frontend** project's supplier screens call this
API — see D15 for what it exposed.

Status vocabulary, used verbatim: `Not started` · `Spec'd` · `Planned` · `Building` ·
`Blocked — needs human` · `In review` · `Done` · `Abandoned`

---

## 4. Architecture

**How the service is put together, area by area — the shape first, then the decisions that
produced it.** "Why / who asked" cells hold only reasons the team stated; anything else reads
"unknown — no record" (A7). Sources: **Arch** = `SupplierServiceArchitecture.md`, **Log** =
`../ai/usage-log.md`, **Chat** = the team's replies in the listed sessions (dates are the log
entry dates).

```text
SPA / frontend ──HTTPS──► API gateway (single origin) ──► Supplier Service  /api/v1
                                                            │  Presentation: routes, controllers, multer, middleware
User Service  ◄── GET JWKS ───────── auth middleware ◄─────┤  Business: services, photo plan, hours/is_open rules
                                                            │  Persistence: repositories (only layer that speaks SQL)
                       MySQL 8 ◄────────────────────────────┤
                       Redis  ◄── idempotency cache ────────┤
                       MinIO/S3 ◄── PhotoStorage port ──────┘
   write txn ─► `outbox` row ─► relay (1 s, BullMQ scheduler) ─► BullMQ queues ─► worker
                                     ├─ image_cleanup ─► PhotoStorage.delete
                                     └─ supplier_suspension ─► (mock) Order delete ─► (mock) Message notify
                                     failures ─► `dead_letter_jobs`
```

### 4.1 Layering, stack and API conventions

**Now:** Four tiers — presentation (Express controllers/routes, `multer`), business (services,
validation, photo plan), persistence (repository interfaces + MySQL implementations; business code
never sees SQL), database. All routes live under `/api/v1`. Tests mirror `src/` under `test/`;
`tsconfig.build.json` compiles `src/` only. The API is usable without the UI.

| ID | Date | Decision | Why / who asked | Source |
|---|---|---|---|---|
| C1 | 2026-09-27 | Four-tier layering (presentation, business, persistence, database) | Layers stay less coupled and can be replaced independently; a strict persistence interface mediates DB access, supporting database security | Arch §2 |
| C2 | 2026-09-28 | Single API gateway fronts all services, so the SPA and API share an origin and no CORS config is needed | Team-stated fact about the deployment; asked to be folded into the spec | Chat (architecture review); Arch §3, §9 item 18 |
| C3 | 2026-09-28 | Fixed stack TS / Node / Express / MySQL / Redis recorded in `AGENTS.md`; no other engine without a team decision | Asked by the team; reason unknown — no record. Client libraries `mysql2` and `ioredis` were proposed by the agent, not named by the team (A9) | Chat (architecture review); `AGENTS.md` |
| C4 | 2026-09-28 | All endpoints versioned under `/api/v1` | unknown — no record | Arch §7 |
| C5 | 2026-09-29 | `multer` parses multipart requests | "as that's the industry standard" | Chat (Phase 2) |
| C6 | 2026-09-29 | Move all tests into `test/` mirroring `src/` | Asked by the team; reason unknown — no record | Chat (Phase 2); Log |
| C7 | 2026-09-30 | Record every endpoint as an OpenAPI YAML, starting with the supplier service | Asked by the team while starting the real frontend integration; no further reason given | Chat (frontend); Log |
| C8 | 2026-09-29 | List queries: `limit` is always 50 and any other value is `422`; `sortOrder` A-Z (default) / Z-A; a page past the end is `200` with empty `data`; unknown id is `404`; `isOpen` is an optional filter; search covers name, location, category (not `supplier_desc`) | For the fixed limit: "there is no entrypoint for anyone to modify this. as such if it is modified, throwing in error is warranted". `supplier_desc` is excluded because "the description is not displayed in list results" (Arch §6.3). Others: unknown — no record | Chat (Phase 1); Arch §7.2 |
| C9 | 2026-09-30 | All API responses use `id`; every supplier response also carries `location_id`, `faculty_id` and `categories: [{category, category_id}]` | `id`: "just standardise to id in all api responses". Ids added so the admin edit form can refill without a second lookup (Arch §7.3); the team's own words gave no further reason | Chat (Phase 4; edit-form ids); Arch §9 item 23 |

### 4.2 Data model (MySQL)

**Now:** Nine tables — `faculties`, `supplier_locations`, `supplier`, `supplier_categories`,
`supplier_category_map`, `supplier_hours`, `supplier_photos`, `dead_letter_jobs`, `outbox` (DDL in
Arch §6.4, applied by `src/db/init.sql` via `npm run migrate`). A supplier is identified by
`(name, type, location_id)`; branches of one brand are separate rows at different locations.
`is_open` is never stored — it is computed from `supplier_hours` in Singapore time. There is no
supplier catalogue. Deletion is soft (`is_deleted`) for suppliers and hard-when-unreferenced for
lookups.

| ID | Date | Decision | Why / who asked | Source |
|---|---|---|---|---|
| C10 | 2026-09-27 | MySQL as the database | Fixed, highly structured fields; explicit relationships between suppliers, locations, categories, hours and photos; little benefit from NoSQL; data changes infrequently and is read-mostly, so a lightweight MySQL is preferred over a heavier PostgreSQL | Arch §6.1 |
| C11 | 2026-09-28 | `UNIQUE(supplier_name, supplier_type, location_id)` enforced by an application pre-check **and** the DB constraint, across all rows including soft-deleted | Asked by the team ("backend will also verify…"); reason beyond F8.2.2 not stated | Chat (architecture review); Arch §6.2 |
| C12 | 2026-09-28 | A `POST` matching a soft-deleted supplier reactivates that row instead of inserting; submitted photos replace the old ones | Keeps the same `supplier_id` and history and satisfies the `UNIQUE` key "without needing to exclude soft-deleted rows"; the team called it an unlikely case | Chat (architecture review); Arch §6.2, §9 item 18 |
| C13 | 2026-09-29 | Reactivation returns `200`, sets `is_active` true (old value overridden), replaces stored fields, bumps `updated_on` **and** `version` | "if its added back, it should be activated. Old is_active state overriden"; the team asked for a rationale and the agent could not write one (AGENTS.md §2) — the team's own is not recorded | Chat (Phase 2) |
| C14 | 2026-09-28 | `is_active` (admin visibility toggle, set via `PUT`) and `is_deleted` (set by `DELETE`) are independent; either hides a supplier from users | "if an item is soft deleted, it is also no longer visible and theres no need for the is_active state to be uppdated" | Chat (architecture review); Arch §6.2 |
| C15 | 2026-09-28 | `supplier_id` is a stable cross-service reference (never renumbered or hard-deleted) | Satisfies F8.3.2 (history preserved) without any change in this service | Chat (architecture review); Spec Phase 3 |
| C16 | 2026-09-29 | Lookup rows (`faculties`, `supplier_locations`, `supplier_categories`) are **hard**-deleted, only when unreferenced (references from soft-deleted suppliers count); FKs use `ON DELETE RESTRICT`; blocked delete `422`, unknown id `404`, success `200`. **Reverses** an earlier same-day decision to soft-delete lookups | "fields only associated with soft-deleted suppliers cannot be deleted as well." | Chat (Phase 2); Arch §6.2 |
| C17 | 2026-09-29 | Hours: `day_of_week` 1 (Mon)–7 (Sun) plus reserved `8` = open 24/7, valid only with `is_24h` true and `00:00`–`23:59`; a Facility or 24/7 Store has exactly one day-8 row; Facility hours are server-filled; a Store 24 h on some days uses `00:00`–`23:59` rows with `is_24h` false; equal open/close times → `422` telling the client to use `00:00`–`23:59`; responses carry no `is24h` field but create requests do | "This allow for some stores to open 24h only on some days of the week"; no `is24h` in responses because it "can be derived from day=8" and "ensures consistency in response shape"; Facility text is shown by the frontend | Chat (Phases 1–2); Arch §6.2 |
| C18 | 2026-09-29 | `is_open`: day-8 entry ⇒ true first; a `00:00`–`23:59` row for today ⇒ true; overnight intervals wrap; Singapore time; `is_24h` is `BOOLEAN NOT NULL DEFAULT FALSE` | Confirmed by the team ("confirm is_24h is a boolean not null default false"); other parts unknown — no record | Chat (Phases 1–2); Arch §6.2 |
| C19 | 2026-09-27 | All timestamps (`created_on`, `updated_on`, `is_open`) use Singapore time (UTC+8) only | unknown — no record | Arch §9 item 11 |
| C20 | 2026-09-27 | `supplier.version` is an optimistic-concurrency counter; stale `PUT` → `409` | unknown — no record (stated as "guards concurrent edits") | Arch §6.2, §7.5 |
| C21 | 2026-09-29 | `display_order` starts at 0 and follows the admin's arrangement in the UI before submission | Team decision; no reason recorded | Chat (Phase 2) |

### 4.3 Identity and access control

**Now:** API requests pass `authenticate`, which verifies an RS256 bearer token locally using
the cached User Service JWKS and attaches `{user_id, role}`; missing or invalid tokens receive
`401`. Protected routes then apply `requireRole` as appropriate. Roles are
`user`, `admin`, `super admin` (with a space). `user` may call only the read and reference GETs;
`admin` and `super admin` have identical supplier capabilities; anything else ⇒ `403`. Enforcement
is in the backend, not the UI. Rate limit 30 requests/min/IP ⇒ `429`.

| ID | Date | Decision | Why / who asked | Source |
|---|---|---|---|---|
| C22 | 2026-09-27 | Historical contract (RS256 JWT, `GET /auth/verify`; superseded by cached JWKS verification in Arch §7); `admin`/`super admin` identical here; `super admin`'s extras belong to the User Service | unknown — no record | Arch §7, §9 items 3, 12 |
| C23 | 2026-09-28 | The role literal is `super admin` (space), matching the User Service's `role_enum`; the Supplier docs and Phase 0 plan were changed to match | "follow super admin with space" — the team chose to adopt the User Service's existing string rather than change that service | Chat (architecture review); Arch §9 item 19 |
| C24 | 2026-09-27 | Rate limit fixed at 30 requests/minute/IP for all endpoints | unknown — no record. Reviewed and left unchanged 2026-09-30 when the frontend hit it (D15) | Arch §7.5 |

### 4.4 Photo storage

**Now:** `PhotoStorage` port (`upload`, `update`, `delete`, `view`); business/persistence code uses
no provider SDK. The adapter uses `@aws-sdk/client-s3`, against local MinIO in development and
tests (`compose.photo-store.yaml`, bucket `supplier-photos`, anonymous read). The storage returns a
location that is stored directly in `supplier_photos.photo_location`. Limits: 0–10 JPEG/PNG files,
≤5 MB each. `view()` returns the stored location unchanged (D16).

| ID | Date | Decision | Why / who asked | Source |
|---|---|---|---|---|
| C25 | 2026-09-29 | Provider-agnostic storage interface: upload, update, delete, view | "The cloud provider is not decided yet… so the provider can be swapped out easily" (AWS S3 vs Google Cloud Storage undecided) | Chat (Phase 2); Arch §8.2 |
| C26 | 2026-09-29 | Local development and tests use MinIO to simulate the cloud, replacing an earlier plan for a local MySQL photo table; MinIO returns the location directly | "would allow perfect simulation". The MySQL variant was dropped when this was chosen | Chat (Phase 2) |
| C27 | 2026-09-29 | The photo-store compose file lives in `supplier-service/`, **not** the root `compose.yaml` | "as this is not used in deployment" | Chat (Phase 2) |
| C28 | 2026-09-29 | Use the AWS S3 client library for the MinIO adapter | Team named it; MinIO is S3-compatible (the reason is the agent's, not the team's) | Chat (Phase 2); Spec Phase 2 |
| C29 | 2026-09-29 | MinIO is used for tests of real cloud-connection logic; the in-memory fake only for pure business logic; MinIO tests are `*.minio.test.ts`, run by `npm run test:minio` and never silently skipped | The team's rule: "minio should be used when testing actual cloud connection logic" | Chat (Phase 2) |
| C30 | 2026-09-27 | Edit/create saga: upload new photos → MySQL transaction → on failure delete the new objects (`500`) → excluded-photo cleanup after commit | Existing objects are not deleted before the commit; further reason unknown — no record | Arch §8.2 |
| C31 | 2026-09-29 | Create response returns photos as `photoId`/`photoLocation` only | "Actual photo binary is only sent during photo uploads/edits." | Chat (Phase 2) |
| C32 | 2026-09-30 | `PUT` photo wire format: `isPhotoDirty`, `photo_ids` (JSON array — numbers = existing ids, strings = placeholders), `placeholder_ids`, files matched by index; placeholders kept | The team first said "i do not need placeholders, since the cloud save will have to run first and return the actual photo_id", then chose "follow original plan" (Arch §8.2) | Chat (Phase 3) |
| C33 | 2026-09-27 | `photoLocation` is intended to be a provider-signed URL valid 24 h — **not yet available or confirmed** | Storage provider undecided | Arch §6.3, §9 item 20(g) |

### 4.5 Background processing (outbox, relay, worker)

**Now:** Any write that needs a background task inserts `outbox(id, task_name, payload, version)`
rows in the same MySQL transaction (`version` = the supplier's new version). A relay in the worker,
driven by a BullMQ job scheduler every second, reads rows `ORDER BY version, id`, adds each to
BullMQ (job id `outbox-<id>`, name = `task_name`, data = `payload`) and deletes the row after a
successful add. Queues: `queue:image:cleanup` (`image_cleanup`, payload `{photo_id, photo_location}`),
`queue:supplier:suspension` (`supplier_suspension`, payload `{supplier_id}` → mock Order delete then
mock Message notify), relay `queue:outbox:relay`; queue keys map to BullMQ as prefix + name split at
the last colon. Retries are BullMQ delayed jobs (max 5 attempts; 5 s / 25 s / 125 s / 625 s); a bad
job or unroutable row, or one that exhausts retries, is written to `dead_letter_jobs`. The worker is
a separate process (`npm run worker`) and container (`supplier-worker`), stops taking jobs on the
standard shutdown signals and lets the active job finish. **The API no longer needs Redis for jobs.**

| ID | Date | Decision | Why / who asked | Source |
|---|---|---|---|---|
| C34 | 2026-09-30 | `DELETE /admin/suppliers/:id` returns `200 {id, isDeleted: true}` (`404` unknown/already deleted), bumps `updated_on` and `version`, leaves `is_active` alone; the response follows the commit and does not wait for the worker | "just standardise to id in all api responses"; "deletion will bump updated_on and version too" | Chat (Phase 4) |
| C35 | 2026-09-30 | Retries happen as BullMQ delayed jobs, not inside the worker; delays 5 s/25 s/125 s/625 s; bad jobs go straight to the dead letter | "a queue will be maintained with timestamps to signal when the task should be tried again, freeing the worker for other tasks. Use the BullMQ library" | Chat (Phase 4) |
| C36 | 2026-09-30 | Transactional outbox: enqueue only after commit via the outbox table; **all** enqueues (suspension, excluded-photo cleanup from `PUT` and reactivation) go through it. Supersedes an earlier "commit only after the Redis enqueue" reading and the Phase 3 producer-only `LPUSH` design | The earlier reading was chosen so "redis enqueue issues [can] be captured and prevent the deletion from happening so the user can retry"; the outbox was then requested by the team (reason for switching not recorded) | Chat (Phase 4) |
| C37 | 2026-09-30 | Outbox columns: autoincrement `id`, `task_name`, `payload`, `version` = the supplier version | "autoincrement id (for worker to know order, and for deletion)… version (version 1 processed before 2)"; version is the supplier's "so that multiple tasks for the same supplier will be guaranteed to be executed in the intended order" | Chat (Phase 4) |
| C38 | 2026-09-30 | The relay is a BullMQ job scheduler inside the worker, every second; **ordering is enqueue order only** (not a per-supplier execution-order guarantee) | "stick with enqueue order only." | Chat (Phase 4) |
| C39 | 2026-09-30 | One suspension job on `queue:supplier:suspension` does the Order delete then the Message notify; Order/Message are ports with logging mocks (env switch `MOCK_DOWNSTREAM_FAILURE` forces failure) until those services exist | Team choice among options offered; reason unknown — no record | Chat (Phase 4); Arch §9 items 5, 17 |
| C40 | 2026-09-30 | The worker runs as a dedicated container even in development; standard shutdown signals, last job finishes | "Add in the dedicated container config that runs the workers, even for development" | Chat (Phase 4) |
| C41 | 2026-09-30 | `PHOTO_STORE_ENDPOINT` is `http://host.docker.internal:9000` in development, the same string in the API and worker | "using docker's host.docker.internal:9000 for internal development should mitigate this issue" (the worker rejecting locations with a different prefix) | Chat (Phase 4) |
| C42 | 2026-09-30 | Reactivation = restore `is_deleted=false`, `is_active=true`, then handle detail/photo changes through the normal edit cycle, all in one transaction; new photos replace the old, none submitted leaves them, `version` bumped once | The team specified the flow; the edit is attempted before the flags commit | Chat (Phase 4) |

### 4.6 API policies (idempotency, concurrency, errors, PUT semantics)

**Now:** `POST /admin/suppliers` requires an `Idempotency-Key` (UUID); the first response is cached
in Redis per user and key (60 s in-flight marker → `409` on concurrent replay; 24 h cached result
replayed). `PUT` and `DELETE` are idempotent by design; `PUT` needs the current `version`. Errors use
one envelope (`status_code`, `error`, `message`, `timestamp`, `details[]`). `PUT` accepts the create
fields plus `isActive`; sent `category_id`/`openingHours` replace the whole set.

| ID | Date | Decision | Why / who asked | Source |
|---|---|---|---|---|
| C43 | 2026-09-29 | `Idempotency-Key` mandatory (`400` if missing); 60 s in-flight TTL, 24 h response TTL; cached per user and per key | "for maximum security" (per-user keying) | Chat (Phase 2) |
| C44 | 2026-09-30 | `PUT` fields = create fields + `isActive`; identity collision with another supplier ⇒ `422`, on a soft-deleted supplier ⇒ `404`; a `PUT` with only `version` ⇒ `422`; files sent while `isPhotoDirty` is false ⇒ `422`; error precedence 404 → 409 (before any upload) → 422 → upload `500`; changing `type` re-derives hours | Team answers to multiple-choice questions; reasons unknown — no record | Chat (Phase 3) |
| C45 | 2026-09-30 | One cleanup job per excluded photo; Redis key `queue:image:cleanup`, task `image_cleanup` (given by the team) | Team decision; no reason recorded | Chat (Phase 3) |
| C46 | 2026-09-27 | Fixed error envelope and status set (`200/201/204/400/401/403/404/409/422/429/500`); per-endpoint `message`/`details` wording is **left for the team** (§7.1.1 template) | Unfilled by design — see Q1 | Arch §7.1, §7.1.1 |

---

## 5. Conventions

Rules every change must honour. Breaking one is a bug even if the tests pass.

- **Root `AGENTS.md` governs:** agents implement decided work only. Anything that adds/changes a
  table, column, route, request/response shape, status code, library or pattern, or chooses
  between security/performance options, needs a recorded team decision first — ask, do not fill
  gaps with "sensible defaults". Never draft decision rationales.
- **Disclosure on every AI-touched file:** header (`AI Assistance Disclosure`) at the top (appended
  dated `Scope`/`Author review` pair on later edits); `Author review:` is left blank by the agent
  and signed only by a human; files that cannot carry comments (`package.json`, lockfiles) are
  listed in the log entry. Every finished task appends one entry to `../ai/usage-log.md` **and**
  one row to the Log index in `../README.md`.
- **Persistence boundary:** SQL lives only in `src/persistence/`; business code depends on the
  repository interfaces.
- **Time:** all stored and computed times are Singapore time (UTC+8).
- **Tests mirror `src/` under `test/`;** unit tests use mocked pools; only `*.minio.test.ts` and
  the seed test touch real infrastructure.
- **Photo endpoint string** must be identical in the API and the worker (C41).
- **Line endings:** working copies of some files are CRLF; do not rewrite endings of existing files.
- **ID namespaces:** `W` = workstream, `C` = decision, `D` = deviation, `Q` = needs a human,
  `S` = session, `A` = bootstrap assumption. Numbers unique across the file, never reused. (`A` is
  an addition to the skill's namespaces — D-level entries would have buried them.)

---

## 6. Known Gaps & Accepted Limitations

These are decisions or accepted limits, **not a TODO list**. If one looks wrong, raise it in
§ Needs a Human; if asked to change one, confirm first: keep, or reverse and record the reversal.

- **Storage provider undecided (AWS S3 vs Google Cloud Storage)** and **24 h signed URLs not
  confirmed** — the service returns the stored location as is, and photos load only because the
  dev bucket allows anonymous download (C33, D16).
- **Order Service / Message Service contracts are mocked** by logging adapters; the mocks are not
  idempotent against a real downstream (Log, Phase 4). Deliberately deferred until those services
  exist (Arch §9 items 5, 17).
- **Health-check endpoints are deferred** and out of scope (Arch §7.5).
- **Execution order is not guaranteed** — only enqueue order; a job in a retry delay lets later
  jobs run first (C38). Strict per-supplier ordering would need more machinery and is not planned.
- **The outbox grows while the worker is down and is unbounded** — deliberate; no cap or alert
  (Phase 4 plan reading 8).
- **Several worker replicas could reorder enqueues**; compose runs exactly one (Phase 4 plan).
- **Failed BullMQ jobs are kept in Redis** so a job whose dead-letter insert failed can be recovered
  by hand; `dead_letter_jobs` is the visibility record.
- **No supplier catalogue, no per-branch entity beyond `(name, type, location)`** — kept out to stay
  focused on FoC supplier information (course brief).
- **Lookup rows cannot be soft-deleted** (C16).
- **Rate limit is per IP** — users behind one address share the 30/min budget (C24; D15).
- **Existing behaviours observed and deliberately not changed:** `POST` returns a silent `500`
  "Supplier could not be saved." on a schema mismatch (D10); the API logs ioredis "Unhandled error
  event" while Redis is down; stalled BullMQ jobs never reach `dead_letter_jobs`; shutdown signals
  received during worker start-up use Node's default exit (Phase 4 final review).
- **Explicitly out of scope:** UI implementation and responsive behaviour (the `frontend` project),
  User Service admin management (`super admin`'s extra powers), OAuth/login mechanics, storage
  provider deletion/availability behaviour (Arch §8.2).

---

## 7. Needs a Human

| ID | What is needed | What it blocks | Raised |
|---|---|---|---|
| Q1 | Review the missed local NFR7.1 run and decide the next test environment and whether query/index changes are allowed. Response wording, test targets, k6/MySQL setup, Vitest format, stub tokens and transcript handling have been supplied. | W6 performance acceptance; DB-dependent response-message verification also remains incomplete | 2026-11-04 |
| Q2 | Decide whether a queued `supplier_suspension` job should still run after the supplier is reactivated (final Phase 4 review, finding I1) — design decision, not implemented | Nothing blocks; the behaviour exists today | 2026-09-30 |
| Q3 | Sign `Author review` on files, header pairs and log entries still blank — the Phase 3 and Phase 4 log entries (and their file headers), the OpenAPI/seed/frontend entries, and anything from 2026-09-30 onward | Course disclosure compliance, not builds | 2026-10-01 |
| Q4 | Decide how the phase branches reach `main` (none of `supplier-phase-1…4` or the current branch is in `main`; 82 commits ahead) | Merge/PR; other services already on `main` | 2026-10-01 |
| Q5 | Commit or discard the uncommitted files: `openapi.yaml`, `test/seed/`, `vitest.seed.config.ts`, `package.json` (seed script), `vitest.config.ts`, `README.md`, `../README.md`, `../ai/usage-log.md`, `../frontend/` | Clean history; W7 leaving `In review` | 2026-10-01 |
| Q6 | Resolved: the [Phase 5 plan](../docs/superpowers/plans/2026-09-30-supplier-service-phase-5.md) is present. D14 records the earlier state. | None | 2026-11-04 |
| Q7 | Fix or accept the `vitest` vs `@types/node` peer conflict that breaks plain `npm install` / `npm ci` (CI and other machines) | CI; fresh installs (D4) | 2026-09-29 |
| Q8 | Run `npm run migrate:phase2` on the real `supplier_service` database if it predates Phase 2 (its 15 hours rows include Sunday=0 rows), and confirm it ran; record the seed outcome (operator reported `npm run seed` succeeded 2026-09-30) | Correct `is_open` and creates on that DB (D10) | 2026-09-29 |
| Q9 | Verify the flows against the **real** User Service token (Phases 2–4 used a stub; Phase 1 used a real token) and log in with a real admin in the browser | Evidence for course requirement 4 | 2026-09-30 |
| Q10 | Provide evidence of the UI on desktop and mobile viewports with live data; none is recorded in any session read | Course requirement 5 | 2026-10-01 |
| Q11 | Confirm the bootstrap: review § Assumptions and each `unknown — no record` cell, and supply the missing rationales in your own words | Accuracy of § Architecture | 2026-10-01 |
| Q12 | Confirm whether the instruction "Do not log this sessions" covers this bootstrap request, since `AGENTS.md` §5.2 otherwise requires a log entry and README index row for AI-influenced files (this file and the skill copy have headers but no log entry) | Compliance of this change | 2026-10-01 |

---

## 8. Decisions & Context

Decisions that do **not** shape the architecture — process, priorities, scope, tooling.

| ID | Date | Decision | Why / who asked | Source |
|---|---|---|---|---|
| C47 | 2026-09-28 | Phases are ordered by technical build dependency, not sprint priority; the backlog's Priority/Planned Week columns stay authoritative | Stated in the spec | Spec intro |
| C48 | 2026-09-28→30 | Each phase is executed on its own branch (`supplier-phase-1`…`4`) by subagent-driven development | Team instruction for Phases 1–4; reason unknown — no record | Chat (Phases 1–4) |
| C49 | 2026-09-29 | Reviewer subagents are skipped for small, contained edits (asked for Phases 1 and 2); Phase 3 used one combined spec+quality reviewer per task; Phase 4 used spec and quality reviewers per task plus a whole-branch final review | Team instruction to save effort on simple tasks; details in D12 | Chat (Phases 1–4) |
| C50 | 2026-09-28 | Where a design question is unrecorded the agent stops and asks (root `AGENTS.md` §2.1); the team answered these as multiple-choice or free-text chat answers, which are the "sources" cited above | Course AI policy | `../AGENTS.md` |
| C51 | 2026-09-30 | Build the real frontend as a copy of `foc-mockup/` named `frontend/`, wired to services through their APIs; supplier data first from the compose `supplier-db`; seed by replaying the creation process as a test | The team wanted the frontend to reference real supplier data; frontend auth = real login, access token in memory, refresh cookie carries the session | Chat (frontend); Log |
| C52 | 2026-10-01 | Treat each service as its own project with its own `PROJECT_STATE.md` under the `maintaining-project-state` skill copied from the SnoozeShare repo | Team instruction (this session) | This bootstrap |
| C53 | 2026-11-05 | `GET /api/v1/suppliers` accepts `ids` (up to 20 comma-separated ids) and then also returns `unavailable: [{id, status: hidden\|deleted\|invalid}]`; the service never calls the user-service | Asked by the team in chat (2026-11-05); reason not recorded | Chat (supplier bookmarking); spec B8–B12, B15 |
| C54 | 2026-11-09 | `GET /suppliers/:id` and `GET /suppliers/reference/location` accept header `Supplier-Order-Service-Key` (secret `SUPPLIER_ORDER_SERVICE_API_KEY`) as an alternative to a user JWT, on those two routes only; constant-time compare; wrong key with no valid JWT → `401` `{error: "INVALID_SERVICE_KEY"}` (the service's envelope has no `code` field, so the code goes in `error` — the team chose this over putting it in `message`); a valid JWT still wins when both are sent | Fully specified by order-service's team in `instructions.md` Stage 28 c1, for the scheduled-errands worker's fire-time supplier/location checks | `../instructions.md` Stage 28 c1 |

---

## 9. Deviations & Discoveries

Newest first. Where reality diverged from a spec/plan, plus traps found the hard way.

### D19 — Two PROJECT_STATE conventions differ from the skill (this bootstrap)
The skill assumes one file at the repo root; here it lives at `supplier-service/PROJECT_STATE.md`
with the ledger at `supplier-service/docs/project-state/done-ledger.md`, and there is no
`docs/superpowers/specs/` — the Architecture and Spec documents play the spec's role (A1, A2). The
skill's `SKILL.md` gained a "Monorepo Adaptation" section. Consequence: reconcile links with
`../docs/superpowers/plans/`, not a service-local `docs/superpowers/`.

### D18 — Phase 4 final review findings left for the team
Recorded, not fixed: **I1** a suspension job can run after reactivation (Q2); **I2** contract test
tying builder payloads to handler schemas — a follow-up test was assigned but the session hit a usage
limit before finishing (its commit is not in the log; verify before relying on it); **M1** a
reactivation `POST` can now return `409` in a narrow race instead of `422`; **M2** `updateSupplier`
still returns an unused `{removedPhotos}`; **M3** queue constants split over two files; **M4** stalled
jobs never dead-lettered; **M5** signals during worker start-up not handled; **M6** dev photo-store
credentials as compose defaults. Consequence: none block; M1/M4 change behaviour and need a decision.

### D17 — OpenAPI, seed test and frontend files are uncommitted
`openapi.yaml`, `test/seed/`, `vitest.seed.config.ts`, the `seed` script and `frontend/` exist only
in the working tree (Q5). The OpenAPI file "follows the code" where docs and code differ (category
management uses `category_type`). Seed values are placeholders, not team data: `type` Store,
`level` 1, identical hours every day; `.webp` images skipped (API accepts JPEG/PNG only); three
referenced images do not exist so those suppliers have no photo.

### D16 — `view()` returns the stored location unchanged
Architecture §8.2 says `photoLocation` is a signed URL valid 24 h. The adapter returns the stored
location as is; images load only because the dev bucket allows anonymous download. Consequence: do
not assume expiry semantics until the provider is chosen (C33).

### D15 — Frontend integration exposed a request flood and a lost role (2026-09-30)
A dependency-list bug re-ran the landing list request in a loop (216 requests in 3 s), tripping the
30/min limit ("unable to load", then "rate limit exceeded"); a reload lost the admin role because
`GET /users/me` returned only `{username, email}` — at the time session restore also called
`GET /auth/verify` (that endpoint has since been removed).
The rate limit was **not** changed (C24). Other frontend notes: location and category filters are
single-choice (the API accepts one of each); the request screens still use mock supplier ids 1–14
that do not match database ids; the real successful login, supplier list/detail and admin flows were
not verified in a browser by the agent (only stubbed-network checks). Owned by the `frontend`
project.

### D14 — Phase 5 plan file is missing
The Phase 5 planning session reported writing
`docs/superpowers/plans/2026-09-30-supplier-service-phase-5.md` (Task 1 ready, Tasks 2–5 blocked),
and did not log it. It is not in the working tree or in any branch's history (`git log --all`
finds only a stash index of `supplier-phase-4`). Consequence: the Phase 5 task breakdown exists only
in that session's transcript; Q6.

### D13 — Seed against the real database hung on `host.docker.internal`
The Windows hosts entry for `host.docker.internal` pointed at a stale LAN address (192.168.10.102),
so uploads to `http://host.docker.internal:9000` hung. The seed passed against a throwaway database
with `PHOTO_STORE_ENDPOINT=http://localhost:9000`. The operator then reported running `npm run seed`
successfully (2026-09-30); how the hosts entry was fixed is not recorded. Suggested (not applied)
fix: map the name to `127.0.0.1`. Consequence: rows stored with a `localhost:9000` prefix cannot be
deleted by the worker (it rejects other prefixes).

### D12 — Review depth varied by phase
Phase 0: reviewers skipped for Tasks 7–10 (implementer reports plus the passing suite backed them).
Phase 1: reviewers skipped for all tasks (team instruction). Phase 2: one reviewer, on the create/
reactivate workflow (found reactivation not replacing the name; fixed in `8541efb`). Phase 3: one
combined spec+quality reviewer per task, all approved. Phase 4: spec and quality reviewers per task and
a final whole-branch review. Consequence: Phases 0–2 have weaker independent review than 3–4.

### D11 — Worker shutdown verified only while idle; nodemon sends SIGINT
With the worker idle `docker stop` finished in about 3 s ("Received SIGINT…", exit 143). The
`--signal SIGTERM` flag on `worker:dev` did not change which signal reached the process. Stopping
**during** an in-flight job was not tested (mock handlers finish in ~1 ms).

### D10 — A database created before Phase 2 needs `migrate:phase2`
The old `supplier_hours` (no `is_24h`, day check 0–6) made `POST /admin/suppliers` fail with a
silent `500` and nothing in the log. Fix: `npm run migrate:phase2` (adds `is_24h`, converts Sunday 0
→ 7, widens the check to 1–8; safe to re-run). It also changed 5 pre-existing suppliers' days during
the Phase 4 live check. `init.sql` uses `CREATE TABLE IF NOT EXISTS`, so `npm run migrate` alone will
not repair old tables.

### D9 — Live verification was against stubs in Phases 2–4
Phase 1 was verified live with a real User Service token (the User Service itself needed a
`SUPER_ADMIN_PASSWORD` and an RS256 keypair — local, git-ignored fixes). Phases 2 and 4 used a local
stub of `GET /auth/verify` on port 4999; Phase 3 had no live run (no MySQL container then). Mock-only
tests cover the real MySQL photo reorder (`+1000000` offset vs `UNIQUE(supplier_id, display_order)`).

### D8 — Phase 1 needed compose wiring the plan did not include
There was no `supplier-db`/`supplier-service` in `../compose.yaml`. Added on request: `supplier-db`
(MySQL 8, host 5436, seeded from `init.sql`), `supplier-redis` (not exposed), `supplier-service` (host
3004; no healthcheck since health checks are deferred), later `supplier-worker`. Root `.env.example`
gained `SUPPLIER_SERVICE_PORT`, `SUPPLIER_DB_PORT`, `SUPPLIER_DB_PASSWORD`.

### D7 — MinIO images pulled from `quay.io`
`minio/minio` and `minio/mc` would not pull on the dev machine, so `compose.photo-store.yaml` uses
`quay.io/minio/minio` and `quay.io/minio/mc`, unpinned.

### D6 — Enqueue-after-commit `500` (Phase 3) — superseded
Phase 3 enqueued cleanup jobs after the commit, so an enqueue failure returned `500` with the edit
already saved (no rollback). The team said "follow original plan". Phase 4's outbox removed this path
(C36); the Phase 3 `jobQueue.ts`/`photoDeletionJob.ts` producer is no longer used by the API.

### D5 — Phase 0 smoke checks and small fixes
MySQL migration and Redis `PING` were not run when Phase 0 finished. `ioredis` was imported by its
named export (`Redis`) to clear a `tsc` error; `lazyConnect: true` was added; `vitest.config.ts`
supplies test env values (from `.env.example`) because `config.ts` exits the process on missing vars;
the rate-limit test sets `trust proxy` so the `X-Forwarded-For` case is meaningful; the plan's
`authenticate.ts` snippet had a type error and an unused variable, fixed.

### D4 — Dependency installs need `--force`
`vitest@5.0.2` has an optional peer on `@types/node ^22 || >=24` while the tree has `@types/node 20`,
so plain `npm install` and `npm ci` fail with `ERESOLVE`. `--legacy-peer-deps` stripped `vite`; `--force`
gave an additive lockfile diff. New packages (multer, `@aws-sdk/client-s3`, bullmq 6.3.10) were installed
with `--force`. The Docker build of `supplier-worker` still succeeded. Q7.

### D3 — Test layout change dropped two stale tests
Moving tests to `test/` changed the default suite from 26 files / 210 tests to 24 / 204: the old
pattern had also run two stale compiled tests under `dist/`. Nothing was lost from `src`. Two
test-only helpers (`minioTestStorage.ts`, `inMemoryPhotoStorage.ts`) moved to `test/storage/`. A
`git stash -u` briefly stashed an untracked plan file and was restored immediately. Plan documents
still cite the old `src/...test.ts` paths.

### D2 — Overlapping edits by two sessions (2026-09-29)
Another session concurrently reversed soft delete for suppliers too (and edited the backlog, `init.sql`
and repository code); this session's script may have overwritten its doc edits. The team ruled that
the Phase 2 session was the source of truth — suppliers keep soft delete and reactivation. The other
session's uncommitted changes to five files were restored by the operator. Its earlier log entry and
index row remain in the append-only log and are stale ("soft delete reversed").

### D1 — Architecture text that predates later decisions
`SupplierServiceArchitecture.md` §7.1.1 still says `DELETE` "can return 204" though `200` is recorded;
§6.2's `dead_letter_jobs` row still says "Redis background jobs"; §9 items 17 and 20 describe the
pre-outbox flow (item 8/22 note the change). The Phase 0 plan's headers were also observed rewritten
(`Tool name (model: )`, `Author review: Congchen`) by something other than the agent that day — not
investigated. Consequence: trust § Architecture above for the enqueue flow and confirm with Q11.

### Assumptions made while bootstrapping (A-entries)

- **A1** Each FoC service (`user`, `supplier`, `credit`, `order`, `frontend`) is its own project; this
  file, the ledger and the skill's paths are scoped to `supplier-service/`. Only this file was
  bootstrapped (the request named supplier-service); the other four are untouched.
- **A2** There is no `docs/superpowers/specs/` in this repo; `SupplierServiceArchitecture.md` and
  `SupplierServiceSpec.md` are treated as the spec, and the Workstreams table links them.
- **A3** A "workstream" is one spec Phase (0–5) plus the OpenAPI/seed/response-id work; the spec's
  phase numbers were kept, IDs `W1`–`W7` shifted by one.
- **A4** `Done` = implemented, committed, and passing the automated suite at the time; not
  author-reviewed and, for Phases 2–4, not verified against the real User Service. The Guide column is
  `—` because the `update-documentation` skill is not present.
- **A5** The ledger is backfilled at phase granularity (skill's rule), with commit ranges; session rows
  S1–S6 were pruned because their work is fully in git and the ledger. Session IDs were assigned in
  chronological order: S1 Phase 0, S2 architecture review, S3 Phase 1, S4 Phase 2, S5 Phase 3, S6
  Phase 4, S7 Phase 5 planning, S8 frontend integration, S9 this session.
- **A6** "Current branch" is `supplier-service-ui-integration`; the `supplier-phase-N` branches are
  treated as its ancestors because `git log` on it contains their commits and `main` does not.
- **A7** A reason is recorded only where the team (the user) wrote it in chat, in `ai/usage-log.md`,
  or in the architecture document. Everything else reads "unknown — no record"; no rationale was
  drafted (root `AGENTS.md` §2, skill bootstrap rule). Quoted phrases are the team's own words.
- **A8** Source coverage: read in full — Phase 0 session, `ai/usage-log.md` entries for 2026-09-28 to
  2026-09-30, the five phase plans' decision tables, the Architecture and Spec documents, the Phase 4
  prompts file. Read partly (later ranges, first-hand for the user's messages where visible): Phase 1,
  2, 3, 4 sessions; "Microservices integration with frontend"; "SupplierServiceArchitecture review"
  (its earliest ~370 messages, where the 2026-09-27 architecture was iterated, were **not** read, so
  C1, C10, C19, C20, C22, C24, C30, C46 rest on the document alone); Phase 5 planning (read). Not
  read: other repos' sessions except the SnoozeShare skill files and one sample of its
  `PROJECT_STATE.md`; the user/credit/order/frontend sessions.
- **A9** Library names not stated by the team (`mysql2`, `ioredis`, `zod`, `supertest`) were chosen by
  the agent in the Phase 0 plan and are listed in the plan as needing team confirmation; there is no
  record that the team confirmed them individually beyond accepting the plan.
- **A10** Dates are taken from log entries and commit dates (Singapore time); session start times
  are approximate and time-of-day is not recorded ("Started" shows a date only).
- **A11** Test counts (343 in 38 files) are from the last full runs reported in the Phase 4 and
  post-Phase 4 log entries; they were **not** re-run while bootstrapping (no commands beyond reading
  and copying were executed).
- **A12** Decision IDs `C1`–`C52` were assigned in this bootstrap, grouped by architecture area
  (not by date); the numbering carries no meaning beyond uniqueness.
- **A13** The 2026-09-27 dates on C1, C10, C19, C20, C22, C24, C30, C33, C46 are the date of the
  architecture commit `20cc6a0` (the design date within it is not recorded).
- **A14** The instruction "Do not log this sessions" was taken to apply to the earlier summary
  request; whether it applies to this bootstrap is Q12. No log entry or README index row has been
  added for this session.

---

## 10. Record

The Done ledger lives in **[`docs/project-state/done-ledger.md`](docs/project-state/done-ledger.md)**
— every change, big or small, newest first (backfilled at phase granularity, A5).

- **Latest entry:** 2026-10-01
- **Entries:** 12

Deviations stay in § Deviations above: those are read every session.
