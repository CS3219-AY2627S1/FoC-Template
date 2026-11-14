<!--
AI Assistance Disclosure:
Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-29
Scope: Implementation plan for SupplierServiceSpec.md "Phase 3 — Admin Update", transcribing decisions
       the team already recorded in SupplierServiceArchitecture.md (§6.2, §7, §7.1.1, §7.3, §7.5, §8.2)
       and the answers the team gave in chat on 2026-09-29 and 2026-09-30 (see "Decisions this plan implements" and "Readings confirmed by the team").
       No requirements, architecture, schema, or API decisions were made by the AI tool. The few
       implementation-level readings the plan needs are listed under "Readings confirmed by the team".
       The code in this plan has not been compiled or run.
Author review: Congchen
-->

# Supplier Service Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver F8.3: `PUT /api/v1/admin/suppliers/:id` — partial supplier edit with optimistic concurrency (`version`) and the full photo-edit saga (upload → transactional DB edit incl. reorder → post-commit enqueue of excluded-photo deletion).

**Architecture:** Same layers as Phase 2 (controller → business service → persistence interface → MySQL). `SupplierWriteRepository` gains `findCurrent` and `updateSupplier`; a pure `buildPhotoPlan` resolves `photo_ids`/`placeholder_ids`; a new `SupplierUpdateService` runs the saga; a small Redis `JobQueue` producer enqueues the deletion jobs (no worker: Phase 4).

**Tech Stack:** TypeScript, Express 4, `mysql2`, `ioredis`, `zod`, `multer`, Vitest, Supertest (all already in the repo).

