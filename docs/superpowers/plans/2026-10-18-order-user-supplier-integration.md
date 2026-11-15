<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus 5.5), date: 2026-10-18
Scope: broke the author's spec into implementation tasks. Behaviour comes from the spec; the internal names, signatures and file layout listed under "Implementation choices" are Claude's and await the author's review.
Author review: Reviewed and approved by @mattis.
-->

# Order Service: User and Supplier Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real HTTP adapters for User (`GET /auth/verify`) and Supplier (`GET /api/v1/suppliers/:id`) in order-service, selected with `AUTH_MODE=http` / `SUPPLIER_MODE=http`, with the stubs kept as a mode.

**Architecture:** Two new adapter classes sit behind the existing `SessionVerifier` and `SupplierDirectory` interfaces and call the services with the global `fetch` (Node 22). Upstream failures are thrown as two error types that the existing Express error handler maps to 503 or 500. Compose switches order-service to `http` mode.

**Tech Stack:** Node 22, TypeScript, Express 5, `node:test`, Docker Compose, bash + curl + jq for the demo.

**Spec:** `docs/superpowers/specs/2026-10-18-order-user-supplier-integration.md` (rounds 1–5). Where a task cites "R3 Q1" it means round 3, question 1 of the spec.

**Branch:** `feat/order-user-supplier-integration` (from `origin/main` at `abbd82f`).

## Global Constraints

- Modes: `AUTH_MODE` and `SUPPLIER_MODE` accept `stub` and `http`; unset means `stub` (R1 Q4, R2 6). `CREDIT_MODE` stays `stub` only (Credit is a separate PR).
- Variables inside the container: `USER_SERVICE_BASE_URL`, `USER_SERVICE_VERIFY_TIMEOUT_MS` (default `1000`), `SUPPLIER_SERVICE_BASE_URL`, `SUPPLIER_SERVICE_LOOKUP_TIMEOUT_MS` (default `2000`) (R2 5, R3).
- In `.env`, Order's timeouts are `ORDER_USER_SERVICE_VERIFY_TIMEOUT_MS` and `ORDER_SUPPLIER_SERVICE_LOOKUP_TIMEOUT_MS` (R5 2), so they don't share Supplier's `USER_SERVICE_VERIFY_TIMEOUT_MS`.
- In `http` mode, a missing base URL stops startup (R4 Q5).
- Forward the caller's `Authorization` header unchanged to both services (R1 Q3).
- No retries (R4 Q4).
- Responses, exact values:
  - Upstream down (5xx, timeout, network error) on any request: `503 SERVICE_UNAVAILABLE`, message `Service temporarily unavailable` (R2 3–4, R4 Q1–Q2, R5 3).
  - Supplier `401`: `401 UNAUTHENTICATED`, message `A valid session is required` (R4 Q1, R5 Q4).
  - Administrator, supplier `status: "ARCHIVED"`: `422 SUPPLIER_ARCHIVED`, message `Supplier is archived; restore it to create an errand.` (R2 1).
  - Supplier `404`, or any archived supplier for a member: `422 SUPPLIER_UNAVAILABLE` with the existing message (R2 2, R4 Q1).
  - Supplier `400`/`403`, User 4xx other than `401`, or a `200` body Order doesn't expect: `500 INTERNAL_ERROR`, logged (R4 Q1–Q3).
- Unit tests keep using the stubs; the HTTP adapters are tested with an injected fake `fetch` (R4 Q8).
- Compose: order-service runs in `http` mode and waits for `user-service` and `supplier-service` to start (R4 Q6, R5 1).
- Repo rules: AI disclosure header on every AI-influenced file (`Author review: PENDING`), an `ai/usage-log.md` entry per task with exact prompts, no Claude tag in commit messages, conventional commit subjects.

## Implementation choices (Claude's, for your review)

These aren't in the spec. They change no behaviour the spec fixes; change any of them before execution if you disagree.

