<!--
AI Assistance Disclosure:
Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
Scope: Documented the Phase 0 scaffold's setup/run instructions (SupplierServiceSpec.md, "Phase 0 —
       Foundations"). No requirements, architecture, schema, or API decisions were made by the AI
       tool.
Author review: Congchen
Scope: 2026-09-29 update — added the Phase 1 requester-mode API section (SupplierServiceSpec.md,
       "Phase 1 — Supplier Read APIs"), listing the four read endpoints, their accepted roles, and
       the §7.2 query parameters. No requirements, architecture, schema, or API decisions were made
       by the AI tool.
Author review: Congchen
Scope: 2026-09-29 update — added the local photo store section (development/unit-test MinIO
       instance, `compose.photo-store.yaml`) per SupplierServiceArchitecture.md §8.2 and §9 item 21.
       No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review:
Scope: 2026-09-29 update — added the Phase 2 admin API section, `npm run migrate:phase2`,
       `npm run test:minio` and the `PHOTO_STORE_*` variables (SupplierServiceSpec.md, "Phase 2").
       No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review:
Scope: 2026-09-30 update — added the Phase 3 `PUT /api/v1/admin/suppliers/:id` row to the admin API
       table (SupplierServiceSpec.md, "Phase 3 — Admin Update"). Tool: Claude Code (model:
       claude-sonnet-5-5). No requirements, architecture, schema, or API decisions were made by the
       AI tool.
Author review: Congchen
Scope: 2026-09-30 update — documented the Phase 4 `DELETE /api/v1/admin/suppliers/:id` row, the
       reactivation and cleanup wording, the "Background worker" section and the upgrade notes
       (SupplierServiceSpec.md, "Phase 4"). Tool: Claude Code (model: claude-sonnet-5-5). No
       requirements, architecture, schema, or API decisions were made by the AI tool; the change
       records the team's decisions of 2026-09-30.
Author review: Congchen
Scope: 2026-09-30 update — documented the OpenAPI file and the local seed (`npm run seed`). Tool: Claude
       Code (model: claude-sonnet-5-5). No requirements, architecture, schema, or API decisions were made
       by the AI tool.
Author review: Congchen
Scope: 2026-10-20 update — documented local JWKS retrieval and RS256 bearer-token verification
       for the authentication middleware. No requirements, architecture, schema, or API decisions
       were made by the AI tool.
Author review: tng wen xi
Scope (2026-11-02, Codex, model: GPT-6): Clarified the implemented JWKS authentication setup.
Author review: Congchen
Scope: 2026-11-05 update (Claude Code, model: claude-sonnet-5-5) — Documented the ids filter and unavailable array, and recorded workstream W8, per the 2026-11-05 supplier-bookmarking spec.
       No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: Congchen
Scope (2026-11-06, Claude Code, model: claude-opus-5-5): Documented that the photo store keys are optional
       on ECS, per George's task role decision of 2026-11-06. No requirements, architecture, schema, or API
       decisions were made by the AI tool.
Author review: George Yeo
Scope (2026-11-11, Codex, model: GPT-6): Updated the service overview and API documentation from existing implementation.
No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: Congchen
-->

# Supplier Service

The Supplier Service maintains FoC's directory of stores and facilities. Users can browse and filter
visible suppliers, view their details and opening hours, and retrieve locations and categories.
Administrators manage suppliers, photos and reference data, including soft deletion and reactivation.

The service uses a four-tier architecture: HTTP controllers handle requests, business services apply
supplier workflows, repositories mediate persistence, and MySQL stores supplier data. Redis supports
idempotency and background jobs; an S3-compatible photo store holds images. A separate worker relays
outbox tasks and processes photo cleanup and supplier suspension. The suspension integrations are
currently mocks. The User Service supplies signing keys for bearer-token verification.

See [SupplierServiceArchitecture.md](./SupplierServiceArchitecture.md) for the architecture and
[SupplierServiceSpec.md](./SupplierServiceSpec.md) for the phased implementation plan. For the
implemented HTTP contract, including authentication and errors, see [openapi.yaml](./openapi.yaml).

## Setup

```bash
npm install
cp .env.example .env   # fill in DB/Redis/User Service values for your environment
npm run migrate        # applies src/db/init.sql (§6.4 schema)
npm run dev
```

## Environment variables

See `.env.example` for the full list: server port, MySQL connection, Redis connection, and
`USER_SERVICE_URL` (the User Service base URL, used to fetch its JWKS from
`/auth/.well-known/jwks.json`). The middleware caches those public keys, selects a key by the
token's `kid`, and verifies the RS256 signature and expiry locally. An unknown `kid` triggers one
JWKS refresh before rejection. Missing or invalid tokens receive `401`. A previously cached matching
key can still be used when the User Service is unavailable. The User Service must be configured with
its signing key pair and key ID; see [its setup guide](../user-service/docs/user-service-instructions.md).
The optional `PHOTO_STORE_ENDPOINT`, `PHOTO_STORE_BUCKET`, `PHOTO_STORE_ACCESS_KEY` and
`PHOTO_STORE_SECRET_KEY` point the photo storage interface at an S3-compatible store (the local
MinIO below); without the endpoint and bucket, photo operations fail with `500`. On ECS, leave both
keys unset and the AWS SDK uses the task role's credentials. Setting only one key counts as not
configured.

