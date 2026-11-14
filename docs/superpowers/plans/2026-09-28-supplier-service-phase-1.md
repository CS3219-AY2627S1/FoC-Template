<!--
AI Assistance Disclosure:
Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-28
Scope: Wrote an implementation plan for Phase 1 of SupplierServiceSpec.md, transcribing decisions the
       team already recorded in SupplierServiceArchitecture.md (§6.2, §6.3, §7, §7.2, §7.3) and the
       spec. Points the documents left open were listed for the team and are now resolved (see "Team
       decisions").
       No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: Congchen
Scope: 2026-09-29 update — amended the plan to implement the team's recorded Phase 1 decisions (isOpen
       filter, always-enforced limit of 50, 00:00-23:59 all-day check, 404 and paging behavior) and to
       match the merged Phase 0 code. No requirements, architecture, schema, or API decisions were
       made by the AI tool; each was supplied by the team in chat.
Author review: Congchen
-->

# Supplier Service — Phase 1 (Supplier Read APIs, Requester Mode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the four requester-mode read endpoints — `GET /api/v1/suppliers`, `GET /api/v1/suppliers/:id`, `GET /api/v1/suppliers/reference/location`, `GET /api/v1/suppliers/reference/categories` — through the presentation → business → persistence layering, with the `is_open` calculation, fixed 50-entry pagination, and the user-facing visibility rule.

**Architecture:** This plan implements only what `supplier-service/SupplierServiceSpec.md` ("Phase 1") and `supplier-service/SupplierServiceArchitecture.md` (§4, §5, §6.2, §6.3, §7 endpoint table, §7.2, §7.3) already record. A controller/router validates the request and calls a business-layer service; the service depends on a `SupplierRepository` interface (§5), implemented over the Phase 0 `mysql2` pool. `is_open` is a pure function in its own module. No route beyond the four above is added; admin routes, photo upload and writes are Phase 2+.

**Tech Stack:** TypeScript, Express, `mysql2`, Zod, Vitest + Supertest — all already fixed by `supplier-service/AGENTS.md` and Phase 0. **No new dependencies.**

---

## Prerequisite: Phase 0 (complete)

Phase 0 is merged on `supplier-service` (through commit `65f8162`). This plan uses these Phase 0 files:

| Phase 0 file | Used here as |
| --- | --- |
| `src/db/pool.ts` (**named** export `pool`) | injected into the MySQL repository |
| `src/utils/AppError.ts` | `new AppError(status, error, message, { details })` |
| `src/utils/asyncHandler.ts` | wraps async controllers |
| `src/middleware/requireRole.ts` | `requireRole('user', 'admin', 'super admin')` |
| `src/middleware/errorHandler.ts` | §7.1 envelope (used by route tests) |
| `src/app.ts` (`apiV1` router, with `authenticate` already applied) | mount point for `/suppliers` |
| `vitest.config.ts` | supplies the env vars `src/config.ts` needs, so `npx vitest run` works with no `.env` |
| `src/db/init.sql` | tables/columns queried below |

Follow Phase 0's conventions: TypeScript files carry the disclosure as a `/* ... */` block comment at the top (as in `src/app.ts`), not `//` lines.

---

## Team decisions (recorded 2026-09-29) and remaining points

The team answered the eight points raised in the first draft of this plan. The decisions are recorded in
`SupplierServiceArchitecture.md` (§6.2, §6.3, §7.1, §7.1.1, §7.2, §7.3, §9 item 20); this plan implements them:

| # | Decision | Where implemented |
| --- | --- | --- |
| 1 | `isOpen` is an additional optional list filter (`true` = open now, `false` = closed now) | Tasks 1, 3, 4, 5, 6 |
| 2 | `limit` is always 50; any other supplied value is an error (`422`) | Task 3 |
| 3 | `sortOrder` defaults to `A-Z`; a page past the last page returns `200` with empty `data` | Tasks 3, 5 |
| 4 | Unknown (or hidden) supplier id returns `404` | Tasks 5, 6 |
| 5 | `00:00`–`23:59` means 24 hours; `is_open` has a dedicated check returning `true` for it | Task 2 |
| 6 | Equal open and close times are not allowed; the message directs 24-hour schedules to `00:00`–`23:59` | Write-time validation, **Phase 2/3** (recorded in the architecture; Phase 1 has no write endpoint) |
| 7 | The 24-hour signed-URL validity is not yet available or confirmed | Task 4: `photoLocation` is returned as stored |
| 8 | `category` in the category reference response is the category value (`category_type`) | Tasks 4, 5 |

Four implementation-level points, confirmed by the team on 2026-09-29:

1. **`isOpen` value format** — confirmed as `isOpen=true` / `isOpen=false`; any other value is a `422`.
2. **How the `isOpen` filter paginates** — confirmed: `is_open` is computed in code (SGT, overnight rules), not stored, so when `isOpen` is supplied the service loads all suppliers matching the other filters, computes `isOpen`, filters, then slices the 50-entry page (`totalRecords`/`totalPages` describe the filtered set). Without `isOpen`, paging stays in SQL. Confirmed as acceptable for Phase 1; revisit if NFR7.1's Phase 5 load test shows it doesn't scale.
3. **A Facility with no hours rows** — confirmed as reporting closed (not forced open). §6.2 stores Facility rows as `00:00`–`23:59`, so this only affects bad/missing seed data.
4. **Zero-length rows already in the database** — confirmed: `is_open` treats an `open == close` row as closed, defensively, on top of the write-time rejection (decision 6).

---

## File Structure

```
supplier-service/src/
├── app.ts                                  # modify: mount /suppliers router
├── app.integration.test.ts                 # modify: add /suppliers 401 test
├── types/
│   └── supplier.ts                         # API response shapes (§7.3)
├── validation/
│   ├── supplierQuery.ts                    # Zod schemas: list query + :id param, parseOrThrow
│   └── supplierQuery.test.ts
├── business/
│   ├── isOpen.ts                           # pure is_open calculation (§6.2)
│   ├── isOpen.test.ts
│   ├── supplierService.ts                  # list/detail/reference workflows (§4)
│   └── supplierService.test.ts
├── persistence/
│   ├── supplierRepository.ts               # persistence interface + row types (§5)
│   ├── mysqlSupplierRepository.ts          # MySQL implementation
│   └── mysqlSupplierRepository.test.ts     # fake-pool tests of SQL + row mapping
├── controllers/
│   └── supplier.controller.ts              # HTTP <-> service
└── routes/
    ├── supplier.routes.ts                  # router, role guard, route order
    └── supplier.routes.test.ts
```

Route registration order matters: `/reference/location` and `/reference/categories` are declared **before** `/:id` so `reference` is never captured as an id.

---

## Task 1: Response types and persistence interface

No behaviour yet, so no test; later tasks' tests exercise these types (`npx tsc --noEmit` is the check).

**Files:**
- Create: `supplier-service/src/types/supplier.ts`
- Create: `supplier-service/src/persistence/supplierRepository.ts`

- [ ] **Step 1: Write `src/types/supplier.ts`** (shapes are §7.3 verbatim)

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Typed the response shapes already specified in SupplierServiceArchitecture.md §7.3
 *        (SupplierSummary, paginated envelope, detailed supplier, reference options). No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

export interface PhotoDto {
  photoId: number;
  photoLocation: string;
  displayOrder: number;
}

export interface SupplierSummary {
  id: number;
  name: string;
  type: 'Store' | 'Facility';
  location: string;
  faculty: string;
  level: number;
  categories: string[];
  photos: PhotoDto[];
  isOpen: boolean;
}

export interface OpeningHourDto {
  day: number;
  open: string;
  close: string;
}

export interface SupplierDetail extends SupplierSummary {
  desc: string | null;
  openingHours: OpeningHourDto[];
}

export interface PaginatedSuppliers {
  metadata: {
    totalRecords: number;
    currPage: number;
    limit: number;
    totalPages: number;
  };
  data: SupplierSummary[];
}

export interface LocationOption {
  location_id: number;
  location: string;
  faculty_id: number;
  faculty: string;
}

