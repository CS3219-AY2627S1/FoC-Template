<!--
AI Assistance Disclosure:
Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-08
Scope: Wrote the implementation plan for precise delivery location from the team's recorded
       decisions in the spec (P1-P23). Code in the steps implements those decisions; the names the
       team did not spell out (spec §4, P16 and P20) are marked in the spec for the team to check.
       No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: Congchen
-->

# Precise Delivery Location Implementation Plan

> **For agentic workers:** use superpowers:executing-plans or superpowers:subagent-driven-development to implement task by task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a required 250-character `deliveryDetails` field to orders, remember each user's last submitted location and details in the user-service, and offer a one-click reuse card on the new-request form.

**Architecture:** The order-service stores `deliveryDetails` on `requests`. The user-service owns a `last_request` table with `GET` and `PUT /users/me/last-request`. The frontend reads the stored values when the new-request form opens, and calls the update in parallel with the order call. The services never call each other. Spec: [`../specs/2026-11-08-precise-delivery-location-design.md`](../specs/2026-11-08-precise-delivery-location-design.md) (decisions P1–P23, no open questions).

**Tech Stack:** user-service: TypeScript, Express, PostgreSQL (`pg`), Zod, Vitest + Supertest. order-service: TypeScript, Express, Prisma, PostgreSQL, Vitest. frontend: React 18, Vite, Vitest + Testing Library.

---

## Conventions for every task