## Upgrading an existing database

`npm run migrate:phase2` upgrades a database created from the pre-Phase 2 `init.sql`: it adds
`supplier_hours.is_24h`, moves `day_of_week` from 0–6 to 1–7 (Sunday 0 becomes 7) and widens the
check to 1–8. It is safe to run more than once. New databases get this schema from `init.sql`.

`npm run migrate` re-applies `init.sql` and creates the `outbox` table on an existing database. A
database created before Phase 2 also needs `npm run migrate:phase2` before supplier creation works.

## Background worker

The worker is a separate process from the API (`src/worker/main.ts`).

```bash
npm run worker                          # run the worker (npm run worker:dev restarts it on change)
docker compose up -d supplier-worker    # run it as the compose service (from the repository root)
```

- Every second a relay (a BullMQ job scheduler on `queue:outbox:relay`) reads up to 100 `outbox` rows
  ordered by `version` then `id`, adds each to its BullMQ queue (job id `outbox-<outbox id>`, job name =
  `task_name`, job data = `payload`) and deletes the row once it has been added. If adding fails, the
  row is kept and retried on the next tick. Ordering is enqueue order only.
- Queues: `supplier_suspension` jobs go to `queue:supplier:suspension` (payload `{ supplier_id }`);
  `image_cleanup` jobs go to `queue:image:cleanup` (payload `{ photo_id, photo_location }`). A queue
  key maps to BullMQ as prefix plus name split at the last colon (`queue:supplier:suspension` is prefix
  `queue:supplier`, name `suspension`).
- A failed job is retried as a BullMQ delayed job, up to 5 attempts in total, with delays of 5 s,
  25 s, 125 s and 625 s. The worker is not blocked while a job waits.
- A job that has used all attempts, a job with an unknown name or an invalid payload (no retry), and an
  outbox row whose `task_name` has no queue are written to `dead_letter_jobs` (`job_id`
  `outbox-<outbox id>`, `status` `UNRESOLVED`).
- The suspension job (queued by a soft delete, or by setting a supplier inactive) first checks the supplier's
  flags: a supplier that is live again (`is_deleted` false and `is_active` true) is skipped. Otherwise it calls
  order-service `POST /suppliers/:id/cancel-orders` (body `{ "supplierName" }`, header
  `order-supplier-service-key`), which cancels the open/accepted requests and posts the request-chat notice.
  `ORDER_SERVICE_URL` and `ORDER_SUPPLIER_SERVICE_API_KEY` are required by the worker.
- On `SIGINT`/`SIGTERM` the worker takes no new jobs and lets the active job finish. Observed on
  2026-09-30 with an idle worker under `docker stop`: it stopped in about 3 s, the log showed
  `SIGINT` (not `SIGTERM`), and the exit code was 143. Stopping during an in-flight job has not been
  tested.
- `PHOTO_STORE_ENDPOINT` is `http://host.docker.internal:9000` in development and must be the same
  string in the API and the worker. Photos stored earlier with a `http://localhost:9000` prefix cannot
  be deleted by the worker.

## Local photo store (development and unit tests only)

Supplier photos go through a provider-agnostic storage interface
(`SupplierServiceArchitecture.md` §8.2). Locally, and in unit tests, that interface is backed by a
MinIO instance that simulates the cloud object storage. It is defined in `compose.photo-store.yaml`
in this folder and is not part of the root `compose.yaml`, because it is not used in deployment.

```bash
docker compose -f compose.photo-store.yaml up -d     # start it (run from supplier-service/)
docker compose -f compose.photo-store.yaml ps        # wait until photo-store reports healthy
docker compose -f compose.photo-store.yaml down      # stop it (add -v to also delete its data)
```

The S3 API listens on host port `9000` and the web console on `9001` (override with
`PHOTO_STORE_API_PORT` / `PHOTO_STORE_CONSOLE_PORT`). The one-shot `photo-store-init` service creates
the `supplier-photos` bucket. The development-only credentials are `photostoredev` /
`photostoredev-secret` (override with `PHOTO_STORE_ACCESS_KEY` / `PHOTO_STORE_SECRET_KEY`). The
instance must be running before `npm run test:minio` (see Tests) is run.

## API (Phase 1 — requester mode)

Routes below are versioned under `/api/v1`. They accept User Service bearer tokens with roles
`user`, `admin`, or `super admin`. Supplier detail and location reference reads also accept the
`Supplier-Order-Service-Key` header, configured with `SUPPLIER_ORDER_SERVICE_API_KEY`.

