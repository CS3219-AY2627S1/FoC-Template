<!--
AI Assistance Disclosure:
Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
Scope: Implementation plan for SupplierServiceSpec.md "Phase 5 — Cross-Cutting Hardening and Verification".
       It transcribes what the spec and SupplierServiceArchitecture.md already record. The parts of Phase 5
       that need a team decision (per-endpoint §7.1.1 wording, the NFR7.1 latency target, the load-test
       tool and data volume, the demonstration format) are listed under "Blocked on team decisions" and
       are NOT filled in. No requirements, architecture, schema, or API decisions were made by the AI
       tool. The code in this plan has not been compiled or run.
Author review: Congchen
Scope (2026-11-03, Codex, model: GPT-6): Recorded the team-supplied latency objective and linked the API call inventory.
       No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: Congchen
Scope (2026-11-04, Codex, model: GPT-6): Recorded team-supplied performance and no-UI test decisions.
       No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: Congchen
Scope (2026-11-04, Codex, model: GPT-6): Recorded clarified load targets and database choice.
       No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: Congchen
Scope (2026-11-04, Codex, model: GPT-6): Recorded team-supplied rate-limit and workload decisions.
       No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: Congchen
Scope (2026-11-04, Codex, model: GPT-6): Recorded the revised staging rate limit and current task status.
       No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: Congchen
Scope (2026-11-04, Codex, model: GPT-6): Recorded the team's acceptance of current response wording and optional details.
       No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: Congchen
Scope (2026-11-04, Claude Code, model: claude-sonnet-5-5): Recorded task status after Task 2 tests and the first local k6 run.
       No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: Congchen
-->

# Supplier Service Phase 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Do not start a task marked BLOCKED until the team's answer is written into the Decision record at the end of this file.**