- **Branch:** `add-precise-delivery-location`. Commit after each task, ending the message with the attribution trailer the session requires.
- **Disclosure header:** every file you create gets the standard header (root `AGENTS.md` §4.1) in that file's comment syntax with `Tool: Claude Code (model: claude-sonnet-5-5), date: <today>`, a `Scope:` line, and a blank `Author review:`. Every existing file you edit gets an appended `Scope (<date>, Claude Code, model: claude-sonnet-5-5): <the task's "Header scope"> No requirements, architecture, schema, or API decisions were made by the AI tool.` plus a blank `Author review:`. Files that cannot carry comments (`package.json`, lockfiles, the generated Prisma client) get none and are listed in the log entry. Never sign the review.
- **Line endings:** some working copies are CRLF. Use Edit for existing files.
- **No new decisions:** if a step needs a choice the spec does not record, stop and ask the team.
- **Test commands:** `cd user-service && npx vitest run` (needs the test Postgres from `user-service/.env.test`); `cd order-service && npm run typecheck && npm test`; `cd frontend && npm test && npm run build`. Report the true result of each run.

## File structure

| File | Responsibility |
|---|---|
| `user-service/src/db/init.sql` (modify) | `last_request` table |
| `user-service/src/db/queries/lastRequest.queries.ts` (create) | SQL: read, upsert, default row |
| `user-service/src/db/queries/users.queries.ts` (modify) | Insert the default row when a user is created |
| `user-service/src/services/lastRequest.service.ts`, `controllers/lastRequest.controller.ts` (create), `routes/me.routes.ts` (modify) | Endpoints |
| `user-service/tests/...` (create/modify) | Tests, `tests/helpers/db.ts` helper |
| `order-service/prisma/schema.prisma` (modify), `prisma/migrations/20261108100000_delivery_details/migration.sql` (create) | Column |
| `order-service/src/constants/errors.ts`, `types/orders.ts`, `services/orders.service.ts`, `realtime/order-events.ts` (modify) | Validation, trimming, events |
| `order-service/src/**/*.spec.ts`, `test/*.e2e-spec.ts` (modify) | Tests |
| `frontend/src/api/lastRequest.js` (create) | Calls |
| `frontend/src/api/orders.js`, `pages/CreateRequest.jsx` (modify) | Field, reuse card, parallel update |
| `frontend/src/components/RequestCard.jsx`, `pages/activityShared.jsx`, `pages/AdminOrderTransactions.jsx` (modify) | Show the details under the location name |
| `frontend/tests/...` (create/modify) | Tests |
| `ai/usage-log.md`, `README.md` (modify) | Disclosure |

---

# Part A — user-service

### Task A1: Table, queries, default row at registration

**Files:** Modify `user-service/src/db/init.sql`, `user-service/src/db/queries/users.queries.ts`, `user-service/tests/helpers/db.ts`. Create `user-service/src/db/queries/lastRequest.queries.ts`. Test `user-service/tests/db/queries/lastRequest.queries.test.ts`.

Header scope: "Added the last_request table, its queries, the default row on user creation and a test read helper, per the 2026-11-08 precise-delivery-location spec."

- [ ] **Step 1: Add the table.** Append to `init.sql` (comment style as the file's existing entries, plus a header line for this change):

```sql
-- Precise delivery location (spec 2026-11-08): one row per user. The id is the Supplier Service's
-- location id, a plain integer because that table lives in another service. The default row made
-- at registration holds a null id and the details 'Nil'.
CREATE TABLE IF NOT EXISTS last_request (
  user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  last_req_del_loc_id INTEGER CHECK (last_req_del_loc_id > 0),
  last_req_del_loc_details VARCHAR(250) NOT NULL DEFAULT 'Nil'
    CHECK (char_length(last_req_del_loc_details) >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 2: Write failing tests** (`lastRequest.queries.test.ts`, same setup as `bookmarks.queries.test.ts`): `getLastRequest` returns `null` for a user with no row; `insertDefaultRow` creates `{ id: null, details: 'Nil' }` and is a no-op the second time; `upsertLastRequest` creates a row when none exists, replaces both values on a second call and moves `updated_at` forward (use `dbNow`); a 251-character details string is rejected by the database; a user delete cascades the row away. Run: they fail (module missing).

- [ ] **Step 3: Add the test helper** `getLastRequestRow(userId)` to `tests/helpers/db.ts` (`SELECT * FROM last_request WHERE user_id = $1`).

- [ ] **Step 4: Write the queries** in `lastRequest.queries.ts`, using `pool` and `Queryable` as `bookmarks.queries.ts` does:

```ts
export interface LastRequest {
  last_req_del_loc_id: number | null;
  last_req_del_loc_details: string | null;
}

// null when the user has no row (spec P8).
export async function getLastRequest(userId: string, db: Queryable = pool): Promise<LastRequest | null> {
  const r = await db.query<LastRequest>(
    `SELECT last_req_del_loc_id, last_req_del_loc_details FROM last_request WHERE user_id = $1`,
    [userId],
  );
  return r.rows[0] ?? null;
}

export async function upsertLastRequest(
  userId: string, locationId: number, details: string, db: Queryable = pool,
): Promise<void> {
  await db.query(
    `INSERT INTO last_request (user_id, last_req_del_loc_id, last_req_del_loc_details)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE
       SET last_req_del_loc_id = EXCLUDED.last_req_del_loc_id,
           last_req_del_loc_details = EXCLUDED.last_req_del_loc_details,
           updated_at = NOW()`,
    [userId, locationId, details],
  );
}

// Registration (spec P19, P21): a null id and the details 'Nil'.
export async function insertDefaultRow(userId: string, db: Queryable = pool): Promise<void> {
  await db.query(`INSERT INTO last_request (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [userId]);
}
```

- [ ] **Step 5: Create the row with the user.** In `users.queries.ts`, after the `INSERT INTO users` in `createUser` call `insertDefaultRow(row.id, db)`; do the same in `createSuperAdmin` when a row was returned. Both already take a `db` argument, so the row joins any surrounding transaction. Add a test in `tests/services/auth.service.test.ts` (or the file that tests `createUser`) that a registered user has a `Nil` row.

- [ ] **Step 6: Run** `npx vitest run tests/db tests/services`; all pass. Run the whole suite to catch tests that count rows or truncate (`truncateAll` uses `CASCADE`, so the new table is cleared). Commit: `feat(user-service): last_request table and default row`.

### Task A2: Endpoints

**Files:** Create `user-service/src/services/lastRequest.service.ts`, `user-service/src/controllers/lastRequest.controller.ts`. Modify `user-service/src/routes/me.routes.ts`. Test `user-service/tests/controllers/lastRequest.controller.test.ts`.

Header scope: "Added GET and PUT /users/me/last-request, per the 2026-11-08 precise-delivery-location spec."

- [ ] **Step 1: Write failing controller tests** (copy the setup of `bookmarks.controller.test.ts`): GET without a token → `401`; GET for a user with the default row → `200` `{ last_req_del_loc_id: null, last_req_del_loc_details: "Nil" }`; GET for a user with no row → `200` with both null; PUT saves and a following GET returns the values; PUT trims leading and trailing spaces before storing; PUT twice keeps one row; PUT with a missing/null/zero/negative/fractional/too-large id → `400 VALIDATION_ERROR`; PUT with missing, non-string, whitespace-only or 251-character (after trimming) details → `400 VALIDATION_ERROR`; a user can never change another user's row (the id comes from the token only: PUT with someone else's `user_id` in the body leaves their row unchanged).

- [ ] **Step 2: Write the controller.**

```ts
import { z } from 'zod';
import * as lastRequestService from '../services/lastRequest.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// 2147483647 is the largest value the INTEGER column holds (same bound as bookmarks).
const body = z.object({
  last_req_del_loc_id: z.number().int().min(1).max(2147483647),
  last_req_del_loc_details: z.string().trim().min(1).max(250),
});

export const read = asyncHandler(async (req, res) => {
  res.status(200).json(await lastRequestService.readLastRequest(req.user!.user_id));
});

export const update = asyncHandler(async (req, res) => {
  const { last_req_del_loc_id, last_req_del_loc_details } = body.parse(req.body);
  res.status(200).json(
    await lastRequestService.saveLastRequest(req.user!.user_id, last_req_del_loc_id, last_req_del_loc_details),
  );
});
```

- [ ] **Step 3: Write the service.** `readLastRequest` returns the row or `{ last_req_del_loc_id: null, last_req_del_loc_details: null }`. `saveLastRequest` calls `upsertLastRequest` and returns `{ message: "Last request saved", code: "LAST_REQUEST_SAVED" }`.

- [ ] **Step 4: Add the routes** to `me.routes.ts`: `router.get('/last-request', authenticate, lastRequestController.read)` and `router.put('/last-request', authenticate, lastRequestController.update)`.

- [ ] **Step 5: Run** `npx vitest run`, `npm run build`, `npm run lint`; all pass. Commit: `feat(user-service): GET and PUT /users/me/last-request`.

---

# Part B — order-service

### Task B1: Column and migration

**Files:** Modify `order-service/prisma/schema.prisma`. Create `order-service/prisma/migrations/20261108100000_delivery_details/migration.sql`.

Header scope: "Added deliveryDetails to requests, per the 2026-11-08 precise-delivery-location spec."

- [ ] **Step 1:** In the `OrderRequest` model add `deliveryDetails String @default("Nil") @db.VarChar(250)` after `deliveryLocationId`.
- [ ] **Step 2:** Create the migration:

```sql
-- Precise delivery location: existing rows take 'Nil', which is also the default (spec P1, P2).
ALTER TABLE "requests" ADD COLUMN "deliveryDetails" VARCHAR(250) NOT NULL DEFAULT 'Nil';
```

- [ ] **Step 3:** Regenerate the client (`node scripts/prisma-generate.mjs`) and apply the migration to a scratch database (`npx prisma migrate deploy` against the test DB used by the e2e suite). Check the column exists, an old row reads `Nil`, and a 251-character insert fails. Commit: `feat(order-service): deliveryDetails column`.

### Task B2: Validation, trimming, events

**Files:** Modify `order-service/src/constants/errors.ts`, `src/types/orders.ts`, `src/services/orders.service.ts`, `src/realtime/order-events.ts`. Tests: `src/services/orders.service.spec.ts`, `src/controllers/orders.controller.spec.ts`, `src/realtime/order-events.spec.ts`, `test/credit-saga.e2e-spec.ts`, `test/realtime.e2e-spec.ts`.

Header scope: "Required deliveryDetails (trimmed, at most 250 characters) on create and edit, and included in listing-card events, per the 2026-11-08 precise-delivery-location spec."

- [ ] **Step 1: Write failing tests** in `orders.service.spec.ts`: create without `deliveryDetails`, with `null`, with `''`, and with `'   '` → `MISSING_DELIVERY_DETAILS`; with a number → `INVALID_DELIVERY_DETAILS`; with 251 characters after trimming → `INVALID_DELIVERY_DETAILS`; with 250 characters → ok; with `'  Level 2 lobby  '` → stored as `Level 2 lobby`. Edit: a payload without `deliveryDetails` → `MISSING_DELIVERY_DETAILS`; with an invalid value → `INVALID_DELIVERY_DETAILS`; a valid one is trimmed and stored. Controller spec: the missing case answers `400` with the message text below. Events spec: the `order:created` card carries `deliveryDetails`.
- [ ] **Step 2: Add the codes** to `errors.ts` (enum and message map):

```ts
MISSING_DELIVERY_DETAILS = 'MISSING_DELIVERY_DETAILS',
INVALID_DELIVERY_DETAILS = 'INVALID_DELIVERY_DETAILS',
// ...
[ErrorCode.MISSING_DELIVERY_DETAILS]: 'Request is missing delivery details.',
[ErrorCode.INVALID_DELIVERY_DETAILS]: 'Delivery details must be text of at most 250 characters.',
```

- [ ] **Step 3: Types.** In `types/orders.ts` add `deliveryDetails: string;` to `CreateOrderPayload` (after `deliveryLocationId`).
- [ ] **Step 4: Validation helper** in `orders.service.ts`:

```ts
export const DELIVERY_DETAILS_MAX = 250;

// Spec P9, P10, P15, P22: required, trimmed on both ends, at most 250 characters once trimmed.
const checkDeliveryDetails = (
  value: unknown,
): { error: ErrorCode } | { value: string } => {
  if (value === undefined || value === null) return { error: ErrorCode.MISSING_DELIVERY_DETAILS };
  if (typeof value !== 'string') return { error: ErrorCode.INVALID_DELIVERY_DETAILS };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { error: ErrorCode.MISSING_DELIVERY_DETAILS };
  if (trimmed.length > DELIVERY_DETAILS_MAX) return { error: ErrorCode.INVALID_DELIVERY_DETAILS };
  return { value: trimmed };
};
```

- [ ] **Step 5: Create.** In `createOrder`, after the delivery-location checks call `checkDeliveryDetails(requestPayload.deliveryDetails)`; on `error` push it onto `errors`; keep the trimmed `value` and pass it as `deliveryDetails` in the `create` data.
- [ ] **Step 6: Edit.** Add `'deliveryDetails'` to `EDITABLE_ORDER_FIELDS`. In `editOrder`, before the field loop, run `checkDeliveryDetails(payload.deliveryDetails)` (required on every edit, P10) and push any error; inside the loop skip `deliveryDetails` (already checked, so the field is not reported twice). In the `updateMany` data use `{ ...payload, deliveryDetails: trimmed, version: { increment: 1 } }`.
- [ ] **Step 7: Events.** Add `deliveryDetails: string` to `ListingCard` and `deliveryDetails: o.deliveryDetails` to `listingCard` in `order-events.ts`.
- [ ] **Step 8: Fix callers.** Run `npm run typecheck`; add `deliveryDetails` to every test payload and fixture the compiler (or the new required check) flags, including the two e2e specs. Do not change any other behaviour.
- [ ] **Step 9: Run** `npm run typecheck && npm test && npm run lint`; if the e2e prerequisites (Docker) are available run `npm run test:e2e`, otherwise report it as not run. Commit: `feat(order-service): required deliveryDetails on create and edit`.

---

# Part C — frontend

### Task C1: API calls

**Files:** Create `frontend/src/api/lastRequest.js`. Modify `frontend/src/api/orders.js` (comments only: add `deliveryDetails` to the documented payloads). Test `frontend/tests/api/lastRequest.test.js` (mock `request` as `bookmarks` tests do, if present).

Header scope: "Calls for GET and PUT /users/me/last-request, per the 2026-11-08 precise-delivery-location spec."

- [ ] Write:

```js
import { request } from './http'

// 200 { last_req_del_loc_id: number|null, last_req_del_loc_details: string|null }.
// A user with no row reads as nulls; the default row at registration reads as { null, "Nil" }.
export const getLastRequest = () => request('/users/me/last-request')

// 200 { message, code: 'LAST_REQUEST_SAVED' }; 400 VALIDATION_ERROR for a bad value.
export const saveLastRequest = (locationId, details) =>
  request('/users/me/last-request', {
    method: 'PUT',
    json: { last_req_del_loc_id: Number(locationId), last_req_del_loc_details: details },
  })
```

Test both calls hit the expected path, method and body. Check `vite.config.js` and `nginx` proxy entries: `/users/me/*` is already proxied for bookmarks, so no change is expected; if a route list names `/users/me/bookmarks` specifically, add `/users/me/last-request`. Commit.

### Task C2: Form field, reuse card, parallel update

**Files:** Modify `frontend/src/pages/CreateRequest.jsx`. Test `frontend/tests/pages/CreateRequest.test.jsx` (create; mock `../api/*` modules as other page tests do).

Header scope: "Added the exact delivery details field, the reuse card and the parallel last-request update, per the 2026-11-08 precise-delivery-location spec."

- [ ] **Step 1: Write failing tests:** (a) the new-request form shows an "Exact delivery details" field with `maxLength` 250 and "Post errand" stays disabled while it is empty or whitespace-only; (b) with a stored `{ id: 3, details: "Level 2 lobby" }` and location 3 in the list, the card "Delivering to the same location?" shows the location name and details, sits between the "Deliver to" label and the selector, and clicking "Confirm" sets the selector to 3 and fills the field; (c) no card when the stored details are `Nil`, when the id is null, when the id is not in the location list, when both values are null, or on the edit route; (d) posting calls `createOrder` with `deliveryDetails` trimmed **and** calls `saveLastRequest(locationId, trimmedDetails)` without waiting for `createOrder`, and still calls it when `createOrder` rejects; a rejected `saveLastRequest` shows no error and does not stop navigation; (e) saving an edit calls `editOrder` with `deliveryDetails` and `saveLastRequest` in the same way.
- [ ] **Step 2: State and data.** In `RequestForm`: `const [details, setDetails] = useState(order?.deliveryDetails ?? '')`; `const { data: last } = useApi(() => (isEdit ? Promise.resolve(null) : getLastRequest().catch(() => null)), [])`. Import `getLastRequest`, `saveLastRequest`.
- [ ] **Step 3: Reusable value.** A pure helper in the file:

```js
// Spec P13, P19, P21: usable only when both values are real and the location is still offered.
const reusable = (last, locations) =>
  last && last.last_req_del_loc_id != null && last.last_req_del_loc_details &&
  last.last_req_del_loc_details !== 'Nil' &&
  locations.some((l) => Number(l.location_id) === Number(last.last_req_del_loc_id))
    ? { id: String(last.last_req_del_loc_id), details: last.last_req_del_loc_details }
    : null
```

- [ ] **Step 4: The card** (new-request form only), rendered inside the "Deliver to" section between its `label(...)` and the `<select>`: heading "Delivering to the same location?", body the location name (from `locations`) with the saved details on the line below, and a `Button` "Confirm" whose click calls `setLocationId(r.id); setDetails(r.details)`. Reuse the existing tip/notice styling used elsewhere in the project if one exists (search `components/` for a tip or notice card first); otherwise a bordered `rounded-card` box in the page's existing tokens.
- [ ] **Step 5: The field.** Below the "Deliver to" section's `<select>`: a label "Exact delivery details" with the required mark (`label(..., true)`), an `<input type="text" maxLength={250}>` bound to `details`, and a `{details.length}/250` counter in the style of the description counter. Add `details.trim()` to `complete`.
- [ ] **Step 6: Submit.** In `onPost` and `onSave`, build the trimmed `const exact = details.trim()`, add `deliveryDetails: exact` to the payload, and before awaiting the order call start `saveLastRequest(locationId, exact).catch(() => {})` (do not await it).
- [ ] **Step 7: Run** `npm test && npm run build && npm run lint`; all pass. Commit.

### Task C3: Show the details under the location name

**Files:** Modify `frontend/src/components/RequestCard.jsx`, `frontend/src/pages/activityShared.jsx`, `frontend/src/pages/AdminOrderTransactions.jsx`. Tests: extend `frontend/tests/pages/RequestBoard.test.jsx`, `MyActivitySplit.test.jsx`, `AdminOrderTransactions.test.jsx`.

Header scope: "Shows deliveryDetails on the line below the location name, per the 2026-11-08 precise-delivery-location spec."

- [ ] **Step 1: Write failing tests:** each of the three places renders the order's `deliveryDetails` directly below the location name; an order with `Nil` shows `Nil`; the realtime `order:created` card on the board shows the details (it carries them, Task B2).
- [ ] **Step 2: Implement.** In `RequestCard.jsx` (the `→ {locationName}` paragraph near line 171) and `ActivityCard` in `activityShared.jsx` (near line 263) add, inside the same paragraph, `<span className="block">{request.deliveryDetails}</span>` after the location name; keep the existing `· …` suffix on the name line. In `AdminOrderTransactions.jsx` (near line 182) render the name and a `block` span with `order.deliveryDetails` in the same `<dd>`. Render nothing extra when the field is undefined (older cached payloads).
- [ ] **Step 3: Run** `npm test && npm run build && npm run lint`. Commit.

---

# Part D — close-out

### Task D1: Disclosure and final checks

- [ ] **Step 1:** Run all three suites once more, plus `git status` to list every touched file.
- [ ] **Step 2:** Append an entry to `ai/usage-log.md` (format `AGENTS.md` §5.2: exact prompts, key responses, every file including those without headers, true verification results, blank review fields) and one row to the README "Log index".
- [ ] **Step 3:** Remind the team which headers and log entries still need author review.
- [ ] **Step 4 (manual, for the team):** with the three services running, post an errand with details, confirm the order shows the details under the location name, open a second new-request form and check the reuse card appears and "Confirm" fills both fields; edit the errand and confirm no card appears; post with an unknown stored location and confirm no card. This browser check is not run by the plan's automated steps.
