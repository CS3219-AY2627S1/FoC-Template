/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope: Issue #11 - GET /orders listing per George's decisions (2026-10-19/20):
 *        a registry of filters, each mapped to a Prisma `where` builder (combinable,
 *        AND-ed); filters location (exact supplier location id), credits min/max and
 *        expiry before/after on completeBy, where no completeBy matches every
 *        expiresAfter; default status `open`; `pending` is not listable (invalid status);
 *        unknown parameters and invalid values are 400s; keyset (cursor) pagination,
 *        50 per page; sort soonest-expiring first by default, user-configurable.
 *        Parameter names, the sortable fields (completeBy | credits | createdAt), id as
 *        tie-breaker, nulls-last ordering and the opaque base64url cursor format are by
 *        convention and flagged for review.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): Issue #6 - listActiveDeliveries for F12.1.3 (courier's accepted /
 *        picked_up / delivered orders, from issue #6's scope).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): Frontend integration - listMyOrders for the caller's own orders
 *        (George, 2026-10-20: add an authenticated endpoint), as requester (default, all
 *        statuses including pending) or as courier, newest first. The `as` parameter and
 *        ordering are by convention.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): `failed` status - GET /orders?status=failed is rejected like pending
 *        (400 INVALID_STATUS), and GET /orders/mine leaves failed orders out (George,
 *        2026-10-20).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-22
 * Scope (2026-10-22): authz fix - listOrders takes the caller's id; a non-open `status`
 *        filter only returns the caller's own orders (as requester or courier), so other
 *        users' accepted / picked_up / completed rows are no longer listable (George,
 *        2026-10-22). The default and status=open listing stays public.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Tool: Codex (model: GPT-6), date: 2026-11-05
 * Scope: Implemented the team-specified admin user order listing contract from chat.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 e (instructions.md) - listMyOrders now also returns failed rows that have
 *        a failureReason (series outcomes); credit-reservation failures (failureReason null)
 *        stay hidden, per the stage's "Failed rows" table.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { ErrorCode } from '../constants/errors.js';
import type { PrismaClient } from '../db/prisma.js';
import {
  RequestStatus,
  type OrderRequest,
  type Prisma,
} from '../generated/prisma/client.js';
import { isPositiveInt, isUuid } from '../utils/validation.js';

export const PAGE_SIZE = 50;

export interface ListingProblem {
  code: ErrorCode;
  param: string;
}

export type ListOrdersResult =
  | { ok: true; orders: OrderRequest[]; nextCursor: string | null }
  | { ok: false; errors: ListingProblem[] };

type Where = Prisma.OrderRequestWhereInput;

// ---- filter registry ------------------------------------------------------------

interface FilterDef<T> {
  /** Parsed value, or undefined when the raw value is invalid. */
  parse(raw: string): T | undefined;
  where(value: T): Where;
  /** Error code for an invalid value (default INVALID_QUERY_PARAMETER). */
  invalid?: ErrorCode;
}

const filter = <T>(def: FilterDef<T>) => def;

/** Every status except `pending` (hidden until its credits are reserved) and `failed`
 *  (its reservation never went through); both are INVALID_STATUS. */
const UNLISTED_STATUSES: ReadonlySet<string> = new Set(['pending', 'failed']);
const LISTABLE_STATUSES: ReadonlySet<string> = new Set(
  Object.values(RequestStatus).filter((s) => !UNLISTED_STATUSES.has(s)),
);

const parseNonNegativeInt = (raw: string): number | undefined =>
  /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw))
    ? Number(raw)
    : undefined;

const parsePositiveId = (raw: string): number | undefined =>
  /^[1-9]\d*$/.test(raw) && isPositiveInt(Number(raw))
    ? Number(raw)
    : undefined;

const parseIsoDate = (raw: string): Date | undefined => {
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? undefined : new Date(ms);
};

export const FILTERS = {
  status: filter<RequestStatus>({
    parse: (raw) =>
      LISTABLE_STATUSES.has(raw) ? (raw as RequestStatus) : undefined,
    where: (status) => ({ status }),
    invalid: ErrorCode.INVALID_STATUS,
  }),
  location: filter<number>({
    parse: parsePositiveId,
    where: (deliveryLocationId) => ({ deliveryLocationId }),
  }),
  minCredits: filter<number>({
    parse: parseNonNegativeInt,
    where: (gte) => ({ credits: { gte } }),
  }),
  maxCredits: filter<number>({
    parse: parseNonNegativeInt,
    where: (lte) => ({ credits: { lte } }),
  }),
  expiresBefore: filter<Date>({
    parse: parseIsoDate,
    where: (lt) => ({ completeBy: { lt } }),
  }),
  expiresAfter: filter<Date>({
    parse: parseIsoDate,
    // No complete-by = never expires, so it outlasts any time.
    where: (gt) => ({ OR: [{ completeBy: { gt } }, { completeBy: null }] }),
  }),
};