1. `SupplierDirectory.getActiveSupplier(id)` becomes `findSupplier(id, authorization)` returning a tagged result, because the route now has four outcomes, not two. `SessionVerifier` keeps its signature.
2. The HTTP classes live next to their stubs, in `src/adapters/sessionVerifier.ts` and `src/adapters/supplierDirectory.ts`. The shared timeout/fetch helper and the two error classes go in a new `src/adapters/upstream.ts`.
3. A base URL that is set but doesn't parse as an `http:` or `https:` URL also stops startup (the spec only says "unset").
4. A `200` body is "unexpected" (→ 500) when: User's `id` isn't a UUID or `role` isn't `MEMBER`/`ADMINISTRATOR`; Supplier's `id`, `name`, `buildingCode` or `locationDescription` isn't a non-empty string, or `status` isn't `ACTIVE`/`ARCHIVED`.
5. Compose waits with `condition: service_started` for both, the literal reading of "start first" (supplier-service has no healthcheck).
6. R5 3 ("keep the existing message") is read as: both the database 503 and the new upstream 503 say `Service temporarily unavailable`.
7. The demo registers three fresh members per run (unique usernames), logs in the bootstrap administrator from `.env`, and uses the first supplier from `GET /api/v1/suppliers`. It reads `ALLOWED_EMAIL_DOMAIN` and `BOOTSTRAP_ADMIN_*` from `$ROOT/.env`.

## Review Focus

1. User returns `200` with a body Order can't use (e.g. `role: "SUPPORT"`, missing `id`) → 500, never a request that runs as a half-valid principal. Test in Task 2.
2. User or Supplier accepts the connection but never answers → 503 after the configured timeout, not a hung request. Test in Tasks 2 and 3 (fake `fetch` that only settles on abort).
3. Supplier returns `200` `status: "ARCHIVED"` to a member caller → 422 `SUPPLIER_UNAVAILABLE`, not `SUPPLIER_ARCHIVED`. Test in Task 3.
4. The `Authorization` header reaches both services byte for byte. Tests in Tasks 2 and 3.
5. A base URL with a trailing slash (`http://supplier-service:3000/`) still produces `/api/v1/suppliers/<id>`. Test in Task 3.

---

### Task 1: Modes and upstream settings in config

**Files:**
- Modify: `order-service/src/config.ts` (`stubMode`, `loadAdapterConfig`)
- Test: `order-service/test/adapters.test.ts` (`describe("adapter config")`)

**Interfaces:**
- Produces:
  ```ts
  type AdapterMode = "stub" | "http";
  interface UpstreamConfig { baseUrl: string; timeoutMs: number }
  loadAdapterConfig(): {
    authMode: AdapterMode; supplierMode: AdapterMode; creditMode: "stub";
    userService?: UpstreamConfig;      // present only when authMode === "http"
    supplierService?: UpstreamConfig;  // present only when supplierMode === "http"
    stubCreditLimit: number; stubCreditDelayMs: number; stubCreditSilentAmount: number;
  }
  ```

