<!--
AI Assistance Disclosure:
Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-05
Scope: Wrote the implementation plan for supplier bookmarking from the team's recorded decisions in
       the spec. Code in the steps is implementation of those decisions; where the team had not
       decided something, the spec's "Not yet decided by the team" table lists the working choice.
       No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review:
-->

# Supplier Bookmarking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users bookmark supplier cards (stored in the user-service) and filter the supplier list by "Bookmarked" (ids sent to the existing supplier list endpoint).

**Architecture:** The user-service owns a `user_bookmarks` table and three `/users/me/bookmarks` endpoints. The supplier-service gains an optional `ids` list parameter on `GET /api/v1/suppliers` and returns an `unavailable` array for hidden/deleted ids. The frontend holds the user's ids in a context, draws the icon from it, and clears `deleted` bookmarks. The services never call each other. Spec: [`../specs/2026-11-05-supplier-bookmarking-design.md`](../specs/2026-11-05-supplier-bookmarking-design.md) (decisions B1–B25, no open gaps).

**Tech Stack:** user-service: TypeScript, Express, PostgreSQL (`pg`), Zod, Vitest + Supertest (real test DB from `.env.test`). supplier-service: TypeScript, Express, MySQL (`mysql2`), Zod, Vitest. frontend: React 18, Vite, Vitest + Testing Library.

---

## Conventions for every task

- **Branch:** `supplier-bookmarking` (already created from `main`). Commit after each task. End each commit message with the attribution trailer the session requires.
- **Disclosure header:** every file you create gets the standard header (root `AGENTS.md` §4.1) in that file's comment syntax, with `Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-05`, a `Scope:` line, and a blank `Author review:`. Every existing file you edit gets an appended pair:
  `Scope (2026-11-05, Claude Code, model: claude-sonnet-5-5): <the task's "Header scope"> No requirements, architecture, schema, or API decisions were made by the AI tool.` followed by `Author review:` (blank). Never sign the review.
- **Line endings:** some working copies are CRLF. Use Edit for existing files so endings are preserved.
- **Gaps:** none open; every working choice has been approved by the team (spec §6). Do not change them without the team.
- **Test commands:** user-service needs its test Postgres (`user-service/.env.test`); supplier-service default suite needs no Docker; frontend needs nothing extra.

## File structure

| File | Responsibility |
|---|---|
| `user-service/src/db/init.sql` (modify) | `user_bookmarks` table |
| `user-service/src/db/queries/bookmarks.queries.ts` (create) | SQL for the table |
| `user-service/src/services/bookmarks.service.ts` (create) | Cap, idempotency, race safety |
| `user-service/src/controllers/bookmarks.controller.ts` (create) | Param validation, responses |
| `user-service/src/routes/me.routes.ts` (modify) | Three routes |
| `user-service/tests/helpers/db.ts` (modify) | `getBookmarkRows` helper |
| `user-service/tests/db/queries/bookmarks.queries.test.ts`, `tests/services/bookmarks.service.test.ts`, `tests/controllers/bookmarks.controller.test.ts` (create) | Tests |
| `supplier-service/src/validation/supplierQuery.ts` (modify) | `ids` parameter |
| `supplier-service/src/persistence/supplierRepository.ts`, `mysqlSupplierRepository.ts` (modify) | `supplierIds` criterion, `findStatusesByIds` |
| `supplier-service/src/types/supplier.ts`, `src/business/supplierService.ts`, `src/controllers/supplier.controller.ts` (modify) | `unavailable` and wiring |
| `supplier-service/openapi.yaml`, `README.md`, `PROJECT_STATE.md` (modify) | Docs and state |
| `frontend/src/api/bookmarks.js` (create), `api/suppliers.js` (modify) | API calls, empty page |
| `frontend/src/context/BookmarksContext.jsx` (create), `src/main.jsx` (modify) | Bookmark state |
| `frontend/src/components/SupplierCard.jsx`, `pages/Landing.jsx`, `pages/Suppliers.jsx` (modify) | Icon and Bookmarked filter |
| `frontend/tests/...` (create) | Tests |

---

# Part A — user-service

### Task A1: Table and queries

**Files:**
- Modify: `user-service/src/db/init.sql` (append at end)
- Create: `user-service/src/db/queries/bookmarks.queries.ts`
- Modify: `user-service/tests/helpers/db.ts` (append a helper)
- Test: `user-service/tests/db/queries/bookmarks.queries.test.ts`

Header scope: "Added the user_bookmarks table, its queries and a test read helper, per the 2026-11-05 supplier-bookmarking spec."

- [ ] **Step 1: Add the table.** Append to `user-service/src/db/init.sql`:

```sql
-- Supplier bookmarking (spec 2026-11-05): one row per (user, supplier). supplier_id is the Supplier
-- Service's id, kept as a plain integer because that table lives in another service.
CREATE TABLE IF NOT EXISTS user_bookmarks (
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  supplier_id INTEGER NOT NULL CHECK (supplier_id > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, supplier_id)
);
```

- [ ] **Step 2: Add the test helper.** Append to `user-service/tests/helpers/db.ts`:

```ts
export async function getBookmarkRows(
  userId: string,
): Promise<{ supplier_id: number; created_at: Date }[]> {
  const r = await pool.query<{ supplier_id: number; created_at: Date }>(
    'SELECT supplier_id, created_at FROM user_bookmarks WHERE user_id = $1 ORDER BY created_at, supplier_id',
    [userId],
  );
  return r.rows;
}
```

- [ ] **Step 3: Write the failing test.** Create `user-service/tests/db/queries/bookmarks.queries.test.ts`:

```ts
// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5-5), date: 2026-11-05
// Scope: Integration tests for bookmarks.queries.ts against the real test DB, per the
//        2026-11-05 supplier-bookmarking spec. No requirements, architecture, schema, or API
//        decisions were made by the AI tool.
// Author review:
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import pool from '../../../src/db/pool.js';
import * as bookmarks from '../../../src/db/queries/bookmarks.queries.js';
import * as users from '../../../src/db/queries/users.queries.js';
import { getBookmarkRows, truncateAll } from '../../helpers/db.js';

let userId: string;
let otherUserId: string;

beforeEach(async () => {
  await truncateAll();
  userId = (
    await users.createUser({ username: 'alice', email: 'alice@example.com', passwordHash: 'h', status: 'active' })
  ).id;
  otherUserId = (
    await users.createUser({ username: 'bob', email: 'bob@example.com', passwordHash: 'h', status: 'active' })
  ).id;
});
afterEach(truncateAll);

describe('insertBookmark', () => {
  it('inserts a row and reports it', async () => {
    expect(await bookmarks.insertBookmark(userId, 5, pool)).toBe(true);
    expect((await getBookmarkRows(userId)).map((r) => r.supplier_id)).toEqual([5]);
  });

  it('ignores a repeat of the same pair and reports false', async () => {
    await bookmarks.insertBookmark(userId, 5, pool);
    expect(await bookmarks.insertBookmark(userId, 5, pool)).toBe(false);
    expect(await getBookmarkRows(userId)).toHaveLength(1);
  });

  it('lets two users bookmark the same supplier', async () => {
    await bookmarks.insertBookmark(userId, 5, pool);
    expect(await bookmarks.insertBookmark(otherUserId, 5, pool)).toBe(true);
  });
});

describe('listSupplierIds', () => {
  it('returns the user’s ids oldest first and nobody else’s', async () => {
    await bookmarks.insertBookmark(userId, 9, pool);
    await bookmarks.insertBookmark(userId, 3, pool);
    await bookmarks.insertBookmark(otherUserId, 4, pool);
    await bookmarks.insertBookmark(userId, 5, pool);
    expect(await bookmarks.listSupplierIds(userId)).toEqual([9, 3, 5]);
  });

  it('returns an empty list for a user with none', async () => {
    expect(await bookmarks.listSupplierIds(userId)).toEqual([]);
  });
});

describe('countBookmarks and bookmarkExists', () => {
  it('count only the given user’s rows', async () => {
    await bookmarks.insertBookmark(userId, 1, pool);
    await bookmarks.insertBookmark(userId, 2, pool);
    await bookmarks.insertBookmark(otherUserId, 1, pool);
    expect(await bookmarks.countBookmarks(userId)).toBe(2);
    expect(await bookmarks.bookmarkExists(userId, 2)).toBe(true);
    expect(await bookmarks.bookmarkExists(userId, 3)).toBe(false);
  });
});

describe('deleteBookmark', () => {
  it('removes the row once, then reports false', async () => {
    await bookmarks.insertBookmark(userId, 5, pool);
    expect(await bookmarks.deleteBookmark(userId, 5)).toBe(true);
    expect(await bookmarks.deleteBookmark(userId, 5)).toBe(false);
  });
});

describe('user deletion', () => {
  it('removes that user’s bookmarks', async () => {
    await bookmarks.insertBookmark(userId, 5, pool);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    expect(await getBookmarkRows(userId)).toEqual([]);
  });
});

describe('table constraints', () => {
  it('rejects a non-positive supplier id', async () => {
    await expect(bookmarks.insertBookmark(userId, 0, pool)).rejects.toThrow();
  });
});
```

- [ ] **Step 4: Run it to see it fail.** `cd user-service && npx vitest run tests/db/queries/bookmarks.queries.test.ts` — Expected: FAIL, cannot resolve `bookmarks.queries.js`.

- [ ] **Step 5: Write the queries.** Create `user-service/src/db/queries/bookmarks.queries.ts`:

```ts
// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5-5), date: 2026-11-05
// Scope: Queries for the user_bookmarks table, per the 2026-11-05 supplier-bookmarking spec.
//        No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:

import pool from "../pool.js";
import type { Queryable } from "../transaction.js";

// Locks the user's row so two adds for the same user run one after the other; without it two
// adds at 19 bookmarks could both pass the count check. Call inside a transaction.
export async function lockUser(userId: string, db: Queryable): Promise<void> {
  await db.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);
}

// Oldest first, then by supplier id so ties are stable.
export async function listSupplierIds(
  userId: string,
  db: Queryable = pool,
): Promise<number[]> {
  const result = await db.query<{ supplier_id: number }>(
    `SELECT supplier_id FROM user_bookmarks
     WHERE user_id = $1
     ORDER BY created_at, supplier_id`,
    [userId],
  );
  return result.rows.map((row) => row.supplier_id);
}

export async function countBookmarks(
  userId: string,
  db: Queryable = pool,
): Promise<number> {
  const result = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM user_bookmarks WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0]!.count;
}

export async function bookmarkExists(
  userId: string,
  supplierId: number,
  db: Queryable = pool,
): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM user_bookmarks WHERE user_id = $1 AND supplier_id = $2`,
    [userId, supplierId],
  );
  return (result.rowCount ?? 0) > 0;
}