**Goal:** Verify NFR6.1 (#60) and NFR7.1 (#61) for the finished Supplier Service and produce the verification evidence the spec lists (per-endpoint wording, no-UI API demonstration, cross-role demonstration).

**Architecture:** No production code changes are planned. Phase 5 adds tests and evidence only. NFR6.1 is proven by driving the real `app` (the full middleware chain) with the User Service, MySQL and Redis stubbed, and asserting no persistence call happens on a rejected request. Anything that would change a route, response shape, schema or index is a stop-and-ask item (root `AGENTS.md` §2.1), not part of this plan.

**Tech Stack:** TypeScript, Vitest, Supertest (all already in the repo). No new dependency is planned; a load tool would be a team choice (Task 3).

**Every task also requires** (root `AGENTS.md` §4, §5, §7): the AI disclosure header on each created file (edited files get an appended dated `Scope`/`Author review` pair; never write the author's name), and one log entry plus one README "Log index" row when the phase is finished (Task 6). Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Run everything from `supplier-service/` (the repo root is `..`). Tests live in `test/`, mirroring `src/`.

---

## Where this phase stands (from the spec)

| Spec item | Status here |
| --- | --- |
| End-to-end tests proving NFR6.1 | **Implemented** — Task 1 |
| §7.1.1 per-endpoint `message`/`details` content | **Verified in part** — `test/routes/responseMessages.test.ts` covers the shared-middleware/validation rows; DB-dependent rows not covered — Task 2 |
| Load/pagination tests proving NFR7.1 | **Run, targets missed** — local k6 run recorded in `supplier-service/docs/phase-5-load-test-results.md`; awaiting team decision — Task 3 |
| Live API-call transcript + independent no-UI demonstration (§9 item 10) | **Implemented; live suite recorded as passing** — Task 4 |
| Cross-role end-to-end demonstration | **Implemented; live suite recorded as passing** — Task 5 |

Already true and only *cited*, not rebuilt: 401/403 handling (`authenticate`, `requireRole`), the 30/min/IP limiter, and the fixed `limit` of 50 (`422` otherwise). `test/app.integration.test.ts` already covers a subset of 401/403; Task 1 makes the coverage systematic and adds the "no state change" assertion it lacks.

## Original decision questions

The decision record below contains subsequent answers. Remaining unanswered questions must not be filled in by the agent.

1. **Task 2 — endpoint wording.** For each row of the §7.1.1 table (`400`, `401`, `403`, `404`, `422`, and the mapped `409`/`429`/`500` if wording changes), per endpoint: the exact `message` and what `details` carries (field, location, resource identifier, downstream service, or job id). Today's messages are whatever the code emits; changing them alters the API's response contract.
2. **Task 3 — NFR7.1.** (a) What is "acceptable latency" as a number (p95 or p99, in ms, at what request rate)? (b) How many suppliers is "at scale"? (c) Which tool, e.g. a Node script versus a library such as autocannon or k6? (d) Which database serves it, the compose MySQL or a throwaway one? (e) If the target is missed, is adding an index or changing a query allowed? That is a schema/performance trade-off the team owns.
3. **Tasks 4–5 — demonstration.** In what form should the evidence be delivered: a `.http`/REST-client file, a shell script with `curl`, a Vitest suite against a running stack, or a written transcript? Where should it live (e.g. `supplier-service/docs/` or the repo `docs/`)? Should the roles come from real User Service tokens or the local stub used in Phase 4?

---

### Task 1: NFR6.1 — every mutating endpoint rejects unauthorized requests without touching state

Governing decision: Spec Phase 5 scope bullet 2, NFR6.1.1 (#60); Arch §7 (role column), §7.1.1 rows `401`/`403`.

**Files:**
- Create: `test/security/mutatingEndpoints.test.ts`

The mutating endpoints, all from the routers: `POST/PUT/DELETE` on `/api/v1/admin/suppliers`, and `POST/PUT/DELETE` on `/api/v1/admin/reference/{faculties,locations,categories}` (12 in total). Their role guard is `requireRole('admin', 'super admin')`, which runs before `requireIdempotencyKey` and `uploadPhotos`, so a `user` is rejected before any body is parsed.

- [ ] **Step 1: Write the test**

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: End-to-end tests for NFR6.1 (Phase 5 plan Task 1): each mutating endpoint rejects a request
 *        with no token, an invalid token, or the `user` role, and never touches MySQL or Redis.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Any call on these stubs means a rejected request reached persistence or the idempotency cache.
const { poolStub, redisStub } = vi.hoisted(() => ({
  poolStub: { query: vi.fn(), execute: vi.fn(), getConnection: vi.fn() },
  redisStub: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    eval: vi.fn(),
    call: vi.fn(),
  },
}));
vi.mock('../../src/db/pool.js', () => ({ pool: poolStub }));
vi.mock('../../src/redis/client.js', () => ({ default: redisStub }));

import app from '../../src/app.js';

const mutating: Array<{ name: string; method: 'post' | 'put' | 'delete'; path: string }> = [
  { name: 'create supplier', method: 'post', path: '/api/v1/admin/suppliers' },
  { name: 'update supplier', method: 'put', path: '/api/v1/admin/suppliers/1' },
  { name: 'delete supplier', method: 'delete', path: '/api/v1/admin/suppliers/1' },
  { name: 'create faculty', method: 'post', path: '/api/v1/admin/reference/faculties' },
  { name: 'update faculty', method: 'put', path: '/api/v1/admin/reference/faculties/1' },
  { name: 'delete faculty', method: 'delete', path: '/api/v1/admin/reference/faculties/1' },
  { name: 'create location', method: 'post', path: '/api/v1/admin/reference/locations' },
  { name: 'update location', method: 'put', path: '/api/v1/admin/reference/locations/1' },
  { name: 'delete location', method: 'delete', path: '/api/v1/admin/reference/locations/1' },
  { name: 'create category', method: 'post', path: '/api/v1/admin/reference/categories' },
  { name: 'update category', method: 'put', path: '/api/v1/admin/reference/categories/1' },
  { name: 'delete category', method: 'delete', path: '/api/v1/admin/reference/categories/1' },
];

function expectNoStateChange(): void {
  for (const stub of [...Object.values(poolStub), ...Object.values(redisStub)]) {
    expect(stub).not.toHaveBeenCalled();
  }
}

describe('NFR6.1: mutating endpoints reject unauthorized requests without changing state', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe.each(mutating)('$name ($method $path)', ({ method, path }) => {
    it('rejects a request with no bearer token with 401', async () => {
      const res = await request(app)[method](path);
      expect(res.status).toBe(401);
      expect(res.body.status_code).toBe(401);
      expect(fetch).not.toHaveBeenCalled();
      expectNoStateChange();
    });

    it('rejects a token the User Service does not accept with 401', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 401 }));
      const res = await request(app)[method](path).set('Authorization', 'Bearer bad');
      expect(res.status).toBe(401);
      expectNoStateChange();
    });

    it('rejects the user role with 403', async () => {
      vi.mocked(fetch).mockImplementation(
        async () => new Response(JSON.stringify({ user_id: 'u-1', role: 'user' }), { status: 200 }),
      );
      const res = await request(app)[method](path).set('Authorization', 'Bearer t');
      expect(res.status).toBe(403);
      expect(res.body.status_code).toBe(403);
      expectNoStateChange();
    });
  });
});
```

The rate limiter is one in-memory counter per process (30/min/IP) and this file sends 36 requests. Step 2 shows how the test handles it.

- [ ] **Step 2: Run it and handle the rate limit**

Run: `npx vitest run test/security/mutatingEndpoints.test.ts`
Expected: the first 30 requests pass and the rest fail with `429`. The limiter is created at import (`app.use(createRateLimiter())`), so the fix has to live in the test, not `src/`: add this near the top of the file, before `import app`, so each request gets a distinct client IP through the already-enabled `trust proxy` setting, and add `.set('X-Forwarded-For', nextIp())` to each of the three `request(app)…` calls.

```ts
let ipCounter = 0;
const nextIp = () => `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;
```