- [ ] **Step 1: Write the failing tests** in `describe("adapter config")`. Add the four new variable names to the list the `beforeEach` clears.
  - `config accepts AUTH_MODE=http with base URL and default timeout 1000`: set `AUTH_MODE=http`, `USER_SERVICE_BASE_URL=http://user-service:3001` → `authMode === "http"`, `userService` deep-equals `{ baseUrl: "http://user-service:3001", timeoutMs: 1000 }`.
  - `config accepts SUPPLIER_MODE=http with default timeout 2000`: likewise with `SUPPLIER_SERVICE_BASE_URL=http://supplier-service:3000` → `{ baseUrl: "http://supplier-service:3000", timeoutMs: 2000 }`.
  - `config reads both timeouts`: `USER_SERVICE_VERIFY_TIMEOUT_MS=1500`, `SUPPLIER_SERVICE_LOOKUP_TIMEOUT_MS=2500` → `1500` and `2500`.
  - `config refuses http mode without a base URL`: `AUTH_MODE=http` and no URL → throws `/^Error: USER_SERVICE_BASE_URL is not set$/`; same for `SUPPLIER_MODE=http` → `/^Error: SUPPLIER_SERVICE_BASE_URL is not set$/`.
  - `config refuses a base URL that is not http(s)`: `USER_SERVICE_BASE_URL=ftp://x` → throws `/USER_SERVICE_BASE_URL must be an http or https URL/`.
  - `config refuses a timeout of 0`: `USER_SERVICE_VERIFY_TIMEOUT_MS=0` with http mode → throws `/USER_SERVICE_VERIFY_TIMEOUT_MS must be a whole number >= 1/`.
  - `config leaves userService undefined in stub mode`: defaults → `userService === undefined && supplierService === undefined`.
  - Keep `config rejects AUTH_MODE=user-service` as it is. Add `config rejects CREDIT_MODE=http` → `/^Error: CREDIT_MODE=http is not implemented yet$/`.

- [ ] **Step 2: Run and see them fail**
  Run: `cd order-service && node --import tsx --test --test-name-pattern "config" test/adapters.test.ts`
  Expected: the new tests FAIL (`AUTH_MODE=http is not implemented yet`).

- [ ] **Step 3: Implement.** Replace `stubMode` with a `mode(name, allowed)` helper that keeps the existing `${name}=${value} is not implemented yet` message for disallowed values. Use the existing `required()` and `positiveInteger()` for the URLs and timeouts. Validate the protocol with `new URL()`. Update the comment above it, which says only stubs exist.

- [ ] **Step 4: Run and see them pass** (same command). Expected: all `adapter config` tests PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add order-service/src/config.ts order-service/test/adapters.test.ts
  git commit -m "feat(order): accept http mode and upstream settings for User and Supplier"
  ```

### Task 2: HTTP session verifier and the 503 mapping

**Files:**
- Create: `order-service/src/adapters/upstream.ts`
- Modify: `order-service/src/adapters/sessionVerifier.ts`, `order-service/src/http/errors.ts` (`errorHandler`)
- Test: `order-service/test/adapters.test.ts` (new `describe("http session verifier")`), `order-service/test/http.test.ts` (one new test)

**Interfaces:**
- Consumes: `UpstreamConfig` (Task 1).
- Produces:
  ```ts
  // upstream.ts
  class UpstreamUnavailableError extends Error { constructor(service: "user" | "supplier", detail: string) }  // → 503
  class UpstreamContractError extends Error { constructor(service: "user" | "supplier", detail: string) }     // → 500, logged
  function fetchWithTimeout(fetchImpl: typeof fetch, url: URL, init: RequestInit, timeoutMs: number, service: "user" | "supplier"): Promise<Response>
    // a timeout or network error throws UpstreamUnavailableError
  // sessionVerifier.ts
  class HttpSessionVerifier implements SessionVerifier {
    constructor(config: UpstreamConfig, fetchImpl?: typeof fetch)  // defaults to globalThis.fetch
  }
  ```

- [ ] **Step 1: Write the failing tests** with a fake `fetch` that records `(url, init)` and returns a canned `Response`.
  - `http verifier forwards the header to /auth/verify and returns the principal`: base `http://user-service:3001`, header `Bearer abc.def`. Fake returns `200 {"id":"<uuid>","role":"MEMBER"}`. Assert the URL is `http://user-service:3001/auth/verify`, the method is `GET`, `init.headers` has `authorization: Bearer abc.def`, and the result equals `{ id: "<uuid lowercased>", role: "MEMBER" }`.
  - `http verifier returns null on 401`.
  - `http verifier returns null without calling User when the header is missing`: assert the fake was not called.
  - `http verifier throws UpstreamUnavailableError on 500, 503 and a network error`.
  - `http verifier throws UpstreamUnavailableError after the timeout`: `timeoutMs: 50`. The fake returns a promise that rejects only when `init.signal` aborts. Assert it rejects with `UpstreamUnavailableError` in under 1000 ms.
  - `http verifier throws UpstreamContractError on 403 and 404`.
  - `http verifier throws UpstreamContractError on an unexpected 200 body`: cases `{"id":"x","role":"MEMBER"}`, `{"id":"<uuid>","role":"SUPPORT"}`, `{"role":"MEMBER"}`, and a body that isn't JSON.
  - In `http.test.ts`: `User Service down is 503 SERVICE_UNAVAILABLE`. Build `createApp` with `new HttpSessionVerifier(cfg, fakeFetchReturning503)` and the stub supplier directory. `GET /api/v1/errands/open` → status `503`, body `{ error: "SERVICE_UNAVAILABLE", message: "Service temporarily unavailable" }`.