export interface CategoryOption {
  category_id: number;
  category: string;
}
```

- [ ] **Step 2: Write `src/persistence/supplierRepository.ts`** (the §5 persistence boundary: the business layer sees only this interface, never SQL)

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Defined the persistence interface the business layer depends on, as required by
 *        SupplierServiceArchitecture.md §5 and SupplierServiceSpec.md Phase 0/1. Read operations
 *        only; the visibility rule (§7) is part of every query. No requirements, architecture,
 *        schema, or API decisions were made by the AI tool.
 * Author review:
 */

export interface SupplierRow {
  supplierId: number;
  name: string;
  type: 'Store' | 'Facility';
  desc: string | null;
  location: string;
  faculty: string;
  level: number;
}

export interface CategoryLinkRow {
  supplierId: number;
  category: string;
}

export interface HourRow {
  supplierId: number;
  dayOfWeek: number; // 0 = Sunday .. 6 = Saturday (§6.2)
  open: string; // 'HH:MM'
  close: string; // 'HH:MM'
}

export interface PhotoRow {
  supplierId: number;
  photoId: number;
  photoLocation: string;
  displayOrder: number;
}

export interface LocationRow {
  locationId: number;
  location: string;
  facultyId: number;
  faculty: string;
}

export interface CategoryRow {
  categoryId: number;
  category: string;
}

export interface ListCriteria {
  search?: string;
  locationId?: number;
  categoryId?: number;
  sortOrder: 'A-Z' | 'Z-A';
}

export interface ListFilter extends ListCriteria {
  limit: number;
  offset: number;
}

export interface SupplierRepository {
  /** User-facing page: only suppliers with is_deleted = false AND is_active = true. */
  findVisiblePage(filter: ListFilter): Promise<{ rows: SupplierRow[]; total: number }>;
  /**
   * Same visibility rule and criteria, no paging. Used when the computed isOpen filter must be
   * applied to the whole result set before a page is cut.
   */
  findAllVisible(criteria: ListCriteria): Promise<SupplierRow[]>;
  /** Same visibility rule; null when the id is missing, deleted, or inactive. */
  findVisibleById(supplierId: number): Promise<SupplierRow | null>;
  findCategoryLinks(supplierIds: number[]): Promise<CategoryLinkRow[]>;
  findHours(supplierIds: number[]): Promise<HourRow[]>;
  findPhotos(supplierIds: number[]): Promise<PhotoRow[]>;
  listLocations(): Promise<LocationRow[]>;
  listCategories(): Promise<CategoryRow[]>;
}
```

- [ ] **Step 3: Typecheck**

Run: `cd supplier-service && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add supplier-service/src/types/supplier.ts supplier-service/src/persistence/supplierRepository.ts
git commit -m "feat(supplier-service): add supplier response types and persistence interface"
```

---

## Task 2: `is_open` calculation (§6.2)

Pure function: Singapore time (UTC+8); overnight intervals continue into the next day; a dedicated check returns `true` for a `00:00`–`23:59` entry on the current day (decision 5). There is no Facility special case: a Facility is open because its stored rows are `00:00`–`23:59` (remaining point 3).

**Files:**
- Create: `supplier-service/src/business/isOpen.ts`
- Test: `supplier-service/src/business/isOpen.test.ts`

Reference instants (SGT = UTC+8; 2026-09-28 is a Monday, `day_of_week = 1`):

| SGT | UTC used in tests |
| --- | --- |
| Mon 10:00 | `2026-09-28T02:00:00Z` |
| Mon 08:59 | `2026-09-28T00:59:00Z` |
| Mon 18:00 | `2026-09-28T10:00:00Z` |
| Mon 23:30 | `2026-09-28T15:30:00Z` |
| Tue 01:00 | `2026-09-28T17:00:00Z` |
| Sun 01:00 | `2026-09-26T17:00:00Z` |

- [ ] **Step 1: Write the failing test**

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Unit tests for the is_open rules in SupplierServiceArchitecture.md §6.2, including the
 *        dedicated 00:00-23:59 check. No requirements, architecture, schema, or API decisions were
 *        made by the AI tool.
 * Author review:
 */
import { describe, expect, it } from 'vitest';
import { computeIsOpen } from './isOpen.js';

const at = (iso: string) => new Date(iso);
const monday9to18 = [{ dayOfWeek: 1, open: '09:00', close: '18:00' }];
const monday24h = [{ dayOfWeek: 1, open: '00:00', close: '23:59' }];