type FilterName = keyof typeof FILTERS;

const DEFAULT_STATUS: RequestStatus = 'open';

// ---- sorting + keyset cursor ---------------------------------------------------

export const SORT_FIELDS = ['completeBy', 'credits', 'createdAt'] as const;
type SortField = (typeof SORT_FIELDS)[number];
type SortOrder = 'asc' | 'desc';
const DEFAULT_SORT: SortField = 'completeBy';
const DEFAULT_ORDER: SortOrder = 'asc';

const CONTROL_PARAMS = new Set(['sort', 'order', 'cursor']);

/** What the cursor remembers: the sort it was made for and the last row's position. */
interface Cursor {
  s: SortField;
  o: SortOrder;
  v: string | number | null; // last row's sort value (dates as ISO strings)
  id: string; // last row's id (tie-breaker)
}

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url');
}

function decodeCursor(raw: string): Cursor | undefined {
  try {
    const c = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    ) as Cursor;
    if (!SORT_FIELDS.includes(c?.s) || (c.o !== 'asc' && c.o !== 'desc'))
      return;
    if (!isUuid(c.id)) return;
    const validValue =
      c.s === 'credits'
        ? Number.isInteger(c.v)
        : c.s === 'completeBy'
          ? c.v === null ||
            (typeof c.v === 'string' && !Number.isNaN(Date.parse(c.v)))
          : typeof c.v === 'string' && !Number.isNaN(Date.parse(c.v));
    return validValue ? c : undefined;
  } catch {
    return undefined;
  }
}

function sortValueOf(order: OrderRequest, field: SortField): Cursor['v'] {
  const v = order[field];
  return v instanceof Date ? v.toISOString() : v;
}

/** `completeBy` nulls (no deadline) sort as "latest": last ascending, first descending. */
function orderByFor(field: SortField, order: SortOrder) {
  const primary =
    field === 'completeBy'
      ? {
          completeBy: {
            sort: order,
            nulls: order === 'asc' ? 'last' : 'first',
          },
        }
      : { [field]: order };
  return [
    primary,
    { id: 'asc' },
  ] as Prisma.OrderRequestOrderByWithRelationInput[];
}

/** Rows strictly after the cursor position, in the same ordering as orderByFor. */
function afterCursor({ s: field, o: order, v, id }: Cursor): Where {
  const pastId = { id: { gt: id } };
  const toValue = (x: string | number) =>
    field === 'credits' ? x : new Date(x);

  if (field === 'completeBy') {
    if (v === null) {
      return order === 'asc'
        ? { completeBy: null, ...pastId } // nulls are last: only later nulls remain
        : {
            OR: [
              { completeBy: null, ...pastId },
              { completeBy: { not: null } },
            ],
          };
    }
    const at = new Date(v as string);
    const rest: Where[] = [
      { completeBy: order === 'asc' ? { gt: at } : { lt: at } },
      { completeBy: at, ...pastId },
    ];
    if (order === 'asc') rest.push({ completeBy: null }); // nulls follow every date
    return { OR: rest };
  }

  const value = toValue(v as string | number);
  const beyond = order === 'asc' ? { gt: value } : { lt: value };
  return { OR: [{ [field]: beyond }, { [field]: value, ...pastId }] };
}

// ---- entry point ------------------------------------------------------------------

/** Only orders `userId` is part of, as requester or courier. */
const involving = (userId: string): Where => ({
  OR: [{ requesterId: userId }, { courierId: userId }],
});

/**
 * `query` is Express's parsed query string: values may be strings or arrays.
 * Open orders are public; any other status is scoped to `callerId`'s own orders.
 */