- [ ] **Step 2: Run and see them fail**
  Run: `cd order-service && node --import tsx --test --test-name-pattern "http verifier" test/adapters.test.ts`
  Expected: FAIL (`HttpSessionVerifier` is not exported).

- [ ] **Step 3: Implement** `upstream.ts`, then `HttpSessionVerifier`. Use `AbortSignal.timeout(timeoutMs)` for the timeout. Build the URL with `new URL("/auth/verify", baseUrl)`. In `errorHandler`, next to the `isDatabaseUnavailable` branch, map `UpstreamUnavailableError` to the same 503 body and log `http.upstream_unavailable` with `{ path, service, message }`. `UpstreamContractError` falls through to the existing 500 branch, which already logs.

- [ ] **Step 4: Run and see them pass.** Run the Step 2 command, then `TEST_DATABASE_URL=… npm test` for `http.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add order-service/src/adapters/upstream.ts order-service/src/adapters/sessionVerifier.ts order-service/src/http/errors.ts order-service/test/adapters.test.ts order-service/test/http.test.ts
  git commit -m "feat(order): verify sessions with the User Service over HTTP"
  ```

### Task 3: HTTP supplier directory and the create-errand outcomes

**Files:**
- Modify: `order-service/src/adapters/supplierDirectory.ts`, `order-service/src/http/routes.ts` (`POST /errands`, about line 112)
- Test: `order-service/test/adapters.test.ts` (new `describe("http supplier directory")`, plus an update to the stub test), `order-service/test/http.test.ts`

**Interfaces:**
- Consumes: `UpstreamConfig` (Task 1); `fetchWithTimeout`, `UpstreamUnavailableError`, `UpstreamContractError` (Task 2); `Principal` (existing).
- Produces:
  ```ts
  type SupplierLookup =
    | { kind: "active"; supplier: SupplierSnapshot }
    | { kind: "archived" }          // only reachable for an ADMINISTRATOR caller
    | { kind: "unavailable" }       // 404
    | { kind: "unauthenticated" };  // Supplier said 401
  interface SupplierDirectory { findSupplier(id: string, authorization: string): Promise<SupplierLookup> }
  class HttpSupplierDirectory implements SupplierDirectory { constructor(config: UpstreamConfig, fetchImpl?: typeof fetch) }
  // StubSupplierDirectory.findSupplier ignores authorization: one of STUB_SUPPLIERS → active, otherwise unavailable
  ```