| Method & path                                | Query parameters                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/v1/suppliers`                      | `page`, `limit` (fixed at 50), `search`, `location_id`, `category_id`, `isOpen` (`true`/`false`), `sortOrder` (`A-Z`/`Z-A`, default `A-Z`), `ids` (comma-separated, up to 20; adds an `unavailable` array) |
| `GET /api/v1/suppliers/:id`                  | —                                                                                                                                          |
| `GET /api/v1/suppliers/reference/location`   | —                                                                                                                                          |
| `GET /api/v1/suppliers/reference/categories` | —                                                                                                                                          |

See [openapi.yaml](./openapi.yaml) for request and response details. `GET /health` is unauthenticated
and reports process health without checking dependencies.

## API (Phase 2 — admin mode)

All routes require a valid bearer token with role `admin` or `super admin` (§7).

| Method & path                                                                                           | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/admin/suppliers`                                                                           | User-list query parameters except `ids`; includes inactive and soft-deleted suppliers and adds `isActive`, `isDeleted`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `GET /api/v1/admin/suppliers/:id`                                                                       | Adds `isActive`, `isDeleted`, `createdOn`, `createdBy`, `updatedOn`, `version`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `POST /api/v1/admin/suppliers`                                                                          | `multipart/form-data`: `name`, `type`, `location_id`, `category_id` (JSON array), `desc`, `openingHours` (JSON array), `is24h`, and 0–10 JPEG/PNG `photos` (≤ 5 MB each). Requires an `Idempotency-Key` UUID header. `201` on create. When the name, type and location match a soft-deleted supplier, `200`: the submitted details and photos are applied through the edit cycle and `is_deleted = false`, `is_active = true` are restored in the same transaction (submitted photos replace the existing ones; no photos submitted leaves them; `version` is bumped once). If anything fails before the commit, the supplier stays soft-deleted and unchanged                                                                                                                                                                                                                              |
| `PUT /api/v1/admin/suppliers/:id`                                                                       | `multipart/form-data`: `name`, `type`, `desc`, `location_id`, `category_id` (JSON array; replaces the whole set), `openingHours` (JSON array), `is24h`, `isActive`, required `version`, `isPhotoDirty`, `photo_ids` (JSON array; numbers are existing photo ids, strings are placeholders), `placeholder_ids` (JSON array; the i-th placeholder matches the i-th uploaded `photos` file), and 0–10 JPEG/PNG `photos` (≤ 5 MB each). No `Idempotency-Key`. `200` with the updated admin supplier; `404` for an unknown or soft-deleted supplier; `409` for a stale `version`; `422` for a validation failure, a duplicate name/type/location, nothing to update, or files sent without `isPhotoDirty`. Excluded-photo cleanup tasks (`task_name` `image_cleanup`) are written to the `outbox` table in the update transaction and processed by the background worker (see Background worker) |
| `DELETE /api/v1/admin/suppliers/:id`                                                                    | Soft-deletes the supplier (`is_deleted = true`; `is_active` unchanged; `updated_on` and `version` bumped). `200` with `{ "id": <id>, "isDeleted": true }`; `404` for an unknown or already deleted supplier; `403` for the `user` role. The delete and its `supplier_suspension` outbox row commit in one transaction                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `POST` / `PUT /:id` / `DELETE /:id` on `/api/v1/admin/reference/faculties`, `/locations`, `/categories` | JSON bodies as in §7; `DELETE` succeeds only for an unreferenced row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

See `SupplierServiceArchitecture.md` §6.2, §7 and §8.2 for the full contract.

## Tests

```bash
npm test               # everything except the MinIO tests; needs no Docker
npm run test:minio     # tests of the real photo-store connection; needs the photo store running
```

## API description

[openapi.yaml](./openapi.yaml) records every endpoint in OpenAPI 3.0 form. It restates the contract in
SupplierServiceArchitecture.md §7 and follows the implemented routes; update it with any contract change.

## Seeding local data

```bash
docker compose up -d supplier-db        # from the repository root
npm run migrate                         # with DB_HOST=localhost and the published DB port
npm run seed                            # needs the photo store running as well
```

`npm run seed` is a test (`test/seed/seedSuppliers.seed.test.ts`) that creates the reference data and then
each of the 14 frontend-mock suppliers through the real creation service: details go to MySQL, photos go to
MinIO, and the location MinIO returns is stored in MySQL. It can be re-run; existing rows are skipped.
`vitest.seed.config.ts` reads `SUPPLIER_DB_PORT` and `SUPPLIER_DB_PASSWORD` from the root `.env`, and every
connection value can be overridden with the usual `DB_*` / `PHOTO_STORE_*` variables.

- Photos must be JPEG or PNG and present under `frontend/public/images` (or `foc-mockup/public/images`);
  a supplier whose image is missing or is `.webp` is created without a photo and the run reports it.
- Stored photo locations start with `PHOTO_STORE_ENDPOINT` (default `http://host.docker.internal:9000`),
  which must be the value the API and worker use. The machine running the seed and the browser must be able
  to resolve and reach that name.