**Every task also requires** (root `AGENTS.md` §4, §5, §7): the AI disclosure header on each created file (edited files get an appended dated `Scope`/`Author review` pair; never write the author's name), and one log entry plus one README "Log index" row when the phase is finished (Task 9). Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Run everything from `supplier-service/`.

---

## Decisions this plan implements (all written down)

| Decision | Where recorded |
| --- | --- |
| `PUT /api/v1/admin/suppliers/:id`, `admin`/`super admin` only, `multipart/form-data` via `multer`: any updated supplier field, current `version`, `isPhotoDirty`, ordered `photo_ids`, optional `placeholder_ids`, uploaded files; response = updated supplier with photo references, `updatedOn`, new `version` | Arch §7 table, §7.3; Spec Phase 3 |
| `version` is required and echoed back; stored value advanced → `409 Conflict`; match on `supplier_id` + `version`, increment on success | Arch §6.2, §7.5, §7.1.1 |
| Saga steps 1–7: upload new files (failure → `500`, no DB save); one MySQL transaction (version check, edits, delete excluded rows, append new rows, reorder `display_order`, bump `updated_on`/`version`); tx failure → roll back, delete the new cloud objects, `500`; after commit enqueue deletion job(s) for excluded photos; respond once enqueued | Arch §8.2 |
| Placeholders identify new binaries; backend resolves them by index position, one-to-one; mismatched placeholders → `422`; ≤ 10 photos; unknown supplier → `404` | Arch §8.2, §7.1.1 |
| Job shape `{id, task_name, payload}`; a photo-deletion payload carries `photo_id`/`photo_location` | Arch §8.1 |
| `is_active` is an ordinary PUT field, independent of `is_deleted` | Spec Phase 3, Arch §6.2; **team answer 1** |
| PUT accepts the same fields as create plus `isActive`; a sent `category_id` / `openingHours` replaces the whole set; omitted fields are untouched; Facility/Store hours rules are those of create (Arch §6.2) | **team answer 1** |
| A PUT whose name/type/location collides with another supplier → `422`; PUT on a soft-deleted supplier → `404` | **team answer 2** |
| `photo_ids` and `placeholder_ids` are JSON-array strings; the i-th placeholder id maps to the i-th uploaded `photos` file; `photo_ids` mixes existing numeric ids and placeholder strings; mismatched counts / unknown ids → `422` | **team answer 3**; placeholders kept (2026-09-30) |
| Phase 3 adds a producer only; Phase 4 builds the worker; payload = `{photo_id, photo_location}` | **team answer 4** |
| PUT is idempotent by design: no `Idempotency-Key` | Arch §7.5 |
| F8.3.2 (history preserved) is satisfied passively: `supplier_id` is never renumbered or hard-deleted | Spec Phase 3 |

## Team-supplied job values (2026-09-30)

Redis list key `queue:image:cleanup`, `task_name` `image_cleanup` (given by the team in chat). Both live in `src/queue/photoDeletionJob.ts`.

## Readings confirmed by the team (2026-09-30)

1. One Redis job **per excluded photo**. Confirmed.
2. Uploaded files while `isPhotoDirty` is false → `422`. Confirmed.
3. Missing/non-numeric `version` → `422`. Confirmed.
4. A PUT with no editable field (only `version`, and `isPhotoDirty` not true) → `422`. Confirmed (this replaces the earlier "succeed and bump version" reading).
5. A stale `version` is rejected with `409` **before** uploading anything, and again inside the transaction. Confirmed.
6. Changing `type` re-derives hours: to Facility → the day-8 entry; to Store → hours must be sent (`422` otherwise). Confirmed.
7. Placeholders are **kept** as recorded in Arch §8.2: client-generated, never returned by the cloud (the storage returns only a location; `photo_id` is the MySQL auto-increment). In `photo_ids`, JSON numbers are existing photo ids and JSON strings are placeholders. Confirmed.
8. Only a failure to **enqueue** the cleanup job after the commit returns `500` (job retries and exhaustion are Phase 4's worker and its `dead_letter_jobs` log, not this endpoint). **Caveat to settle:** Arch §8.2 places the enqueue after the commit, so the edit is already saved when the `500` is returned; the plan does not roll it back. Rolling the edit back would need a compensating write, which is a design change the team would have to record first.
9. Error precedence: `404` → `409` → `422` → upload `500`. Confirmed.

## File structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/queue/photoDeletionJob.ts` | create | Team-supplied queue key/task name; builds the job |
| `src/queue/jobQueue.ts` | create | `JobQueue` port + Redis `LPUSH` adapter |
| `src/validation/supplierInput.ts` | modify | Export shared helpers; add `resolveHours` |
| `src/validation/supplierUpdateInput.ts` | create | Parse PUT multipart text fields |
| `src/business/photoPlan.ts` | create | Pure `photo_ids`/`placeholder_ids` resolution |
| `src/persistence/supplierWriteRepository.ts` | modify | Add `findCurrent`, `updateSupplier` types |
| `src/persistence/mysqlSupplierWriteRepository.ts` | modify | Implement them |
| `src/business/supplierUpdateService.ts` | create | Saga |
| `src/controllers/adminSupplier.controller.ts` | modify | `update` handler |
| `src/routes/adminSupplier.routes.ts` | modify | `PUT /:id` |
| `src/app.ts` | modify | Wire service |
| tests | create/modify | one `*.test.ts` next to each new source file |
| `README.md`, `SupplierServiceSpec.md`, `ai/usage-log.md`, root `README.md` | modify | Docs and disclosure |

---

### Task 1: Job queue producer

**Files:**
- Create: `src/queue/jobQueue.ts`, `src/queue/photoDeletionJob.ts`
- Test: `src/queue/jobQueue.test.ts`

- [ ] **Step 1: Write the failing test** — `src/queue/jobQueue.test.ts`

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-29
 * Scope: Tests for the Redis job producer (Phase 3 plan Task 1).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { createRedisJobQueue } from './jobQueue.js';
import { PHOTO_DELETION_QUEUE_KEY, PHOTO_DELETION_TASK_NAME, buildPhotoDeletionJob } from './photoDeletionJob.js';

describe('redis job queue', () => {
  it('pushes the job as JSON onto the given list', async () => {
    const lpush = vi.fn().mockResolvedValue(1);
    const queue = createRedisJobQueue({ lpush } as unknown as Redis);
    await queue.enqueue('q', { id: 'j-1', task_name: 't', payload: { a: 1 } });
    expect(lpush).toHaveBeenCalledWith('q', JSON.stringify({ id: 'j-1', task_name: 't', payload: { a: 1 } }));
  });

  it('lets a Redis failure propagate', async () => {
    const queue = createRedisJobQueue({ lpush: vi.fn().mockRejectedValue(new Error('down')) } as unknown as Redis);
    await expect(queue.enqueue('q', { id: 'j', task_name: 't', payload: {} })).rejects.toThrow('down');
  });
});

describe('buildPhotoDeletionJob', () => {
  it('carries photo_id and photo_location with a unique id', () => {
    const a = buildPhotoDeletionJob({ photoId: 7, location: 'loc-7' });
    const b = buildPhotoDeletionJob({ photoId: 7, location: 'loc-7' });
    expect(a.task_name).toBe(PHOTO_DELETION_TASK_NAME);
    expect(a.payload).toEqual({ photo_id: 7, photo_location: 'loc-7' });
    expect(a.id).not.toBe(b.id);
    expect(PHOTO_DELETION_QUEUE_KEY.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/queue/jobQueue.test.ts` — Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/queue/jobQueue.ts`:

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-29
 * Scope: Redis job producer for the {id, task_name, payload} contract (Phase 3 plan Task 1;
 *        SupplierServiceArchitecture.md §8.1). No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review:
 */
import type { Redis } from 'ioredis';

/** Generic job shape shared by every Redis job (Arch §8.1). */
export interface Job {
  id: string;
  task_name: string;
  payload: unknown;
}

export interface JobQueue {
  enqueue(queueKey: string, job: Job): Promise<void>;
}

export function createRedisJobQueue(redis: Redis): JobQueue {
  return {
    async enqueue(queueKey, job) {
      await redis.lpush(queueKey, JSON.stringify(job));
    },
  };
}
```

`src/queue/photoDeletionJob.ts` :

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-29
 * Scope: Photo-deletion job builder (Phase 3 plan Task 1). The queue key and task name are the
 *        values the team supplied. No requirements, architecture, schema, or API decisions were
 *        made by the AI tool.
 * Author review:
 */
import { randomUUID } from 'node:crypto';
import type { Job } from './jobQueue.js';

export const PHOTO_DELETION_QUEUE_KEY = 'queue:image:cleanup';
export const PHOTO_DELETION_TASK_NAME = 'image_cleanup';

export function buildPhotoDeletionJob(photo: { photoId: number; location: string }): Job {
  return {
    id: randomUUID(),
    task_name: PHOTO_DELETION_TASK_NAME,
    payload: { photo_id: photo.photoId, photo_location: photo.location },
  };
}
```

- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/queue
git commit -m "feat(supplier-service): add Redis job producer and photo-deletion job builder"
```

---

### Task 2: Export shared validation helpers and `resolveHours`

**Files:** Modify `src/validation/supplierInput.ts`; Test `src/validation/supplierInput.test.ts`

- [ ] **Step 1: Add the failing test** (append to `supplierInput.test.ts`; add `resolveHours` to its imports from `./supplierInput.js`):

```ts
describe('resolveHours', () => {
  it('returns the day-8 entry for a Facility, ignoring client hours', () => {
    expect(resolveHours('Facility', '[{"day":1,"open":"09:00","close":"18:00"}]', false)).toEqual([
      { day: 8, open: '00:00', close: '23:59', is24h: true },
    ]);
  });

  it('parses Store hours', () => {
    expect(resolveHours('Store', '[{"day":1,"open":"09:00","close":"18:00"}]', false)).toEqual([
      { day: 1, open: '09:00', close: '18:00', is24h: false },
    ]);
  });

  it('rejects a Store with no hours (422)', () => {
    expect(() => resolveHours('Store', undefined, false)).toThrowError(/Operating hours are required/);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/validation/supplierInput.test.ts` — Expected: FAIL (`resolveHours` not exported).

- [ ] **Step 3: Implement.** In `src/validation/supplierInput.ts`: add `export` to `invalid`, `fail`, `parseJson` and `parseCategoryIds`; add after `parseStoreHours`:

```ts
/** Hours for a supplier of the given type (Arch §6.2, §7): Facility → server-filled day 8; Store → client hours. */
export function resolveHours(type: 'Store' | 'Facility', rawOpeningHours: unknown, is24h: boolean): HourInput[] {
  return type === 'Facility' ? [{ ...ALWAYS_OPEN }] : parseStoreHours(rawOpeningHours, is24h);
}
```

and in `parseCreateSupplier` replace the `const hours = ...` ternary with:

```ts
  const hours = resolveHours(data.type, body.openingHours, data.is24h === 'true');
```

Append a dated `Scope`/`Author review` pair to the header.

- [ ] **Step 4: Run** `npx vitest run src/validation` — Expected: all PASS (existing create tests unchanged).
- [ ] **Step 5: Commit** `git commit -am "refactor(supplier-service): export hours resolver and validation helpers"`

---

### Task 3: Parse the PUT text fields

**Files:** Create `src/validation/supplierUpdateInput.ts`; Test `src/validation/supplierUpdateInput.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-29
 * Scope: Tests for PUT field parsing (Phase 3 plan Task 3).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { describe, expect, it } from 'vitest';
import { parseUpdateSupplier } from './supplierUpdateInput.js';

describe('parseUpdateSupplier', () => {
  it('accepts one editable field and leaves every other field undefined', () => {
    expect(parseUpdateSupplier({ version: '3', isActive: 'true' })).toEqual({
      version: 3,
      isActive: true,
      isPhotoDirty: false,
    });
  });

  it('rejects a body with only version (nothing to update) with 422', () => {
    expect(() => parseUpdateSupplier({ version: '3' })).toThrowError(expect.objectContaining({ statusCode: 422 }));
  });

  it('accepts version plus a photo change alone', () => {
    expect(parseUpdateSupplier({ version: '3', isPhotoDirty: 'true', photo_ids: '[]' })).toEqual({
      version: 3,
      isPhotoDirty: true,
      photoIds: [],
    });
  });

  it('parses every editable field', () => {
    const result = parseUpdateSupplier({
      version: '3',
      name: '  New Name ',
      type: 'Store',
      desc: '  ',
      location_id: '5',
      category_id: '[1,2]',
      openingHours: '[{"day":1,"open":"09:00","close":"18:00"}]',
      is24h: 'false',
      isActive: 'false',
      isPhotoDirty: 'true',
      photo_ids: '[2,"ph-1"]',
      placeholder_ids: '["ph-1"]',
    });
    expect(result).toEqual({
      version: 3,
      name: 'New Name',
      type: 'Store',
      desc: null,
      locationId: 5,
      categoryIds: [1, 2],
      openingHours: '[{"day":1,"open":"09:00","close":"18:00"}]',
      is24h: false,
      isActive: false,
      isPhotoDirty: true,
      photoIds: [2, 'ph-1'],
      placeholderIds: ['ph-1'],
    });
  });

  it.each([[{}], [{ version: 'x' }], [{ version: '-1' }]])('rejects a missing or bad version %j with 422', (body) => {
    expect(() => parseUpdateSupplier(body)).toThrowError(expect.objectContaining({ statusCode: 422 }));
  });

  it('rejects an empty name and an unknown type with 422', () => {
    expect(() => parseUpdateSupplier({ version: '1', name: ' ' })).toThrowError(expect.objectContaining({ statusCode: 422 }));
    expect(() => parseUpdateSupplier({ version: '1', type: 'Shop' })).toThrowError(expect.objectContaining({ statusCode: 422 }));
  });

  it('requires photo_ids when isPhotoDirty is true (422)', () => {
    expect(() => parseUpdateSupplier({ version: '1', isPhotoDirty: 'true' })).toThrowError(
      expect.objectContaining({ statusCode: 422 }),
    );
  });

  it('rejects malformed JSON with 400', () => {
    expect(() => parseUpdateSupplier({ version: '1', isPhotoDirty: 'true', photo_ids: '[' })).toThrowError(
      expect.objectContaining({ statusCode: 400 }),
    );
  });

  it('rejects duplicate placeholder ids with 422', () => {
    expect(() =>
      parseUpdateSupplier({ version: '1', isPhotoDirty: 'true', photo_ids: '["a","a"]', placeholder_ids: '["a","a"]' }),
    ).toThrowError(expect.objectContaining({ statusCode: 422 }));
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/validation/supplierUpdateInput.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** `src/validation/supplierUpdateInput.ts`

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-29
 * Scope: Parses the multipart text fields of PUT /api/v1/admin/suppliers/:id (Phase 3 plan Task 3;
 *        SupplierServiceArchitecture.md §7, §7.3, §8.2). No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review:
 */
import { z } from 'zod';
import { fail, invalid, parseCategoryIds, parseJson } from './supplierInput.js';

export interface UpdateSupplierInput {
  version: number;
  name?: string;
  type?: 'Store' | 'Facility';
  /** undefined = untouched, null = cleared. */
  desc?: string | null;
  locationId?: number;
  categoryIds?: number[];
  /** Raw JSON string; resolved against the effective type by the service. */
  openingHours?: string;
  is24h?: boolean;
  isActive?: boolean;
  isPhotoDirty: boolean;
  /** JSON numbers = existing photo ids, JSON strings = placeholders. */
  photoIds?: Array<number | string>;
  placeholderIds?: string[];
}

const bool = (message: string) => z.enum(['true', 'false'], { errorMap: () => ({ message }) });

const fieldsSchema = z.object({
  version: z
    .string({ required_error: 'version is required.' })
    .regex(/^\d+$/, 'version must be a non-negative integer.')
    .transform(Number),
  name: z.string().trim().min(1, 'Supplier name must not be empty.').max(255).optional(),
  type: z.enum(['Store', 'Facility'], { errorMap: () => ({ message: 'Type must be Store or Facility.' }) }).optional(),
  desc: z.string().optional(),
  location_id: z.coerce
    .number({ invalid_type_error: 'Location must be a number.' })
    .int()
    .positive('Location must be a positive id.')
    .optional(),
  openingHours: z.string().optional(),
  is24h: bool('is24h must be true or false.').optional(),
  isActive: bool('isActive must be true or false.').optional(),
  isPhotoDirty: bool('isPhotoDirty must be true or false.').optional(),
});

function parsePhotoIds(raw: unknown): Array<number | string> {
  const result = z
    .array(z.union([z.number().int().positive(), z.string().min(1)]))
    .safeParse(parseJson('photo_ids', String(raw)));
  if (!result.success) fail('photo_ids', 'photo_ids must be a list of photo ids and placeholder ids.');
  return result.data;
}

function parsePlaceholderIds(raw: unknown): string[] {
  const result = z.array(z.string().min(1)).safeParse(parseJson('placeholder_ids', String(raw)));
  if (!result.success) fail('placeholder_ids', 'placeholder_ids must be a list of strings.');
  if (new Set(result.data).size !== result.data.length) fail('placeholder_ids', 'placeholder_ids must be unique.');
  return result.data;
}

export function parseUpdateSupplier(body: Record<string, unknown>): UpdateSupplierInput {
  const fields = fieldsSchema.safeParse(body);
  if (!fields.success) {
    throw invalid(
      fields.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'body',
        location: 'body',
        message: issue.message,
      })),
    );
  }
  const data = fields.data;
  const isPhotoDirty = data.isPhotoDirty === 'true';
  if (isPhotoDirty && body.photo_ids === undefined) {
    fail('photo_ids', 'photo_ids is required when isPhotoDirty is true.');
  }

  const input: UpdateSupplierInput = { version: data.version, isPhotoDirty };
  if (data.name !== undefined) input.name = data.name;
  if (data.type !== undefined) input.type = data.type;
  if (data.desc !== undefined) input.desc = data.desc.trim() === '' ? null : data.desc.trim();
  if (data.location_id !== undefined) input.locationId = data.location_id;
  if (body.category_id !== undefined) input.categoryIds = parseCategoryIds(body.category_id);
  if (data.openingHours !== undefined) input.openingHours = data.openingHours;
  if (data.is24h !== undefined) input.is24h = data.is24h === 'true';
  if (data.isActive !== undefined) input.isActive = data.isActive === 'true';
  if (body.photo_ids !== undefined) input.photoIds = parsePhotoIds(body.photo_ids);
  if (body.placeholder_ids !== undefined) input.placeholderIds = parsePlaceholderIds(body.placeholder_ids);

  // Nothing to update (only version, photos not dirty) is rejected (team decision, 2026-09-30).
  if (Object.keys(input).length === 2) fail('body', 'At least one field to update is required.');
  return input;
}
```

- [ ] **Step 4: Run** `npx vitest run src/validation/supplierUpdateInput.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `git add src/validation && git commit -m "feat(supplier-service): parse PUT supplier fields"`

---

### Task 4: Photo plan (pure)

**Files:** Create `src/business/photoPlan.ts`; Test `src/business/photoPlan.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-29
 * Scope: Tests for placeholder resolution (Phase 3 plan Task 4).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { describe, expect, it } from 'vitest';
import { buildPhotoPlan } from './photoPlan.js';

const current = [
  { photoId: 1, location: 'a' },
  { photoId: 2, location: 'b' },
  { photoId: 3, location: 'c' },
];

describe('buildPhotoPlan', () => {
  it('keeps, reorders, adds by placeholder index, and reports removed photos', () => {
    const plan = buildPhotoPlan(current, [3, 'p-2', 1, 'p-1'], ['p-1', 'p-2'], 2);
    expect(plan.entries).toEqual([
      { kind: 'existing', photoId: 3 },
      { kind: 'new', fileIndex: 1 },
      { kind: 'existing', photoId: 1 },
      { kind: 'new', fileIndex: 0 },
    ]);
    expect(plan.removed).toEqual([{ photoId: 2, location: 'b' }]);
  });

  it('allows removing every photo', () => {
    const plan = buildPhotoPlan(current, [], [], 0);
    expect(plan.entries).toEqual([]);
    expect(plan.removed).toHaveLength(3);
  });

  it.each([
    ['an id that is not this supplier\'s', [9], [], 0],
    ['the same existing id twice', [1, 1], [], 0],
    ['a placeholder that was not declared', ['p-x'], [], 0],
    ['a declared placeholder that is never used', [1], ['p-1'], 1],
    ['a placeholder used twice', ['p-1', 'p-1'], ['p-1'], 1],
    ['a file count that differs from placeholder_ids', ['p-1'], ['p-1'], 2],
  ])('rejects %s with 422', (_label, ids, placeholders, files) => {
    expect(() => buildPhotoPlan(current, ids as Array<number | string>, placeholders as string[], files as number)).toThrowError(
      expect.objectContaining({ statusCode: 422 }),
    );
  });

  it('rejects more than 10 photos with 422', () => {
    const placeholders = Array.from({ length: 11 }, (_, i) => `p-${i}`);
    expect(() => buildPhotoPlan([], placeholders, placeholders, 11)).toThrowError(expect.objectContaining({ statusCode: 422 }));
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/business/photoPlan.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-29
 * Scope: Resolves photo_ids/placeholder_ids into an ordered photo plan (Phase 3 plan Task 4;
 *        SupplierServiceArchitecture.md §8.2). No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review:
 */
import { AppError } from '../utils/AppError.js';

const MAX_PHOTOS = 10;

export interface CurrentPhoto {
  photoId: number;
  location: string;
}

export type PlanEntry = { kind: 'existing'; photoId: number } | { kind: 'new'; fileIndex: number };

export interface PhotoPlan {
  /** Final photo order (index = display_order). */
  entries: PlanEntry[];
  /** Existing photos not listed in photo_ids; their cloud objects are deleted after commit. */
  removed: CurrentPhoto[];
}

function invalid(message: string): AppError {
  return new AppError(422, 'Unprocessable Entity', message, {
    details: [{ field: 'photo_ids', location: 'body', message }],
  });
}

/** photo_ids: numbers = existing ids, strings = placeholders; the i-th placeholder maps to the i-th file (Arch §8.2). */
export function buildPhotoPlan(
  current: CurrentPhoto[],
  photoIds: Array<number | string>,
  placeholderIds: string[],
  fileCount: number,
): PhotoPlan {
  if (photoIds.length > MAX_PHOTOS) throw invalid('At most 10 photos are allowed.');
  if (placeholderIds.length !== fileCount) {
    throw invalid('placeholder_ids must match the number of uploaded photos.');
  }

  const owned = new Set(current.map((photo) => photo.photoId));
  const seen = new Set<number | string>();
  const usedPlaceholders = new Set<string>();
  const entries: PlanEntry[] = photoIds.map((id): PlanEntry => {
    if (seen.has(id)) throw invalid('photo_ids must not repeat an id.');
    seen.add(id);
    if (typeof id === 'number') {
      if (!owned.has(id)) throw invalid(`Photo ${id} does not belong to this supplier.`);
      return { kind: 'existing', photoId: id };
    }
    const fileIndex = placeholderIds.indexOf(id);
    if (fileIndex === -1) throw invalid(`Placeholder ${id} is not listed in placeholder_ids.`);
    usedPlaceholders.add(id);
    return { kind: 'new', fileIndex };
  });
  if (usedPlaceholders.size !== placeholderIds.length) {
    throw invalid('Every placeholder in placeholder_ids must appear in photo_ids.');
  }

  const kept = new Set(entries.flatMap((entry) => (entry.kind === 'existing' ? [entry.photoId] : [])));
  return { entries, removed: current.filter((photo) => !kept.has(photo.photoId)) };
}
```

- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `git add src/business/photoPlan* && git commit -m "feat(supplier-service): resolve photo_ids and placeholders into a photo plan"`

---

### Task 5: Repository `findCurrent` and `updateSupplier`

**Files:** Modify `src/persistence/supplierWriteRepository.ts`, `src/persistence/mysqlSupplierWriteRepository.ts`, `src/persistence/mysqlSupplierWriteRepository.test.ts`, `src/business/supplierCreationService.test.ts` (fake gains the two new methods so it type-checks)

- [ ] **Step 1: Write the failing tests** — append to `mysqlSupplierWriteRepository.test.ts` (uses the file's existing `fakePool` and `sqls` helpers):

```ts
describe('updateSupplier', () => {
  const now = '2026-09-29 10:00:00';

  it('updates only the sent columns with a version-matched WHERE and bumps version', async () => {
    const { pool, conn } = fakePool([{ affectedRows: 1 }]);
    const result = await createMysqlSupplierWriteRepository(pool).updateSupplier(101, { version: 3, now, name: 'New' });

    expect(result).toEqual({ removedPhotos: [] });
    expect(sqls(conn)[0]).toBe(
      'UPDATE supplier SET supplier_name = ?, updated_on = ?, version = version + 1 WHERE supplier_id = ? AND version = ? AND is_deleted = FALSE',
    );
    expect(conn.query.mock.calls[0]?.[1]).toEqual(['New', now, 101, 3]);
    expect(conn.commit).toHaveBeenCalled();
  });

  it('rejects with 409 and rolls back when no row matches the version', async () => {
    const { pool, conn } = fakePool([{ affectedRows: 0 }]);
    await expect(
      createMysqlSupplierWriteRepository(pool).updateSupplier(101, { version: 2, now, name: 'New' }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });

  it('replaces categories and hours when sent', async () => {
    const { pool, conn } = fakePool([{ affectedRows: 1 }, {}, {}, {}, {}]);
    await createMysqlSupplierWriteRepository(pool).updateSupplier(101, {
      version: 3,
      now,
      categoryIds: [2],
      hours: [{ day: 8, open: '00:00', close: '23:59', is24h: true }],
    });
    const statements = sqls(conn);
    expect(statements[1]).toBe('DELETE FROM supplier_category_map WHERE supplier_id = ?');
    expect(conn.query.mock.calls[2]?.[1]).toEqual([[[101, 2]]]);
    expect(statements[3]).toBe('DELETE FROM supplier_hours WHERE supplier_id = ?');
    expect(conn.query.mock.calls[4]?.[1]).toEqual([[[101, 8, '00:00', '23:59', 1]]]);
  });

  it('deletes excluded photos, moves kept rows aside, then writes the final order', async () => {
    const rows = [
      { photo_id: 1, photo_location: 'a' },
      { photo_id: 2, photo_location: 'b' },
    ];
    // supplier UPDATE, SELECT photos, DELETE excluded, offset UPDATE, INSERT new, UPDATE kept
    const { pool, conn } = fakePool([{ affectedRows: 1 }, rows, {}, {}, {}, {}]);
    const result = await createMysqlSupplierWriteRepository(pool).updateSupplier(101, {
      version: 3,
      now,
      photos: [{ kind: 'new', location: 'c' }, { kind: 'existing', photoId: 2 }],
    });

    expect(result).toEqual({ removedPhotos: [{ photoId: 1, location: 'a' }] });
    const statements = sqls(conn);
    expect(statements[1]).toContain('SELECT photo_id, photo_location FROM supplier_photos WHERE supplier_id = ?');
    expect(statements[2]).toBe('DELETE FROM supplier_photos WHERE supplier_id = ? AND photo_id IN (?)');
    expect(conn.query.mock.calls[2]?.[1]).toEqual([101, [1]]);
    expect(statements[3]).toBe('UPDATE supplier_photos SET display_order = display_order + 1000000 WHERE supplier_id = ?');
    expect(statements[4]).toBe('INSERT INTO supplier_photos (supplier_id, photo_location, display_order) VALUES (?, ?, ?)');
    expect(conn.query.mock.calls[4]?.[1]).toEqual([101, 'c', 0]);
    expect(statements[5]).toBe('UPDATE supplier_photos SET display_order = ? WHERE photo_id = ? AND supplier_id = ?');
    expect(conn.query.mock.calls[5]?.[1]).toEqual([1, 2, 101]);
  });

  it('maps a duplicate-key error to 422', async () => {
    const dup = Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
    const { pool } = fakePool([dup]);
    await expect(
      createMysqlSupplierWriteRepository(pool).updateSupplier(101, { version: 3, now, name: 'X' }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });
});

describe('findCurrent', () => {
  it('returns the supplier with its photos in display order, or null', async () => {
    const { pool, poolQuery } = fakePool([]);
    poolQuery
      .mockResolvedValueOnce([[{ supplier_id: 101, supplier_name: 'S', supplier_type: 'Store', location_id: 4, is_deleted: 0, version: '3' }], []])
      .mockResolvedValueOnce([[{ photo_id: 1, photo_location: 'a' }], []])
      .mockResolvedValueOnce([[], []]);
    const repo = createMysqlSupplierWriteRepository(pool);

    expect(await repo.findCurrent(101)).toEqual({
      supplierId: 101, name: 'S', type: 'Store', locationId: 4, isDeleted: false, version: 3,
      photos: [{ photoId: 1, location: 'a' }],
    });
    expect(await repo.findCurrent(999)).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/persistence/mysqlSupplierWriteRepository.test.ts` — Expected: FAIL (methods missing).

- [ ] **Step 3: Implement.**

In `supplierWriteRepository.ts` add (importing `CurrentPhoto` from `../business/photoPlan.js`) and extend the interface:

```ts
export interface CurrentSupplier {
  supplierId: number;
  name: string;
  type: 'Store' | 'Facility';
  locationId: number;
  isDeleted: boolean;
  version: number;
  /** In display order. */
  photos: CurrentPhoto[];
}

export type PhotoWrite = { kind: 'existing'; photoId: number } | { kind: 'new'; location: string };

/** Only the keys present are written (Phase 3: partial update). */
export interface SupplierChange {
  version: number;
  /** Singapore wall-clock 'YYYY-MM-DD HH:MM:SS' (Arch §6.2). */
  now: string;
  name?: string;
  type?: 'Store' | 'Facility';
  desc?: string | null;
  locationId?: number;
  isActive?: boolean;
  categoryIds?: number[];
  hours?: HourInput[];
  /** Final ordered photo list (index = display_order); omitted = photos untouched. */
  photos?: PhotoWrite[];
}

// added to SupplierWriteRepository:
  findCurrent(supplierId: number): Promise<CurrentSupplier | null>;
  /**
   * One transaction (Arch §8.2 step 3): matches supplier_id + version, applies the sent fields,
   * replaces categories/hours if sent, deletes excluded photo rows, appends new ones and reorders,
   * bumps updated_on and version. No matching row → AppError 409; duplicate identity → AppError 422.
   * Returns the excluded photos so the caller can enqueue their cloud deletion.
   */
  updateSupplier(supplierId: number, change: SupplierChange): Promise<{ removedPhotos: CurrentPhoto[] }>;
```

In `mysqlSupplierWriteRepository.ts`, add to the returned object (imports: `CurrentPhoto` type; `HourInput` not needed):

```ts
    async findCurrent(supplierId) {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT supplier_id, supplier_name, supplier_type, location_id, is_deleted, version
         FROM supplier WHERE supplier_id = ?`,
        [supplierId],
      );
      const row = rows[0];
      if (row === undefined) return null;
      const [photos] = await pool.query<RowDataPacket[]>(
        'SELECT photo_id, photo_location FROM supplier_photos WHERE supplier_id = ? ORDER BY display_order',
        [supplierId],
      );
      return {
        supplierId: Number(row.supplier_id),
        name: String(row.supplier_name),
        type: row.supplier_type as 'Store' | 'Facility',
        locationId: Number(row.location_id),
        isDeleted: Boolean(row.is_deleted),
        version: Number(row.version),
        photos: photos.map((photo) => ({ photoId: Number(photo.photo_id), location: String(photo.photo_location) })),
      };
    },

    async updateSupplier(supplierId, change) {
      try {
        return await inTransaction(async (conn) => {
          const sets: string[] = [];
          const params: unknown[] = [];
          const set = (column: string, value: unknown) => {
            sets.push(`${column} = ?`);
            params.push(value);
          };
          if (change.name !== undefined) set('supplier_name', change.name);
          if (change.type !== undefined) set('supplier_type', change.type);
          if (change.desc !== undefined) set('supplier_desc', change.desc);
          if (change.locationId !== undefined) set('location_id', change.locationId);
          if (change.isActive !== undefined) set('is_active', change.isActive ? 1 : 0);
          set('updated_on', change.now);
          sets.push('version = version + 1');

          const [updated] = await conn.query<ResultSetHeader>(
            `UPDATE supplier SET ${sets.join(', ')} WHERE supplier_id = ? AND version = ? AND is_deleted = FALSE`,
            [...params, supplierId, change.version],
          );
          if (updated.affectedRows === 0) {
            throw new AppError(409, 'Conflict', 'The supplier was modified by someone else. Re-fetch it and retry.');
          }

          if (change.categoryIds !== undefined) {
            await conn.query('DELETE FROM supplier_category_map WHERE supplier_id = ?', [supplierId]);
            if (change.categoryIds.length > 0) {
              await conn.query('INSERT INTO supplier_category_map (supplier_id, category_id) VALUES ?', [
                change.categoryIds.map((categoryId) => [supplierId, categoryId]),
              ]);
            }
          }
          if (change.hours !== undefined) {
            await conn.query('DELETE FROM supplier_hours WHERE supplier_id = ?', [supplierId]);
            await conn.query(
              'INSERT INTO supplier_hours (supplier_id, day_of_week, open_time, close_time, is_24h) VALUES ?',
              [change.hours.map((hour) => [supplierId, hour.day, hour.open, hour.close, hour.is24h ? 1 : 0])],
            );
          }

          const removedPhotos: CurrentPhoto[] = [];
          if (change.photos !== undefined) {
            const [current] = await conn.query<RowDataPacket[]>(
              'SELECT photo_id, photo_location FROM supplier_photos WHERE supplier_id = ? ORDER BY display_order FOR UPDATE',
              [supplierId],
            );
            const kept = new Set(change.photos.flatMap((p) => (p.kind === 'existing' ? [p.photoId] : [])));
            for (const row of current) {
              if (!kept.has(Number(row.photo_id))) {
                removedPhotos.push({ photoId: Number(row.photo_id), location: String(row.photo_location) });
              }
            }
            if (removedPhotos.length > 0) {
              await conn.query('DELETE FROM supplier_photos WHERE supplier_id = ? AND photo_id IN (?)', [
                supplierId,
                removedPhotos.map((photo) => photo.photoId),
              ]);
            }
            // Move kept rows out of the way first so the UNIQUE (supplier_id, display_order) key never collides.
            await conn.query(
              'UPDATE supplier_photos SET display_order = display_order + 1000000 WHERE supplier_id = ?',
              [supplierId],
            );
            for (const [order, photo] of change.photos.entries()) {
              if (photo.kind === 'new') {
                await conn.query(
                  'INSERT INTO supplier_photos (supplier_id, photo_location, display_order) VALUES (?, ?, ?)',
                  [supplierId, photo.location, order],
                );
              } else {
                await conn.query(
                  'UPDATE supplier_photos SET display_order = ? WHERE photo_id = ? AND supplier_id = ?',
                  [order, photo.photoId, supplierId],
                );
              }
            }
          }
          return { removedPhotos };
        });
      } catch (error) {
        if ((error as { code?: string } | null)?.code === 'ER_DUP_ENTRY') throw duplicate();
        throw error;
      }
    },
```

In `supplierCreationService.test.ts` `setup()`, add to the `repo` fake: `findCurrent: vi.fn().mockResolvedValue(null), updateSupplier: vi.fn().mockResolvedValue({ removedPhotos: [] }),`.

- [ ] **Step 4: Run** `npx vitest run src/persistence src/business/supplierCreationService.test.ts` — Expected: PASS. Then `npx tsc --noEmit` — Expected: no errors.
- [ ] **Step 5: Commit** `git add src && git commit -m "feat(supplier-service): add optimistic-concurrency update to the write repository"`

---

### Task 6: `SupplierUpdateService` (the saga)

**Files:** Create `src/business/supplierUpdateService.ts`; Test `src/business/supplierUpdateService.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-29
 * Scope: Tests for the supplier update saga (Phase 3 plan Task 6).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { describe, expect, it, vi } from 'vitest';
import type { CurrentSupplier, SupplierWriteRepository } from '../persistence/supplierWriteRepository.js';
import { PHOTO_DELETION_QUEUE_KEY, PHOTO_DELETION_TASK_NAME } from '../queue/photoDeletionJob.js';
import { createInMemoryPhotoStorage } from '../storage/inMemoryPhotoStorage.js';
import { AppError } from '../utils/AppError.js';
import type { UpdateSupplierInput } from '../validation/supplierUpdateInput.js';
import { createSupplierUpdateService } from './supplierUpdateService.js';

const NOW = new Date('2026-09-29T02:00:00Z');
const current: CurrentSupplier = {
  supplierId: 101, name: 'Campus Store', type: 'Store', locationId: 4, isDeleted: false, version: 3,
  photos: [{ photoId: 1, location: 'loc-a' }, { photoId: 2, location: 'loc-b' }],
};
const png = { buffer: Buffer.from('p'), mimeType: 'image/png' as const };
const base: UpdateSupplierInput = { version: 3, isPhotoDirty: false };

function setup(overrides: Partial<SupplierWriteRepository> = {}, queueError?: Error) {
  const repo: SupplierWriteRepository = {
    findByIdentity: vi.fn().mockResolvedValue(null),
    locationExists: vi.fn().mockResolvedValue(true),
    findMissingCategoryIds: vi.fn().mockResolvedValue([]),
    insertSupplier: vi.fn(),
    reactivateSupplier: vi.fn(),
    findCurrent: vi.fn().mockResolvedValue(current),
    updateSupplier: vi.fn().mockResolvedValue({ removedPhotos: [] }),
    ...overrides,
  };
  const storage = createInMemoryPhotoStorage();
  const reader = { getAdminSupplier: vi.fn().mockResolvedValue({ id: 101, version: 4 }) };
  const queue = { enqueue: queueError ? vi.fn().mockRejectedValue(queueError) : vi.fn().mockResolvedValue(undefined) };
  const service = createSupplierUpdateService({ repo, storage, reader, queue, clock: () => NOW });
  return { repo, storage, reader, queue, service };
}

describe('updateSupplier', () => {
  it('404s an unknown or soft-deleted supplier', async () => {
    const missing = setup({ findCurrent: vi.fn().mockResolvedValue(null) });
    await expect(missing.service.updateSupplier(101, base, [])).rejects.toMatchObject({ statusCode: 404 });
    const deleted = setup({ findCurrent: vi.fn().mockResolvedValue({ ...current, isDeleted: true }) });
    await expect(deleted.service.updateSupplier(101, base, [])).rejects.toMatchObject({ statusCode: 404 });
  });

  it('409s a stale version before uploading anything', async () => {
    const { service, storage, repo } = setup();
    await expect(service.updateSupplier(101, { ...base, version: 2 }, [png])).rejects.toMatchObject({ statusCode: 409 });
    expect(storage.objects.size).toBe(0);
    expect(repo.updateSupplier).not.toHaveBeenCalled();
  });

  it('writes only the sent fields and returns 200 with the admin detail', async () => {
    const { service, repo, reader, queue } = setup();
    const result = await service.updateSupplier(101, { ...base, name: 'New Name', isActive: false }, []);

    expect(result).toEqual({ statusCode: 200, body: { id: 101, version: 4 } });
    expect(repo.updateSupplier).toHaveBeenCalledWith(101, {
      version: 3, now: '2026-09-29 10:00:00', name: 'New Name', isActive: false,
    });
    expect(reader.getAdminSupplier).toHaveBeenCalledWith(101);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('422s a collision with another supplier but allows the supplier itself', async () => {
    const other = setup({ findByIdentity: vi.fn().mockResolvedValue({ supplierId: 7, isDeleted: false }) });
    await expect(other.service.updateSupplier(101, { ...base, name: 'Dup' }, [])).rejects.toMatchObject({ statusCode: 422 });
    const same = setup({ findByIdentity: vi.fn().mockResolvedValue({ supplierId: 101, isDeleted: false }) });
    await expect(same.service.updateSupplier(101, { ...base, name: 'campus store' }, [])).resolves.toMatchObject({ statusCode: 200 });
  });

  it('422s an unknown location and unknown categories', async () => {
    const loc = setup({ locationExists: vi.fn().mockResolvedValue(false) });
    await expect(loc.service.updateSupplier(101, { ...base, locationId: 9 }, [])).rejects.toMatchObject({ statusCode: 422 });
    const cat = setup({ findMissingCategoryIds: vi.fn().mockResolvedValue([9]) });
    await expect(cat.service.updateSupplier(101, { ...base, categoryIds: [9] }, [])).rejects.toMatchObject({ statusCode: 422 });
  });

  it('re-derives hours when the type changes to Facility, and requires hours when it changes to Store', async () => {
    const toFacility = setup();
    await toFacility.service.updateSupplier(101, { ...base, type: 'Facility' }, []);
    expect(toFacility.repo.updateSupplier).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ type: 'Facility', hours: [{ day: 8, open: '00:00', close: '23:59', is24h: true }] }),
    );
    const toStore = setup({ findCurrent: vi.fn().mockResolvedValue({ ...current, type: 'Facility' }) });
    await expect(toStore.service.updateSupplier(101, { ...base, type: 'Store' }, [])).rejects.toMatchObject({ statusCode: 422 });
  });

  it('parses sent Store hours into the change', async () => {
    const { service, repo } = setup();
    await service.updateSupplier(101, { ...base, openingHours: '[{"day":1,"open":"09:00","close":"18:00"}]' }, []);
    expect(repo.updateSupplier).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ hours: [{ day: 1, open: '09:00', close: '18:00', is24h: false }] }),
    );
  });

  it('uploads new photos, writes the resolved order, and enqueues one job per excluded photo', async () => {
    const removed = [{ photoId: 1, location: 'loc-a' }];
    const { service, repo, queue, storage } = setup({ updateSupplier: vi.fn().mockResolvedValue({ removedPhotos: removed }) });
    await service.updateSupplier(
      101,
      { ...base, isPhotoDirty: true, photoIds: [2, 'ph-1'], placeholderIds: ['ph-1'] },
      [png],
    );

    expect(storage.objects.size).toBe(1);
    expect(repo.updateSupplier).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ photos: [{ kind: 'existing', photoId: 2 }, { kind: 'new', location: 'memory://photos/1' }] }),
    );
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    expect(queue.enqueue).toHaveBeenCalledWith(
      PHOTO_DELETION_QUEUE_KEY,
      expect.objectContaining({ task_name: PHOTO_DELETION_TASK_NAME, payload: { photo_id: 1, photo_location: 'loc-a' } }),
    );
  });

  it('422s uploaded files while isPhotoDirty is false, uploading nothing', async () => {
    const { service, storage } = setup();
    await expect(service.updateSupplier(101, base, [png])).rejects.toMatchObject({ statusCode: 422 });
    expect(storage.objects.size).toBe(0);
  });

  it('500s and saves nothing when an upload fails, cleaning up earlier uploads', async () => {
    const { service, storage, repo } = setup();
    const original = storage.upload.bind(storage);
    let calls = 0;
    storage.upload = async (file) => {
      calls += 1;
      if (calls === 2) throw new Error('boom');
      return original(file);
    };
    await expect(
      service.updateSupplier(101, { ...base, isPhotoDirty: true, photoIds: ['a', 'b'], placeholderIds: ['a', 'b'] }, [png, png]),
    ).rejects.toMatchObject({ statusCode: 500 });
    expect(repo.updateSupplier).not.toHaveBeenCalled();
    expect(storage.objects.size).toBe(0);
  });

  it('cleans up new uploads and 500s when the transaction fails', async () => {
    const { service, storage, queue } = setup({ updateSupplier: vi.fn().mockRejectedValue(new Error('db')) });
    await expect(
      service.updateSupplier(101, { ...base, isPhotoDirty: true, photoIds: ['a'], placeholderIds: ['a'] }, [png]),
    ).rejects.toMatchObject({ statusCode: 500 });
    expect(storage.objects.size).toBe(0);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('cleans up and rethrows the 409 raised inside the transaction', async () => {
    const conflict = new AppError(409, 'Conflict', 'stale');
    const { service, storage } = setup({ updateSupplier: vi.fn().mockRejectedValue(conflict) });
    await expect(
      service.updateSupplier(101, { ...base, isPhotoDirty: true, photoIds: ['a'], placeholderIds: ['a'] }, [png]),
    ).rejects.toBe(conflict);
    expect(storage.objects.size).toBe(0);
  });

  it('500s when the deletion job cannot be enqueued after commit', async () => {
    const removed = [{ photoId: 1, location: 'loc-a' }];
    const { service } = setup({ updateSupplier: vi.fn().mockResolvedValue({ removedPhotos: removed }) }, new Error('redis'));
    await expect(
      service.updateSupplier(101, { ...base, isPhotoDirty: true, photoIds: [2] }, []),
    ).rejects.toMatchObject({ statusCode: 500 });
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/business/supplierUpdateService.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-29
 * Scope: Supplier update workflow (validate, upload, transaction, cleanup, enqueue) from the Phase 3
 *        plan Task 6; SupplierServiceArchitecture.md §6.2, §7.5, §8.2. No requirements, architecture,
 *        schema, or API decisions were made by the AI tool.
 * Author review:
 */
import type { PhotoWrite, SupplierChange, SupplierWriteRepository } from '../persistence/supplierWriteRepository.js';
import type { JobQueue } from '../queue/jobQueue.js';
import { PHOTO_DELETION_QUEUE_KEY, buildPhotoDeletionJob } from '../queue/photoDeletionJob.js';
import type { PhotoFile, PhotoStorage } from '../storage/photoStorage.js';
import { AppError } from '../utils/AppError.js';
import { sgtDatetime } from '../utils/time.js';
import { resolveHours } from '../validation/supplierInput.js';
import type { UpdateSupplierInput } from '../validation/supplierUpdateInput.js';
import { buildPhotoPlan } from './photoPlan.js';

export interface UpdateResult {
  statusCode: 200;
  body: unknown;
}

interface Dependencies {
  repo: SupplierWriteRepository;
  storage: PhotoStorage;
  reader: { getAdminSupplier(supplierId: number): Promise<unknown> };
  queue: JobQueue;
  clock?: () => Date;
}

function invalid(field: string, message: string): AppError {
  return new AppError(422, 'Unprocessable Entity', message, { details: [{ field, location: 'body', message }] });
}

export function createSupplierUpdateService({ repo, storage, reader, queue, clock = () => new Date() }: Dependencies) {
  async function removeUploaded(locations: string[]): Promise<void> {
    // Best effort: a failed cleanup must not mask the original error.
    await Promise.allSettled(locations.map((location) => storage.delete(location)));
  }

  return {
    async updateSupplier(supplierId: number, input: UpdateSupplierInput, files: PhotoFile[]): Promise<UpdateResult> {
      const current = await repo.findCurrent(supplierId);
      if (current === null || current.isDeleted) throw new AppError(404, 'Not Found', 'Supplier not found.');
      if (input.version !== current.version) {
        throw new AppError(409, 'Conflict', 'The supplier was modified by someone else. Re-fetch it and retry.');
      }

      const type = input.type ?? current.type;
      const locationId = input.locationId ?? current.locationId;
      const name = input.name ?? current.name;

      if (input.locationId !== undefined && !(await repo.locationExists(input.locationId))) {
        throw invalid('location_id', 'The selected location does not exist.');
      }
      if (input.categoryIds !== undefined) {
        const missing = await repo.findMissingCategoryIds(input.categoryIds);
        if (missing.length > 0) throw invalid('category_id', `Unknown category id(s): ${missing.join(', ')}.`);
      }
      const clash = await repo.findByIdentity(name, type, locationId);
      if (clash !== null && clash.supplierId !== supplierId) {
        throw invalid('name', 'A supplier with the same name, type and location already exists.');
      }

      const change: SupplierChange = { version: input.version, now: sgtDatetime(clock()) };
      if (input.name !== undefined) change.name = input.name;
      if (input.type !== undefined) change.type = input.type;
      if (input.desc !== undefined) change.desc = input.desc;
      if (input.locationId !== undefined) change.locationId = input.locationId;
      if (input.isActive !== undefined) change.isActive = input.isActive;
      if (input.categoryIds !== undefined) change.categoryIds = input.categoryIds;

      const hoursSent = input.openingHours !== undefined || input.is24h !== undefined;
      if (hoursSent || input.type !== undefined && input.type !== current.type) {
        change.hours = resolveHours(type, input.openingHours, input.is24h ?? false);
      }

      const plan = input.isPhotoDirty
        ? buildPhotoPlan(current.photos, input.photoIds ?? [], input.placeholderIds ?? [], files.length)
        : null;
      if (plan === null && files.length > 0) {
        throw invalid('photos', 'Photos were uploaded but isPhotoDirty is not true.');
      }

      // Step 2: upload first; a failure aborts the save (Arch §8.2).
      const uploaded: string[] = [];
      try {
        for (const file of files) uploaded.push(await storage.upload(file));
      } catch {
        await removeUploaded(uploaded);
        throw new AppError(500, 'Internal Server Error', 'Photo upload failed.');
      }
      if (plan !== null) {
        change.photos = plan.entries.map(
          (entry): PhotoWrite =>
            entry.kind === 'existing'
              ? { kind: 'existing', photoId: entry.photoId }
              : { kind: 'new', location: uploaded[entry.fileIndex] as string },
        );
      }

      // Steps 3-4: one transaction; on failure remove the new cloud objects.
      let removedPhotos: Array<{ photoId: number; location: string }>;
      try {
        ({ removedPhotos } = await repo.updateSupplier(supplierId, change));
      } catch (error) {
        await removeUploaded(uploaded);
        if (error instanceof AppError) throw error;
        throw new AppError(500, 'Internal Server Error', 'Supplier could not be saved.');
      }

      // Steps 5-6: after commit, enqueue deletion of the excluded photos' cloud objects.
      try {
        for (const photo of removedPhotos) {
          await queue.enqueue(PHOTO_DELETION_QUEUE_KEY, buildPhotoDeletionJob(photo));
        }
      } catch {
        throw new AppError(500, 'Internal Server Error', 'Photo cleanup could not be queued.');
      }

      return { statusCode: 200, body: await reader.getAdminSupplier(supplierId) };
    },
  };
}

export type SupplierUpdateService = ReturnType<typeof createSupplierUpdateService>;
```

- [ ] **Step 4: Run** `npx vitest run src/business/supplierUpdateService.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `git add src/business && git commit -m "feat(supplier-service): add supplier update saga"`

---

### Task 7: Controller, route and app wiring

**Files:** Modify `src/controllers/adminSupplier.controller.ts`, `src/routes/adminSupplier.routes.ts`, `src/app.ts`, `src/routes/adminSupplier.routes.test.ts`

- [ ] **Step 1: Write the failing tests.** In `adminSupplier.routes.test.ts`: import `SupplierUpdateService` from `../business/supplierUpdateService.js`; in `buildApp()` add next to `creation`

```ts
  const update = {
    updateSupplier: vi.fn().mockResolvedValue({ statusCode: 200, body: { id: 101, version: 4 } }),
  };
```

pass `update: update as unknown as SupplierUpdateService,` in the `createAdminSupplierRouter({...})` call, and return `update` from `buildApp` alongside the existing values. Then append:

```ts
describe('PUT /api/v1/admin/suppliers/:id', () => {
  it('rejects a user role with 403 and calls nothing', async () => {
    const { app, update } = buildApp();
    const res = await request(app).put('/api/v1/admin/suppliers/101').set('x-test-role', 'user').field('version', '3').field('name', 'X');
    expect(res.status).toBe(403);
    expect(update.updateSupplier).not.toHaveBeenCalled();
  });

  it('passes parsed fields and files to the service and returns its body', async () => {
    const { app, update } = buildApp();
    const res = await request(app)
      .put('/api/v1/admin/suppliers/101')
      .set('x-test-role', 'admin')
      .field('version', '3')
      .field('name', 'New Name')
      .field('isPhotoDirty', 'true')
      .field('photo_ids', '["ph-1"]')
      .field('placeholder_ids', '["ph-1"]')
      .attach('photos', Buffer.from('x'), { filename: 'a.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 101, version: 4 });
    expect(update.updateSupplier).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ version: 3, name: 'New Name', isPhotoDirty: true, photoIds: ['ph-1'], placeholderIds: ['ph-1'] }),
      [expect.objectContaining({ mimeType: 'image/png' })],
    );
  });

  it('422s a body with only version', async () => {
    const { app } = buildApp();
    const res = await request(app).put('/api/v1/admin/suppliers/101').set('x-test-role', 'admin').field('version', '3');
    expect(res.status).toBe(422);
  });

  it('422s a missing version', async () => {
    const { app } = buildApp();
    const res = await request(app).put('/api/v1/admin/suppliers/101').set('x-test-role', 'admin').field('name', 'X');
    expect(res.status).toBe(422);
  });

  it('422s a non-numeric id', async () => {
    const { app } = buildApp();
    const res = await request(app).put('/api/v1/admin/suppliers/abc').set('x-test-role', 'admin').field('version', '1').field('name', 'X');
    expect(res.status).toBe(422);
  });

  it.each([404, 409])('maps a service %i to the error envelope', async (status) => {
    const { app, update } = buildApp();
    update.updateSupplier.mockRejectedValueOnce(new AppError(status, 'E', 'nope'));
    const res = await request(app).put('/api/v1/admin/suppliers/101').set('x-test-role', 'admin').field('version', '3').field('name', 'X');
    expect(res.status).toBe(status);
  });
});
```

(If the existing `buildApp` returns a differently shaped object or lacks `errorHandler`, follow its existing pattern; the assertions above are the required behaviour.)

- [ ] **Step 2: Run** `npx vitest run src/routes/adminSupplier.routes.test.ts` — Expected: FAIL (no PUT route).

- [ ] **Step 3: Implement.**

Controller: add `import type { SupplierUpdateService } from '../business/supplierUpdateService.js';` and `import { parseUpdateSupplier } from '../validation/supplierUpdateInput.js';`; add `update: SupplierUpdateService;` to `AdminSupplierDependencies`; destructure `update`; add the handler after `create` (rename destructured `update` to `updater` to avoid shadowing the handler name):

```ts
    update: asyncHandler(async (req, res) => {
      const { id } = parseOrThrow(idParamSchema, req.params, 'path');
      const input = parseUpdateSupplier((req.body ?? {}) as Record<string, unknown>);
      const files = ((req.files as Express.Multer.File[] | undefined) ?? []).map(
        (file): PhotoFile => ({ buffer: file.buffer, mimeType: file.mimetype as PhotoFile['mimeType'] }),
      );
      const result = await updater.updateSupplier(id, input, files);
      res.status(result.statusCode).json(result.body);
    }),
```

(with the function signature `createAdminSupplierController({ reader, creation, update: updater, idempotency })`).

Route: after the `router.post(...)` line add `router.put('/:id', uploadPhotos, controller.update);` — PUT is idempotent by design, so no idempotency middleware (Arch §7.5).

`app.ts`: import `createSupplierUpdateService`, `createRedisJobQueue`; build and pass:

```ts
const writeRepository = createMysqlSupplierWriteRepository(pool);
const photoStorage = createConfiguredPhotoStorage(config.photoStore);
// supplierCreation uses writeRepository and photoStorage in place of the inline calls
const supplierUpdate = createSupplierUpdateService({
  repo: writeRepository,
  storage: photoStorage,
  reader: supplierService,
  queue: createRedisJobQueue(redis),
});
// ...createAdminSupplierRouter({ reader: supplierService, creation: supplierCreation, update: supplierUpdate, idempotency: ... })
```

Append dated `Scope`/`Author review` pairs to the three source headers and the test header.

- [ ] **Step 4: Run** `npx vitest run` — Expected: all PASS. Then `npx tsc --noEmit` and `npm run lint` — Expected: clean.
- [ ] **Step 5: Commit** `git add src && git commit -m "feat(supplier-service): add admin supplier PUT endpoint"`

---

### Task 8: Verification

- [ ] **Step 1:** `npm test -- --run` — record the real pass/fail counts.
- [ ] **Step 2:** `npm run build` and `npm run lint` — record results.
- [ ] **Step 3 (only if the local dev stack — MySQL, Redis, MinIO — is running; otherwise report "not run"):** with an admin token, `GET /api/v1/admin/suppliers/:id` to read `version`, then
  - `curl -X PUT .../api/v1/admin/suppliers/:id -H "Authorization: Bearer $T" -F version=<v> -F isActive=false` → `200`, `version` +1, `isActive` false;
  - repeat the same call with the old `version` → `409`;
  - `-F isPhotoDirty=true -F 'photo_ids=[2,"ph-1"]' -F 'placeholder_ids=["ph-1"]' -F photos=@a.png` → `200`, photo order `[2, new]`, and the excluded photo's job present in the team's Redis list (`redis-cli LRANGE queue:image:cleanup 0 -1`).
- [ ] **Step 4:** Report exactly what ran and what did not (root `AGENTS.md` §2.3).

---

### Task 9: Docs and disclosure

**Files:** Modify `supplier-service/README.md`, `supplier-service/SupplierServiceSpec.md`, `ai/usage-log.md`, `README.md` (root)

- [ ] **Step 1:** In `supplier-service/README.md` add one row to the admin API table (`PUT /api/v1/admin/suppliers/:id` — fields, `version` required, `isPhotoDirty`/`photo_ids`/`placeholder_ids`/`photos`, `409` on stale version, `422` on collision, `404` on unknown or soft-deleted) and append a header `Scope`/`Author review` pair.
- [ ] **Step 2:** In `SupplierServiceSpec.md` Phase 3 add a status note in the style of the Phase 2 "done" bullets, and a header `Scope` line. Record the team's four 2026-09-29 answers there only if the team asks; they belong to the team's documents (Architecture §9), which the agent does not edit unprompted.
- [ ] **Step 3:** Append the `ai/usage-log.md` entry per root `AGENTS.md` §5.2: `## 2026-09-29 — Phase 3: Admin update (PUT /api/v1/admin/suppliers/:id)`; **Governing decision:** `SupplierServiceSpec.md` "Phase 3", Architecture §6.2/§7/§7.5/§8.2, plus the four team answers given in chat; **Prompts (exact):** `Based on  @SupplierServiceSpec, plan phase 3` and the four multi-choice answers quoted verbatim from the session; list every file from this plan (including `package.json` only if changed); **Deviations / questions:** the four questions asked, the team-supplied queue key/task name, and the nine "Readings confirmed by the team" (including the reading 8 caveat); verification results from Task 8, stated truthfully; leave `What I kept/changed/rejected` and `Author review` blank.
- [ ] **Step 4:** Add the matching row to the root `README.md` "Log index": `| 2026-09-29 | supplier-service | Phase 3: Admin update (PUT /api/v1/admin/suppliers/:id) | Optimistic-concurrency supplier edit with photo reorder and deletion jobs |`.
- [ ] **Step 5: Commit**

```bash
git add supplier-service/README.md supplier-service/SupplierServiceSpec.md ai/usage-log.md README.md
git commit -m "docs(supplier-service): document Phase 3 update endpoint and log the implementation"
```

- [ ] **Step 6:** Remind the team which headers and log entries still need `Author review` signatures (root `AGENTS.md` §7 step 6).

---

## Self-review

- **Spec coverage:** partial PUT + `version`/`409` → Tasks 3, 5, 6; photo edit semantics (`isPhotoDirty`, ordered `photo_ids`, placeholders, reorder, post-commit enqueue) → Tasks 1, 4, 5, 6; `updated_on`/`version` bump → Task 5; `is_active` toggle → Tasks 3, 5; F8.3.1 (no blank mandatory fields) → non-empty `name`, hours required for Store (Tasks 3, 6); F8.3.2 passive (nothing renumbers `supplier_id`) → no code needed; worker/dead-letter → out of scope (Phase 4).
- **Placeholders:** the only external inputs are the two team-supplied strings, gated in Task 1 Step 0 (not invented).
- **Type consistency:** `CurrentPhoto`/`PhotoWrite`/`SupplierChange`/`CurrentSupplier` are defined in Tasks 4–5 and used unchanged in Task 6; `UpdateSupplierInput` fields (`photoIds`, `placeholderIds`, `openingHours`, `is24h`, `isActive`) match between Tasks 3, 6, 7; `updateSupplier(supplierId, input, files)` signature matches the controller call.
- **Not verified:** none of this code has been compiled; `tsconfig` strictness (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) may require small typing tweaks, and the Task 7 test-helper edit assumes the shape of `buildApp`.