// True when a row was inserted, false when the pair already existed.
export async function insertBookmark(
  userId: string,
  supplierId: number,
  db: Queryable = pool,
): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO user_bookmarks (user_id, supplier_id) VALUES ($1, $2)
     ON CONFLICT (user_id, supplier_id) DO NOTHING`,
    [userId, supplierId],
  );
  return (result.rowCount ?? 0) > 0;
}

// True when a row was deleted, false when there was nothing to delete.
export async function deleteBookmark(
  userId: string,
  supplierId: number,
  db: Queryable = pool,
): Promise<boolean> {
  const result = await db.query(
    `DELETE FROM user_bookmarks WHERE user_id = $1 AND supplier_id = $2`,
    [userId, supplierId],
  );
  return (result.rowCount ?? 0) > 0;
}
```

- [ ] **Step 6: Run it to see it pass.** `cd user-service && npx vitest run tests/db/queries/bookmarks.queries.test.ts` — Expected: PASS (all tests).

- [ ] **Step 7: Commit.**

```bash
git add user-service/src/db/init.sql user-service/src/db/queries/bookmarks.queries.ts user-service/tests/helpers/db.ts user-service/tests/db/queries/bookmarks.queries.test.ts
git commit -m "feat(user-service): user_bookmarks table and queries"
```

### Task A2: Bookmarks service

**Files:**
- Create: `user-service/src/services/bookmarks.service.ts`
- Test: `user-service/tests/services/bookmarks.service.test.ts`

Header scope: n/a (new files).

- [ ] **Step 1: Write the failing test.** Create `user-service/tests/services/bookmarks.service.test.ts`:

```ts
// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5-5), date: 2026-11-05
// Scope: Tests for the bookmarks service (cap, repeat safety, race safety), per the 2026-11-05
//        supplier-bookmarking spec. No requirements, architecture, schema, or API decisions were
//        made by the AI tool.
// Author review:
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as users from '../../src/db/queries/users.queries.js';
import {
  BOOKMARK_LIMIT_MESSAGE,
  MAX_BOOKMARKS,
  addBookmark,
  listBookmarks,
  removeBookmark,
} from '../../src/services/bookmarks.service.js';
import { AppError } from '../../src/utils/AppError.js';
import { getBookmarkRows, truncateAll } from '../helpers/db.js';

let userId: string;

beforeEach(async () => {
  await truncateAll();
  userId = (
    await users.createUser({ username: 'alice', email: 'alice@example.com', passwordHash: 'h', status: 'active' })
  ).id;
});
afterEach(truncateAll);

async function fill(count: number) {
  for (let id = 1; id <= count; id += 1) await addBookmark(userId, id);
}

describe('addBookmark', () => {
  it('stores the bookmark and answers with the added code', async () => {
    expect(await addBookmark(userId, 7)).toEqual({ message: 'Supplier bookmarked', code: 'BOOKMARK_ADDED' });
    expect(await listBookmarks(userId)).toEqual({ supplier_ids: [7] });
  });

  it('is safe to repeat: same answer, still one row', async () => {
    await addBookmark(userId, 7);
    expect(await addBookmark(userId, 7)).toEqual({ message: 'Supplier bookmarked', code: 'BOOKMARK_ADDED' });
    expect(await getBookmarkRows(userId)).toHaveLength(1);
  });

  it('allows exactly the limit', async () => {
    await fill(MAX_BOOKMARKS);
    expect(await getBookmarkRows(userId)).toHaveLength(MAX_BOOKMARKS);
  });

  it('rejects the next one with 422 BOOKMARK_LIMIT_REACHED and the user-facing message', async () => {
    await fill(MAX_BOOKMARKS);
    const err = await addBookmark(userId, 99).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ status: 422, code: 'BOOKMARK_LIMIT_REACHED', message: BOOKMARK_LIMIT_MESSAGE });
    expect(BOOKMARK_LIMIT_MESSAGE).toBe(
      'You can bookmark up to 20 suppliers. Remove one before adding another.',
    );
    expect(await getBookmarkRows(userId)).toHaveLength(MAX_BOOKMARKS);
  });

  it('still accepts a repeat of an existing bookmark when at the limit', async () => {
    await fill(MAX_BOOKMARKS);
    await expect(addBookmark(userId, 1)).resolves.toMatchObject({ code: 'BOOKMARK_ADDED' });
  });

  it('never exceeds the limit when adds race', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: MAX_BOOKMARKS + 5 }, (_, i) => addBookmark(userId, i + 1)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(MAX_BOOKMARKS);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(5);
    expect(await getBookmarkRows(userId)).toHaveLength(MAX_BOOKMARKS);
  });
});

describe('removeBookmark', () => {
  it('removes the bookmark and frees a slot', async () => {
    await fill(MAX_BOOKMARKS);
    expect(await removeBookmark(userId, 3)).toEqual({ message: 'Bookmark removed', code: 'BOOKMARK_REMOVED' });
    await expect(addBookmark(userId, 99)).resolves.toMatchObject({ code: 'BOOKMARK_ADDED' });
  });

  it('answers the same when the bookmark was not saved', async () => {
    expect(await removeBookmark(userId, 42)).toEqual({ message: 'Bookmark removed', code: 'BOOKMARK_REMOVED' });
  });
});

describe('listBookmarks', () => {
  it('returns an empty list for a user with none', async () => {
    expect(await listBookmarks(userId)).toEqual({ supplier_ids: [] });
  });
});
```

- [ ] **Step 2: Run it to see it fail.** `cd user-service && npx vitest run tests/services/bookmarks.service.test.ts` — Expected: FAIL, cannot resolve `bookmarks.service.js`.

- [ ] **Step 3: Write the service.** Create `user-service/src/services/bookmarks.service.ts`:

```ts
// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5-5), date: 2026-11-05
// Scope: Bookmarks service (20-per-user cap, repeat-safe add and remove), per the 2026-11-05
//        supplier-bookmarking spec. No requirements, architecture, schema, or API decisions were
//        made by the AI tool.
// Author review:

import { withTransaction } from "../db/transaction.js";
import * as queries from "../db/queries/bookmarks.queries.js";
import { AppError } from "../utils/AppError.js";

export const MAX_BOOKMARKS = 20;
export const BOOKMARK_LIMIT_MESSAGE =
  "You can bookmark up to 20 suppliers. Remove one before adding another.";

export async function listBookmarks(userId: string): Promise<{ supplier_ids: number[] }> {
  return { supplier_ids: await queries.listSupplierIds(userId) };
}

export async function addBookmark(
  userId: string,
  supplierId: number,
): Promise<{ message: string; code: string }> {
  await withTransaction(async (client) => {
    // Serialise adds for this user so the count below cannot go stale.
    await queries.lockUser(userId, client);
    // A repeat of a saved supplier succeeds even at the limit.
    if (await queries.bookmarkExists(userId, supplierId, client)) return;
    if ((await queries.countBookmarks(userId, client)) >= MAX_BOOKMARKS) {
      throw new AppError(422, BOOKMARK_LIMIT_MESSAGE, "BOOKMARK_LIMIT_REACHED");
    }
    await queries.insertBookmark(userId, supplierId, client);
  });
  return { message: "Supplier bookmarked", code: "BOOKMARK_ADDED" };
}

export const BOOKMARK_REMOVED_RESPONSE = {
  message: "Bookmark removed",
  code: "BOOKMARK_REMOVED",
};

export async function removeBookmark(
  userId: string,
  supplierId: number,
): Promise<{ message: string; code: string }> {
  await queries.deleteBookmark(userId, supplierId);
  return BOOKMARK_REMOVED_RESPONSE;
}
```

- [ ] **Step 4: Run it to see it pass.** `cd user-service && npx vitest run tests/services/bookmarks.service.test.ts` — Expected: PASS (all tests, including the race test).

- [ ] **Step 5: Commit.**

```bash
git add user-service/src/services/bookmarks.service.ts user-service/tests/services/bookmarks.service.test.ts
git commit -m "feat(user-service): bookmarks service with 20-per-user cap"
```

### Task A3: Controller, routes and HTTP tests

**Files:**
- Create: `user-service/src/controllers/bookmarks.controller.ts`
- Modify: `user-service/src/routes/me.routes.ts`
- Test: `user-service/tests/controllers/bookmarks.controller.test.ts`

Header scope for `me.routes.ts`: "Added GET /bookmarks, PUT /bookmarks/:supplierId and DELETE /bookmarks/:supplierId, per the 2026-11-05 supplier-bookmarking spec."

- [ ] **Step 1: Write the failing test.** Create `user-service/tests/controllers/bookmarks.controller.test.ts`:

