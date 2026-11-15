<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
Scope: Drafted an implementation plan for the Order Service core from the team's D1 requirements,
       the D3 instructions and the Credit Service message contract on origin/branch_credit.
       Every design call is listed in "Design calls" for the author to accept or change.
Author review: Reviewed and approved by @mattis.
Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-16
Scope: Added one open-question line under the design calls (pickup-timeout re-listing).
Author review: Reviewed and approved by @mattis.
-->

# Order Service Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A running, containerized Order Service that takes an errand from creation through every lifecycle state to a terminal state, emits credit messages through an outbox, and talks to User, Supplier and Credit Services only through swappable stub adapters.

**Architecture:** Express + `pg` service in `order-service/`, modelled on `credit-service` (branch `origin/branch_credit`) and `user-service`. Every state change is one conditional `UPDATE … WHERE state = ANY(allowed) AND <party check> AND <deadline check>` inside a transaction that also appends history and, for terminal states, an outbox row. The transition rules live in one table (`TRANSITIONS`) used by the HTTP actions, the credit-reply handler and the deadline sweeper alike. Other services sit behind three interfaces (`SessionVerifier`, `SupplierDirectory`, `MessagePublisher`); this plan ships only stub implementations.

**Tech Stack:** Node 22, TypeScript (`tsc`, `tsx`), Express 5, `pg`, PostgreSQL 17, `node:test`, Docker Compose.

**Spec:** No separate spec. Requirements: `CS3219_Project_Related_Docs/Project-D1-filled-in-requirements-list.md` (Order Service section, OS-F1 to OS-F7, OS-NFR1 to OS-NFR3). Assessment: `CS3219_Project_Related_Docs/CS3219-Instructions-MilestoneD3.pdf` Part 1 and Part 4. Message contract (settled by the author, 2026-10-16): `order-service/docs/order-credit-contract.md`. It matches what `credit-service/src/messages.ts` on `origin/branch_credit` validates.

## Design calls (accepted as written by the author, 2026-10-16)

The repo's AI policy has the author make design decisions.

> **Open question for the author:** `pickupTimeout` and a late `withdraw` return an errand to `OPEN` already past its `listing_deadline` (the schema enforces `listing_deadline <= pickup_deadline`), so it cannot be re-accepted and expires in the same sweep. OS-F2.2.2 promises re-listing; the behaviour is kept and documented in the README under "Known deviations".

1. **Database: PostgreSQL 17, own `order-db`.** The service needs row locks and conditional updates for single-winner accepts, and the outbox needs the errand change and the event in one transaction.
2. **A state before OPEN.** `PENDING_RESERVATION` (hidden from couriers) → `OPEN` on `CreditReserved`, or → `RESERVATION_REJECTED` (terminal, no credit event, `rejection_reason` stored) on `CreditReservationRejected`.
3. **The first outcome is final, and a reply has a time limit (author decision, Option A).**
   - If no reply arrives by `reservation_deadline` (= `created_at + RESERVATION_TIMEOUT_SECONDS`, default 30), the sweeper moves the errand `PENDING_RESERVATION` → `RESERVATION_TIMED_OUT` (terminal) and writes a `ReservationTimedOut` message. That message tells Credit to release a hold if one exists.
   - A late `CreditReserved` for a `RESERVATION_REJECTED` errand writes an `OrderCancelled` to release the hold.
   - Late replies for a `RESERVATION_TIMED_OUT` errand, and a late rejection for an `OPEN` errand, are ignored.
   - See the contract doc, "Why the timeout can't strand credits".
4. **Duplicate detection comes from the state guards.** A repeated credit reply finds the errand already moved and does nothing, so there's no `processed_messages` table.
5. **Supplier snapshot.** The errand stores `supplier_id` plus a copy of name, building code and location description taken at creation. Later supplier edits or archiving don't change existing errands. New errands need an `ACTIVE` supplier.
6. **Users are referenced by ID only** (`requester_id`, `courier_id`). Usernames are looked up by the frontend.
7. **Confirmation deadline** = `delivered_at + CONFIRMATION_WINDOW_MINUTES` (default 1440). D1 names the deadline (OS-F3.5) but doesn't define it.
8. **Deadlines are enforced at the moment of the action and by a sweeper.** Accepting after the listing deadline fails even if the sweeper hasn't run yet.
9. **Repeated actions return an error.** A second `confirm` returns `409 INVALID_STATE` with `currentState: "COMPLETED"`. The client can treat that as success. Only the first produces `OrderCompleted`.
10. **Admins can't resolve a dispute they're part of** (as requester or courier).
11. **Creation returns `202 Accepted`** with the errand in `PENDING_RESERVATION`, because the reservation is asynchronous.
12. **Limits:** `credit_amount` is a whole number from 1 to 1000. Items: 1–20 entries of `{ name: 1–100 chars, quantity: 1–99 }`. `dropoffLocation` is 1–200 chars. `notes` is ≤ 500 chars or absent. Unknown body fields are rejected.
13. **No cancel while `PENDING_RESERVATION`** (contract rule 3). There's no hold to release yet, so `cancel` starts only from `OPEN` or `ACCEPTED`.
14. **Port 3002, paths without a prefix** (`/errands`, like User Service). The gateway maps `/api/v1/errands` → `/errands` and `/api/v1/admin/errands` → `/admin/errands`.

**Not in this plan (follow-ups):**
- Real adapters: User Service `/auth/verify`, Supplier `GET /api/v1/suppliers/:id`, the Kafka producer/consumer.
- Credit Service support for `ReservationTimedOut`: the parser, the handler and migration `0002`, listed in the contract doc under "Changes needed in Credit Service". Until then, the stand-in covers it.
- OS-F6, reacting to account suspensions. It needs the User Service publisher.
- Frontend pages.
- Network isolation in compose.

## Global Constraints

- Every new source, SQL, shell and Dockerfile starts with the repo's AI disclosure header (`Tool: Claude Code (Claude Opus 5.5), date: <date>`, `Scope: …`, `Author review: PENDING`), as in `user-service/src/authenticate.ts`. Add one entry per task to `ai/usage-log.md`.
- Work on the branch `feat/order-service-core`. Commit messages follow `feat(order): …` / `test(order): …` / `docs(order): …` and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Credit messages follow `order-service/docs/order-credit-contract.md` exactly:
  - Fields are snake_case: `type`, `schema_version: 1`, `operation_id`, `order_id`, `requester_id`, `amount`, `occurred_at`.
  - Terminal events also carry `courier_id`: the courier's UUID on `OrderCompleted`, `null` on `OrderCancelled`, `OrderExpired` and `OrderFailed`.
  - `ReserveRequested` and `ReservationTimedOut` have no `courier_id` key.
  - Topics: `credit.commands` (out, key `order_id`) and `credit.results` (in).