- [ ] **Step 1: Write the failing tests.**
  - `http directory forwards the header and maps an ACTIVE supplier`: base `http://supplier-service:3000/` (trailing slash). Assert the URL is `http://supplier-service:3000/api/v1/suppliers/<id>`, the header is forwarded unchanged, and the result is `{ kind: "active", supplier: { id, name, buildingCode, locationDescription } }`. Extra fields such as `buildingLabel` and `version` are dropped.
  - `http directory maps ARCHIVED to archived`, `404 to unavailable`, `401 to unauthenticated`.
  - `http directory throws UpstreamContractError on 400, 403 and an unexpected 200 body`: cases with `status: "DELETED"`, a missing `name`, and an empty `buildingCode`.
  - `http directory throws UpstreamUnavailableError on 502, a network error and a timeout` (the timeout fake as in Task 2, `timeoutMs: 50`).
  - Update `returns the three fixed suppliers and null for unknown ids` to the new result shapes.
  - In `http.test.ts`, with a fake Supplier directory returning a fixed `SupplierLookup`, run `POST /api/v1/errands` with a valid body:
    - `archived supplier as administrator is 422 SUPPLIER_ARCHIVED`: caller `stub.<uuid>.ADMINISTRATOR`, lookup `archived` → `422`, `{ error: "SUPPLIER_ARCHIVED", message: "Supplier is archived; restore it to create an errand." }`.
    - `archived supplier as member is 422 SUPPLIER_UNAVAILABLE`: caller MEMBER, lookup `archived` → `422 SUPPLIER_UNAVAILABLE`.
    - `supplier 401 is 401 UNAUTHENTICATED`: lookup `unauthenticated` → `401`, `{ error: "UNAUTHENTICATED", message: "A valid session is required" }`.
    - `Supplier Service down is 503`: the directory throws `UpstreamUnavailableError` → `503 SERVICE_UNAVAILABLE`, and no errand row is written (assert `SELECT count(*) FROM errands` is unchanged).
    - `unexpected Supplier reply is 500`: the directory throws `UpstreamContractError` → `500 INTERNAL_ERROR`.

- [ ] **Step 2: Run and see them fail**
  Run: `cd order-service && node --import tsx --test --test-name-pattern "directory" test/adapters.test.ts`
  Expected: FAIL (`findSupplier` is not a function).

- [ ] **Step 3: Implement** `HttpSupplierDirectory`, switch the stub to `findSupplier`, and switch the route on `lookup.kind`. Pass `req.header("authorization")` to the directory; `authenticate()` has already guaranteed it is present. The archived case checks `user(res).role === "ADMINISTRATOR"`. Keep the existing `SUPPLIER_UNAVAILABLE` message.

- [ ] **Step 4: Run the whole suite and the type check**
  Run: `cd order-service && TEST_DATABASE_URL=postgres://postgres:postgres@localhost:55432/postgres npm test && npm run typecheck`
  Expected: all tests PASS (the 120 existing tests plus the new ones); typecheck clean.

- [ ] **Step 5: Commit**
  ```bash
  git add order-service/src/adapters/supplierDirectory.ts order-service/src/http/routes.ts order-service/test/adapters.test.ts order-service/test/http.test.ts
  git commit -m "feat(order): look up suppliers in the Supplier Service over HTTP"
  ```

### Task 4: Wire it up — entry point, compose, env example, docs, demo

**Files:**
- Modify: `order-service/src/index.ts`, `compose.yaml` (the `order-service` block), `.env.example` (the Order section), `order-service/README.md` (the stubs table and the settings table), `order-service/scripts/demo.sh`

**Interfaces:**
- Consumes: `loadAdapterConfig()` (Task 1); `HttpSessionVerifier` (Task 2); `HttpSupplierDirectory` (Task 3).

- [ ] **Step 1: `index.ts`.** Pick each adapter by mode: `authMode === "http" ? new HttpSessionVerifier(adapters.userService!) : new StubSessionVerifier()`, and the same for suppliers. Update the comment that says only the stubs exist. The `order_service.started` log already prints both modes.

- [ ] **Step 2: `compose.yaml`.** In `order-service.environment`, set `AUTH_MODE: http`, `SUPPLIER_MODE: http`, `USER_SERVICE_BASE_URL: http://user-service:3001`, `USER_SERVICE_VERIFY_TIMEOUT_MS: ${ORDER_USER_SERVICE_VERIFY_TIMEOUT_MS:-1000}`, `SUPPLIER_SERVICE_BASE_URL: http://supplier-service:3000` and `SUPPLIER_SERVICE_LOOKUP_TIMEOUT_MS: ${ORDER_SUPPLIER_SERVICE_LOOKUP_TIMEOUT_MS:-2000}`. Keep `CREDIT_MODE: stub` and reword its comment so it speaks only of Credit. Under `depends_on`, add `user-service: { condition: service_started }` and `supplier-service: { condition: service_started }`.