```ts
// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5-5), date: 2026-11-05
// Scope: HTTP tests (supertest, real test DB) for GET/PUT/DELETE /users/me/bookmarks, per the
//        2026-11-05 supplier-bookmarking spec. No requirements, architecture, schema, or API
//        decisions were made by the AI tool.
// Author review:
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/app.js';
import { getBookmarkRows, truncateAll } from '../helpers/db.js';
import { accessTokenFor, bearer, createActiveUser } from '../helpers/fixtures.js';

beforeEach(truncateAll);
afterEach(truncateAll);

const UNAUTHORIZED = { message: 'Unauthorized', code: 'UNAUTHORIZED' };

const call = (method: 'get' | 'put' | 'delete', token: string | undefined, suffix = '') => {
  const r = request(app)[method]('/users/me/bookmarks' + suffix);
  return token ? r.set('Authorization', bearer(token)) : r;
};

async function signedInUser(n: number) {
  const user = await createActiveUser(n);
  return { user, token: await accessTokenFor(user) };
}

describe('authentication', () => {
  it.each([
    ['get', ''],
    ['put', '/5'],
    ['delete', '/5'],
  ] as const)('%s %s without a token: 401', async (method, suffix) => {
    const res = await call(method, undefined, suffix);
    expect(res.status).toBe(401);
    expect(res.body).toEqual(UNAUTHORIZED);
  });
});

describe('GET /users/me/bookmarks', () => {
  it('returns an empty list for a new user', async () => {
    const { token } = await signedInUser(1);
    const res = await call('get', token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ supplier_ids: [] });
  });
});

describe('PUT /users/me/bookmarks/:supplierId', () => {
  it('adds the bookmark: 200 and it appears in the list and the DB', async () => {
    const { user, token } = await signedInUser(1);
    const res = await call('put', token, '/7');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Supplier bookmarked', code: 'BOOKMARK_ADDED' });
    expect((await call('get', token)).body).toEqual({ supplier_ids: [7] });
    expect(await getBookmarkRows(user.id)).toHaveLength(1);
  });

  it('is safe to repeat', async () => {
    const { user, token } = await signedInUser(1);
    await call('put', token, '/7');
    const res = await call('put', token, '/7');
    expect(res.status).toBe(200);
    expect(await getBookmarkRows(user.id)).toHaveLength(1);
  });

  it('answers the 21st with 422 and the user-facing message', async () => {
    const { user, token } = await signedInUser(1);
    for (let id = 1; id <= 20; id += 1) expect((await call('put', token, '/' + id)).status).toBe(200);

    const res = await call('put', token, '/21');
    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      message: 'You can bookmark up to 20 suppliers. Remove one before adding another.',
      code: 'BOOKMARK_LIMIT_REACHED',
    });
    expect(await getBookmarkRows(user.id)).toHaveLength(20);
  });

  it.each(['abc', '0', '-1', '1.5', '2147483648', '01'])('rejects id %s with 400', async (id) => {
    const { token } = await signedInUser(1);
    const res = await call('put', token, '/' + id);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Supplier id must be a positive whole number', code: 'VALIDATION_ERROR' });
  });
});

describe('DELETE /users/me/bookmarks/:supplierId', () => {
  it('removes the bookmark', async () => {
    const { token } = await signedInUser(1);
    await call('put', token, '/7');
    const res = await call('delete', token, '/7');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Bookmark removed', code: 'BOOKMARK_REMOVED' });
    expect((await call('get', token)).body).toEqual({ supplier_ids: [] });
  });

  it('answers 200 when the bookmark was not saved', async () => {
    const { token } = await signedInUser(1);
    expect((await call('delete', token, '/7')).status).toBe(200);
  });

  it.each(['abc', '0', '-1', '1.5', '2147483648'])(
    'answers 200 without failing for a malformed id (%s): there is nothing to remove',
    async (id) => {
      const { user, token } = await signedInUser(1);
      await call('put', token, '/7');

      const res = await call('delete', token, '/' + id);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Bookmark removed', code: 'BOOKMARK_REMOVED' });
      expect(await getBookmarkRows(user.id)).toHaveLength(1);
    },
  );
});

describe('per-user isolation', () => {
  it('one user’s bookmarks never show up for or affect another', async () => {
    const a = await signedInUser(1);
    const b = await signedInUser(2);
    await call('put', a.token, '/7');
    expect((await call('get', b.token)).body).toEqual({ supplier_ids: [] });
    await call('delete', b.token, '/7');
    expect((await call('get', a.token)).body).toEqual({ supplier_ids: [7] });
  });
});
```

- [ ] **Step 2: Run it to see it fail.** `cd user-service && npx vitest run tests/controllers/bookmarks.controller.test.ts` — Expected: FAIL (the routes return 404).

- [ ] **Step 3: Write the controller.** Create `user-service/src/controllers/bookmarks.controller.ts`:

```ts
// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5-5), date: 2026-11-05
// Scope: Controller for GET/PUT/DELETE /users/me/bookmarks, per the 2026-11-05
//        supplier-bookmarking spec. No requirements, architecture, schema, or API decisions were
//        made by the AI tool.
// Author review:

import { z } from 'zod';
import * as bookmarksService from '../services/bookmarks.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// The Supplier Service ids are integers; 2147483647 is the largest the column can hold.
const supplierIdParams = z.object({
  supplierId: z
    .string()
    .refine(
      (value) => /^[1-9]\d{0,9}$/.test(value) && Number(value) <= 2147483647,
      'Supplier id must be a positive whole number',
    )
    .transform(Number),
});

export const list = asyncHandler(async (req, res) => {
  // authenticate has run, so req.user is set. The id never comes from the request.
  res.status(200).json(await bookmarksService.listBookmarks(req.user!.user_id));
});

export const add = asyncHandler(async (req, res) => {
  const { supplierId } = supplierIdParams.parse(req.params);
  res.status(200).json(await bookmarksService.addBookmark(req.user!.user_id, supplierId));
});

export const remove = asyncHandler(async (req, res) => {
  const parsed = supplierIdParams.safeParse(req.params);
  // A malformed id can never have been bookmarked, so there is nothing to remove and the call must
  // not fail (spec B23): the frontend uses this to drop records the Supplier Service called invalid.
  if (!parsed.success) {
    res.status(200).json(bookmarksService.BOOKMARK_REMOVED_RESPONSE);
    return;
  }
  res.status(200).json(await bookmarksService.removeBookmark(req.user!.user_id, parsed.data.supplierId));
});
```

- [ ] **Step 4: Add the routes.** In `user-service/src/routes/me.routes.ts`, add the import under the existing `meController` import:

```ts
import * as bookmarksController from '../controllers/bookmarks.controller.js';
```

and add these lines after the `router.post('/confirm-password-change', ...)` line:

```ts
router.get('/bookmarks', authenticate, bookmarksController.list);
router.put('/bookmarks/:supplierId', authenticate, bookmarksController.add);
router.delete('/bookmarks/:supplierId', authenticate, bookmarksController.remove);
```

- [ ] **Step 5: Run it to see it pass.** `cd user-service && npx vitest run tests/controllers/bookmarks.controller.test.ts` — Expected: PASS.

- [ ] **Step 6: Run the whole user-service suite and typecheck.** `cd user-service && npx vitest run && npx tsc --noEmit` — Expected: all pass, no type errors (report any failure that existed before this change separately).

- [ ] **Step 7: Document the routes if the README lists `/users/me` routes.** Run `grep -n "active-view" user-service/README.md`. If it prints a table row, add three rows in the same format for `GET /users/me/bookmarks`, `PUT /users/me/bookmarks/:supplierId`, `DELETE /users/me/bookmarks/:supplierId`, using the descriptions in spec §4.1 and appending the README header pair. If it prints nothing, skip.

- [ ] **Step 8: Commit.**

```bash
git add user-service/src/controllers/bookmarks.controller.ts user-service/src/routes/me.routes.ts user-service/tests/controllers/bookmarks.controller.test.ts user-service/README.md
git commit -m "feat(user-service): /users/me/bookmarks endpoints"
```

---

# Part B — supplier-service

### Task B1: `ids` query parameter

**Files:**
- Modify: `supplier-service/src/validation/supplierQuery.ts`
- Test: `supplier-service/test/validation/supplierQuery.test.ts`

Header scope: "Added the ids list parameter to the list query schema, per the 2026-11-05 supplier-bookmarking spec."

- [ ] **Step 1: Write the failing tests.** Append to `test/validation/supplierQuery.test.ts` (after the existing `listQuerySchema` describe block):

```ts
describe('listQuerySchema ids', () => {
  const ids = (raw: unknown) => parseOrThrow(listQuerySchema, { ids: raw }, 'query').ids;

  it('leaves ids undefined when omitted', () => {
    expect(parseOrThrow(listQuerySchema, {}, 'query').ids).toBeUndefined();
  });

  it('splits a comma-separated list into well-formed numbers', () => {
    expect(ids('3,7,12')).toEqual({ valid: [3, 7, 12], invalid: [] });
  });

  it('ignores duplicates, keeping first-seen order', () => {
    expect(ids('7,3,7')).toEqual({ valid: [7, 3], invalid: [] });
  });

  it('treats an empty value as no ids rather than an error', () => {
    expect(ids('')).toEqual({ valid: [], invalid: [] });
  });

  it('ignores empty items such as a trailing comma', () => {
    expect(ids('3,,7,')).toEqual({ valid: [3, 7], invalid: [] });
  });

  it('reports malformed items as invalid without rejecting the request', () => {
    expect(ids('3,x,0,1.5,-2,07,7')).toEqual({ valid: [3, 7], invalid: ['x', '0', '1.5', '-2', '07'] });
  });

  it('treats an id above 2147483647 as invalid', () => {
    expect(ids('2147483647,2147483648')).toEqual({ valid: [2147483647], invalid: ['2147483648'] });
  });

  it('accepts exactly 20 values', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => i + 1).join(',');
    expect(ids(twenty)?.valid).toHaveLength(20);
  });

  it.each([
    ['21 values', Array.from({ length: 21 }, (_, i) => i + 1).join(',')],
    ['a repeated parameter', ['1', '2']],
  ])('rejects %s with a 422 naming ids', (_label, raw) => {
    const err = catchAppError(() => ids(raw));
    expect(err.statusCode).toBe(422);
    expect(err.details?.[0]).toMatchObject({ location: 'query' });
    expect((err.details?.[0] as { field: string }).field).toMatch(/^ids/);
  });
});
```

- [ ] **Step 2: Run it to see it fail.** `cd supplier-service && npx vitest run test/validation/supplierQuery.test.ts` — Expected: FAIL (`ids` is not in the schema, so it is stripped and parsed ids are `undefined`).

- [ ] **Step 3: Add the field.** In `src/validation/supplierQuery.ts`, add above `export const listQuerySchema`:

```ts
const MAX_IDS = 20;
const MAX_ID = 2147483647;

// "3,x,7" -> { valid: [3, 7], invalid: ['x'] }. Empty items are ignored and duplicates dropped. An
// item that is not a positive whole number is reported back as invalid instead of failing the
// request, so one bad value never blocks the good ones. More than MAX_IDS items is a 422.
const idsField = z
  .string()
  .transform((raw) => raw.split(',').filter((part) => part !== ''))
  .pipe(z.array(z.string()).max(MAX_IDS, `ids accepts at most ${MAX_IDS} values`))
  .transform((parts) => {
    const valid: number[] = [];
    const invalid: string[] = [];
    for (const part of new Set(parts)) {
      if (/^[1-9]\d*$/.test(part) && Number(part) <= MAX_ID) valid.push(Number(part));
      else invalid.push(part);
    }
    return { valid, invalid };
  });
```

and add this line inside `listQuerySchema` after `sortOrder`:

```ts
  ids: idsField.optional(),
```

- [ ] **Step 4: Run it to see it pass.** `cd supplier-service && npx vitest run test/validation/supplierQuery.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add supplier-service/src/validation/supplierQuery.ts supplier-service/test/validation/supplierQuery.test.ts
git commit -m "feat(supplier-service): ids list parameter on the list query"
```

### Task B2: Repository

**Files:**
- Modify: `supplier-service/src/persistence/supplierRepository.ts`
- Modify: `supplier-service/src/persistence/mysqlSupplierRepository.ts`
- Test: `supplier-service/test/persistence/mysqlSupplierRepository.test.ts`