export async function listOrders(
  prisma: PrismaClient,
  callerId: string,
  query: Record<string, unknown>,
): Promise<ListOrdersResult> {
  const errors: ListingProblem[] = [];
  const where: Where[] = [];
  const raw = (name: string): string | undefined => {
    const value = query[name];
    if (value === undefined) return undefined;
    if (typeof value !== 'string') {
      // Repeated (?a=1&a=2) or nested parameters are not supported.
      errors.push({ code: ErrorCode.INVALID_QUERY_PARAMETER, param: name });
      return undefined;
    }
    return value;
  };

  for (const name of Object.keys(query)) {
    if (!(name in FILTERS) && !CONTROL_PARAMS.has(name)) {
      errors.push({ code: ErrorCode.UNKNOWN_QUERY_PARAMETER, param: name });
    }
  }

  const parsed: Partial<Record<FilterName, unknown>> = {};
  for (const name of Object.keys(FILTERS) as FilterName[]) {
    const value = raw(name);
    if (value === undefined) continue;
    const def = FILTERS[name] as FilterDef<unknown>;
    const v = def.parse(value);
    if (v === undefined) {
      errors.push({
        code: def.invalid ?? ErrorCode.INVALID_QUERY_PARAMETER,
        param: name,
      });
      continue;
    }
    parsed[name] = v;
    where.push(def.where(v));
  }
  if (
    parsed.status === undefined &&
    !errors.some((e) => e.param === 'status')
  ) {
    where.push(FILTERS.status.where(DEFAULT_STATUS));
  }
  // Only the open marketplace is public; past it, rows carry other users' ids.
  if (parsed.status !== undefined && parsed.status !== 'open') {
    where.push(involving(callerId));
  }
  if (
    typeof parsed.minCredits === 'number' &&
    typeof parsed.maxCredits === 'number' &&
    parsed.minCredits > parsed.maxCredits
  ) {
    errors.push({
      code: ErrorCode.INVALID_QUERY_PARAMETER,
      param: 'maxCredits',
    });
  }

  const sortRaw = raw('sort') ?? DEFAULT_SORT;
  const orderRaw = raw('order') ?? DEFAULT_ORDER;
  const sort = SORT_FIELDS.find((f) => f === sortRaw);
  const order =
    orderRaw === 'asc' || orderRaw === 'desc' ? orderRaw : undefined;
  if (!sort)
    errors.push({ code: ErrorCode.INVALID_QUERY_PARAMETER, param: 'sort' });
  if (!order)
    errors.push({ code: ErrorCode.INVALID_QUERY_PARAMETER, param: 'order' });

  const cursorRaw = raw('cursor');
  let cursor: Cursor | undefined;
  if (cursorRaw !== undefined) {
    cursor = decodeCursor(cursorRaw);
    // A cursor only makes sense for the ordering it was issued under.
    if (!cursor || cursor.s !== sort || cursor.o !== order) {
      errors.push({ code: ErrorCode.INVALID_CURSOR, param: 'cursor' });
    }
  }

  if (errors.length || !sort || !order) return { ok: false, errors };

  if (cursor) where.push(afterCursor(cursor));

  // One extra row tells us whether another page exists.
  const rows = await prisma.orderRequest.findMany({
    where: { AND: where },
    orderBy: orderByFor(sort, order),
    take: PAGE_SIZE + 1,
  });
  const orders = rows.slice(0, PAGE_SIZE);
  const last = orders.at(-1);
  const nextCursor =
    rows.length > PAGE_SIZE && last
      ? encodeCursor({
          s: sort,
          o: order,
          v: sortValueOf(last, sort),
          id: last.id,
        })
      : null;

  return { ok: true, orders, nextCursor };
}

/** F12.1.3: orders the courier has accepted and not yet finished, soonest-expiring first. */
export function listActiveDeliveries(
  prisma: PrismaClient,
  courierId: string,
): Promise<OrderRequest[]> {
  return prisma.orderRequest.findMany({
    where: {
      courierId,
      status: { in: ['accepted', 'picked_up', 'delivered'] },
    },
    orderBy: orderByFor('completeBy', 'asc'),
  });
}

export type MyOrdersRole = 'requester' | 'courier';

/** The caller's own orders in every status, newest first (Activity page tabs). */
export function listMyOrders(
  prisma: PrismaClient,
  userId: string,
  as: MyOrdersRole,
): Promise<OrderRequest[]> {
  return prisma.orderRequest.findMany({
    where: {
      ...(as === 'courier' ? { courierId: userId } : { requesterId: userId }),
      // Credit-reservation failures (failureReason null) stay hidden; series-caused
      // failures (failureReason set) are shown (instructions.md Stage 28e).
      OR: [
        { status: { not: 'failed' } },
        { status: 'failed', failureReason: { not: null } },
      ],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });
}

// AI-generated
export const ADMIN_USER_ORDERS_PAGE_SIZE = 10;

/** Admin history includes every status and both participation roles. */
export async function listAdminUserOrders(
  prisma: PrismaClient,
  userId: string,
  currentPage: number,
) {
  const where = involving(userId);
  const [totalCount, rows] = await Promise.all([
    prisma.orderRequest.count({ where }),
    prisma.orderRequest.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (currentPage - 1) * ADMIN_USER_ORDERS_PAGE_SIZE,
      take: ADMIN_USER_ORDERS_PAGE_SIZE,
    }),
  ]);
  return {
    totalCount,
    currentPage,
    pageSize: ADMIN_USER_ORDERS_PAGE_SIZE,
    totalPages: Math.ceil(totalCount / ADMIN_USER_ORDERS_PAGE_SIZE),
    orders: rows.map((order) => ({
      order,
      role: order.requesterId === userId ? 'requester' : 'courier',
    })),
  };
}