describe('computeIsOpen', () => {
  it('is open at any time on a day with a 00:00-23:59 entry', () => {
    expect(computeIsOpen(monday24h, at('2026-09-27T16:00:00Z'))).toBe(true); // Mon 00:00 SGT
    expect(computeIsOpen(monday24h, at('2026-09-28T02:00:00Z'))).toBe(true); // Mon 10:00
    expect(computeIsOpen(monday24h, at('2026-09-28T15:59:00Z'))).toBe(true); // Mon 23:59
  });

  it('does not extend a 00:00-23:59 entry to other days', () => {
    expect(computeIsOpen(monday24h, at('2026-09-29T02:00:00Z'))).toBe(false); // Tue 10:00
  });

  it('is closed with no hours entries', () => {
    expect(computeIsOpen([], at('2026-09-28T02:00:00Z'))).toBe(false);
  });

  it('is open inside a same-day interval in Singapore time', () => {
    expect(computeIsOpen(monday9to18, at('2026-09-28T02:00:00Z'))).toBe(true); // Mon 10:00 SGT
  });

  it('is open exactly at open_time and closed exactly at close_time', () => {
    expect(computeIsOpen(monday9to18, at('2026-09-28T01:00:00Z'))).toBe(true); // 09:00 SGT
    expect(computeIsOpen(monday9to18, at('2026-09-28T10:00:00Z'))).toBe(false); // 18:00 SGT
  });

  it('is closed before opening', () => {
    expect(computeIsOpen(monday9to18, at('2026-09-28T00:59:00Z'))).toBe(false); // 08:59 SGT
  });

  it('is closed on a day with no hours row', () => {
    expect(computeIsOpen(monday9to18, at('2026-09-29T02:00:00Z'))).toBe(false); // Tue 10:00 SGT
  });

  it('uses Singapore time, not UTC, to pick the day', () => {
    // Sun 16:30 UTC is already Mon 00:30 SGT; a Monday 00:00-02:00 row must match.
    const early = [{ dayOfWeek: 1, open: '00:00', close: '02:00' }];
    expect(computeIsOpen(early, at('2026-09-27T16:30:00Z'))).toBe(true);
  });

  it('continues an overnight interval into the next day', () => {
    const overnight = [{ dayOfWeek: 1, open: '22:00', close: '02:00' }];
    expect(computeIsOpen(overnight, at('2026-09-28T15:30:00Z'))).toBe(true); // Mon 23:30
    expect(computeIsOpen(overnight, at('2026-09-28T17:00:00Z'))).toBe(true); // Tue 01:00
    expect(computeIsOpen(overnight, at('2026-09-28T18:00:00Z'))).toBe(false); // Tue 02:00
  });

  it('does not apply an overnight row to the day before it starts', () => {
    const overnight = [{ dayOfWeek: 1, open: '22:00', close: '02:00' }];
    expect(computeIsOpen(overnight, at('2026-09-27T17:00:00Z'))).toBe(false); // Mon 01:00
  });

  it('wraps an overnight Saturday interval into Sunday', () => {
    const satNight = [{ dayOfWeek: 6, open: '22:00', close: '02:00' }];
    expect(computeIsOpen(satNight, at('2026-09-26T17:00:00Z'))).toBe(true); // Sun 01:00
  });

  it('never counts a zero-length interval as open', () => {
    const zero = [{ dayOfWeek: 1, open: '09:00', close: '09:00' }];
    expect(computeIsOpen(zero, at('2026-09-28T02:00:00Z'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd supplier-service && npx vitest run src/business/isOpen.test.ts`
Expected: FAIL — `./isOpen.js` does not exist.

- [ ] **Step 3: Write `src/business/isOpen.ts`**

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Implemented the is_open calculation described in SupplierServiceArchitecture.md §6.2:
 *        Singapore time (UTC+8), a dedicated check for a 00:00-23:59 entry, and overnight intervals
 *        continuing into the following day. The half-open close boundary is an implementation choice
 *        listed in the Phase 1 plan. No requirements, architecture, schema, or API decisions were
 *        made by the AI tool.
 * Author review:
 */
export interface HourEntry {
  dayOfWeek: number; // 0 = Sunday .. 6 = Saturday
  open: string; // 'HH:MM'
  close: string; // 'HH:MM'
}

const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;
const ALL_DAY_OPEN = '00:00';
const ALL_DAY_CLOSE = '23:59';

export function toMinutes(hhmm: string): number {
  const [hours = '0', minutes = '0'] = hhmm.split(':');
  return Number(hours) * 60 + Number(minutes);
}

function sgtDayAndMinutes(now: Date): { dayOfWeek: number; minutes: number } {
  const sgt = new Date(now.getTime() + SGT_OFFSET_MS);
  return { dayOfWeek: sgt.getUTCDay(), minutes: sgt.getUTCHours() * 60 + sgt.getUTCMinutes() };
}

export function computeIsOpen(hours: HourEntry[], now: Date): boolean {
  const { dayOfWeek, minutes } = sgtDayAndMinutes(now);

  // 00:00-23:59 denotes 24-hour operation (§6.2): open for any time of that day.
  const isAllDay = hours.some(
    (entry) =>
      entry.dayOfWeek === dayOfWeek && entry.open === ALL_DAY_OPEN && entry.close === ALL_DAY_CLOSE,
  );
  if (isAllDay) {
    return true;
  }

  const previousDay = (dayOfWeek + 6) % 7;

  return hours.some((entry) => {
    const open = toMinutes(entry.open);
    const close = toMinutes(entry.close);

    // Equal open/close is rejected at write time (§6.2); defensively treated as closed.
    if (open === close) {
      return false;
    }
    if (open < close) {
      return entry.dayOfWeek === dayOfWeek && minutes >= open && minutes < close;
    }
    // Overnight: the evening part belongs to the row's own day, the early-morning part to the next.
    if (entry.dayOfWeek === dayOfWeek && minutes >= open) {
      return true;
    }
    return entry.dayOfWeek === previousDay && minutes < close;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd supplier-service && npx vitest run src/business/isOpen.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add supplier-service/src/business/isOpen.ts supplier-service/src/business/isOpen.test.ts
git commit -m "feat(supplier-service): add SGT is_open calculation"
```

---

## Task 3: Request validation (list query, `:id`)

**Files:**
- Create: `supplier-service/src/validation/supplierQuery.ts`
- Test: `supplier-service/src/validation/supplierQuery.test.ts`

Failures map to `422` with the §7.1 `details` array (`field`, `location`, `message`) — §7.1.1 classes "limit over 50, invalid location_id" as `422`. Decisions 1–3 above: `isOpen` is `true`/`false` (anything else is `422`), any `limit` other than 50 is `422`, `sortOrder` defaults to `A-Z`.

- [ ] **Step 1: Write the failing test**

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Unit tests for list-query and path-id validation per SupplierServiceArchitecture.md §7.2
 *        and §7.1.1. No requirements, architecture, schema, or API decisions were made by the AI
 *        tool.
 * Author review:
 */
import { describe, expect, it } from 'vitest';
import { AppError } from '../utils/AppError.js';
import { idParamSchema, listQuerySchema, parseOrThrow } from './supplierQuery.js';

function catchAppError(fn: () => unknown): AppError {
  try {
    fn();
  } catch (err) {
    if (err instanceof AppError) return err;
    throw err;
  }
  throw new Error('expected an AppError');
}

describe('listQuerySchema via parseOrThrow', () => {
  it('applies defaults: page 1, sortOrder A-Z', () => {
    const q = parseOrThrow(listQuerySchema, {}, 'query');
    expect(q).toMatchObject({ page: 1, sortOrder: 'A-Z' });
  });

  it('coerces numeric strings and keeps filters', () => {
    const q = parseOrThrow(
      listQuerySchema,
      { page: '3', search: '  store ', location_id: '4', category_id: '2', sortOrder: 'Z-A', limit: '50' },
      'query',
    );
    expect(q).toMatchObject({ page: 3, search: 'store', location_id: 4, category_id: 2, sortOrder: 'Z-A' });
  });

  it.each([
    ['true', true],
    ['false', false],
  ])('parses isOpen=%s', (raw, expected) => {
    expect(parseOrThrow(listQuerySchema, { isOpen: raw }, 'query').isOpen).toBe(expected);
  });

  it('leaves isOpen undefined when omitted', () => {
    expect(parseOrThrow(listQuerySchema, {}, 'query').isOpen).toBeUndefined();
  });

  it('rejects limit other than 50 with a 422 naming the field', () => {
    const err = catchAppError(() => parseOrThrow(listQuerySchema, { limit: '51' }, 'query'));
    expect(err.statusCode).toBe(422);
    expect(err.details?.[0]).toMatchObject({ field: 'limit', location: 'query' });
  });

  it.each([
    ['page', '0'],
    ['page', 'abc'],
    ['location_id', '-1'],
    ['category_id', 'x'],
    ['sortOrder', 'newest'],
    ['limit', '0'],
    ['isOpen', 'maybe'],
    ['isOpen', '1'],
  ])('rejects invalid %s=%s with 422', (field, value) => {
    const err = catchAppError(() => parseOrThrow(listQuerySchema, { [field]: value }, 'query'));
    expect(err.statusCode).toBe(422);
    expect(err.error).toBe('Unprocessable Entity');
    expect(err.details?.[0]?.field).toBe(field);
  });
});

describe('idParamSchema via parseOrThrow', () => {
  it('parses a positive integer id', () => {
    expect(parseOrThrow(idParamSchema, { id: '101' }, 'path')).toEqual({ id: 101 });
  });

  it.each(['0', 'abc', '1.5', '-3'])('rejects id=%s with 422', (id) => {
    const err = catchAppError(() => parseOrThrow(idParamSchema, { id }, 'path'));
    expect(err.statusCode).toBe(422);
    expect(err.details?.[0]).toMatchObject({ field: 'id', location: 'path' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd supplier-service && npx vitest run src/validation/supplierQuery.test.ts`
Expected: FAIL — `./supplierQuery.js` does not exist.

- [ ] **Step 3: Write `src/validation/supplierQuery.ts`**

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Validation for the list query parameters and :id path parameter listed in
 *        SupplierServiceArchitecture.md §7.2, mapping failures to the 422 error envelope from §7.1 /
 *        §7.1.1. The open questions on `limit`, defaults and edges are recorded in the Phase 1 plan.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { z } from 'zod';
import { AppError } from '../utils/AppError.js';

export const PAGE_SIZE = 50;

const positiveInt = z.coerce.number().int().positive();

export const listQuerySchema = z.object({
  page: positiveInt.default(1),
  limit: z.coerce
    .number()
    .int()
    .refine((value) => value === PAGE_SIZE, { message: `limit is fixed at ${PAGE_SIZE}` })
    .optional(),
  search: z.string().trim().optional(),
  location_id: positiveInt.optional(),
  category_id: positiveInt.optional(),
  isOpen: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  sortOrder: z.enum(['A-Z', 'Z-A']).default('A-Z'),
});

export const idParamSchema = z.object({ id: positiveInt });

export function parseOrThrow<S extends z.ZodTypeAny>(
  schema: S,
  input: unknown,
  location: 'query' | 'path',
): z.infer<S> {
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }
  throw new AppError(422, 'Unprocessable Entity', 'One or more request values failed validation.', {
    details: result.error.issues.map((issue) => ({
      field: issue.path.join('.') || location,
      location,
      message: issue.message,
    })),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd supplier-service && npx vitest run src/validation/supplierQuery.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add supplier-service/src/validation/supplierQuery.ts supplier-service/src/validation/supplierQuery.test.ts
git commit -m "feat(supplier-service): add list query and id param validation"
```

---

## Task 4: MySQL persistence implementation

Tests use a fake pool (no DB needed) to assert the SQL carries the visibility rule, filters, sort and paging, and that rows are mapped correctly. Real-database behaviour is verified in Task 8.

**Files:**
- Create: `supplier-service/src/persistence/mysqlSupplierRepository.ts`
- Test: `supplier-service/src/persistence/mysqlSupplierRepository.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Tests for the MySQL read queries behind the Phase 1 endpoints, using a fake pool. They
 *        check the visibility rule (§7), search/filter/sort/paging (§7.2, §6.3) and row mapping. No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import type { Pool } from 'mysql2/promise';
import { describe, expect, it, vi } from 'vitest';
import { createMysqlSupplierRepository } from './mysqlSupplierRepository.js';

function fakePool(...results: unknown[][]) {
  const query = vi.fn();
  for (const rows of results) {
    query.mockResolvedValueOnce([rows, []]);
  }
  return { pool: { query } as unknown as Pool, query };
}

const baseFilter = { sortOrder: 'A-Z' as const, limit: 50, offset: 0 };

describe('findVisiblePage', () => {
  it('applies the visibility rule, orders A-Z with a stable tie-break, and pages', async () => {
    const { pool, query } = fakePool(
      [{ total: 125 }],
      [
        {
          supplier_id: 101,
          supplier_name: 'Campus Store',
          supplier_type: 'Store',
          supplier_desc: null,
          location: 'Central Library',
          faculty: 'Computing',
          level: 1,
        },
      ],
    );

    const result = await createMysqlSupplierRepository(pool).findVisiblePage({ ...baseFilter, offset: 100 });

    expect(result.total).toBe(125);
    expect(result.rows).toEqual([
      {
        supplierId: 101,
        name: 'Campus Store',
        type: 'Store',
        desc: null,
        location: 'Central Library',
        faculty: 'Computing',
        level: 1,
      },
    ]);

    const [countSql] = query.mock.calls[0] as [string, unknown[]];
    const [pageSql, pageParams] = query.mock.calls[1] as [string, unknown[]];
    for (const sql of [countSql, pageSql]) {
      expect(sql).toContain('s.is_deleted = FALSE');
      expect(sql).toContain('s.is_active = TRUE');
    }
    expect(pageSql).toContain('ORDER BY s.supplier_name ASC, s.supplier_id ASC');
    expect(pageSql).toContain('LIMIT ? OFFSET ?');
    expect(pageParams.slice(-2)).toEqual([50, 100]);
  });

  it('orders Z-A when requested', async () => {
    const { pool, query } = fakePool([{ total: 0 }], []);
    await createMysqlSupplierRepository(pool).findVisiblePage({ ...baseFilter, sortOrder: 'Z-A' });
    expect((query.mock.calls[1] as [string])[0]).toContain('ORDER BY s.supplier_name DESC, s.supplier_id ASC');
  });

  it('adds location and category filters as bound parameters', async () => {
    const { pool, query } = fakePool([{ total: 0 }], []);
    await createMysqlSupplierRepository(pool).findVisiblePage({ ...baseFilter, locationId: 4, categoryId: 2 });

    const [countSql, countParams] = query.mock.calls[0] as [string, unknown[]];
    expect(countSql).toContain('s.location_id = ?');
    expect(countSql).toContain('cm.category_id = ?');
    expect(countParams).toEqual([4, 2]);
  });

  it('searches name, location and category case-insensitively, never the description', async () => {
    const { pool, query } = fakePool([{ total: 0 }], []);
    await createMysqlSupplierRepository(pool).findVisiblePage({ ...baseFilter, search: 'StOrE' });

    const [countSql, countParams] = query.mock.calls[0] as [string, unknown[]];
    expect(countSql).toContain('LOWER(s.supplier_name) LIKE ?');
    expect(countSql).toContain('LOWER(l.location) LIKE ?');
    expect(countSql).toContain('LOWER(c.category_type) LIKE ?');
    expect(countSql).not.toContain('supplier_desc');
    expect(countParams).toEqual(['%store%', '%store%', '%store%']);
  });

  it('escapes LIKE wildcards in the search text', async () => {
    const { pool, query } = fakePool([{ total: 0 }], []);
    await createMysqlSupplierRepository(pool).findVisiblePage({ ...baseFilter, search: '50%_off\\' });
    const [, params] = query.mock.calls[0] as [string, string[]];
    expect(params[0]).toBe('%50\\%\\_off\\\\%');
  });
});

describe('findAllVisible', () => {
  it('applies the visibility rule and filters but no LIMIT', async () => {
    const { pool, query } = fakePool([
      {
        supplier_id: 5,
        supplier_name: 'Kiosk',
        supplier_type: 'Store',
        supplier_desc: null,
        location: 'Central Library',
        faculty: 'Computing',
        level: 1,
      },
    ]);

    const rows = await createMysqlSupplierRepository(pool).findAllVisible({
      sortOrder: 'Z-A',
      locationId: 4,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ supplierId: 5, name: 'Kiosk' });
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('s.is_deleted = FALSE');
    expect(sql).toContain('s.is_active = TRUE');
    expect(sql).toContain('ORDER BY s.supplier_name DESC, s.supplier_id ASC');
    expect(sql).not.toContain('LIMIT');
    expect(params).toEqual([4]);
  });
});

describe('findVisibleById', () => {
  it('returns the mapped row with the visibility rule applied', async () => {
    const { pool, query } = fakePool([
      {
        supplier_id: 7,
        supplier_name: 'Gym',
        supplier_type: 'Facility',
        supplier_desc: 'Open gym',
        location: 'Sports Hall',
        faculty: 'Sports',
        level: 2,
      },
    ]);

    const row = await createMysqlSupplierRepository(pool).findVisibleById(7);

    expect(row).toMatchObject({ supplierId: 7, name: 'Gym', desc: 'Open gym' });
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('s.is_deleted = FALSE');
    expect(sql).toContain('s.is_active = TRUE');
    expect(params).toEqual([7]);
  });

  it('returns null when no visible row matches', async () => {
    const { pool } = fakePool([]);
    expect(await createMysqlSupplierRepository(pool).findVisibleById(9)).toBeNull();
  });
});

describe('detail lookups', () => {
  it('skips the query entirely for an empty id list', async () => {
    const { pool, query } = fakePool();
    const repo = createMysqlSupplierRepository(pool);
    expect(await repo.findCategoryLinks([])).toEqual([]);
    expect(await repo.findHours([])).toEqual([]);
    expect(await repo.findPhotos([])).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('maps category links', async () => {
    const { pool } = fakePool([{ supplier_id: 1, category_type: 'Food' }]);
    expect(await createMysqlSupplierRepository(pool).findCategoryLinks([1])).toEqual([
      { supplierId: 1, category: 'Food' },
    ]);
  });

  it('trims TIME values to HH:MM', async () => {
    const { pool } = fakePool([{ supplier_id: 1, day_of_week: 1, open_time: '09:00:00', close_time: '18:30:00' }]);
    expect(await createMysqlSupplierRepository(pool).findHours([1])).toEqual([
      { supplierId: 1, dayOfWeek: 1, open: '09:00', close: '18:30' },
    ]);
  });

  it('maps photos in the order returned', async () => {
    const { pool, query } = fakePool([
      { supplier_id: 1, photo_id: 201, photo_location: 'https://x/1.png', display_order: 1 },
    ]);
    expect(await createMysqlSupplierRepository(pool).findPhotos([1])).toEqual([
      { supplierId: 1, photoId: 201, photoLocation: 'https://x/1.png', displayOrder: 1 },
    ]);
    expect((query.mock.calls[0] as [string])[0]).toContain('ORDER BY supplier_id, display_order');
  });
});

describe('reference lookups', () => {
  it('maps locations with their faculty', async () => {
    const { pool } = fakePool([{ location_id: 4, location: 'Central Library', faculty_id: 2, faculty: 'Computing' }]);
    expect(await createMysqlSupplierRepository(pool).listLocations()).toEqual([
      { locationId: 4, location: 'Central Library', facultyId: 2, faculty: 'Computing' },
    ]);
  });

  it('maps categories', async () => {
    const { pool } = fakePool([{ category_id: 2, category_type: 'Food' }]);
    expect(await createMysqlSupplierRepository(pool).listCategories()).toEqual([
      { categoryId: 2, category: 'Food' },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd supplier-service && npx vitest run src/persistence/mysqlSupplierRepository.test.ts`
Expected: FAIL — `./mysqlSupplierRepository.js` does not exist.

- [ ] **Step 3: Write `src/persistence/mysqlSupplierRepository.ts`**

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: MySQL implementation of the Phase 1 read operations over the schema in
 *        SupplierServiceArchitecture.md §6.4: visibility rule (§7), name/location/category search
 *        excluding supplier_desc (§6.3), location/category filters, A-Z/Z-A sort and fixed-size
 *        paging (§7.2). No requirements, architecture, schema, or API decisions were made by the AI
 *        tool.
 * Author review:
 */
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type {
  CategoryLinkRow,
  CategoryRow,
  HourRow,
  ListFilter,
  LocationRow,
  PhotoRow,
  SupplierRepository,
  SupplierRow,
} from './supplierRepository.js';

interface SupplierDbRow extends RowDataPacket {
  supplier_id: number;
  supplier_name: string;
  supplier_type: 'Store' | 'Facility';
  supplier_desc: string | null;
  location: string;
  faculty: string;
  level: number;
}

const SUPPLIER_COLUMNS = `
  s.supplier_id, s.supplier_name, s.supplier_type, s.supplier_desc,
  l.location, f.faculty, l.level`;

const SUPPLIER_FROM = `
  FROM supplier s
  JOIN supplier_locations l ON l.location_id = s.location_id
  JOIN faculties f ON f.faculty_id = l.faculty_id`;

const VISIBLE = 's.is_deleted = FALSE AND s.is_active = TRUE';

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function buildWhere(filter: Pick<ListFilter, 'search' | 'locationId' | 'categoryId'>): {
  where: string;
  params: Array<string | number>;
} {
  const conditions = [VISIBLE];
  const params: Array<string | number> = [];

  if (filter.locationId !== undefined) {
    conditions.push('s.location_id = ?');
    params.push(filter.locationId);
  }
  if (filter.categoryId !== undefined) {
    conditions.push(
      `EXISTS (SELECT 1 FROM supplier_category_map cm
               WHERE cm.supplier_id = s.supplier_id AND cm.category_id = ?)`,
    );
    params.push(filter.categoryId);
  }
  if (filter.search !== undefined && filter.search !== '') {
    const pattern = `%${escapeLike(filter.search.toLowerCase())}%`;
    conditions.push(
      `(LOWER(s.supplier_name) LIKE ?
        OR LOWER(l.location) LIKE ?
        OR EXISTS (SELECT 1 FROM supplier_category_map cm2
                   JOIN supplier_categories c ON c.category_id = cm2.category_id
                   WHERE cm2.supplier_id = s.supplier_id AND LOWER(c.category_type) LIKE ?))`,
    );
    params.push(pattern, pattern, pattern);
  }

  return { where: conditions.join(' AND '), params };
}

function toSupplierRow(row: SupplierDbRow): SupplierRow {
  return {
    supplierId: Number(row.supplier_id),
    name: row.supplier_name,
    type: row.supplier_type,
    desc: row.supplier_desc,
    location: row.location,
    faculty: row.faculty,
    level: Number(row.level),
  };
}

export function createMysqlSupplierRepository(pool: Pool): SupplierRepository {
  return {
    async findVisiblePage(filter) {
      const { where, params } = buildWhere(filter);
      const direction = filter.sortOrder === 'Z-A' ? 'DESC' : 'ASC';

      const countPromise = pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total ${SUPPLIER_FROM} WHERE ${where}`,
        params,
      );
      const pagePromise = pool.query<SupplierDbRow[]>(
        `SELECT ${SUPPLIER_COLUMNS} ${SUPPLIER_FROM} WHERE ${where}
         ORDER BY s.supplier_name ${direction}, s.supplier_id ASC
         LIMIT ? OFFSET ?`,
        [...params, filter.limit, filter.offset],
      );
      const [[countRows], [pageRows]] = await Promise.all([countPromise, pagePromise]);

      return {
        rows: pageRows.map(toSupplierRow),
        total: Number(countRows[0]?.total ?? 0),
      };
    },

    async findAllVisible(criteria) {
      const { where, params } = buildWhere(criteria);
      const direction = criteria.sortOrder === 'Z-A' ? 'DESC' : 'ASC';
      const [rows] = await pool.query<SupplierDbRow[]>(
        `SELECT ${SUPPLIER_COLUMNS} ${SUPPLIER_FROM} WHERE ${where}
         ORDER BY s.supplier_name ${direction}, s.supplier_id ASC`,
        params,
      );
      return rows.map(toSupplierRow);
    },

    async findVisibleById(supplierId) {
      const [rows] = await pool.query<SupplierDbRow[]>(
        `SELECT ${SUPPLIER_COLUMNS} ${SUPPLIER_FROM} WHERE ${VISIBLE} AND s.supplier_id = ?`,
        [supplierId],
      );
      const row = rows[0];
      return row === undefined ? null : toSupplierRow(row);
    },

    async findCategoryLinks(supplierIds): Promise<CategoryLinkRow[]> {
      if (supplierIds.length === 0) return [];
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT cm.supplier_id, c.category_type
         FROM supplier_category_map cm
         JOIN supplier_categories c ON c.category_id = cm.category_id
         WHERE cm.supplier_id IN (?)
         ORDER BY cm.supplier_id, c.category_type`,
        [supplierIds],
      );
      return rows.map((row) => ({
        supplierId: Number(row.supplier_id),
        category: String(row.category_type),
      }));
    },

    async findHours(supplierIds): Promise<HourRow[]> {
      if (supplierIds.length === 0) return [];
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT supplier_id, day_of_week, open_time, close_time
         FROM supplier_hours
         WHERE supplier_id IN (?)
         ORDER BY supplier_id, day_of_week`,
        [supplierIds],
      );
      return rows.map((row) => ({
        supplierId: Number(row.supplier_id),
        dayOfWeek: Number(row.day_of_week),
        open: String(row.open_time).slice(0, 5),
        close: String(row.close_time).slice(0, 5),
      }));
    },

    async findPhotos(supplierIds): Promise<PhotoRow[]> {
      if (supplierIds.length === 0) return [];
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT supplier_id, photo_id, photo_location, display_order
         FROM supplier_photos
         WHERE supplier_id IN (?)
         ORDER BY supplier_id, display_order`,
        [supplierIds],
      );
      return rows.map((row) => ({
        supplierId: Number(row.supplier_id),
        photoId: Number(row.photo_id),
        photoLocation: String(row.photo_location),
        displayOrder: Number(row.display_order),
      }));
    },

    async listLocations(): Promise<LocationRow[]> {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT l.location_id, l.location, l.faculty_id, f.faculty
         FROM supplier_locations l
         JOIN faculties f ON f.faculty_id = l.faculty_id
         ORDER BY f.faculty, l.location, l.level`,
      );
      return rows.map((row) => ({
        locationId: Number(row.location_id),
        location: String(row.location),
        facultyId: Number(row.faculty_id),
        faculty: String(row.faculty),
      }));
    },

    async listCategories(): Promise<CategoryRow[]> {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT category_id, category_type FROM supplier_categories ORDER BY category_type`,
      );
      return rows.map((row) => ({
        categoryId: Number(row.category_id),
        category: String(row.category_type),
      }));
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd supplier-service && npx vitest run src/persistence/mysqlSupplierRepository.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add supplier-service/src/persistence/mysqlSupplierRepository.ts supplier-service/src/persistence/mysqlSupplierRepository.test.ts
git commit -m "feat(supplier-service): add MySQL supplier read repository"
```

---

## Task 5: Business-layer service

Assembles summaries/details from repository rows, computes `isOpen`, applies the `isOpen` filter, and builds pagination metadata (§4, §7.2, §7.3). Depends only on `SupplierRepository` (§5). `clock` is injectable so tests fix the time (Mon 10:00 SGT = `2026-09-28T02:00:00Z`).

Two list paths (remaining point 2): without `isOpen`, paging happens in SQL (`findVisiblePage`); with `isOpen`, the service loads all matching rows (`findAllVisible`), computes `isOpen`, filters, then cuts the page. In both, a page past the last returns an empty `data` array with `200` (decision 3).

**Files:**
- Create: `supplier-service/src/business/supplierService.ts`
- Test: `supplier-service/src/business/supplierService.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Tests for the Phase 1 business workflows (list incl. the isOpen filter, detail, reference
 *        options) against an in-memory fake repository, per SupplierServiceArchitecture.md §4,
 *        §6.2, §7.2, §7.3. No requirements, architecture, schema, or API decisions were made by the
 *        AI tool.
 * Author review:
 */
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../utils/AppError.js';
import type { SupplierRepository, SupplierRow } from '../persistence/supplierRepository.js';
import { createSupplierService } from './supplierService.js';

const MONDAY_10AM_SGT = new Date('2026-09-28T02:00:00Z');

const store: SupplierRow = {
  supplierId: 1,
  name: 'Campus Store',
  type: 'Store',
  desc: 'A campus convenience store.',
  location: 'Central Library',
  faculty: 'Computing',
  level: 1,
};
const facility: SupplierRow = {
  supplierId: 2,
  name: 'Gym',
  type: 'Facility',
  desc: null,
  location: 'Sports Hall',
  faculty: 'Sports',
  level: 2,
};
const kiosk: SupplierRow = {
  supplierId: 3,
  name: 'Night Kiosk',
  type: 'Store',
  desc: null,
  location: 'Central Library',
  faculty: 'Computing',
  level: 1,
}; // no hours rows: never open

function fakeRepo(overrides: Partial<SupplierRepository> = {}): SupplierRepository {
  return {
    findVisiblePage: vi.fn().mockResolvedValue({ rows: [store, facility], total: 125 }),
    findAllVisible: vi.fn().mockResolvedValue([store, facility, kiosk]),
    findVisibleById: vi.fn().mockResolvedValue(store),
    findCategoryLinks: vi.fn().mockResolvedValue([
      { supplierId: 1, category: 'Drinks' },
      { supplierId: 1, category: 'Food' },
    ]),
    findHours: vi.fn().mockResolvedValue([
      { supplierId: 1, dayOfWeek: 2, open: '10:00', close: '12:00' },
      { supplierId: 1, dayOfWeek: 1, open: '09:00', close: '18:00' },
      { supplierId: 2, dayOfWeek: 1, open: '00:00', close: '23:59' },
    ]),
    findPhotos: vi.fn().mockResolvedValue([
      { supplierId: 1, photoId: 201, photoLocation: 'https://x/201.png', displayOrder: 1 },
    ]),
    listLocations: vi.fn().mockResolvedValue([]),
    listCategories: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

const service = (repo: SupplierRepository) => createSupplierService(repo, () => MONDAY_10AM_SGT);

describe('listSuppliers', () => {
  it('builds summaries with categories, photos and isOpen, without desc/openingHours', async () => {
    const result = await service(fakeRepo()).listSuppliers({ page: 1, sortOrder: 'A-Z' });

    expect(result.data[0]).toEqual({
      id: 1,
      name: 'Campus Store',
      type: 'Store',
      location: 'Central Library',
      faculty: 'Computing',
      level: 1,
      categories: ['Drinks', 'Food'],
      photos: [{ photoId: 201, photoLocation: 'https://x/201.png', displayOrder: 1 }],
      isOpen: true,
    });
    expect(result.data[1]).toMatchObject({ id: 2, categories: [], photos: [], isOpen: true });
    expect(result.data[0]).not.toHaveProperty('desc');
    expect(result.data[0]).not.toHaveProperty('openingHours');
  });

  it('builds pagination metadata with the fixed 50-entry limit', async () => {
    const result = await service(fakeRepo()).listSuppliers({ page: 1, sortOrder: 'A-Z' });
    expect(result.metadata).toEqual({ totalRecords: 125, currPage: 1, limit: 50, totalPages: 3 });
  });

  it('passes filters, sort and the page offset to the repository', async () => {
    const repo = fakeRepo();
    await service(repo).listSuppliers({
      page: 3,
      search: 'store',
      locationId: 4,
      categoryId: 2,
      sortOrder: 'Z-A',
    });
    expect(repo.findVisiblePage).toHaveBeenCalledWith({
      search: 'store',
      locationId: 4,
      categoryId: 2,
      sortOrder: 'Z-A',
      limit: 50,
      offset: 100,
    });
    expect(repo.findAllVisible).not.toHaveBeenCalled();
  });

  it('reports zero pages and no data when nothing matches', async () => {
    const repo = fakeRepo({ findVisiblePage: vi.fn().mockResolvedValue({ rows: [], total: 0 }) });
    const result = await service(repo).listSuppliers({ page: 1, sortOrder: 'A-Z' });
    expect(result).toEqual({
      metadata: { totalRecords: 0, currPage: 1, limit: 50, totalPages: 0 },
      data: [],
    });
  });

  it('returns empty data, not an error, for a page past the last page', async () => {
    const repo = fakeRepo({ findVisiblePage: vi.fn().mockResolvedValue({ rows: [], total: 125 }) });
    const result = await service(repo).listSuppliers({ page: 9, sortOrder: 'A-Z' });
    expect(result).toEqual({
      metadata: { totalRecords: 125, currPage: 9, limit: 50, totalPages: 3 },
      data: [],
    });
  });

  it('reports a Store as closed outside its hours', async () => {
    const evening = createSupplierService(fakeRepo(), () => new Date('2026-09-28T12:00:00Z')); // 20:00 SGT
    const result = await evening.listSuppliers({ page: 1, sortOrder: 'A-Z' });
    expect(result.data[0]?.isOpen).toBe(false);
    expect(result.data[1]?.isOpen).toBe(true); // Gym has a 00:00-23:59 Monday row
  });
});

describe('listSuppliers with the isOpen filter', () => {
  it('returns only currently open suppliers for isOpen=true', async () => {
    const repo = fakeRepo();
    const result = await service(repo).listSuppliers({ page: 1, sortOrder: 'A-Z', isOpen: true });

    expect(result.data.map((item) => item.id)).toEqual([1, 2]);
    expect(result.metadata).toEqual({ totalRecords: 2, currPage: 1, limit: 50, totalPages: 1 });
    expect(repo.findAllVisible).toHaveBeenCalledWith({
      search: undefined,
      locationId: undefined,
      categoryId: undefined,
      sortOrder: 'A-Z',
    });
    expect(repo.findVisiblePage).not.toHaveBeenCalled();
  });

  it('returns only currently closed suppliers for isOpen=false', async () => {
    const result = await service(fakeRepo()).listSuppliers({ page: 1, sortOrder: 'A-Z', isOpen: false });
    expect(result.data.map((item) => item.id)).toEqual([3]);
    expect(result.metadata.totalRecords).toBe(1);
  });

  it('cuts the page after filtering, and a page past the end is empty', async () => {
    const result = await service(fakeRepo()).listSuppliers({ page: 2, sortOrder: 'A-Z', isOpen: true });
    expect(result).toEqual({
      metadata: { totalRecords: 2, currPage: 2, limit: 50, totalPages: 1 },
      data: [],
    });
  });

  it('pages the filtered set 50 at a time', async () => {
    const many = Array.from({ length: 120 }, (_, i) => ({ ...facility, supplierId: 1000 + i }));
    const repo = fakeRepo({
      findAllVisible: vi.fn().mockResolvedValue(many),
      findHours: vi.fn().mockResolvedValue(
        many.map((row) => ({ supplierId: row.supplierId, dayOfWeek: 1, open: '00:00', close: '23:59' })),
      ),
    });
    const result = await service(repo).listSuppliers({ page: 3, sortOrder: 'A-Z', isOpen: true });
    expect(result.data).toHaveLength(20);
    expect(result.metadata).toEqual({ totalRecords: 120, currPage: 3, limit: 50, totalPages: 3 });
  });
});

describe('getSupplier', () => {
  it('returns the detail shape with desc and day-ordered openingHours', async () => {
    const detail = await service(fakeRepo()).getSupplier(1);
    expect(detail).toMatchObject({
      id: 1,
      desc: 'A campus convenience store.',
      isOpen: true,
      openingHours: [
        { day: 1, open: '09:00', close: '18:00' },
        { day: 2, open: '10:00', close: '12:00' },
      ],
    });
  });

  it('throws a 404 AppError when the supplier is missing or hidden', async () => {
    const repo = fakeRepo({ findVisibleById: vi.fn().mockResolvedValue(null) });
    await expect(service(repo).getSupplier(99)).rejects.toMatchObject({
      statusCode: 404,
      error: 'Not Found',
    });
    await expect(service(repo).getSupplier(99)).rejects.toBeInstanceOf(AppError);
  });
});

describe('reference options', () => {
  it('maps locations to the §7.3 snake_case contract', async () => {
    const repo = fakeRepo({
      listLocations: vi.fn().mockResolvedValue([
        { locationId: 4, location: 'Central Library', facultyId: 2, faculty: 'Computing' },
      ]),
    });
    expect(await service(repo).listLocations()).toEqual({
      locations: [{ location_id: 4, location: 'Central Library', faculty_id: 2, faculty: 'Computing' }],
    });
  });

  it('maps categories to the §7.3 contract, with category as the category value', async () => {
    const repo = fakeRepo({
      listCategories: vi.fn().mockResolvedValue([{ categoryId: 2, category: 'Food' }]),
    });
    expect(await service(repo).listCategories()).toEqual({
      categories: [{ category_id: 2, category: 'Food' }],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd supplier-service && npx vitest run src/business/supplierService.test.ts`
Expected: FAIL — `./supplierService.js` does not exist.

- [ ] **Step 3: Write `src/business/supplierService.ts`**

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Business-layer workflows for the Phase 1 read endpoints (SupplierServiceSpec.md Phase 1;
 *        SupplierServiceArchitecture.md §4, §6.2, §7.2, §7.3): assembles summary/detail responses
 *        from persistence rows, computes isOpen, applies the isOpen filter, and builds pagination
 *        metadata over the fixed 50-entry page. How the isOpen filter is paged (in memory, over all
 *        rows matching the other filters) is an implementation choice listed in the Phase 1 plan.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import type {
  CategoryLinkRow,
  HourRow,
  PhotoRow,
  SupplierRepository,
  SupplierRow,
} from '../persistence/supplierRepository.js';
import type {
  CategoryOption,
  LocationOption,
  PaginatedSuppliers,
  SupplierDetail,
  SupplierSummary,
} from '../types/supplier.js';
import { AppError } from '../utils/AppError.js';
import { computeIsOpen } from './isOpen.js';

const PAGE_SIZE = 50;

export interface ListParams {
  page: number;
  search?: string;
  locationId?: number;
  categoryId?: number;
  isOpen?: boolean;
  sortOrder: 'A-Z' | 'Z-A';
}

interface Assembled {
  summary: SupplierSummary;
  hours: HourRow[];
}

function envelope(page: number, total: number, data: SupplierSummary[]): PaginatedSuppliers {
  return {
    metadata: {
      totalRecords: total,
      currPage: page,
      limit: PAGE_SIZE,
      totalPages: Math.ceil(total / PAGE_SIZE),
    },
    data,
  };
}

export function createSupplierService(
  repo: SupplierRepository,
  clock: () => Date = () => new Date(),
) {
  async function assemble(rows: SupplierRow[]): Promise<Assembled[]> {
    if (rows.length === 0) return [];

    const ids = rows.map((row) => row.supplierId);
    const [categoryLinks, hours, photos]: [CategoryLinkRow[], HourRow[], PhotoRow[]] =
      await Promise.all([repo.findCategoryLinks(ids), repo.findHours(ids), repo.findPhotos(ids)]);
    const now = clock();

    return rows.map((row) => {
      const ownHours = hours.filter((hour) => hour.supplierId === row.supplierId);
      return {
        hours: ownHours,
        summary: {
          id: row.supplierId,
          name: row.name,
          type: row.type,
          location: row.location,
          faculty: row.faculty,
          level: row.level,
          categories: categoryLinks
            .filter((link) => link.supplierId === row.supplierId)
            .map((link) => link.category),
          photos: photos
            .filter((photo) => photo.supplierId === row.supplierId)
            .map((photo) => ({
              photoId: photo.photoId,
              photoLocation: photo.photoLocation,
              displayOrder: photo.displayOrder,
            })),
          isOpen: computeIsOpen(ownHours, now),
        },
      };
    });
  }

  return {
    async listSuppliers(params: ListParams): Promise<PaginatedSuppliers> {
      const criteria = {
        search: params.search,
        locationId: params.locationId,
        categoryId: params.categoryId,
        sortOrder: params.sortOrder,
      };
      const offset = (params.page - 1) * PAGE_SIZE;

      if (params.isOpen === undefined) {
        const { rows, total } = await repo.findVisiblePage({ ...criteria, limit: PAGE_SIZE, offset });
        const assembled = await assemble(rows);
        return envelope(params.page, total, assembled.map((item) => item.summary));
      }

      // isOpen is computed, not stored, so filter the whole matching set before cutting the page.
      const all = await assemble(await repo.findAllVisible(criteria));
      const matching = all
        .map((item) => item.summary)
        .filter((summary) => summary.isOpen === params.isOpen);
      return envelope(params.page, matching.length, matching.slice(offset, offset + PAGE_SIZE));
    },

    async getSupplier(supplierId: number): Promise<SupplierDetail> {
      const row = await repo.findVisibleById(supplierId);
      if (row === null) {
        throw new AppError(404, 'Not Found', 'Supplier not found.');
      }
      const [assembled] = await assemble([row]);
      if (assembled === undefined) {
        throw new AppError(404, 'Not Found', 'Supplier not found.');
      }

      return {
        ...assembled.summary,
        desc: row.desc,
        openingHours: assembled.hours
          .map((hour) => ({ day: hour.dayOfWeek, open: hour.open, close: hour.close }))
          .sort((a, b) => a.day - b.day),
      };
    },

    async listLocations(): Promise<{ locations: LocationOption[] }> {
      const rows = await repo.listLocations();
      return {
        locations: rows.map((row) => ({
          location_id: row.locationId,
          location: row.location,
          faculty_id: row.facultyId,
          faculty: row.faculty,
        })),
      };
    },

    async listCategories(): Promise<{ categories: CategoryOption[] }> {
      const rows = await repo.listCategories();
      return {
        categories: rows.map((row) => ({ category_id: row.categoryId, category: row.category })),
      };
    },
  };
}

export type SupplierService = ReturnType<typeof createSupplierService>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd supplier-service && npx vitest run src/business/supplierService.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add supplier-service/src/business/supplierService.ts supplier-service/src/business/supplierService.test.ts
git commit -m "feat(supplier-service): add supplier list/detail/reference business service"
```

---

## Task 6: Controller and router

**Files:**
- Create: `supplier-service/src/controllers/supplier.controller.ts`
- Create: `supplier-service/src/routes/supplier.routes.ts`
- Test: `supplier-service/src/routes/supplier.routes.test.ts`

The route test replaces `authenticate` with a stub that sets `req.user` from an `x-test-role` header, and uses a fake service, so it isolates routing, role guard, validation and error mapping.

- [ ] **Step 1: Write the failing test**

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Route-level tests for the four Phase 1 endpoints (SupplierServiceArchitecture.md §7 table,
 *        §7.1, §7.2): role acceptance, validation errors, 404 mapping, and static-before-:id route
 *        order. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { SupplierService } from '../business/supplierService.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { AppError } from '../utils/AppError.js';
import { createSupplierRouter } from './supplier.routes.js';

function fakeService(): { [K in keyof SupplierService]: ReturnType<typeof vi.fn> } {
  return {
    listSuppliers: vi.fn().mockResolvedValue({
      metadata: { totalRecords: 0, currPage: 1, limit: 50, totalPages: 0 },
      data: [],
    }),
    getSupplier: vi.fn().mockResolvedValue({ id: 101 }),
    listLocations: vi.fn().mockResolvedValue({ locations: [] }),
    listCategories: vi.fn().mockResolvedValue({ categories: [] }),
  };
}

function buildApp(service = fakeService()) {
  const app = express();
  app.use((req, _res, next) => {
    const role = req.headers['x-test-role'];
    if (typeof role === 'string') {
      req.user = { user_id: 'u-1', role };
    }
    next();
  });
  app.use('/api/v1/suppliers', createSupplierRouter(service as unknown as SupplierService));
  app.use(errorHandler);
  return { app, service };
}

describe.each(['user', 'admin', 'super admin'])('role %s', (role) => {
  it('may list suppliers', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/v1/suppliers').set('x-test-role', role);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/v1/suppliers', () => {
  it('passes parsed query values to the service', async () => {
    const { app, service } = buildApp();
    await request(app)
      .get('/api/v1/suppliers?page=2&search=store&location_id=4&category_id=2&isOpen=false&sortOrder=Z-A&limit=50')
      .set('x-test-role', 'user');
    expect(service.listSuppliers).toHaveBeenCalledWith({
      page: 2,
      search: 'store',
      locationId: 4,
      categoryId: 2,
      isOpen: false,
      sortOrder: 'Z-A',
    });
  });

  it('returns 422 for an isOpen value that is not true or false', async () => {
    const { app, service } = buildApp();
    const res = await request(app).get('/api/v1/suppliers?isOpen=maybe').set('x-test-role', 'user');
    expect(res.status).toBe(422);
    expect(res.body.details[0]).toMatchObject({ field: 'isOpen', location: 'query' });
    expect(service.listSuppliers).not.toHaveBeenCalled();
  });

  it('treats an empty search as no search', async () => {
    const { app, service } = buildApp();
    await request(app).get('/api/v1/suppliers?search=').set('x-test-role', 'user');
    expect(service.listSuppliers).toHaveBeenCalledWith(
      expect.objectContaining({ search: undefined }),
    );
  });

  it('returns 422 with the error envelope for invalid query values', async () => {
    const { app, service } = buildApp();
    const res = await request(app).get('/api/v1/suppliers?limit=51').set('x-test-role', 'user');
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ status_code: 422, error: 'Unprocessable Entity' });
    expect(res.body.details[0]).toMatchObject({ field: 'limit', location: 'query' });
    expect(service.listSuppliers).not.toHaveBeenCalled();
  });

  it('returns 403 for a role outside user/admin/super admin', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/v1/suppliers').set('x-test-role', 'guest');
    expect(res.status).toBe(403);
  });

  it('returns 403 when no identity is attached', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/v1/suppliers');
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/suppliers/:id', () => {
  it('returns the supplier detail', async () => {
    const { app, service } = buildApp();
    const res = await request(app).get('/api/v1/suppliers/101').set('x-test-role', 'user');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 101 });
    expect(service.getSupplier).toHaveBeenCalledWith(101);
  });

  it('returns 422 for a non-numeric id', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/v1/suppliers/abc').set('x-test-role', 'user');
    expect(res.status).toBe(422);
    expect(res.body.details[0]).toMatchObject({ field: 'id', location: 'path' });
  });

  it('maps a service 404 to the error envelope', async () => {
    const service = fakeService();
    service.getSupplier.mockRejectedValue(new AppError(404, 'Not Found', 'Supplier not found.'));
    const { app } = buildApp(service);
    const res = await request(app).get('/api/v1/suppliers/999').set('x-test-role', 'user');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ status_code: 404, error: 'Not Found' });
  });
});

describe('reference endpoints', () => {
  it('serves /reference/location before the :id route', async () => {
    const { app, service } = buildApp();
    const res = await request(app).get('/api/v1/suppliers/reference/location').set('x-test-role', 'user');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ locations: [] });
    expect(service.getSupplier).not.toHaveBeenCalled();
  });

  it('serves /reference/categories', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/v1/suppliers/reference/categories').set('x-test-role', 'user');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ categories: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd supplier-service && npx vitest run src/routes/supplier.routes.test.ts`
Expected: FAIL — `./supplier.routes.js` does not exist.

- [ ] **Step 3: Write `src/controllers/supplier.controller.ts`**

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: HTTP controller for the Phase 1 read endpoints (SupplierServiceArchitecture.md §3, §7):
 *        validates the request, calls the business service, returns 200 with its result. No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import type { SupplierService } from '../business/supplierService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { idParamSchema, listQuerySchema, parseOrThrow } from '../validation/supplierQuery.js';

export function createSupplierController(service: SupplierService) {
  return {
    list: asyncHandler(async (req, res) => {
      const query = parseOrThrow(listQuerySchema, req.query, 'query');
      const result = await service.listSuppliers({
        page: query.page,
        search: query.search === '' ? undefined : query.search,
        locationId: query.location_id,
        categoryId: query.category_id,
        isOpen: query.isOpen,
        sortOrder: query.sortOrder,
      });
      res.status(200).json(result);
    }),

    detail: asyncHandler(async (req, res) => {
      const { id } = parseOrThrow(idParamSchema, req.params, 'path');
      res.status(200).json(await service.getSupplier(id));
    }),

    locations: asyncHandler(async (_req, res) => {
      res.status(200).json(await service.listLocations());
    }),

    categories: asyncHandler(async (_req, res) => {
      res.status(200).json(await service.listCategories());
    }),
  };
}
```

- [ ] **Step 4: Write `src/routes/supplier.routes.ts`**

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Router for the four requester-mode read endpoints in SupplierServiceArchitecture.md §7,
 *        all open to user, admin and super admin. The static /reference/* routes are registered
 *        before /:id so they are not captured as ids. No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review:
 */
import { Router } from 'express';
import type { SupplierService } from '../business/supplierService.js';
import { createSupplierController } from '../controllers/supplier.controller.js';
import { requireRole } from '../middleware/requireRole.js';

export function createSupplierRouter(service: SupplierService): Router {
  const controller = createSupplierController(service);
  const router = Router();

  router.use(requireRole('user', 'admin', 'super admin'));

  router.get('/', controller.list);
  router.get('/reference/location', controller.locations);
  router.get('/reference/categories', controller.categories);
  router.get('/:id', controller.detail);

  return router;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd supplier-service && npx vitest run src/routes/supplier.routes.test.ts`
Expected: PASS (all tests, including the three `describe.each` role cases).

- [ ] **Step 6: Commit**

```bash
git add supplier-service/src/controllers/supplier.controller.ts supplier-service/src/routes/supplier.routes.ts supplier-service/src/routes/supplier.routes.test.ts
git commit -m "feat(supplier-service): add requester-mode supplier routes"
```

---

## Task 7: Mount in the app

**Files:**
- Modify: `supplier-service/src/app.ts` (Phase 0 file: imports at top, the `// Phase 1+ mounts supplier routes on \`apiV1\` here.` line)
- Modify: `supplier-service/src/app.integration.test.ts`

- [ ] **Step 1: Add the failing integration test** (inside the existing `describe`, alongside the Phase 0 tests)

```ts
  it('rejects an unauthenticated GET /api/v1/suppliers with 401', async () => {
    const res = await request(app).get('/api/v1/suppliers');
    expect(res.status).toBe(401);
    expect(res.body.status_code).toBe(401);
  });

  it('routes an authenticated user to the supplier list (empty database rows mocked out)', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ user_id: 'u-1', role: 'user' }), { status: 200 }),
    );
    const res = await request(app).get('/api/v1/suppliers?limit=51').set('Authorization', 'Bearer good-token');
    // limit=51 fails validation before any database access, so no MySQL is needed for this test.
    expect(res.status).toBe(422);
  });
```

- [ ] **Step 2: Run to verify the second test fails**

Run: `cd supplier-service && npx vitest run src/app.integration.test.ts`
Expected: the `401` test may already pass (Phase 0's `authenticate` covers all of `/api/v1`); the `422` test FAILS with `404` because `/suppliers` is not mounted yet.

- [ ] **Step 3: Edit `src/app.ts`** — add imports next to the existing ones:

```ts
import { createSupplierService } from './business/supplierService.js';
import { pool } from './db/pool.js';
import { createMysqlSupplierRepository } from './persistence/mysqlSupplierRepository.js';
import { createSupplierRouter } from './routes/supplier.routes.js';
```

replace the line `// Phase 1+ mounts supplier routes on \`apiV1\` here.` with:

```ts
apiV1.use(
  '/suppliers',
  createSupplierRouter(createSupplierService(createMysqlSupplierRepository(pool))),
);
// Phase 2+ mounts /admin routes on `apiV1` here.
```

and append to the file's existing `/* ... */` disclosure header (do not replace it; add these lines before the closing `*/`):

```ts
 * Scope (2026-09-29, Claude Code, model: claude-sonnet-5): mounted the Phase 1 /suppliers router on
 *        apiV1. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
```

Do the same for `src/app.integration.test.ts` (scope line: added Phase 1 route tests).

- [ ] **Step 4: Run to verify all pass**

Run: `cd supplier-service && npx vitest run`
Expected: every test file passes (Phase 0 files plus the new ones).

- [ ] **Step 5: Typecheck and lint**

Run: `cd supplier-service && npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add supplier-service/src/app.ts supplier-service/src/app.integration.test.ts
git commit -m "feat(supplier-service): mount requester-mode supplier routes under /api/v1"
```

---

## Task 8: Verify against a real MySQL

The fake-pool tests cannot prove the SQL is valid MySQL or that `is_open`/visibility behave end-to-end. This task is manual and **does not commit**; report the results honestly (AGENTS.md §2.3).

**Files:** none (a throwaway SQL file in the session scratchpad only).

- [ ] **Step 1: Start MySQL and apply the schema** (Phase 0 Task 3 Step 4: `docker run ... mysql:8`, `.env` pointing `DB_HOST` at `127.0.0.1`, then `npm run migrate`).

- [ ] **Step 2: Load throwaway test rows** (values chosen only to exercise the rules; not project data)

```sql
INSERT INTO faculties (faculty) VALUES ('Computing'), ('Sports');
INSERT INTO supplier_locations (location, faculty_id, level) VALUES ('Central Library', 1, 1), ('Sports Hall', 2, 2);
INSERT INTO supplier_categories (category_type) VALUES ('Food'), ('Drinks');
INSERT INTO supplier (supplier_name, supplier_type, supplier_desc, location_id, is_active, is_deleted, created_by) VALUES
  ('Campus Store', 'Store',    'Convenience store', 1, TRUE,  FALSE, 'seed'),
  ('Gym',          'Facility', NULL,                2, TRUE,  FALSE, 'seed'),
  ('Hidden Inactive', 'Store', NULL,                1, FALSE, FALSE, 'seed'),
  ('Hidden Deleted',  'Store', NULL,                1, TRUE,  TRUE,  'seed'),
  ('Night Kiosk',     'Store', NULL,                1, TRUE,  FALSE, 'seed');
INSERT INTO supplier_category_map VALUES (1, 1), (1, 2);
-- Campus Store (1) and Gym (2): 00:00-23:59 every day. Night Kiosk (5): no hours rows, so never open.
INSERT INTO supplier_hours (supplier_id, day_of_week, open_time, close_time)
  SELECT s, d, '00:00', '23:59'
  FROM (SELECT 1 s UNION SELECT 2) suppliers
  CROSS JOIN (SELECT 0 d UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) days;
```

- [ ] **Step 3: Call the endpoints** with a valid User Service token (start `user-service` and log in; `USER_SERVICE_URL` in `.env` must reach it):

```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3002/api/v1/suppliers?search=store&sortOrder=Z-A"
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3002/api/v1/suppliers/1"
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3002/api/v1/suppliers/3"
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3002/api/v1/suppliers/reference/location"
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3002/api/v1/suppliers/reference/categories"
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3002/api/v1/suppliers?isOpen=true"
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3002/api/v1/suppliers?isOpen=false"
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3002/api/v1/suppliers?page=9"
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3002/api/v1/suppliers?limit=20"
```

Expected:
- list returns `Campus Store` only for `search=store` (search is case-insensitive; `Hidden Inactive`/`Hidden Deleted` never appear even without `search`), with `categories: ["Drinks","Food"]`, `photos: []`, `isOpen: true`, and `metadata: { totalRecords: 1, currPage: 1, limit: 50, totalPages: 1 }`;
- `/suppliers/1` includes `desc` and seven `openingHours` entries;
- `/suppliers/3` (inactive) returns `404` with the error envelope;
- reference endpoints list both locations (with faculty) and both categories, the latter as `{ category_id, category }`;
- `isOpen=true` returns `Campus Store` and `Gym` (totalRecords 2); `isOpen=false` returns only `Night Kiosk` (totalRecords 1);
- `page=9` returns `200` with `data: []` and `currPage: 9`;
- `limit=20` returns `422` with `details[0].field = "limit"`.

- [ ] **Step 4: Check the search hits each field:** `?search=library` (location match) and `?search=drinks` (category match) both return `Campus Store`; `?search=convenience` (description only) returns nothing (§6.3).

---

## Task 9: AI-usage disclosure

**Files:**
- Modify: `ai/usage-log.md` (append at the true end after re-reading it)
- Modify: `README.md` (append one row to the "Log index" table)
- Modify: `supplier-service/README.md` (add an "API" section listing only the four endpoints)

- [ ] **Step 1: Append the implementation log entry** in the `AGENTS.md` §5.2 format: exact prompts given for the execution session(s), files created/modified (list all files in this plan, including any that cannot hold headers), the verification actually run in Tasks 2–8 with its true results, the team decisions the work implemented (cite `SupplierServiceArchitecture.md` §9 item 20), and any of the four remaining points still unresolved.

- [ ] **Step 2: Add the README log-index row**, title exactly as in the log entry, e.g.:

```markdown
| 2026-09-28 | supplier-service | Supplier Service: Phase 1 Supplier Read APIs | Requester-mode list, detail and reference endpoints with is_open and pagination |
```

- [ ] **Step 3: Add the API section to `supplier-service/README.md`** (with a matching header-scope line): the four routes, their accepted roles, and the query parameters exactly as in §7.2 — copied, not extended.

- [ ] **Step 4: Commit**

```bash
git add ai/usage-log.md README.md supplier-service/README.md
git commit -m "docs(supplier-service): log Phase 1 implementation and document read endpoints"
```

- [ ] **Step 5: Remind the team** that every new file's `Author review:` line, and the log entry's review fields, are for a human to complete after reading and testing the code.

---

## Self-review notes

- **Spec coverage (Phase 1 scope bullets):** persistence reads with location/faculty/category/hours/photo joins → Task 4; `GET /suppliers` with 50/page, search over name/location/category excluding `supplier_desc`, `location_id`/`category_id`/`isOpen` filters, `A-Z`/`Z-A` → Tasks 3, 4, 5, 6; `GET /suppliers/:id` with `desc` and `openingHours` → Tasks 5, 6; `is_open` (SGT, overnight, dedicated `00:00`–`23:59` check) → Task 2; both reference endpoints → Tasks 4–6; visibility rule → Task 4 (`VISIBLE`, asserted in tests) and Task 8. Acceptance criteria: F6.1.1/F6.1.2 and F7.2.1 → Tasks 4, 5, 8; F7.1.1 → Tasks 2, 5; F7.1.2 (search/filter by name, location, or open status) → Tasks 3–6 now that `isOpen` is an accepted parameter; F7.2.2 fallback is UI-layer per the spec (nullable `desc`, empty arrays). NFR7.1 fixed page size → Tasks 3, 5 (`PAGE_SIZE`).
- **Team decisions 1–8:** each maps to a task in the "Team decisions" table; decision 6 (equal open/close rejected) is a write-time rule with no Phase 1 endpoint, so it is carried by the architecture document and must be implemented and tested in Phase 2 (create) and Phase 3 (update) — the Phase 2/3 plans should cite §6.2 and §7.1.1.
- **Out of scope respected:** no admin fields, no photo upload, no writes, no new tables, no new dependencies, no CORS/health routes.
- **Placeholder scan:** none; every code step is complete. Task 9 Step 1 is a documentation instruction whose content depends on what actually happens at execution time.
- **Type consistency:** `SupplierRepository` methods (`findVisiblePage`, `findAllVisible`, `findVisibleById`, `findCategoryLinks`, `findHours`, `findPhotos`, `listLocations`, `listCategories`) and row types are used identically in Tasks 1, 4, 5. `ListCriteria` (Task 1) is what `buildWhere` (Task 4) and the service's `criteria` object (Task 5) satisfy. `ListParams` (Task 5, now with `isOpen`) matches the controller call (Task 6) and the route test's expected call. `computeIsOpen(hours, now)` has the same two-argument signature in Tasks 2 and 5. `SupplierService` type is exported in Task 5 and imported in Task 6. `HourRow` (persistence) is structurally compatible with `HourEntry` (Task 2).
- **Phase 0 conventions matched:** `pool` is a named export; TS headers are `/* */` blocks; `vitest.config.ts` supplies env, so plain `npx vitest run` works.