Header scope: "Added the supplierIds criterion and findStatusesByIds, per the 2026-11-05 supplier-bookmarking spec."

- [ ] **Step 1: Write the failing tests.** Append to `test/persistence/mysqlSupplierRepository.test.ts`:

```ts
describe('supplierIds criterion', () => {
  it('filters the visible page and its count by the given ids', async () => {
    const { pool, query } = fakePool([{ total: 0 }], []);

    await createMysqlSupplierRepository(pool).findVisiblePage({ ...baseFilter, supplierIds: [3, 7] });

    const [countSql, countParams] = query.mock.calls[0] as [string, unknown[]];
    const [pageSql, pageParams] = query.mock.calls[1] as [string, unknown[]];
    for (const sql of [countSql, pageSql]) {
      expect(sql).toContain('s.supplier_id IN (?)');
      expect(sql).toContain('s.is_deleted = FALSE');
    }
    expect(countParams).toEqual([[3, 7]]);
    expect(pageParams).toEqual([[3, 7], 50, 0]);
  });

  it('applies to the unpaged read used by the isOpen filter', async () => {
    const { pool, query } = fakePool([]);

    await createMysqlSupplierRepository(pool).findAllVisible({ sortOrder: 'A-Z', supplierIds: [3, 7] });

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('s.supplier_id IN (?)');
    expect(params).toEqual([[3, 7]]);
  });

  it('adds no id condition when the criterion is absent', async () => {
    const { pool, query } = fakePool([{ total: 0 }], []);

    await createMysqlSupplierRepository(pool).findVisiblePage(baseFilter);

    expect((query.mock.calls[1] as [string, unknown[]])[0]).not.toContain('s.supplier_id IN');
  });
});

describe('findStatusesByIds', () => {
  it('returns the visibility flags of the rows that exist, from the supplier table', async () => {
    const { pool, query } = fakePool([
      { supplier_id: 3, is_active: 1, is_deleted: 0 },
      { supplier_id: 7, is_active: 0, is_deleted: 0 },
    ]);

    const result = await createMysqlSupplierRepository(pool).findStatusesByIds([3, 7, 99]);

    expect(result).toEqual([
      { supplierId: 3, isActive: true, isDeleted: false },
      { supplierId: 7, isActive: false, isDeleted: false },
    ]);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('FROM supplier WHERE supplier_id IN (?)');
    expect(params).toEqual([[3, 7, 99]]);
  });

  it('does not query when given no ids', async () => {
    const { pool, query } = fakePool();

    expect(await createMysqlSupplierRepository(pool).findStatusesByIds([])).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to see it fail.** `cd supplier-service && npx vitest run test/persistence/mysqlSupplierRepository.test.ts` — Expected: FAIL (type errors or missing `findStatusesByIds`).

- [ ] **Step 3: Extend the interface.** In `src/persistence/supplierRepository.ts`, add `supplierIds?: number[];` to `ListCriteria` (after `categoryId`), add this type above `export interface SupplierRepository`:

```ts
export interface SupplierStatusRow {
  supplierId: number;
  isActive: boolean;
  isDeleted: boolean;
}
```

and add this member to `SupplierRepository` (after `findAdminById`):

```ts
  /** Visibility flags for the ids that exist, regardless of state. Missing ids are simply absent. */
  findStatusesByIds(supplierIds: number[]): Promise<SupplierStatusRow[]>;