Re-run. Expected: 36 tests PASS.

- [ ] **Step 3: Prove the test can fail**

Temporarily comment out `router.use(requireRole('admin', 'super admin'));` in `src/routes/lookup.routes.ts`, run the file, confirm the three `user role` cases for the lookup endpoints now fail (`403` expected), then restore the line with `git checkout src/routes/lookup.routes.ts`. Record in the log that this check was run.

- [ ] **Step 4: Full suite, typecheck, lint**

Run: `npx vitest run; npx tsc --noEmit; npm run lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add test/security/mutatingEndpoints.test.ts
git commit -m "test(supplier-service): prove mutating endpoints reject unauthorized requests without state change"
```

---

### Task 2: Per-endpoint `message`/`details` wording (team decision recorded)

Governing decision: the team accepted the existing messages and optional details in the decision record below.

The original steps were written for a new table; use the accepted inventory as the existing behavior to verify:

- [ ] **Step 1:** Copy the team's table verbatim into the Decision record below and cite its source (doc/commit).
- [ ] **Step 2:** For each row, write a Supertest test that asserts the exact `message` and the `details` shape the team specified (add to the matching `test/routes/*.test.ts` file). Run them; the differences from today's output are the work list.
- [ ] **Step 3:** Change only the message strings and `details` payloads in the controllers/services/middleware that emit them. If any row needs a new status code, route, or response field, stop and ask.
- [ ] **Step 4:** Update the §7.1.1 table's "Project-specific mapping" column only if the team asks (agent formats their text; it does not write rationale).
- [ ] **Step 5:** `npx vitest run; npx tsc --noEmit; npm run lint`, then commit.

---

### Task 3: NFR7.1 pagination/latency verification (in progress)