- `order_id` in messages is the errand's `id`. `ReserveRequested.operation_id` is the errand's `reservation_operation_id`, fixed at creation. Each terminal event gets a new `operation_id` when its outbox row is written, and a resend reuses the stored payload unchanged.
- The contract's five rules hold everywhere:
  1. one `ReserveRequested` per errand
  2. at most one closing message (terminal event or `ReservationTimedOut`) per errand, except the `OrderCancelled` for a late `CreditReserved` after a rejection
  3. no terminal event before `CreditReserved`; `ReservationTimedOut` is the only closing message allowed before a reply
  4. terminal `requester_id` and `amount` equal the errand's
  5. outbox rows are published in `created_at` order
- Error bodies are `{ "error": "<CODE>", "message": "<text>" }`, matching User Service. 409s also include `currentState`.
- Only `src/config.ts` reads `process.env`.
- Database roles: `order_bootstrap` (superuser, used only by the init script), `order_migrator` (owns the schema), `order_app` (row access only). DB name `orders`.
- Base images: `node:22.23.3-alpine3.24` and `postgres:17.11-alpine3.24`, as in User Service.
- DB tests need `TEST_DATABASE_URL`, a superuser URL for a disposable server, e.g. `docker run --rm -d --name order-test-pg -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:17.11-alpine3.24` → `postgres://postgres:postgres@localhost:55432/postgres`.

## Review Focus

1. **Deadline that passed before the sweeper ran.** Accept, pickup, deliver or reject after the relevant deadline must fail with `409 DEADLINE_PASSED` → test `rejects accept after listing deadline even before sweep` in Task 3.
2. **Timestamps without a time-zone offset** (`"2026-10-20T10:00:00"`) are ambiguous. Reject them with 400 → test `rejects deadline without offset` in Task 2.
3. **Wrong JSON types:** `creditAmount` as `"10"` or `10.5`, `items: []`, an extra field. Each is a 400 listing the field, never a 500 → tests in Task 2.
4. **A path ID that isn't a UUID** (`/errands/abc/accept`) returns 404, not a Postgres `22P02` 500 → test `non-uuid id is 404` in Task 8.
5. **A credit reply for an unknown `order_id`** is logged and ignored, never thrown, so the consumer doesn't get stuck → test `ignores reply for unknown order` in Task 4.

---

## File structure

```
order-service/
  package.json, tsconfig.json, Dockerfile, .dockerignore, README.md, AGENTS.md
  docs/order-credit-contract.md        settled Order ⇄ Credit messages (exists; source of truth)
  docker/postgres/init-roles.sh        creates order_migrator and order_app
  migrations/0001_create_order_tables.sql
  scripts/demo.sh                      curl walkthrough for the D3 demo
  src/
    config.ts                          all env reading
    db.ts                              createPool, inTransaction, rollback   (copy from credit-service)
    dbAvailability.ts                  isDatabaseUnavailable, retries       (copy from credit-service)
    migrations.ts, migrate.ts          migration runner                     (copy from credit-service)
    log.ts                             JSON line logger                     (copy from credit-service)
    domain/states.ts                   ErrandState, TERMINAL_STATES
    domain/transitions.ts              TRANSITIONS table
    domain/validation.ts               validateCreateErrand
    domain/messages.ts                 outgoing payload builders, parseCreditResult
    errands/errand.ts                  Errand type, mapErrandRow
    errands/repository.ts              createErrand, applyTransition
    errands/queries.ts                 listOpen, listMine, getErrandForViewer, adminListErrands
    credit/creditResults.ts            handleCreditResult
    deadlines/sweeper.ts               sweepDeadlines, startDeadlineSweeper
    outbox.ts                          insertOutboxEvent, publishOutboxBatch, startOutboxPublisher
    adapters/sessionVerifier.ts        SessionVerifier, StubSessionVerifier
    adapters/supplierDirectory.ts      SupplierDirectory, StubSupplierDirectory
    adapters/creditBus.ts              MessagePublisher, StubCreditBus
    http/app.ts                        createApp
    http/auth.ts                       authenticate, requireRole
    http/errors.ts                     transition error → HTTP status
    http/routes.ts                     errand + admin routes
    index.ts                           wiring and shutdown
  test/helpers.ts, test/*.test.ts
compose.yaml, .env.example, frontend/nginx.conf, frontend/vite.config.ts   (modified in Task 9)
```

---

### Task 1: Scaffold, schema and migration runner

**Files:**
- Create: `order-service/package.json`, `tsconfig.json`, `src/config.ts`, `src/db.ts`, `src/dbAvailability.ts`, `src/log.ts`, `src/migrations.ts`, `src/migrate.ts`, `migrations/0001_create_order_tables.sql`, `test/helpers.ts`, `test/schema.test.ts`
- Replace the empty: `order-service/AGENTS.md` (pointer to this plan and the README)

**Interfaces:**
- Produces: `createPool(): Pool`, `inTransaction<T>(pool, fn: (c: PoolClient) => Promise<T>): Promise<T>`, `rollback<T>(r: T): never`, `isUniqueViolation(err): boolean` (same as credit-service `src/db.ts`). `migrate(client: Client): Promise<void>`. `createTestDatabase(): Promise<{ pool: Pool; drop(): Promise<void> }>`, which creates the `order_app` role if missing and applies the migrations.

- [ ] **Step 1: Copy the credit-service files.** Copy `package.json` (name `order-service`, deps `express@^5`, `pg`; devDeps `@types/express`, `@types/node`, `@types/pg`, `tsx`, `typescript`; no Kafka dependency yet), `tsconfig.json`, `db.ts` (drop `toAmount`), `dbAvailability.ts`, `log.ts`, `migrations.ts`, `migrate.ts` and the `createTestDatabase` part of `test/helpers.ts` from `origin/branch_credit` with `git show origin/branch_credit:credit-service/<path>`. Rename `credit` → `order`. `config.ts` exports `loadDatabaseConfig()` and `DB_RESILIENCE` (same values) for now.

- [ ] **Step 2: Write `migrations/0001_create_order_tables.sql`**