```

- [ ] **Step 4: Implement in MySQL.** In `src/persistence/mysqlSupplierRepository.ts`: add `SupplierStatusRow` to the type import from `./supplierRepository.js`; add this interface after `AdminDbRow`:

```ts
interface StatusDbRow extends RowDataPacket {
  supplier_id: number;
  is_active: number;
  is_deleted: number;
}
```

change `buildWhere` to:

```ts
function buildWhere(
  filter: Pick<ListFilter, 'search' | 'locationId' | 'categoryId' | 'supplierIds'>,
  visibleOnly = true,
): { where: string; params: Array<string | number | number[]> } {
  const conditions = visibleOnly ? [VISIBLE] : ['1 = 1'];
  const params: Array<string | number | number[]> = [];

  if (filter.supplierIds !== undefined) {
    conditions.push('s.supplier_id IN (?)');
    params.push(filter.supplierIds);
  }
```

(keep the rest of the function unchanged), and add this method to the returned object, after `findAdminById`:

```ts
    async findStatusesByIds(supplierIds) {
      if (supplierIds.length === 0) return [];
      const [rows] = await pool.query<StatusDbRow[]>(
        `SELECT supplier_id, is_active, is_deleted FROM supplier WHERE supplier_id IN (?)`,
        [supplierIds],
      );
      return rows.map(
        (row): SupplierStatusRow => ({
          supplierId: Number(row.supplier_id),
          isActive: Boolean(row.is_active),
          isDeleted: Boolean(row.is_deleted),
        }),
      );
    },
```

- [ ] **Step 5: Run it to see it pass.** `cd supplier-service && npx vitest run test/persistence/mysqlSupplierRepository.test.ts` — Expected: PASS. (`supplierService.test.ts` will have a type error until Task B3 adds the method to its fake; that is expected here.)

- [ ] **Step 6: Commit.**

```bash
git add supplier-service/src/persistence/supplierRepository.ts supplier-service/src/persistence/mysqlSupplierRepository.ts supplier-service/test/persistence/mysqlSupplierRepository.test.ts
git commit -m "feat(supplier-service): id filter and status lookup in the supplier repository"
```

### Task B3: Service and response type

**Files:**
- Modify: `supplier-service/src/types/supplier.ts`
- Modify: `supplier-service/src/business/supplierService.ts`
- Test: `supplier-service/test/business/supplierService.test.ts`

Header scope: "Added the unavailable array for the ids filter, per the 2026-11-05 supplier-bookmarking spec."

- [ ] **Step 1: Update the fake and write the failing tests.** In `test/business/supplierService.test.ts`, add this line to `fakeRepo`'s returned object, after `findAdminById`:

```ts
    findStatusesByIds: vi.fn().mockResolvedValue([]),
```

and append at the end of the file:

```ts
describe('listSuppliers with ids', () => {
  const statuses = [
    { supplierId: 1, isActive: true, isDeleted: false },
    { supplierId: 7, isActive: false, isDeleted: false },
    { supplierId: 12, isActive: false, isDeleted: true },
    { supplierId: 13, isActive: true, isDeleted: true },
  ];
  const withStatuses = () => fakeRepo({ findStatusesByIds: vi.fn().mockResolvedValue(statuses) });
  const ids = (valid: number[], invalid: string[] = []) => ({ valid, invalid });

  it('restricts the page query to the ids and keeps the other filters', async () => {
    const repo = withStatuses();

    await service(repo).listSuppliers({ page: 1, sortOrder: 'Z-A', search: 'store', ids: ids([1, 7]) });

    expect(repo.findVisiblePage).toHaveBeenCalledWith(
      expect.objectContaining({ supplierIds: [1, 7], search: 'store', sortOrder: 'Z-A' }),
    );
  });

  it('restricts the unpaged read used by the isOpen filter too', async () => {
    const repo = withStatuses();

    await service(repo).listSuppliers({ page: 1, sortOrder: 'A-Z', isOpen: true, ids: ids([1, 7]) });

    expect(repo.findAllVisible).toHaveBeenCalledWith(expect.objectContaining({ supplierIds: [1, 7] }));
  });

  it('lists hidden, deleted and unknown ids in the order sent, skipping visible ones', async () => {
    const result = await service(withStatuses()).listSuppliers({
      page: 1,
      sortOrder: 'A-Z',
      ids: ids([12, 1, 99, 7]),
    });

    expect(result.unavailable).toEqual([
      { id: 12, status: 'deleted' },
      { id: 99, status: 'deleted' },
      { id: 7, status: 'hidden' },
    ]);
  });

  it('reports a supplier that is both deleted and inactive as deleted', async () => {
    const result = await service(withStatuses()).listSuppliers({
      page: 1,
      sortOrder: 'A-Z',
      ids: ids([12, 13]),
    });

    expect(result.unavailable).toEqual([
      { id: 12, status: 'deleted' },
      { id: 13, status: 'deleted' },
    ]);
  });

  it('reports malformed items as invalid, after the well-formed ones, without blocking them', async () => {
    const repo = withStatuses();

    const result = await service(repo).listSuppliers({
      page: 1,
      sortOrder: 'A-Z',
      ids: ids([7, 1], ['abc', '0']),
    });

    expect(repo.findVisiblePage).toHaveBeenCalledWith(expect.objectContaining({ supplierIds: [7, 1] }));
    expect(result.unavailable).toEqual([
      { id: 7, status: 'hidden' },
      { id: 'abc', status: 'invalid' },
      { id: '0', status: 'invalid' },
    ]);
  });

  it('returns an empty payload without touching the database when no id is well-formed', async () => {
    const repo = withStatuses();

    const result = await service(repo).listSuppliers({ page: 3, sortOrder: 'A-Z', ids: ids([], ['abc']) });

    expect(result).toEqual({
      metadata: { totalRecords: 0, currPage: 3, limit: 50, totalPages: 0 },
      data: [],
      unavailable: [{ id: 'abc', status: 'invalid' }],
    });
    expect(repo.findVisiblePage).not.toHaveBeenCalled();
    expect(repo.findAllVisible).not.toHaveBeenCalled();
    expect(repo.findStatusesByIds).not.toHaveBeenCalled();
  });

  it('returns an empty payload with an empty unavailable array for an empty ids list', async () => {
    const result = await service(withStatuses()).listSuppliers({ page: 1, sortOrder: 'A-Z', ids: ids([]) });

    expect(result.data).toEqual([]);
    expect(result.metadata.totalRecords).toBe(0);
    expect(result.unavailable).toEqual([]);
  });

  it('always includes unavailable (empty) when every id is visible', async () => {
    const result = await service(withStatuses()).listSuppliers({ page: 1, sortOrder: 'A-Z', ids: ids([1]) });

    expect(result.unavailable).toEqual([]);
  });

  it('checks every well-formed id, whatever the other filters are', async () => {
    const repo = withStatuses();

    await service(repo).listSuppliers({
      page: 2,
      sortOrder: 'A-Z',
      search: 'zzz',
      locationId: 4,
      ids: ids([1, 7, 12]),
    });

    expect(repo.findStatusesByIds).toHaveBeenCalledWith([1, 7, 12]);
  });

  it('adds no unavailable field and does no status lookup without ids', async () => {
    const repo = fakeRepo();

    const result = await service(repo).listSuppliers({ page: 1, sortOrder: 'A-Z' });

    expect(result).not.toHaveProperty('unavailable');
    expect(repo.findStatusesByIds).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to see it fail.** `cd supplier-service && npx vitest run test/business/supplierService.test.ts` — Expected: FAIL (`ids` not on `ListParams`, `unavailable` undefined).

- [ ] **Step 3: Update the types.** In `src/types/supplier.ts`, replace the line `export type PaginatedSuppliers = Paginated<SupplierSummary>;` with:

```ts
/** `id` is the value as sent when `status` is `invalid` (a malformed item), otherwise the supplier id. */
export interface UnavailableSupplier {
  id: number | string;
  status: 'hidden' | 'deleted' | 'invalid';
}

/** `unavailable` is present only when the request sent `ids`. */
export type PaginatedSuppliers = Paginated<SupplierSummary> & {
  unavailable?: UnavailableSupplier[];
};
```

- [ ] **Step 4: Update the service.** In `src/business/supplierService.ts`:

(a) Add `SupplierStatusRow` to the type import from `'../persistence/supplierRepository.js'` and `UnavailableSupplier` to the import from `'../types/supplier.js'` (`SupplierSummary` is already imported).

(b) Add `ids?: { valid: number[]; invalid: string[] };` to `ListParams` (after `sortOrder`).

(c) In `listPage`, add `supplierIds: params.ids?.valid,` to the `criteria` object (after `categoryId: params.categoryId,`).

(d) Add this function above `createSupplierService`:

```ts
// Hidden = inactive; deleted = soft-deleted or no such supplier. Soft-deleted wins when both flags
// are set (spec B18). Visible ids are not listed. Order follows the request.
function toUnavailable(ids: number[], statuses: SupplierStatusRow[]): UnavailableSupplier[] {
  const byId = new Map(statuses.map((status) => [status.supplierId, status]));
  const unavailable: UnavailableSupplier[] = [];
  for (const id of ids) {
    const status = byId.get(id);
    if (status === undefined || status.isDeleted) {
      unavailable.push({ id, status: 'deleted' });
    } else if (!status.isActive) {
      unavailable.push({ id, status: 'hidden' });
    }
  }
  return unavailable;
}
```

(e) Replace the whole `listSuppliers(params: ListParams): Promise<PaginatedSuppliers> { ... },` member with:

```ts
    async listSuppliers(params: ListParams): Promise<PaginatedSuppliers> {
      const source = {
        page: (filter: ListFilter) => repo.findVisiblePage(filter),
        all: (criteria: ListCriteria) => repo.findAllVisible(criteria),
      };
      const decorate = (item: Assembled<SupplierRow>) => item.summary;

      if (params.ids === undefined) return listPage(params, source, decorate);

      const { valid, invalid } = params.ids;
      const invalidEntries: UnavailableSupplier[] = invalid.map((id) => ({ id, status: 'invalid' }));

      // Nothing well-formed to look up (spec B20): an empty page, without touching the database.
      if (valid.length === 0) {
        return { ...envelope<SupplierSummary>(params.page, 0, []), unavailable: invalidEntries };
      }

      const [page, statuses] = await Promise.all([
        listPage(params, source, decorate),
        repo.findStatusesByIds(valid),
      ]);
      return { ...page, unavailable: [...toUnavailable(valid, statuses), ...invalidEntries] };
    },
```

- [ ] **Step 5: Run it to see it pass.** `cd supplier-service && npx vitest run test/business/supplierService.test.ts && npx tsc --noEmit` — Expected: PASS, no type errors.

- [ ] **Step 6: Commit.**

```bash
git add supplier-service/src/types/supplier.ts supplier-service/src/business/supplierService.ts supplier-service/test/business/supplierService.test.ts
git commit -m "feat(supplier-service): ids filter and unavailable array in the supplier list"
```

### Task B4: Controller wiring

**Files:**
- Modify: `supplier-service/src/controllers/supplier.controller.ts`
- Test: `supplier-service/test/routes/supplier.routes.test.ts`

Header scope: "Pass the ids query value to the list service, per the 2026-11-05 supplier-bookmarking spec."

- [ ] **Step 1: Write the failing tests.** In `test/routes/supplier.routes.test.ts`, add inside `describe('GET /api/v1/suppliers', ...)` (before its closing `});`):

```ts
  it('passes ids to the service split into well-formed numbers (de-duplicated) and malformed items', async () => {
    const { app, service } = buildApp();
    const res = await request(app).get('/api/v1/suppliers?ids=3,7,3,abc').set('x-test-role', 'user');
    expect(res.status).toBe(200);
    expect(service.listSuppliers).toHaveBeenCalledWith(
      expect.objectContaining({ ids: { valid: [3, 7], invalid: ['abc'] } }),
    );
  });

  it('accepts an empty ids value and passes an empty list', async () => {
    const { app, service } = buildApp();
    const res = await request(app).get('/api/v1/suppliers?ids=').set('x-test-role', 'user');
    expect(res.status).toBe(200);
    expect(service.listSuppliers).toHaveBeenCalledWith(
      expect.objectContaining({ ids: { valid: [], invalid: [] } }),
    );
  });

  it('combines ids with the other filters', async () => {
    const { app, service } = buildApp();
    await request(app).get('/api/v1/suppliers?ids=3,7&search=store&isOpen=true').set('x-test-role', 'user');
    expect(service.listSuppliers).toHaveBeenCalledWith(
      expect.objectContaining({ ids: { valid: [3, 7], invalid: [] }, search: 'store', isOpen: true }),
    );
  });

  it.each([
    ['more than 20 values', 'ids=' + Array.from({ length: 21 }, (_, i) => i + 1).join(',')],
    ['a repeated parameter', 'ids=1&ids=2'],
  ])('returns 422 for %s', async (_label, queryString) => {
    const { app, service } = buildApp();
    const res = await request(app).get('/api/v1/suppliers?' + queryString).set('x-test-role', 'user');
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ status_code: 422, error: 'Unprocessable Entity' });
    expect(res.body.details[0]).toMatchObject({ location: 'query' });
    expect(res.body.details[0].field).toMatch(/^ids/);
    expect(service.listSuppliers).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run it to see it fail.** `cd supplier-service && npx vitest run test/routes/supplier.routes.test.ts` — Expected: FAIL (`ids` missing from the service call).

- [ ] **Step 3: Wire it.** In `src/controllers/supplier.controller.ts`, add `ids: query.ids,` to the object passed to `service.listSuppliers`, after `sortOrder: query.sortOrder,`.

- [ ] **Step 4: Run the full default suite, typecheck and lint.** `cd supplier-service && npx vitest run && npx tsc --noEmit && npm run lint` — Expected: all pass. Report the real counts (at last record: 38 files / 343 tests before this change).

- [ ] **Step 5: Commit.**

```bash
git add supplier-service/src/controllers/supplier.controller.ts supplier-service/test/routes/supplier.routes.test.ts
git commit -m "feat(supplier-service): accept ids on GET /api/v1/suppliers"
```

### Task B5: Supplier-service docs and state

**Files:**
- Modify: `supplier-service/openapi.yaml`
- Modify: `supplier-service/README.md`
- Modify: `supplier-service/PROJECT_STATE.md`

Header scope for each: "Documented the ids filter and unavailable array, and recorded workstream W8, per the 2026-11-05 supplier-bookmarking spec."

- [ ] **Step 1: OpenAPI parameter.** In `openapi.yaml`, in the `/suppliers` `get` parameters, change

```yaml
        - $ref: "#/components/parameters/SortOrder"
      responses:
        "200":
          description: One page of suppliers.
```

(the first occurrence, under `operationId: listSuppliers`) to

```yaml
        - $ref: "#/components/parameters/SortOrder"
        - $ref: "#/components/parameters/Ids"
      responses:
        "200":
          description: One page of suppliers.
```

and add after the `SortOrder:` parameter block in `components/parameters`:

```yaml
    Ids:
      name: ids
      in: query
      description: |
        Comma-separated supplier ids, at most 20, e.g. `3,7,12`; duplicates and empty items are
        ignored. Restricts `data` to those suppliers (the other filters still apply) and adds an
        `unavailable` array to the response. An item that is not a positive whole number is reported
        as `invalid` and does not block the others. An empty value returns an empty page. More than
        20 values, or the parameter sent twice, returns `422`.
      schema: { type: string, example: "3,7,12" }
```

- [ ] **Step 2: OpenAPI schema.** Replace the `SupplierPage` schema with:

```yaml
    SupplierPage:
      type: object
      required: [metadata, data]
      properties:
        metadata: { $ref: "#/components/schemas/PageMetadata" }
        data:
          type: array
          items: { $ref: "#/components/schemas/SupplierSummary" }
        unavailable:
          type: array
          description: |
            Present only when `ids` was sent. Every requested id that is hidden (inactive), deleted
            (soft-deleted, or no such supplier) or malformed. Well-formed ids come first, in the order
            sent, then malformed ones. It ignores the other filters.
          items:
            type: object
            required: [id, status]
            properties:
              id:
                description: The supplier id, or the value as sent when `status` is `invalid`.
                oneOf: [{ type: integer }, { type: string }]
              status: { type: string, enum: [hidden, deleted, invalid] }
```

- [ ] **Step 3: README row.** In `README.md`, in the `GET /api/v1/suppliers` row, change `` `sortOrder` (`A-Z`/`Z-A`, default `A-Z`) `` to `` `sortOrder` (`A-Z`/`Z-A`, default `A-Z`), `ids` (comma-separated, up to 20; adds an `unavailable` array) ``.

- [ ] **Step 4: Project state.** In `PROJECT_STATE.md`: the `W8` row already exists (added with the plan). Before starting Task A1, change its status to `Building` and its Progress cell to a position such as `Task A1 in flight`; keep that cell current as tasks finish (a position, not a diary). Then add this row to the § 4.1 decisions table after `C9`:

```markdown
| C53 | 2026-11-05 | `GET /api/v1/suppliers` accepts `ids` (up to 20 comma-separated ids) and then also returns `unavailable: [{id, status: hidden\|deleted\|invalid}]`; the service never calls the user-service | Asked by the team in chat (2026-11-05); reason not recorded | Chat (supplier bookmarking); spec B8–B12, B15 |
```

and update the `**Branch:**` line to `` `supplier-bookmarking` (from `main`, 2026-11-05). `` and `**Last updated:**` to `2026-11-05 — W8 supplier bookmarking added; other sections retain their earlier dates.`.

- [ ] **Step 5: Commit.**

```bash
git add supplier-service/openapi.yaml supplier-service/README.md supplier-service/PROJECT_STATE.md
git commit -m "docs(supplier-service): document ids filter and record W8"
```

---

# Part C — frontend

### Task C1: API module

**Files:**
- Create: `frontend/src/api/bookmarks.js`
- Modify: `frontend/src/api/suppliers.js`
- Test: `frontend/tests/api/bookmarks.test.js`

Header scope for `suppliers.js`: "Documented the ids parameter and added EMPTY_PAGE, per the 2026-11-05 supplier-bookmarking spec."

- [ ] **Step 1: Write the failing test.** Create `frontend/tests/api/bookmarks.test.js`:

```js
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-05
 * Scope: Tests for the bookmark API calls, per the 2026-11-05 supplier-bookmarking spec.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/api/http', () => ({ request: vi.fn() }))

import { request } from '../../src/api/http'
import { addBookmark, listBookmarks, removeBookmark } from '../../src/api/bookmarks'

beforeEach(() => request.mockReset())

describe('bookmark calls', () => {
  it('listBookmarks calls GET /users/me/bookmarks and returns the body', async () => {
    request.mockResolvedValueOnce({ supplier_ids: [3, 7] })
    expect(await listBookmarks()).toEqual({ supplier_ids: [3, 7] })
    expect(request).toHaveBeenCalledWith('/users/me/bookmarks')
  })

  it('addBookmark calls PUT /users/me/bookmarks/:id', async () => {
    request.mockResolvedValueOnce({ code: 'BOOKMARK_ADDED' })
    await addBookmark(7)
    expect(request).toHaveBeenCalledWith('/users/me/bookmarks/7', { method: 'PUT' })
  })

  it('removeBookmark calls DELETE /users/me/bookmarks/:id', async () => {
    request.mockResolvedValueOnce({ code: 'BOOKMARK_REMOVED' })
    await removeBookmark(7)
    expect(request).toHaveBeenCalledWith('/users/me/bookmarks/7', { method: 'DELETE' })
  })
})
```

- [ ] **Step 2: Run it to see it fail.** `cd frontend && npx vitest run tests/api/bookmarks.test.js` — Expected: FAIL, cannot resolve `bookmarks`.

- [ ] **Step 3: Write the module.** Create `frontend/src/api/bookmarks.js`:

```js
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-05
 * Scope: Calls for the user-service bookmark endpoints, per the 2026-11-05 supplier-bookmarking
 *        spec. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { request } from './http'

// 200 { supplier_ids: [3, 7, 12] }
export const listBookmarks = () => request('/users/me/bookmarks')

// 200 { message, code: 'BOOKMARK_ADDED' }; 422 { message, code: 'BOOKMARK_LIMIT_REACHED' } on the
// 21st (the message is written for the user).
export const addBookmark = (supplierId) =>
  request('/users/me/bookmarks/' + supplierId, { method: 'PUT' })

// 200 { message, code: 'BOOKMARK_REMOVED' }, also when the supplier was not bookmarked.
export const removeBookmark = (supplierId) =>
  request('/users/me/bookmarks/' + supplierId, { method: 'DELETE' })
```

- [ ] **Step 4: Document `ids` and add the empty page.** In `frontend/src/api/suppliers.js`, replace the comment and `listSuppliers` line

```js
// params: { page, search, location_id, category_id, isOpen, sortOrder } (limit is fixed at 50)
export const listSuppliers = (params) => request(BASE + '/suppliers', { query: params })
```

with

```js
// params: { page, search, location_id, category_id, isOpen, sortOrder, ids } (limit is fixed at 50).
// `ids` is a comma-separated string of 1 to 20 supplier ids (the "Bookmarked" filter); the response then
// also carries `unavailable: [{ id, status: 'hidden' | 'deleted' }]`.
export const listSuppliers = (params) => request(BASE + '/suppliers', { query: params })

// What the Bookmarked filter shows without a request when the user has no bookmarks.
export const EMPTY_PAGE = {
  metadata: { totalRecords: 0, currPage: 1, limit: 50, totalPages: 0 },
  data: [],
  unavailable: [],
}
```

- [ ] **Step 5: Run it to see it pass.** `cd frontend && npx vitest run tests/api/bookmarks.test.js` — Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add frontend/src/api/bookmarks.js frontend/src/api/suppliers.js frontend/tests/api/bookmarks.test.js
git commit -m "feat(frontend): bookmark API calls"
```

### Task C2: Bookmarks context

**Files:**
- Create: `frontend/src/context/BookmarksContext.jsx`
- Modify: `frontend/src/main.jsx`
- Test: `frontend/tests/context/BookmarksContext.test.jsx`

Header scope for `main.jsx`: "Mounted BookmarksProvider inside ToastProvider, per the 2026-11-05 supplier-bookmarking spec."

- [ ] **Step 1: Write the failing test.** Create `frontend/tests/context/BookmarksContext.test.jsx`:

```jsx
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-05
 * Scope: Tests for BookmarksProvider, per the 2026-11-05 supplier-bookmarking spec.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BookmarksProvider, useBookmarks } from '../../src/context/BookmarksContext'
import { addBookmark, listBookmarks, removeBookmark } from '../../src/api/bookmarks'

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }))

vi.mock('../../src/api/bookmarks', () => ({
  listBookmarks: vi.fn(),
  addBookmark: vi.fn(),
  removeBookmark: vi.fn(),
}))
vi.mock('../../src/components/Toast', () => ({ useToast: () => ({ showToast }) }))

let auth
vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => auth }))

let latest
function Probe() {
  latest = useBookmarks()
  return (
    <div>
      <span data-testid="ids">{latest.ids.join(',')}</span>
      <span data-testid="ready">{String(latest.ready)}</span>
      <button onClick={() => latest.toggle(7)}>toggle7</button>
    </div>
  )
}

const mount = () =>
  render(
    <BookmarksProvider>
      <Probe />
    </BookmarksProvider>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  auth = { isLoggedIn: true, sessionReady: true }
  listBookmarks.mockResolvedValue({ supplier_ids: [3, 5] })
  addBookmark.mockResolvedValue({ code: 'BOOKMARK_ADDED' })
  removeBookmark.mockResolvedValue({ code: 'BOOKMARK_REMOVED' })
})

describe('BookmarksProvider', () => {
  it('loads the user’s ids once logged in, then reports ready', async () => {
    mount()
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))
    expect(screen.getByTestId('ids')).toHaveTextContent('3,5')
    expect(latest.isBookmarked(3)).toBe(true)
    expect(latest.isBookmarked(4)).toBe(false)
  })

  it('stays empty and ready, without a request, when logged out', async () => {
    auth = { isLoggedIn: false, sessionReady: true }
    mount()
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))
    expect(listBookmarks).not.toHaveBeenCalled()
    expect(screen.getByTestId('ids')).toHaveTextContent('')
  })

  it('toggle adds an unsaved supplier, then removes it on the next click', async () => {
    mount()
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))

    fireEvent.click(screen.getByText('toggle7'))
    await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('3,5,7'))
    expect(addBookmark).toHaveBeenCalledWith(7)

    fireEvent.click(screen.getByText('toggle7'))
    await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('3,5'))
    expect(removeBookmark).toHaveBeenCalledWith(7)
  })

  it('shows the server message and keeps the ids when an add is refused', async () => {
    addBookmark.mockRejectedValueOnce(
      new Error('You can bookmark up to 20 suppliers. Remove one before adding another.'),
    )
    mount()
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))

    fireEvent.click(screen.getByText('toggle7'))

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        'You can bookmark up to 20 suppliers. Remove one before adding another.',
        'error',
      ),
    )
    expect(screen.getByTestId('ids')).toHaveTextContent('3,5')
  })

  it('pruneDeleted removes deleted and invalid entries and keeps hidden ones', async () => {
    mount()
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))

    await act(async () => {
      await latest.pruneDeleted([
        { id: 3, status: 'deleted' },
        { id: 5, status: 'hidden' },
        { id: 'abc', status: 'invalid' },
      ])
    })

    expect(removeBookmark).toHaveBeenCalledTimes(2)
    expect(removeBookmark).toHaveBeenCalledWith(3)
    expect(removeBookmark).toHaveBeenCalledWith('abc')
    expect(screen.getByTestId('ids')).toHaveTextContent('5')
  })

  it('pruneDeleted keeps a bookmark whose removal failed', async () => {
    removeBookmark.mockRejectedValueOnce(new Error('boom'))
    mount()
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))

    await act(async () => {
      await latest.pruneDeleted([{ id: 3, status: 'deleted' }])
    })

    expect(screen.getByTestId('ids')).toHaveTextContent('3,5')
  })
})
```

- [ ] **Step 2: Run it to see it fail.** `cd frontend && npx vitest run tests/context/BookmarksContext.test.jsx` — Expected: FAIL, cannot resolve `BookmarksContext`.

- [ ] **Step 3: Write the context.** Create `frontend/src/context/BookmarksContext.jsx`:

```jsx
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-05
 * Scope: Holds the signed-in user's bookmarked supplier ids and the add/remove/prune actions,
 *        per the 2026-11-05 supplier-bookmarking spec (B6, B12, B16).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { addBookmark, listBookmarks, removeBookmark } from '../api/bookmarks'
import { useAuth } from './AuthContext'
import { useToast } from '../components/Toast'

const BookmarksContext = createContext(null)

export function BookmarksProvider({ children }) {
  const { isLoggedIn, sessionReady } = useAuth()
  const { showToast } = useToast()
  const [ids, setIds] = useState([])
  // false until the first load has settled, so the Bookmarked filter does not flash an empty state.
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!sessionReady) return undefined
    if (!isLoggedIn) {
      setIds([])
      setReady(true)
      return undefined
    }
    let cancelled = false
    setReady(false)
    listBookmarks().then(
      (body) => {
        if (cancelled) return
        setIds(body.supplier_ids)
        setReady(true)
      },
      () => {
        if (cancelled) return
        setIds([])
        setReady(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [isLoggedIn, sessionReady])

  const isBookmarked = useCallback((supplierId) => ids.includes(supplierId), [ids])

  // One icon, two endpoints: which one is called depends on the icon's current state.
  const toggle = useCallback(
    async (supplierId) => {
      try {
        if (ids.includes(supplierId)) {
          await removeBookmark(supplierId)
          setIds((current) => current.filter((id) => id !== supplierId))
        } else {
          await addBookmark(supplierId)
          setIds((current) => (current.includes(supplierId) ? current : [...current, supplierId]))
        }
      } catch (err) {
        showToast(err.message, 'error')
      }
    },
    [ids, showToast],
  )

  // The Supplier Service reports ids it cannot find as 'deleted' (and malformed ones as 'invalid'):
  // clear those bookmarks. 'hidden' ones are kept.
  const pruneDeleted = useCallback(async (unavailable) => {
    const gone = unavailable
      .filter((entry) => entry.status === 'deleted' || entry.status === 'invalid')
      .map((entry) => entry.id)
    if (gone.length === 0) return
    const results = await Promise.allSettled(gone.map((id) => removeBookmark(id)))
    const cleared = gone.filter((_, index) => results[index].status === 'fulfilled')
    if (cleared.length > 0) setIds((current) => current.filter((id) => !cleared.includes(id)))
  }, [])

  const value = useMemo(
    () => ({ ids, ready, isBookmarked, toggle, pruneDeleted }),
    [ids, ready, isBookmarked, toggle, pruneDeleted],
  )

  return <BookmarksContext.Provider value={value}>{children}</BookmarksContext.Provider>
}

export function useBookmarks() {
  const ctx = useContext(BookmarksContext)
  if (!ctx) throw new Error('useBookmarks must be used inside BookmarksProvider')
  return ctx
}
```

- [ ] **Step 4: Mount it.** In `frontend/src/main.jsx`, add `import { BookmarksProvider } from './context/BookmarksContext'` below the `ToastProvider` import, and change

```jsx
          <ToastProvider>
            <App />
          </ToastProvider>
```

to

```jsx
          <ToastProvider>
            <BookmarksProvider>
              <App />
            </BookmarksProvider>
          </ToastProvider>
```

- [ ] **Step 5: Run it to see it pass.** `cd frontend && npx vitest run tests/context/BookmarksContext.test.jsx` — Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add frontend/src/context/BookmarksContext.jsx frontend/src/main.jsx frontend/tests/context/BookmarksContext.test.jsx
git commit -m "feat(frontend): bookmarks context"
```

### Task C3: SupplierCard icon

**Files:**
- Modify: `frontend/src/components/SupplierCard.jsx`
- Test: `frontend/tests/components/SupplierCard.test.jsx`

Header scope: "The bookmark icon now reads its state from BookmarksContext and toggles through it, replacing the mock local state, per the 2026-11-05 supplier-bookmarking spec."

- [ ] **Step 1: Write the failing test.** Create `frontend/tests/components/SupplierCard.test.jsx`:

```jsx
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-05
 * Scope: Tests for the SupplierCard bookmark icon, per the 2026-11-05 supplier-bookmarking spec.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SupplierCard from '../../src/components/SupplierCard'

const toggle = vi.fn()
const requireAuth = vi.fn((_message, callback) => callback())
let bookmarkedIds

vi.mock('../../src/context/BookmarksContext', () => ({
  useBookmarks: () => ({ isBookmarked: (id) => bookmarkedIds.includes(id), toggle }),
}))
vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ requireAuth }) }))