- [ ] **Step 3: `.env.example`.** In the Order section, add `ORDER_USER_SERVICE_VERIFY_TIMEOUT_MS=1000` and `ORDER_SUPPLIER_SERVICE_LOOKUP_TIMEOUT_MS=2000`, each with a one-line comment saying what it is. Add an `Additional AI assistance` header line.

- [ ] **Step 4: README.** In `order-service/README.md`, replace "still **stubs**" with the modes as they are now (User and Supplier `http` by default in compose; Credit stub). Add the four new variables to the settings table. State the response codes from the Global Constraints, with no reasoning text; a `TODO(author): rationale` marker goes wherever a "why" belongs.

- [ ] **Step 5: `demo.sh`.**
  - Replace the stub identities: read `ALLOWED_EMAIL_DOMAIN` and `BOOTSTRAP_ADMIN_USERNAME`/`BOOTSTRAP_ADMIN_PASSWORD` from `$ROOT/.env`.
  - Register three members (`POST $BASE/auth/register`, usernames `demo_<a|b|c>_<epoch>`, password `DemoPass1`) and expect `201`. Log each in (`POST $BASE/auth/login` with `{identifier, password}`) and expect `200`, then take `.accessToken`. Log the administrator in the same way.
  - Read A, B, C and D's ids from `GET $BASE/whoami` (they're used in later checks).
  - Set `SUPPLIER` to `.items[0].id` from `GET $BASE/suppliers?size=1`, and fail if it's null.
  - Update the usage line to `docker compose up -d --build`, and add a disclosure line.
  - Leave every later step unchanged.

- [ ] **Step 6: Verify.**
  - `cd order-service && npm run typecheck && TEST_DATABASE_URL=… npm test` → all PASS.
  - `docker compose --env-file .env.example config -q` with placeholder values (as in the CI fix) → no error.
  - With Docker running: `docker compose up -d --build && bash order-service/scripts/demo.sh` → exits 0. Then `docker compose stop user-service` and `curl -H "Authorization: Bearer <token>" localhost:8080/api/v1/errands/open` → `503`. Then `docker compose start user-service`.

- [ ] **Step 7: Commit, plus a usage-log entry for Tasks 1–4**
  ```bash
  git add order-service/src/index.ts compose.yaml .env.example order-service/README.md order-service/scripts/demo.sh ai/usage-log.md
  git commit -m "feat(order): run against the real User and Supplier services in compose"
  ```

## Coverage check (spec → task)

| Spec decision | Task |
|---|---|
| R1 Q1, R2 conflict + 1–2: archived / unknown supplier | 3 |
| R1 Q2, R2 3–4, R4 Q1–Q2, R5 3: 503 on down/timeout, including User on every request | 2 (User), 3 (Supplier) |
| R1 Q3: forward the caller's token | 2, 3 |
| R1 Q4, R2 6: stubs stay; `http` mode values | 1, 4 |
| R2 5, R3: timeouts and variable names | 1, 4 |
| R4 Q1: Supplier 401 / 400 / 403 | 3 |
| R4 Q2: User 4xx other than 401 → 500 | 2 |
| R4 Q3: unexpected 200 → 500 | 2, 3 |
| R4 Q4: no retries | 2, 3 (none implemented) |
| R4 Q5: refuse to start without a URL | 1 |
| R4 Q6, R5 1: compose http mode, start order | 4 |
| R4 Q7, R5 2: `ORDER_`-prefixed `.env` names | 4 |
| R4 Q8: real logins in the demo, stubs in unit tests | 2, 3, 4 |
| R5 Q4: Order's 401 body | 3 |