```sql
CREATE TYPE errand_state AS ENUM (
  'PENDING_RESERVATION','RESERVATION_REJECTED','RESERVATION_TIMED_OUT','OPEN','ACCEPTED','PICKED_UP',
  'DELIVERED','DISPUTED','COMPLETED','CANCELLED','EXPIRED','FAILED');

CREATE TABLE errands (
  id                             UUID PRIMARY KEY,
  requester_id                   UUID NOT NULL,
  courier_id                     UUID,
  supplier_id                    UUID NOT NULL,
  supplier_name                  TEXT NOT NULL,
  supplier_building_code         TEXT NOT NULL,
  supplier_location_description  TEXT NOT NULL,
  items                          JSONB NOT NULL,
  dropoff_location               TEXT NOT NULL,
  notes                          TEXT,
  credit_amount                  INTEGER NOT NULL CHECK (credit_amount BETWEEN 1 AND 1000),
  state                          errand_state NOT NULL DEFAULT 'PENDING_RESERVATION',
  reservation_operation_id       UUID NOT NULL UNIQUE,
  rejection_reason               TEXT,
  reservation_deadline           TIMESTAMPTZ NOT NULL,
  listing_deadline               TIMESTAMPTZ NOT NULL,
  pickup_deadline                TIMESTAMPTZ NOT NULL,
  delivery_deadline              TIMESTAMPTZ NOT NULL,
  confirm_deadline               TIMESTAMPTZ,
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at                    TIMESTAMPTZ,
  picked_up_at                   TIMESTAMPTZ,
  delivered_at                   TIMESTAMPTZ,
  closed_at                      TIMESTAMPTZ,
  CHECK (listing_deadline <= pickup_deadline AND pickup_deadline <= delivery_deadline),
  CHECK (courier_id IS NULL OR courier_id <> requester_id),
  CHECK ((state IN ('ACCEPTED','PICKED_UP','DELIVERED')) <= (courier_id IS NOT NULL)),
  CHECK ((state IN ('PENDING_RESERVATION','OPEN')) <= (courier_id IS NULL))
);
CREATE INDEX errands_open_idx      ON errands (listing_deadline) WHERE state = 'OPEN';
CREATE INDEX errands_requester_idx ON errands (requester_id, created_at DESC);
CREATE INDEX errands_courier_idx   ON errands (courier_id, created_at DESC) WHERE courier_id IS NOT NULL;
CREATE INDEX errands_state_idx     ON errands (state, created_at DESC);
CREATE INDEX errands_pending_idx   ON errands (reservation_deadline) WHERE state = 'PENDING_RESERVATION';

-- Append-only lifecycle record: shown on the errand detail and to admins in disputes
CREATE TABLE errand_history (
  id          BIGSERIAL PRIMARY KEY,
  errand_id   UUID NOT NULL REFERENCES errands(id),
  from_state  errand_state,
  to_state    errand_state NOT NULL,
  action      TEXT NOT NULL,
  actor_type  TEXT NOT NULL CHECK (actor_type IN ('USER','SYSTEM','CREDIT')),
  actor_id    UUID,
  reason      TEXT,
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX errand_history_errand_idx ON errand_history (errand_id, id);

CREATE TABLE outbox (
  event_id      UUID PRIMARY KEY,
  event_type    TEXT NOT NULL,
  topic         TEXT NOT NULL,
  message_key   TEXT NOT NULL,
  payload       JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ
);
CREATE INDEX outbox_unpublished_idx ON outbox (created_at) WHERE published_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON errands TO order_app;
GRANT SELECT, INSERT ON errand_history TO order_app;
GRANT USAGE ON SEQUENCE errand_history_id_seq TO order_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON outbox TO order_app;
```

- [ ] **Step 3: Write failing tests in `test/schema.test.ts`.** Insert directly through SQL. Each assertion expects a Postgres check violation (`code === "23514"`):
  - `rejects unordered deadlines`: listing after pickup.
  - `rejects courier equal to requester`.
  - `rejects ACCEPTED without courier`.
  - `rejects credit_amount 0 and 1001`.
  - `order_app cannot update errand_history`: `SET ROLE order_app; UPDATE errand_history …` fails with `42501`.

- [ ] **Step 4: Run.** `cd order-service && npm install && TEST_DATABASE_URL=… npm test`. Expected: FAIL before the migration exists, PASS after Step 2 is in place.

- [ ] **Step 5: Commit.** `feat(order): scaffold service, schema and migration runner`

---

### Task 2: States, transition table and create-input validation (pure code)

**Files:**
- Create: `src/domain/states.ts`, `src/domain/transitions.ts`, `src/domain/validation.ts`, `test/transitions.test.ts`, `test/validation.test.ts`

**Interfaces:**
- Produces:
  - `type ErrandState` (the 12 enum values). `TERMINAL_STATES: ReadonlySet<ErrandState>` = `RESERVATION_REJECTED, RESERVATION_TIMED_OUT, COMPLETED, CANCELLED, EXPIRED, FAILED`.
  - `type Action = "accept" | "withdraw" | "pickup" | "deliver" | "confirm" | "reject" | "cancel" | "resolveForCourier" | "resolveForRequester" | "expire" | "pickupTimeout" | "deliveryTimeout" | "confirmTimeout"`.
  - `type Party = "requester" | "courier" | "nonRequester" | "admin" | "system"`.
  - `type DeadlineColumn = "reservation_deadline" | "listing_deadline" | "pickup_deadline" | "delivery_deadline" | "confirm_deadline"`.
  - `type TerminalEventType = "OrderCompleted" | "OrderCancelled" | "OrderExpired" | "OrderFailed"`. `type ClosingMessageType = TerminalEventType | "ReservationTimedOut"`.
  - `interface TransitionRule { from: readonly ErrandState[]; to: ErrandState; party: Party; deadline?: { column: DeadlineColumn; mustHavePassed: boolean }; closingMessage?: ClosingMessageType; courier?: "assign" | "clear"; stamp?: "accepted_at" | "picked_up_at" | "delivered_at" }`.
  - `TRANSITIONS: Readonly<Record<Action, TransitionRule>>`.
  - `interface CreateErrandInput { supplierId: string; items: { name: string; quantity: number }[]; dropoffLocation: string; notes: string | null; creditAmount: number; listingDeadline: Date; pickupDeadline: Date; deliveryDeadline: Date }`.
  - `validateCreateErrand(body: unknown, now: Date): { ok: true; value: CreateErrandInput } | { ok: false; errors: { field: string; message: string }[] }`.

The transition table these encode (copy the values exactly):

| Action | From | To | Party | Deadline | Terminal event | Courier / stamp |
|---|---|---|---|---|---|---|
| accept | OPEN | ACCEPTED | nonRequester | listing, must not have passed | | assign / accepted_at |
| withdraw | ACCEPTED | OPEN | courier | | | clear |
| pickup | ACCEPTED | PICKED_UP | courier | pickup, must not have passed | | picked_up_at |
| deliver | PICKED_UP | DELIVERED | courier | delivery, must not have passed | | delivered_at |
| confirm | DELIVERED | COMPLETED | requester | | OrderCompleted | |
| reject | DELIVERED | DISPUTED | requester | confirm, must not have passed | | |
| cancel | OPEN, ACCEPTED | CANCELLED | requester | | OrderCancelled | |
| resolveForCourier | DISPUTED | COMPLETED | admin | | OrderCompleted | |
| resolveForRequester | DISPUTED | FAILED | admin | | OrderFailed | |
| expire | OPEN | EXPIRED | system | listing, has passed | OrderExpired | |
| pickupTimeout | ACCEPTED | OPEN | system | pickup, has passed | | clear |
| deliveryTimeout | PICKED_UP | DISPUTED | system | delivery, has passed | | |
| confirmTimeout | DELIVERED | COMPLETED | system | confirm, has passed | OrderCompleted | |
| reservationTimeout | PENDING_RESERVATION | RESERVATION_TIMED_OUT | system | reservation, has passed | ReservationTimedOut | |