const supplier = {
  id: 5,
  name: 'Frontier',
  faculty: 'Computing',
  isOpen: true,
  categories: [],
  photos: [],
}

const renderCard = () =>
  render(
    <MemoryRouter>
      <SupplierCard supplier={supplier} showAction={false} />
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  bookmarkedIds = []
})

describe('SupplierCard bookmark icon', () => {
  it('shows an unpressed icon for a supplier that is not bookmarked and toggles it on click', () => {
    renderCard()
    const button = screen.getByRole('button', { name: 'Bookmark this place' })
    expect(button).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(button)

    expect(toggle).toHaveBeenCalledWith(5)
  })

  it('shows a pressed icon for a bookmarked supplier and toggles it on click', () => {
    bookmarkedIds = [5]
    renderCard()
    const button = screen.getByRole('button', { name: 'Remove bookmark' })
    expect(button).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(button)

    expect(toggle).toHaveBeenCalledWith(5)
  })

  it('asks a logged-out visitor to sign in instead of toggling', () => {
    requireAuth.mockImplementationOnce(() => {})
    renderCard()

    fireEvent.click(screen.getByRole('button', { name: 'Bookmark this place' }))

    expect(requireAuth).toHaveBeenCalledWith('You need an account to bookmark a supplier.', expect.any(Function))
    expect(toggle).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to see it fail.** `cd frontend && npx vitest run tests/components/SupplierCard.test.jsx` — Expected: FAIL (the card keeps its own local state and never calls `toggle`).

- [ ] **Step 3: Wire the card.** In `frontend/src/components/SupplierCard.jsx`:

(a) Change `import { useState } from 'react'` to nothing (remove that line) and add below the `useAuth` import: `import { useBookmarks } from '../context/BookmarksContext'`.

(b) Replace

```jsx
  const { requireAuth } = useAuth()
  const navigate = useNavigate()
  const [bookmarked, setBookmarked] = useState(supplier.id === 1 || supplier.id === 5)
```

with

```jsx
  const { requireAuth } = useAuth()
  const { isBookmarked, toggle } = useBookmarks()
  const navigate = useNavigate()
  const bookmarked = isBookmarked(supplier.id)

  const toggleBookmark = () =>
    requireAuth('You need an account to bookmark a supplier.', () => toggle(supplier.id))
```

(c) Replace `onClick={() => setBookmarked((v) => !v)}` with `onClick={toggleBookmark}`.

- [ ] **Step 4: Run it to see it pass.** `cd frontend && npx vitest run tests/components/SupplierCard.test.jsx` — Expected: PASS.

- [ ] **Step 5: Check no other card consumer breaks.** `grep -rn "SupplierCard" frontend/src --include=*.jsx -l` — every page listed renders inside the provider mounted in Task C2, so nothing else to change. Report any consumer outside the app tree.

- [ ] **Step 6: Commit.**

```bash
git add frontend/src/components/SupplierCard.jsx frontend/tests/components/SupplierCard.test.jsx
git commit -m "feat(frontend): supplier card bookmark icon uses real bookmarks"
```

### Task C4: "Bookmarked" filter on the landing page

> **Superseded (spec B26):** `main` removed the landing page, so this chip was dropped when `main` was merged in; its tests now live in `frontend/tests/pages/Suppliers.test.jsx`. Kept below as written for the record.

**Files:**
- Modify: `frontend/src/pages/Landing.jsx`
- Test: `frontend/tests/pages/Landing.test.jsx`

Header scope: "Added a Bookmarked chip that sends the user's bookmark ids and clears deleted bookmarks, per the 2026-11-05 supplier-bookmarking spec."

- [ ] **Step 1: Write the failing test.** Create `frontend/tests/pages/Landing.test.jsx`:

```jsx
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-05
 * Scope: Tests for the landing page's Bookmarked chip, per the 2026-11-05 supplier-bookmarking spec.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Landing from '../../src/pages/Landing'
import { listSuppliers } from '../../src/api/suppliers'

const pruneDeleted = vi.fn()
let bookmarks

vi.mock('../../src/api/suppliers', () => ({
  listSuppliers: vi.fn(),
  EMPTY_PAGE: {
    metadata: { totalRecords: 0, currPage: 1, limit: 50, totalPages: 0 },
    data: [],
    unavailable: [],
  },
}))
vi.mock('../../src/api/useApi', async () => {
  const { useEffect, useState } = await import('react')
  return {
    useReferenceData: () => ({ categories: [], locations: [] }),
    useApi: (load, deps) => {
      const [state, setState] = useState({ data: null, error: null, loading: true })
      useEffect(() => {
        let cancelled = false
        setState((s) => ({ ...s, loading: true }))
        load().then(
          (data) => !cancelled && setState({ data, error: null, loading: false }),
          (error) => !cancelled && setState({ data: null, error, loading: false }),
        )
        return () => {
          cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, deps)
      return state
    },
  }
})
vi.mock('../../src/context/BookmarksContext', () => ({ useBookmarks: () => bookmarks }))
vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ requireAuth: vi.fn() }) }))

const page = (data, unavailable) => ({
  metadata: { totalRecords: data.length, currPage: 1, limit: 50, totalPages: 1 },
  data,
  ...(unavailable ? { unavailable } : {}),
})
const card = (id, name) => ({
  id,
  name,
  type: 'Store',
  location_id: 1,
  location: 'Frontier',
  faculty_id: 1,
  faculty: 'Science',
  level: 1,
  categories: [],
  photos: [],
  isOpen: true,
})

const renderLanding = () =>
  render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  bookmarks = {
    ids: [3, 7],
    ready: true,
    isBookmarked: () => false,
    toggle: vi.fn(),
    pruneDeleted,
  }
  listSuppliers.mockResolvedValue(page([card(1, 'Everything Store')]))
})

describe('Landing Bookmarked chip', () => {
  it('sends the bookmarked ids when Bookmarked is chosen', async () => {
    listSuppliers.mockResolvedValueOnce(page([card(1, 'Everything Store')]))
    listSuppliers.mockResolvedValueOnce(page([card(3, 'Bookmarked Stall')], []))
    renderLanding()
    await screen.findByText('Everything Store')

    fireEvent.click(screen.getByRole('button', { name: 'Bookmarked' }))

    await screen.findByText('Bookmarked Stall')
    expect(listSuppliers).toHaveBeenLastCalledWith(expect.objectContaining({ ids: '3,7' }))
  })

  it('asks the bookmarks context to clear deleted entries, and ignores hidden ones on screen', async () => {
    const unavailable = [
      { id: 7, status: 'deleted' },
      { id: 9, status: 'hidden' },
    ]
    listSuppliers.mockResolvedValueOnce(page([card(1, 'Everything Store')]))
    listSuppliers.mockResolvedValueOnce(page([card(3, 'Bookmarked Stall')], unavailable))
    renderLanding()
    await screen.findByText('Everything Store')

    fireEvent.click(screen.getByRole('button', { name: 'Bookmarked' }))

    await waitFor(() => expect(pruneDeleted).toHaveBeenCalledWith(unavailable))
  })

  it('shows an empty state and sends no ids when the user has no bookmarks', async () => {
    bookmarks = { ...bookmarks, ids: [] }
    renderLanding()
    await screen.findByText('Everything Store')
    listSuppliers.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Bookmarked' }))

    await screen.findByText('No bookmarked suppliers.')
    expect(listSuppliers).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to see it fail.** `cd frontend && npx vitest run tests/pages/Landing.test.jsx` — Expected: FAIL (no "Bookmarked" chip).

- [ ] **Step 3: Implement.** In `frontend/src/pages/Landing.jsx`:

(a) Change `import { useMemo, useState } from 'react'` to `import { useEffect, useMemo, useState } from 'react'`; change `import { listSuppliers } from '../api/suppliers'` to `import { EMPTY_PAGE, listSuppliers } from '../api/suppliers'`; add `import { useBookmarks } from '../context/BookmarksContext'` below the `groupByLocation` import.

(b) Replace the block from `const chips = [...]` through `const { data, loading, error } = useApi(...)` with:

```jsx
  const { ids, ready, pruneDeleted } = useBookmarks()
  const chips = ['All', ...categories.map((c) => c.category), 'Open now', 'Bookmarked']

  // One chip at a time: a category chip filters by category_id, 'Open now' by isOpen, 'Bookmarked' by
  // the user's bookmarked supplier ids.
  const categoryId = categories.find((c) => c.category === chip)?.category_id
  const bookmarkedOnly = chip === 'Bookmarked'
  const idsKey = ids.join(',')
  const query = useMemo(
    () => ({
      category_id: categoryId,
      isOpen: chip === 'Open now' ? 'true' : undefined,
      sortOrder: 'A-Z',
      ids: bookmarkedOnly ? idsKey : undefined,
    }),
    [chip, categoryId, bookmarkedOnly, idsKey],
  )
  // No bookmarks: show the empty page here. The request helper drops empty query values, so an empty
  // ids would never reach the service and the call would list every supplier.
  const { data, loading, error } = useApi(
    () => (bookmarkedOnly && idsKey === '' ? Promise.resolve(EMPTY_PAGE) : listSuppliers(query)),
    [query],
  )

  // Ids the service reports as deleted are cleared from the user's bookmarks.
  useEffect(() => {
    if (bookmarkedOnly && data?.unavailable?.length) pruneDeleted(data.unavailable)
  }, [bookmarkedOnly, data, pruneDeleted])
```

(c) Directly after the existing `{notice}` line, add:

```jsx
        {bookmarkedOnly && ready && !notice && grouped.length === 0 && (
          <p className="mt-8 text-sm text-ink-40">No bookmarked suppliers.</p>
        )}
```

- [ ] **Step 4: Run it to see it pass.** `cd frontend && npx vitest run tests/pages/Landing.test.jsx` — Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add frontend/src/pages/Landing.jsx frontend/tests/pages/Landing.test.jsx
git commit -m "feat(frontend): Bookmarked chip on the landing page"
```

### Task C5: "Bookmarked" filter on the suppliers page

**Files:**
- Modify: `frontend/src/pages/Suppliers.jsx`

Header scope: "Added a Bookmarked filter that sends the user's bookmark ids and clears deleted bookmarks, per the 2026-11-05 supplier-bookmarking spec."

- [ ] **Step 1: Imports.** Change `import { listSuppliers } from '../api/suppliers'` to `import { EMPTY_PAGE, listSuppliers } from '../api/suppliers'`, and add `import { useBookmarks } from '../context/BookmarksContext'` below the `groupByLocation` import.

- [ ] **Step 2: State, params and request.** After `const [openNow, setOpenNow] = useState(false)` add `const [bookmarkedOnly, setBookmarkedOnly] = useState(false)`. After `const { locations, categories } = useReferenceData()` add:

```jsx
  const { ids, ready, pruneDeleted } = useBookmarks()
  const idsKey = ids.join(',')
```

Change the page-reset effect to

```jsx
  useEffect(() => {
    setPage(1)
  }, [search, categoryId, locationId, openNow, bookmarkedOnly, sort])
```

Replace the `params` memo and the `useApi` line with:

```jsx
  const params = useMemo(
    () => ({
      page,
      search,
      location_id: locationId,
      category_id: categoryId,
      isOpen: openNow ? 'true' : undefined,
      sortOrder: sort,
      ids: bookmarkedOnly ? idsKey : undefined,
    }),
    [page, search, locationId, categoryId, openNow, sort, bookmarkedOnly, idsKey],
  )
  // No bookmarks: show the empty page here. The request helper drops empty query values, so an empty
  // ids would never reach the service and the call would list every supplier.
  const { data, loading, error } = useApi(
    () => (bookmarkedOnly && idsKey === '' ? Promise.resolve(EMPTY_PAGE) : listSuppliers(params)),
    [params],
  )
  const notice = useApiNotice({ loading: loading && !data, error })

  // Ids the service reports as deleted are cleared from the user's bookmarks.
  useEffect(() => {
    if (bookmarkedOnly && data?.unavailable?.length) pruneDeleted(data.unavailable)
  }, [bookmarkedOnly, data, pruneDeleted])
```

(remove the old `const notice = useApiNotice(...)` line, which this replaces).

- [ ] **Step 3: Clear and panel.** In `clearFilters`, add `setBookmarkedOnly(false)` after `setOpenNow(false)`. In `filterPanel`, add this block after the Availability `<div>` (before the Location `<div>`):

```jsx
      <div>
        <h3 className="text-sm font-semibold text-ink">Bookmarks</h3>
        <label className="mt-1 flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm text-ink-70">
          <input
            type="checkbox"
            checked={bookmarkedOnly}
            onChange={() => setBookmarkedOnly((v) => !v)}
            className="h-4 w-4 shrink-0 rounded-[4px] border-line text-ink focus:ring-blue"
          />
          <span>Bookmarked</span>
        </label>
      </div>
```

- [ ] **Step 4: Empty state.** Find where the page renders its "no results" state (search for `EmptyState` in the file). If it renders `<EmptyState .../>` when `results.length === 0`, extend its condition so that, when `bookmarkedOnly && ready`, the title reads `No bookmarked suppliers.` (only when `ids.length === 0`); otherwise leave the existing wording. Show the exact diff you make in the commit.

- [ ] **Step 5: Verify.** `cd frontend && npx vitest run && npx vite build && npx oxlint` — Expected: all tests pass, build clean, no new lint warning categories (the project had 14 pre-existing oxlint warnings at last record; report the count you see).

- [ ] **Step 6: Commit.**

```bash
git add frontend/src/pages/Suppliers.jsx
git commit -m "feat(frontend): Bookmarked filter on the suppliers page"
```

---

# Part D — close-out

### Task D1: End-to-end check

- [ ] **Step 1: Bring the stack up.** From the repo root: `docker compose up -d` for the user DB/service and `supplier-db supplier-redis supplier-service`; run `cd user-service && npm run dev` and `cd supplier-service && npm run dev` if you are not using the containers; `cd frontend && npm run dev`. Apply the new table to the dev user database (`init.sql` uses `CREATE TABLE IF NOT EXISTS`, so re-running the user-service migration/setup script is safe; use whatever `user-service/README.md` documents).

- [ ] **Step 2: Walk the flow in the browser** (use the built-in browser): log in; bookmark two suppliers; reload and confirm the icons stay filled; choose Bookmarked on the landing page and the suppliers page and confirm only those two appear, grouped by location; unbookmark one and confirm it leaves the Bookmarked view; add bookmarks until the 21st shows the toast message; as an admin soft-delete one bookmarked supplier, then load Bookmarked and confirm the bookmark is gone from `GET /users/me/bookmarks`; deactivate another and confirm it disappears from Bookmarked but is still in `GET /users/me/bookmarks`.

- [ ] **Step 3: Record honestly.** In the log entry, state which of these checks you ran and which you did not (for example, if no browser or database was available). Do not claim a check you did not run.

### Task D2: Disclosure and index

**Files:**
- Modify: `ai/usage-log.md` (append one entry at the end)
- Modify: `README.md` (append one row to the "Log index" table, last section)
- Modify: `supplier-service/PROJECT_STATE.md` (W8 status and Progress)
- Modify: `supplier-service/docs/project-state/done-ledger.md` (one line, newest first)

- [ ] **Step 1: Append the log entry** to `ai/usage-log.md` in the §5.2 format:
  - Title: `## 2026-11-05 — Supplier bookmarking: bookmarks table, endpoints, ids filter, Bookmarked filter`
  - **Tool:** `Claude Code (model: claude-sonnet-5-5)`; **Mode:** generate; **Scope:** Implementation code; **Governing decision:** `docs/superpowers/specs/2026-11-05-supplier-bookmarking-design.md` (team decisions B1–B16, from the 2026-11-05 chat).
  - **Prompts (exact):** the user's messages of 2026-11-05 in this session, quoted verbatim from the session transcript, one blockquote each (the opening request, then the three answer rounds and the "proceed with spec and plan" message). Do not paraphrase.
  - **Key responses:** what was built per part, the working choices for G1–G7, the verification actually run with real counts, and anything not run.
  - **Files:** every file created or modified in Tasks A1–C5 and this task, including `user-service/src/db/init.sql` and any file that cannot carry a header.
  - **Deviations / questions raised for the team:** G1–G7 from the spec.
  - Leave **What I kept/changed/rejected** and **Author review** blank.

- [ ] **Step 2: Add the README index row** (date, service(s), the entry title exactly as in the log, under 15 words), e.g.

```markdown
| 2026-11-05 | user-service, supplier-service, frontend | Supplier bookmarking: bookmarks table, endpoints, ids filter, Bookmarked filter | Added per-user supplier bookmarks and a Bookmarked filter across three services. |
```

with the next sequence number in the table's first column.

- [ ] **Step 3: Update the project state.** Set W8 to the real status (`In review` when all tasks pass), its Progress cell to a position (for example `Tasks A1–C5 done; D1 browser check: <ran/not run>`), and add one ledger line to `docs/project-state/done-ledger.md` in that file's format.

- [ ] **Step 4: Commit.**

```bash
git add ai/usage-log.md README.md supplier-service/PROJECT_STATE.md supplier-service/docs/project-state/done-ledger.md
git commit -m "docs: log supplier bookmarking and update project state"
```

- [ ] **Step 5: Remind the team** which headers and log entries still need their `Author review` signed, and that the spec's gaps G1–G7 need a team answer.

---

## Self-review (spec coverage)

| Spec | Task |
|---|---|
| B1–B3, §3 table | A1 |
| B5, B13, 20 cap, 422 message | A2, A3 |
| B7, §4.1 | A3 |
| B8, §4.2 request | B1–B4 |
| B9–B11, `unavailable` | B2, B3 |
| B4, B6, B16, §5 icon | C2, C3 |
| B12 clear deleted | C2 (`pruneDeleted`), C4, C5 |
| B14 no pinned section | nothing built (by design) |
| B15 no cross-service calls | none added |
| Empty state (B20) | B3, C4, C5 |
| Invalid ids (B17), deleted precedence (B18) | B1, B3, C2 |
| Docs/state/disclosure | B5, D2 |
