<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-11-03
Scope: Formatted the existing Phase 5 API test cases and team-supplied latency objective.
       No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: Congchen
Scope (2026-11-04, Codex, model: GPT-6): Recorded the team's load targets and no-UI CI intent.
       No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: Congchen
Scope (2026-11-04, Codex, model: GPT-6): Recorded clarified MySQL and percentile targets.
       No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: Congchen
Scope (2026-11-04, Codex, model: GPT-6): Recorded the supplied mixed workload and rate-limit settings.
       No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: Congchen
Scope (2026-11-04, Codex, model: GPT-6): Recorded the team's revised staging rate limit.
       No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: Congchen
Scope (2026-11-04, Codex, model: GPT-6): Recorded the team's no-UI suite and transcript decisions.
       No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: Congchen
-->
# Phase 5 API test plan

This records the calls already identified in the [Phase 5 implementation plan](../../docs/superpowers/plans/2026-09-30-supplier-service-phase-5.md) and [architecture §7.4](../SupplierServiceArchitecture.md). It is a test plan, not a record of a run. Replace placeholders with values from the test environment. All `/api/v1` requests require a User Service bearer token. Use an isolated dataset for mutation tests.

## Pagination latency

Using Grafana k6, evaluate both percentiles over one minute against a separate MySQL test database with 4,000 synthetic supplier records and no concurrent writes. The team plans to swap the target to cloud MySQL later. At 50 requests/s, p50 must be within 300 ms and p95 within 500 ms; at 200 requests/s, p50 must be within 400 ms and p95 within 600 ms. The team specified `PER_IP_RATE_LIMIT`: 20,000 requests/minute/IP locally and in staging, and 30 in production. The code defaults to 30 when the variable is unset; local Compose sets 20,000. The staging setting must be supplied by its deployment. Record 429 responses separately from successful-response latency. The mixed workload is 95% public and 5% admin; 70% page 1, 20% pages 2–5, and 10% page 6+ or filtered queries. Within the 10% complex group, the team specified 40% deep pagination, 15% `search=errand`, 15% `isOpen=true`, 15% category `cleaning`, and 15% location `central`. The team confirmed the test should use numeric `category_id` and `location_id`, as the frontend does.

For each of the two paths below, run each query listed with a role permitted by the existing route (`user`, `admin` or `super admin` for the first; `admin` or `super admin` for the second). Select placeholders from the actual dataset, including an existing location and category and a page number beyond its end.

```http
GET /api/v1/suppliers?page=1&limit=50
GET /api/v1/suppliers?page=<middle-page>&limit=50
GET /api/v1/suppliers?page=<past-end-page>&limit=50
GET /api/v1/suppliers?page=1&limit=50&search=<search-term>
GET /api/v1/suppliers?page=1&limit=50&location_id=<location-id>
GET /api/v1/suppliers?page=1&limit=50&category_id=<category-id>
GET /api/v1/suppliers?page=1&limit=50&isOpen=true
GET /api/v1/admin/suppliers?page=1&limit=50
GET /api/v1/admin/suppliers?page=<middle-page>&limit=50
GET /api/v1/admin/suppliers?page=<past-end-page>&limit=50
GET /api/v1/admin/suppliers?page=1&limit=50&search=<search-term>
GET /api/v1/admin/suppliers?page=1&limit=50&location_id=<location-id>
GET /api/v1/admin/suppliers?page=1&limit=50&category_id=<category-id>
GET /api/v1/admin/suppliers?page=1&limit=50&isOpen=true
```

Send `Authorization: Bearer <access-token>` on each call. Record successful and rejected response counts alongside latency, and the actual request parameters and environment. Do not claim the targets were met without measured results.

The k6 script is [`test/load/pagination.k6.js`](../test/load/pagination.k6.js). Set `BASE_URL` to the service origin, `USER_TOKEN` and `ADMIN_TOKEN` to valid access tokens, and `CATEGORY_ID` and `LOCATION_ID` to valid numeric IDs before running `k6 run test/load/pagination.k6.js`. It schedules the one-minute typical and peak scenarios separately and checks their thresholds, HTTP failures, and dropped iterations. Request mix uses random sampling; proportions are approximate. k6 `http_req_duration` excludes initial connection setup. No run has been recorded yet.

## API-only lifecycle and role checks

The architecture gives the following existing lifecycle. Make calls through the API without the UI using an admin or super-admin token, with real values from the test dataset. Record real status codes and responses; retain the returned supplier ID and version for subsequent calls. POST and PUT use `multipart/form-data`.

```http
GET /api/v1/suppliers/reference/location
GET /api/v1/suppliers/reference/categories
POST /api/v1/admin/suppliers
  Idempotency-Key: <new-uuid>
  form: name=<unique-name>; type=Facility; location_id=<location-id>
GET /api/v1/suppliers?page=1&limit=50
GET /api/v1/suppliers/<supplier-id>
GET /api/v1/admin/suppliers/<supplier-id>
PUT /api/v1/admin/suppliers/<supplier-id>
  form: version=<current-version>; desc=<updated-description>
PUT /api/v1/admin/suppliers/<supplier-id>
  form: version=<previous-version>; desc=<another-description>
DELETE /api/v1/admin/suppliers/<supplier-id>
DELETE /api/v1/admin/suppliers/<supplier-id>
```

The existing Phase 5 plan calls for checking a stale-version `409` and a repeated-delete `404`. The cross-role demonstration uses user, admin and super-admin identities on the same operations, recording live success or rejection; use separate test suppliers for mutations. The team has requested that the live app be used for demonstration. The team confirmed the no-UI test is required and intends it for CI/CD regression testing. The team selected a Vitest suite with a local JWKS stub for tokens; transcripts are generated in CI and need not persist. See `test/api-demo/` and the shared usage log for the recorded live run.