Entering `DELIVERED` also sets `confirm_deadline = delivered_at + CONFIRMATION_WINDOW_MINUTES`. That's handled in Task 3, not in the table. `cancel` from `ACCEPTED` clears nothing: the courier stays recorded for history.

- [ ] **Step 1: Write failing tests**
  - `transitions.test.ts`:
    - `every rule targets a state not in its from list`.
    - `only rules that enter a terminal state other than RESERVATION_REJECTED have a closingMessage`: loop over `TRANSITIONS`, `assert.equal(TERMINAL_STATES.has(r.to) && r.to !== "RESERVATION_REJECTED", r.closingMessage !== undefined)`.
    - `only reservationTimeout leaves PENDING_RESERVATION`: no other rule has `PENDING_RESERVATION` in `from`. Credit replies use their own handler (Task 4), and `cancel` can't start there.
    - `no rule starts from a terminal state`.
  - `validation.test.ts`, with `now = new Date("2026-10-20T00:00:00Z")` and a valid body `{ supplierId: <uuid>, items: [{ name: "Latte", quantity: 1 }], dropoffLocation: "COM1 L2", creditAmount: 10, listingDeadline: "2026-10-20T01:00:00Z", pickupDeadline: "2026-10-20T02:00:00Z", deliveryDeadline: "2026-10-20T03:00:00Z" }`:
    - `accepts valid body`. `notes` absent → `null`.
    - `rejects creditAmount "10"`, `rejects creditAmount 10.5`, `rejects creditAmount 0`, `rejects creditAmount 1001`: each `errors[0].field === "creditAmount"`.
    - `rejects empty items`, `rejects 21 items`, `rejects item quantity 0`.
    - `rejects unknown field`: `{ ...valid, state: "OPEN" }` → field `state`.
    - `rejects deadline in the past` (OS-F1.3).
    - `rejects unordered deadlines`: pickup before listing → field `pickupDeadline`.
    - `rejects deadline without offset`: `"2026-10-20T01:00:00"` → field `listingDeadline`.
    - `rejects non-uuid supplierId`.

- [ ] **Step 2: Run** `npm test`. Expected: FAIL (modules missing).

- [ ] **Step 3: Implement** `states.ts`, `transitions.ts` (the table above) and `validation.ts`. The validator collects every field error rather than stopping at the first. Timestamps must match `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/` and parse. Strings are trimmed before length checks.

- [ ] **Step 4: Run** `npm test`. Expected: PASS.

- [ ] **Step 5: Commit.** `feat(order): errand states, transition table and input validation`

---

### Task 3: Create errand and apply transitions atomically

**Files:**
- Create: `src/errands/errand.ts`, `src/errands/repository.ts`, `src/domain/messages.ts`, `src/outbox.ts`, `test/repository.test.ts`
- Modify: `src/config.ts` (add `loadOrderConfig(): { confirmationWindowMinutes: number; reservationTimeoutSeconds: number }`, env `CONFIRMATION_WINDOW_MINUTES` default 1440 and `RESERVATION_TIMEOUT_SECONDS` default 30, each a whole number ≥ 1; `TOPICS = { commands: "credit.commands", results: "credit.results" }`)

**Interfaces:**
- Consumes: `TRANSITIONS`, `CreateErrandInput` (Task 2); `inTransaction`, `rollback` (Task 1).
- Produces:
  - `interface Errand` with camelCase fields for every `errands` column. Dates are `Date`, `items` is the parsed array. `mapErrandRow(row): Errand`.
  - `interface SupplierSnapshot { id: string; name: string; buildingCode: string; locationDescription: string }`.
  - `type Actor = { kind: "user"; id: string; role: "MEMBER" | "ADMINISTRATOR" } | { kind: "system" } | { kind: "credit" }`.
  - `createErrand(pool: Pool, requesterId: string, input: CreateErrandInput, supplier: SupplierSnapshot): Promise<Errand>`. One transaction: insert the errand (fresh `id` and `reservation_operation_id`), a history row (`from_state NULL → PENDING_RESERVATION`, action `create`, `USER`), and an outbox `ReserveRequested`.
  - `type TransitionError = "NOT_FOUND" | "FORBIDDEN" | "CANNOT_ACCEPT_OWN_ERRAND" | "INVALID_STATE" | "DEADLINE_PASSED"`.
  - `applyTransition(pool: Pool, errandId: string, action: Action, actor: Actor, opts?: { reason?: string; now?: Date }): Promise<{ ok: true; errand: Errand } | { ok: false; error: TransitionError; currentState?: ErrandState }>`.
  - `applyTransitionInTx(client: PoolClient, …same args…)`: the same thing inside the caller's transaction. Task 4 and Task 6 use it.
  - `domain/messages.ts`: `reserveRequestedPayload(e: Errand)` → `{ type: "ReserveRequested", operation_id: e.reservationOperationId, order_id, requester_id, amount, occurred_at, schema_version: 1 }`. `terminalEventPayload(e: Errand, type: TerminalEventType, operationId: string)` → `{ type, operation_id, order_id, requester_id, courier_id, amount, occurred_at, schema_version: 1 }`, with `courier_id = e.courierId` for `OrderCompleted` and `null` otherwise. It throws if `type === "OrderCompleted"` and `e.courierId` is null. `reservationTimedOutPayload(e: Errand, operationId: string)` → `{ type: "ReservationTimedOut", operation_id, order_id, requester_id, amount, occurred_at, schema_version: 1 }`, with no `courier_id` key. `closingMessagePayload(e: Errand, type: ClosingMessageType, operationId: string)` picks between the two.
  - `createErrand` sets `reservation_deadline = now + RESERVATION_TIMEOUT_SECONDS`.
  - `outbox.ts`: `insertOutboxEvent(client, { eventType, topic, key, payload }): Promise<string>`, the same as credit-service but without `causation_id`.

`applyTransitionInTx` approach: one `UPDATE errands SET state = $to, updated_at = $now, … WHERE id = $id AND state = ANY($from) AND <party> AND <deadline> RETURNING *`.
- Party clause:
  - requester: `requester_id = $actor`
  - courier: `courier_id = $actor`
  - nonRequester: `requester_id <> $actor`
  - admin: `$role = 'ADMINISTRATOR' AND requester_id <> $actor AND courier_id IS DISTINCT FROM $actor`
  - system: `$kind = 'system'`