Governing decision: Spec Phase 5 scope bullet 3, NFR7.1.1 (#61); Arch §7.2. The 50-entry limit is already enforced; this task measures latency only. Seed data exists in `../data/csv/supplier-seed-data.csv`.

Once the team gives the target, volume, tool and database:

- [ ] **Step 1:** Write a seeding script that inserts the agreed number of suppliers (with hours, categories and photo rows) into the agreed database. Put it in `scripts/` with the disclosure header.
- [ ] **Step 2:** Write the load script for `GET /api/v1/suppliers` and `GET /api/v1/admin/suppliers` (first page, a middle page, a page past the end, and the `search`, `location_id`, `category_id`, `isOpen` variants) using the agreed tool and request rate.
- [ ] **Step 3:** Run it at increasing supplier counts and record the measured latencies verbatim in the log entry. State plainly whether the team's target was met.
- [ ] **Step 4:** If it was missed, stop and report the numbers. Do not add an index or rewrite a query; that is the team's schema/performance decision.

---

### Task 4: Independent no-UI API demonstration and live transcript (implemented)

Governing decision: Arch §9 item 10 and §8 ("remains usable through its APIs without the UI"). Requests to demonstrate are the ones already recorded in Arch §7.4.

The team selected Vitest, a local JWKS stub and CI-generated transcripts; the recorded live run is in the shared usage log.

- [ ] **Step 1:** Start the stack (`docker compose up` from the repo root with the User Service stub or real tokens as the team chooses) and confirm each service is reachable before recording anything.
- [ ] **Step 2:** Author the demonstration in the agreed format, covering the full lifecycle through the API alone: reference lookups, create (with `Idempotency-Key`), list/detail, update (with `version`, including a stale-`version` `409`), delete, and the repeated-delete `404`.
- [ ] **Step 3:** Run it against the live stack and save the real request/response transcript. Never edit or invent transcript content; if a call fails, report it.
- [ ] **Step 4:** Commit the demonstration and transcript.

---

### Task 5: Cross-role demonstration (implemented)

Governing decision: Spec Phase 5 scope bullet 5 (course requirement point 4).

- [ ] **Step 1:** Using the same format and stack as Task 4, run the same operations as a `user`, an `admin` and a `super admin`, and record which succeed (`200`/`201`) and which return `403`, from live responses.
- [ ] **Step 2:** Commit the recording next to the Task 4 transcript.

---

### Task 6: Disclosure and close-out

- [ ] **Step 1:** Append one entry to `../ai/usage-log.md` in the §5.2 format (exact prompts, key responses, files, and "Deviations / questions raised": list the blocked items and the team's answers). Leave the review fields blank.
- [ ] **Step 2:** Add the matching one-line row to the "Log index" table in `../README.md`.
- [ ] **Step 3:** In `SupplierServiceSpec.md`, add a Phase 5 status note (append a dated `Scope`/`Author review` pair to its header) stating only what was done and verified, and what was not.
- [ ] **Step 4:** Run `npx vitest run; npx tsc --noEmit; npm run lint; npm run build` and report the true results.
- [ ] **Step 5:** Tell the team which entries and headers still need author review.

---

## Self-review against the spec

- NFR6.1 tests → Task 1. Per-endpoint wording → Task 2. NFR7.1 → Task 3. API-only demonstration and transcript (§9 item 10) → Task 4. Cross-role demonstration → Task 5. Disclosure → Task 6. No spec bullet is unmapped.
- The decision record contains the team-supplied answers; the local load run missed its targets and the team has not authorized query or index changes.
- Names used in Task 1 (`poolStub`, `redisStub`, `nextIp`, `expectNoStateChange`) are defined in the same task.

## Decision record

**Task 3, partial — team instruction in chat (2026-11-03):** Measure p50 and p95 pagination latency as load increases; load time should ideally not exceed 1 second. The team has not specified whether this ideal is a strict pass/fail threshold, the request rate, data volume, tool, database, or authorization for query/index changes. Task 3 remains blocked on those details.

**Tasks 4–5, partial — team instruction in chat (2026-11-03):** The demonstration can be conducted on the live app. The team also requested a test plan listing exact API calls; see [Phase 5 API test plan](../../../supplier-service/docs/phase-5-api-test-plan.md). Whether the separate no-UI transcript remains required and the evidence location, format and token source are still open.

**Task 2:** The team will decide the wording after reviewing the [current response inventory](../../../supplier-service/docs/phase-5-response-inventory.md).


**Task 3 — team instruction in chat (2026-11-04):** Target p50 within 300 ms during typical load and p95 within 600 ms during heavy load, evaluated over one minute. Baseline is 50 requests/s and peak is 200 requests/s. Use Grafana k6 and a mock database populated with 4,000 supplier records; ignore concurrent writes. Clarification is pending on whether “mock database” means a separate MySQL database with synthetic records or a mocked database implementation, how the existing 30 requests/minute/IP limit should be handled, and the precise association between each percentile and load level. If a target is missed, index/query changes still need a team decision.

**Tasks 4–5 — team instruction in chat (2026-11-04):** The no-UI test remains required and is intended for CI/CD regression testing. The test format, token source and evidence location remain unrecorded.


**Task 3 — clarified team instruction (2026-11-04):** Use a separate MySQL test database populated with 4,000 synthetic supplier records; the team expects to swap to cloud MySQL later. Measure both percentiles over one minute: at typical load (50 requests/s), p50 ≤300 ms and p95 ≤500 ms; at peak load (200 requests/s), p50 ≤400 ms and p95 ≤600 ms. The team stated the rate limit should be controlled by an environment variable with a very high local/staging limit. Current Supplier Service code hard-codes 30 requests/minute/IP and does not have that variable; its name, exact local/staging setting and unset/production behavior await the team's decision. The workload distribution across listed requests also remains to be specified.


**Task 3 — team instruction (2026-11-04):** `PER_IP_RATE_LIMIT` is 20,000 locally, 10,000 in staging and 30 in production, requests/minute/IP. The mixed request workload is 70% page 1, 20% pages 2–5, and 10% page 6+ or filtered queries. The public/admin route split and distribution within the last group remain open. A 200 requests/s test over one minute from one IP exceeds the staging limit of 10,000 requests/minute/IP.


**Task 3 — team clarification (2026-11-04):** Split the mixed workload 95% public and 5% admin. Within the 10% complex group, use 40% deep pagination (page 6+), 15% text search (`search=errand`), 15% `isOpen=true`, 15% category (`category=cleaning`), and 15% location (`location=central`). Current supplier list validation accepts numeric `category_id` and `location_id`, rather than the supplied category and location names; their mapping awaits the team's clarification.


**Task 3 — team clarification (2026-11-04):** The load test should emulate frontend requests and use category and location IDs in the existing numeric filter parameters.


**Task 3 — team correction (2026-11-04):** Staging `PER_IP_RATE_LIMIT` is 20,000 requests/minute/IP, matching local; this supersedes the earlier 10,000 staging setting. Staging deployment configuration is not present in this checkout and must be updated separately. The existing decision-record entries above are chronological; later clarifications supersede earlier unanswered questions.


**Task 2 — team decision (2026-11-04):** Accept the current messages and optional details documented in [the response inventory](../../../supplier-service/docs/phase-5-response-inventory.md). No new message or details mapping is required. Existing verification work remains; this decision does not specify changes to malformed-JSON or unknown-route handling.


**Tasks 4–5 — team decisions and result (2026-11-04):** Use Vitest against the running service and a local JWKS stub; login is a separate test. Generate transcripts in CI without requiring persistence. The shared usage log records the live no-UI and cross-role suites passing 17/17; see `test/api-demo/` and `vitest.apidemo.config.ts`.