- Deadline clause: `<col> > $now` when it must not have passed, `<col> <= $now` when it must have.
- If 1 row comes back: insert history, and if the rule has a `closingMessage`, insert the outbox row (`closingMessagePayload`) with a fresh `operation_id` and set `closed_at`.
- If 0 rows come back: `SELECT` the row and classify the error in this order:
  1. missing → `NOT_FOUND`
  2. party fails → `accept` by the requester → `CANNOT_ACCEPT_OWN_ERRAND`; otherwise a non-party member sees `NOT_FOUND` unless the errand is `OPEN`; a party with the wrong role → `FORBIDDEN`
  3. state not in `from` → `INVALID_STATE` + `currentState`
  4. otherwise → `DEADLINE_PASSED`

- [ ] **Step 1: Write failing tests in `test/repository.test.ts`.** Each test creates an errand with `createErrand`, then forces `state = 'OPEN'` with SQL where needed:
  - `create writes errand, history and one ReserveRequested`: state `PENDING_RESERVATION`. One outbox row with `topic === "credit.commands"` and `message_key === errand.id`. The payload's keys are exactly `type, schema_version, operation_id, order_id, requester_id, amount, occurred_at`, with `operation_id === errand.reservationOperationId`, `order_id === errand.id` and `amount === 10`.
  - `terminal payloads match the contract`: for each of the four terminal types, the keys are exactly `type, schema_version, operation_id, order_id, requester_id, courier_id, amount, occurred_at`. `courier_id` is B on `OrderCompleted` and `null` on the other three. `operation_id` differs from `reservationOperationId`.
  - `cancel while PENDING_RESERVATION is INVALID_STATE and writes no outbox row` (contract rule 3).
  - `happy path reaches COMPLETED with one OrderCompleted`: accept (B) → pickup → deliver → confirm (A). One outbox row of type `OrderCompleted` with `courier_id === B`, `requester_id === A`, `amount === 10`. Five history rows after create (create + 4).
  - `deliver sets confirm_deadline`: `confirmDeadline − deliveredAt === 1440 min`.
  - `requester cannot accept own errand`: error `CANNOT_ACCEPT_OWN_ERRAND`, state still `OPEN` (OS-F3.1.2).
  - `ten concurrent accepts: exactly one wins`: `Promise.all` of 10 different couriers → one `ok: true`, nine `INVALID_STATE` with `currentState: "ACCEPTED"` (OS-F3.1.3, OS-NFR2.1).
  - `accept racing cancel: one wins, the other gets INVALID_STATE`: repeat 20 times. Final state is `ACCEPTED` or `CANCELLED`, and `OrderCancelled` rows equal the number of cancel wins.
  - `confirm twice: second is INVALID_STATE and only one OrderCompleted`.
  - `unrelated member cannot pickup`: `NOT_FOUND` (the errand isn't `OPEN`). `requester cannot pickup`: `FORBIDDEN`.
  - `rejects accept after listing deadline even before sweep`: `now` passed after `listingDeadline` → `DEADLINE_PASSED`, state `OPEN`.
  - `cancel from ACCEPTED emits OrderCancelled with courier_id null`.
  - `withdraw returns to OPEN and clears courier; no outbox row` (OS-F2.2.2, CS-F2.1.3).
  - `admin party to dispute cannot resolve it`: `FORBIDDEN`. `admin resolves for requester → FAILED + OrderFailed`.

- [ ] **Step 2: Run** `npm test`. Expected: FAIL.

- [ ] **Step 3: Implement** `errand.ts`, `messages.ts`, `outbox.ts` (insert only) and `repository.ts` as above. `applyTransition` = `inTransaction(pool, c => applyTransitionInTx(c, …))`. When there's a classified error, call `rollback(result)` so the history and outbox inserts are never half-written.

- [ ] **Step 4: Run** `npm test`. Expected: PASS.

- [ ] **Step 5: Commit.** `feat(order): atomic create and state transitions with outbox events`

---

### Task 4: Handle credit replies

**Files:**
- Create: `src/credit/creditResults.ts`, `test/creditResults.test.ts`
- Modify: `src/domain/messages.ts` (add the parser)

**Interfaces:**
- Consumes: `applyTransitionInTx`-style conditional update pattern, `insertOutboxEvent`, `terminalEventPayload` (Task 3).
- Produces:
  - `type CreditResult = { type: "CreditReserved"; eventId: string; operationId: string; orderId: string; reservationId: string } | { type: "CreditReservationRejected"; eventId: string; operationId: string; orderId: string; reasonCode: string }`.
  - `parseCreditResult(raw: unknown): { ok: true; message: CreditResult } | { ok: false; reason: string }`. Requires `schema_version === 1` and UUID fields. Unknown `type` is invalid.
  - `handleCreditResult(pool: Pool, msg: CreditResult): Promise<"opened" | "rejected" | "duplicate" | "late_reserve_cancelled" | "ignored_unknown_order" | "ignored_operation_mismatch">`.

Rules, all in one transaction with `SELECT … FOR UPDATE` on the errand:
- No errand → `ignored_unknown_order`, logged at warn level.
- `msg.operationId !== reservation_operation_id` → `ignored_operation_mismatch`.
- `CreditReserved`:
  - `PENDING_RESERVATION` → `OPEN`, with history (`CREDIT`, action `reserved`) → `opened`.
  - `RESERVATION_REJECTED` → insert an `OrderCancelled` outbox row (`terminalEventPayload(errand, "OrderCancelled", randomUUID())`, so the errand's `requester_id` and `amount`, `courier_id: null`), and history (action `late_reserve_released`, state unchanged) → `late_reserve_cancelled`. A second late `CreditReserved` finds that history row and returns `duplicate`, so rule 2 still holds.
  - `RESERVATION_TIMED_OUT` → history only (action `late_reply_after_timeout`), no outbox row: the `ReservationTimedOut` already sent releases the hold → `ignored_after_timeout`.
  - Anything else → `duplicate`.
- `CreditReservationRejected`:
  - `PENDING_RESERVATION` → `RESERVATION_REJECTED`, `rejection_reason = reasonCode`, `closed_at` set → `rejected`.
  - `RESERVATION_TIMED_OUT` → `ignored_after_timeout`, nothing written.
  - Anything else → `duplicate`.

Add `"ignored_after_timeout"` to `handleCreditResult`'s return type.

- [ ] **Step 1: Write failing tests.** Names map one-to-one to the rules:
  - `reserved opens the errand`
  - `rejected closes the errand with reason INSUFFICIENT_CREDIT and writes no outbox row`
  - `duplicate CreditReserved is a no-op` (outbox count unchanged)
  - `late CreditReserved after rejection writes OrderCancelled with amount and requester` (design call 3)
  - `second late CreditReserved writes no second OrderCancelled` (contract rule 2)
  - `late rejection after OPEN is ignored`
  - `late CreditReserved after timeout writes no outbox row`: the state stays `RESERVATION_TIMED_OUT`, and the only closing message in the outbox is the sweeper's `ReservationTimedOut` (contract rule 2)
  - `late rejection after timeout is ignored`
  - `ignores reply for unknown order`
  - `parseCreditResult rejects schema_version 2 and missing order_id`

- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS.

- [ ] **Step 5: Commit.** `feat(order): handle credit reservation replies`

---

### Task 5: Read queries

**Files:**
- Create: `src/errands/queries.ts`, `test/queries.test.ts`

**Interfaces:**
- Consumes: `Errand`, `mapErrandRow` (Task 3).
- Produces:
  - `interface Page<T> { items: T[]; page: number; size: number; totalItems: number }`. `page` starts at 0, default `size` is 20, max 100.
  - `listOpen(pool, viewerId: string, p: { page: number; size: number }): Promise<Page<Errand>>`. `state = 'OPEN' AND requester_id <> viewer AND listing_deadline > now()`, ordered by `listing_deadline ASC` (OS-F4.1 to F4.1.3).
  - `listMine(pool, userId: string, q: { as: "requester" | "courier"; state?: ErrandState; page: number; size: number }): Promise<Page<Errand>>`, ordered by `created_at DESC` (OS-F7.1, F7.2).
  - `getErrandForViewer(pool, id: string, viewer: { id: string; role: string }): Promise<(Errand & { history: HistoryEntry[] }) | null>`. Visible to the requester, the courier, any admin, or anyone while it's `OPEN`. Otherwise `null`.
  - `interface HistoryEntry { fromState: ErrandState | null; toState: ErrandState; action: string; actorType: string; actorId: string | null; reason: string | null; at: Date }`.
  - `adminListErrands(pool, q: { requesterId?: string; courierId?: string; state?: ErrandState; page: number; size: number }): Promise<Page<Errand>>`.

- [ ] **Step 1: Write failing tests**
  - `listOpen excludes own errands`
  - `listOpen excludes PENDING_RESERVATION, ACCEPTED and past-listing errands`
  - `listMine as courier shows only assigned errands`
  - `getErrandForViewer hides an ACCEPTED errand from an unrelated member` (returns `null`)
  - `getErrandForViewer includes history in order`
  - `adminListErrands filters by requesterId and state DISPUTED`
  - `paging returns totalItems and respects size`

- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS.

- [ ] **Step 5: Commit.** `feat(order): errand read queries`

---

### Task 6: Deadline sweeper

**Files:**
- Create: `src/deadlines/sweeper.ts`, `test/sweeper.test.ts`
- Modify: `src/config.ts` (add `SWEEPER = { intervalMs: 5_000, batchSize: 100 }`)

**Interfaces:**
- Consumes: `applyTransitionInTx`, `Actor` `{ kind: "system" }` (Task 3).
- Produces:
  - `sweepDeadlines(pool: Pool, now?: Date): Promise<{ reservationTimeout: number; expire: number; pickupTimeout: number; deliveryTimeout: number; confirmTimeout: number }>`.
  - `startDeadlineSweeper(pool: Pool): { stop(): Promise<void> }`.

Approach: for each of the four system actions, run one transaction that does `SELECT id FROM errands WHERE state = <from> AND <deadline col> <= $now ORDER BY <col> LIMIT batchSize FOR UPDATE SKIP LOCKED` and then calls `applyTransitionInTx` for each ID. Repeat until a batch comes back short. `SKIP LOCKED` lets two replicas run without double-processing. The conditional update in `applyTransitionInTx` already makes a lost race harmless. The loop catches and logs errors without crashing.

- [ ] **Step 1: Write failing tests**
  - `expires OPEN past listing deadline with one OrderExpired` (OS-F2.1.2)
  - `pickup timeout returns ACCEPTED to OPEN and clears courier` (OS-F2.2.2)
  - `delivery timeout moves PICKED_UP to DISPUTED, no outbox row` (OS-F2.3.1)
  - `confirm timeout completes DELIVERED with OrderCompleted` (OS-F3.5)
  - `reservation timeout closes PENDING_RESERVATION with one ReservationTimedOut`: the payload has no `courier_id` key, and `amount` and `requester_id` equal the errand's
  - `reply racing reservation timeout: never both`: 20 rounds of `handleCreditResult(CreditReserved)` against `sweepDeadlines` past the deadline. The final state is `OPEN` xor `RESERVATION_TIMED_OUT`, and `ReservationTimedOut` rows equal the `RESERVATION_TIMED_OUT` count.
  - `leaves errands before their deadline alone`
  - `two concurrent sweeps produce one OrderExpired per errand`: 30 expired errands, `Promise.all([sweep, sweep])` → 30 outbox rows
  - `accept racing expiry: never both`: 20 rounds. Final state is `ACCEPTED` xor `EXPIRED`. `OrderExpired` count equals the `EXPIRED` count.

- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS.

- [ ] **Step 5: Commit.** `feat(order): deadline sweeper for expiry and timeouts`

---

### Task 7: Outbox publisher and stub adapters

**Files:**
- Modify: `src/outbox.ts` (add the publisher)
- Create: `src/adapters/sessionVerifier.ts`, `src/adapters/supplierDirectory.ts`, `src/adapters/creditBus.ts`, `test/outbox.test.ts`, `test/adapters.test.ts`
- Modify: `src/config.ts` (add `loadAdapterConfig(): { authMode: "stub"; supplierMode: "stub"; creditMode: "stub"; stubCreditLimit: number; stubCreditDelayMs: number }`; env `AUTH_MODE`, `SUPPLIER_MODE`, `CREDIT_MODE` must each be `stub` and anything else throws `"<NAME>=<value> is not implemented yet"`; `STUB_CREDIT_LIMIT` default 100, `STUB_CREDIT_DELAY_MS` default 500, `STUB_CREDIT_SILENT_AMOUNT` default 999. A `ReserveRequested` with exactly this amount gets no reply, so the timeout can be demonstrated. The return type gains `stubCreditSilentAmount: number`.)

**Interfaces:**
- Consumes: `handleCreditResult` (Task 4), `insertOutboxEvent` (Task 3).
- Produces:
  - `interface OutboxMessage { eventId: string; topic: string; key: string; payload: Record<string, unknown> }`.
  - `publishOutboxBatch(pool, produce: (m: OutboxMessage[]) => Promise<void>): Promise<number>`, the same algorithm as credit-service `src/outbox.ts` (`FOR UPDATE SKIP LOCKED`, produce, mark, commit).
  - `startOutboxPublisher(pool, publisher: MessagePublisher): { stop(): Promise<void> }`. Batches back to back, with a 250 ms pause when there's nothing to send.
  - `interface MessagePublisher { publish(messages: OutboxMessage[]): Promise<void> }`.
  - `class StubCreditBus implements MessagePublisher`: `constructor(pool: Pool, opts: { limit: number; delayMs: number })`. It logs every message as `credit.stub.sent`. For each `ReserveRequested`, after `delayMs` it calls `handleCreditResult` with `CreditReserved` if `amount <= limit`, else `CreditReservationRejected` with `INSUFFICIENT_CREDIT`. Like real Credit, it keeps an in-memory hold per `order_id` (`{ requesterId, amount, status: "HELD" | "CAPTURED" | "RELEASED", operationIds }`) and checks every message against the contract:
    - A repeated `operation_id` is logged as `credit.stub.duplicate` and gets no new reply.
    - A second `ReserveRequested` for an `order_id` with a different `operation_id` gets no reply (contract rule 1).
    - A terminal event is logged as `credit.stub.contract_violation` with the reason, and the hold doesn't change, if any of these hold: there's no hold (rule 3), the hold is already finalised by a different `operation_id` (rule 2), `requester_id` or `amount` differ from the hold (rule 4), or the `courier_id` rule is broken.
    - A valid terminal event marks the hold `CAPTURED` or `RELEASED` and is logged as `credit.stub.applied`.
    - `ReservationTimedOut` releases a `HELD` hold (with the same requester and amount checks), does nothing when there's no hold, and is a violation only if the hold was finalised by a different `operation_id`.
    - A `ReserveRequested` whose amount equals `silentAmount` is recorded as a hold, so it can be released later, but gets no reply. This mimics a reply that's lost.
    - The constructor options gain `silentAmount: number`.
    - `violations(): string[]` returns every violation reason so far, for tests.
    - `idle(): Promise<void>` resolves when no replies are pending, for tests.
  - `interface Principal { id: string; role: "MEMBER" | "ADMINISTRATOR" }`. `interface SessionVerifier { verify(authorization: string | undefined): Promise<Principal | null> }`. `class StubSessionVerifier` accepts `Bearer stub.<uuid>.<MEMBER|ADMINISTRATOR>` and anything else gives `null`.
  - `interface SupplierDirectory { getActiveSupplier(id: string): Promise<SupplierSnapshot | null> }`. `class StubSupplierDirectory` uses `STUB_SUPPLIERS: readonly SupplierSnapshot[]`: three fixed suppliers with IDs `00000000-0000-4000-8000-00000000000{1,2,3}` (e.g. "Coffee Bean @ COM3"). An unknown ID gives `null`.

- [ ] **Step 1: Write failing tests**
  - `publish batch marks rows published and keeps order`
  - `failed produce leaves rows unpublished`
  - `two publishers never send the same row` (same as credit-service's test)
  - `stub bus opens errand within limit`: create amount 10, publish, `await bus.idle()` → `OPEN`
  - `stub bus rejects over limit`: amount 150 → `RESERVATION_REJECTED`, reason `INSUFFICIENT_CREDIT`
  - `silent reply ends in timeout and the hold is released`: amount 999, publish, `sweepDeadlines` after `reservation_deadline`, publish again → state `RESERVATION_TIMED_OUT`, stub hold `RELEASED`, `violations()` empty
  - `stub bus accepts a full lifecycle with no violations`: create → open → accept → pickup → deliver → confirm, publish → `violations()` is empty and the hold is `CAPTURED`
  - `stub bus flags a terminal event with the wrong amount`: publish a hand-built `OrderCancelled` with `amount: 11` for a hold of 10 → one violation mentioning `amount`
  - `stub bus ignores a duplicate terminal event`: publish the same `OrderCompleted` twice → hold `CAPTURED`, no violation, one `credit.stub.duplicate`
  - `stub verifier parses role and rejects malformed tokens`
  - `config rejects AUTH_MODE=user-service`

- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS.

- [ ] **Step 5: Commit.** `feat(order): outbox publisher and stub adapters for user, supplier and credit`

---

### Task 8: HTTP API

**Files:**
- Create: `src/http/app.ts`, `src/http/auth.ts`, `src/http/errors.ts`, `src/http/routes.ts`, `test/http.test.ts`

**Interfaces:**
- Consumes: Tasks 2–7.
- Produces: `createApp(deps: { pool: Pool; verifier: SessionVerifier; suppliers: SupplierDirectory }): express.Express`. Tests start it with `app.listen(0)` and call it with `fetch`. There's no new test dependency.

Endpoints (every one except `/health` needs a valid session; a missing or invalid one → `401 UNAUTHENTICATED`):

| Method & path | Who | Success | Requirement |
|---|---|---|---|
| `GET /health` | anyone | 200 `{ status: "ok" }` if `SELECT 1` works, else 503 | |
| `POST /errands` | member | **202** errand | OS-F1 |
| `GET /errands/open?page&size` | member | 200 `Page` | OS-F4 |
| `GET /errands/mine?as=requester\|courier&state&page&size` | member | 200 `Page` | OS-F7 |
| `GET /errands/:id` | as `getErrandForViewer` | 200 errand + history | |
| `POST /errands/:id/{accept,withdraw,pickup,deliver,confirm,reject,cancel}` | per table | 200 errand | OS-F2, F3 |
| `POST /admin/errands/:id/resolve` body `{ outcome: "COURIER" \| "REQUESTER", reason: 1–500 chars }` | ADMINISTRATOR | 200 errand | OS-F2.5 |
| `GET /admin/errands?requesterId&courierId&state&page&size` | ADMINISTRATOR | 200 `Page` | D3 query patterns |

`reject` takes an optional `{ reason }`, stored in history.

`errors.ts` mapping:

| Situation | Status | `error` |
|---|---|---|
| validation failure | 400 | `VALIDATION_ERROR`, with `details: [{ field, message }]` |
| supplier missing or archived | 422 | `SUPPLIER_UNAVAILABLE` |
| non-admin on `/admin/*` | 403 | `FORBIDDEN` |
| `NOT_FOUND` or a non-UUID `:id` | 404 | `NOT_FOUND` |
| `FORBIDDEN` | 403 | `FORBIDDEN` |
| `CANNOT_ACCEPT_OWN_ERRAND` | 403 | `CANNOT_ACCEPT_OWN_ERRAND` |
| `INVALID_STATE` on accept | 409 | `ERRAND_NO_LONGER_AVAILABLE`, with `currentState` |
| `INVALID_STATE` otherwise | 409 | `INVALID_STATE`, with `currentState` |
| `DEADLINE_PASSED` | 409 | `DEADLINE_PASSED` |
| database unavailable | 503 | `SERVICE_UNAVAILABLE` |
| anything else | 500 | `INTERNAL_ERROR`, logged with the request path |

Responses serialize `Errand` with ISO strings and omit `reservationOperationId`.

- [ ] **Step 1: Write failing tests in `test/http.test.ts`**
  - `401 without token`
  - `create returns 202 PENDING_RESERVATION`
  - `create with archived/unknown supplier is 422`
  - `create with bad body lists fields`
  - `full lifecycle over HTTP`: A creates, the stub bus opens it, B accepts, picks up, delivers, A confirms → 200 `COMPLETED`
  - `requester accept is 403 CANNOT_ACCEPT_OWN_ERRAND`
  - `second accept is 409 ERRAND_NO_LONGER_AVAILABLE`
  - `second confirm is 409 INVALID_STATE currentState COMPLETED`
  - `unrelated member GET of accepted errand is 404`
  - `member on /admin/errands is 403`
  - `admin resolve COURIER → COMPLETED`
  - `non-uuid id is 404`
  - `open list excludes own and shows other's`

- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS.

- [ ] **Step 5: Commit.** `feat(order): errand HTTP API with relationship-based authorization`

---

### Task 9: Entry point, container, compose, gateway and demo script

**Files:**
- Create: `src/index.ts`, `order-service/Dockerfile` (replaces the empty file), `.dockerignore`, `docker/postgres/init-roles.sh`, `scripts/demo.sh`
- Replace the empty: `order-service/README.md`
- Modify: `compose.yaml`, `.env.example`, `frontend/nginx.conf`, `frontend/vite.config.ts`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write `src/index.ts`.**
  - Load all configs (fail fast).
  - `createPool`, then retry `SELECT 1` while the database is unavailable (copy credit-service's `index.ts` pattern).
  - Build the stubs.
  - Call `startOutboxPublisher(pool, new StubCreditBus(pool, …))` and `startDeadlineSweeper(pool)`.
  - Listen on `PORT` (default 3002).
  - On SIGTERM/SIGINT: close HTTP, stop the sweeper and publisher, end the pool.

- [ ] **Step 2: Write the Dockerfile and init script.**
  - Dockerfile: copy `user-service/Dockerfile` exactly, change `EXPOSE 3002`.
  - `init-roles.sh`: copy `user-service/docker/postgres/init-roles.sh` with `user_` → `order_` and env names `ORDER_DB_MIGRATION_PASSWORD`, `ORDER_DB_APP_PASSWORD`.

- [ ] **Step 3: Add `order-db`, `order-migrate` and `order-service` to `compose.yaml`.** Mirror the three `user-*` services:
  - Image `foc-order-service:local`, port `${ORDER_PORT:-3002}:3002`, `init: true`, `restart: unless-stopped`.
  - Healthcheck on `/health`.
  - Env: `DATABASE_URL` with `order_app`, `AUTH_MODE=stub`, `SUPPLIER_MODE=stub`, `CREDIT_MODE=stub`, `CONFIRMATION_WINDOW_MINUTES`, `RESERVATION_TIMEOUT_SECONDS`, `STUB_CREDIT_LIMIT`, `STUB_CREDIT_SILENT_AMOUNT`.
  - Volume `order-db-data`.
  - Add `ORDER_PORT`, `ORDER_DB_ADMIN_PASSWORD`, `ORDER_DB_MIGRATION_PASSWORD`, `ORDER_DB_APP_PASSWORD`, `CONFIRMATION_WINDOW_MINUTES`, `RESERVATION_TIMEOUT_SECONDS`, `STUB_CREDIT_LIMIT`, `STUB_CREDIT_SILENT_AMOUNT` to `.env.example`.

- [ ] **Step 4: Add gateway routes.**
  - In `frontend/nginx.conf`: `location /api/v1/errands { proxy_pass http://order-service:3002/errands; }` and `location /api/v1/admin/errands { proxy_pass http://order-service:3002/admin/errands; }`, placed before the `/api/` catch-all.
  - Add the same two to the dev proxy in `vite.config.ts`.

- [ ] **Step 5: Write `scripts/demo.sh`.** Bash + curl + jq, using `BASE=${BASE:-http://localhost:8080/api/v1}` and stub tokens for requester A, couriers B and C, and admin D. It prints each step:
  1. A creates (202, `PENDING_RESERVATION`).
  2. Poll until `OPEN`.
  3. A tries to accept own (403).
  4. B and C accept at the same time (`&` + `wait`): one 200, one 409.
  5. Pickup, deliver.
  6. A confirms twice (200, then 409).
  7. Print history.
  8. A second errand with amount 150 → `RESERVATION_REJECTED`.
  9. A third errand: A cancels.
  10. A fourth errand goes through reject → `DISPUTED` → D resolves `REQUESTER` → `FAILED`.
  10b. A fifth errand with amount 999 (no reply): wait `RESERVATION_TIMEOUT_SECONDS + 10` → `RESERVATION_TIMED_OUT`.
  11. Print outbox rows: `docker compose exec order-db psql -U order_bootstrap -d orders -c "select event_type, payload->>'order_id', published_at is not null from outbox order by created_at"`.

- [ ] **Step 6: Write `README.md`.** Status, the state/transition table from Task 2, the endpoint and error tables from Task 8, the design calls list (marked as decided once the author accepts it), a link to `docs/order-credit-contract.md`, how to run, how to test.

- [ ] **Step 7: Verify.**
  - `docker compose up -d --build order-service frontend`, then `docker compose ps`. Expected: `order-db` healthy, `order-migrate` exited 0, `order-service` healthy.
  - `bash order-service/scripts/demo.sh`. Expected: every step prints the status shown above, and the final outbox query lists `ReserveRequested`, `OrderCompleted`, `OrderCancelled`, `OrderFailed` and `ReservationTimedOut` rows, all published, and `docker compose logs order-service | grep -c credit.stub.contract_violation` prints `0`.
  - `docker compose restart order-service && bash order-service/scripts/demo.sh` passes again, showing data and startup survive a restart.

- [ ] **Step 8: Commit.** `feat(order): container, compose, gateway routes and D3 demo script`

---

## Coverage check (D3 Part 1 → task)

| D3 item | Where |
|---|---|
| DB choice and schema; references to other services | Design calls 1, 5, 6; Task 1 |
| State diagram/table incl. cancel and expiry; atomic transitions; conditions, credit effect, trigger, rejection | Task 2 table; Task 3; Task 6; README |
| Transition APIs, validation, unauthorized/invalid/conflicting responses | Task 8 |
| Query patterns: open, details, admin by requester, courier's assigned | Task 5, Task 8 |
| Authorization by identity and relationship, enforced in the backend | Task 3 party clauses; Task 8 tests |
| Same student as requester and courier | `nonRequester` party; `listMine?as=`; Task 5 |
| Single-winner accept; accept vs cancel/expiry; double completion | Task 3 and Task 6 concurrency tests |
| Integration demo | Task 9 `demo.sh` (stubs now; real adapters are a follow-up) |
| Part 4 containerization for Order | Task 9 |
