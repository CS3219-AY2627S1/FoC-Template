/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope: Issue #11 - unit tests for the listing's filter registry, defaults, sorting,
 *        cursor handling and 400 cases (the Prisma query is asserted, not run).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): `failed` status - status=failed is rejected as INVALID_STATUS.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-22
 * Scope (2026-10-22): authz fix - listOrders takes the caller's id; non-open status filters
 *        add a requester-or-courier scope, open / default does not.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 */

import { ErrorCode } from '../constants/errors.js';
import type { PrismaClient } from '../db/prisma.js';
import type { OrderRequest } from '../generated/prisma/client.js';
import {
  encodeCursor,
  listOrders,
  PAGE_SIZE,
} from './order-listing.service.js';

const ID = '0192f0c4-0000-7000-8000-000000000001';
const CALLER = '0192f0c4-7a1e-7c3a-9b2d-3f4e5a6b7c8d';
const OWN = { OR: [{ requesterId: CALLER }, { courierId: CALLER }] };

function fake(rows: Partial<OrderRequest>[] = []) {
  const findMany = vi.fn(async () => rows as OrderRequest[]);
  return {
    prisma: { orderRequest: { findMany } } as unknown as PrismaClient,
    findMany,
  };
}

/** The `where.AND` list the listing built. */
async function whereFor(query: Record<string, unknown>) {
  const { prisma, findMany } = fake();
  const result = await listOrders(prisma, CALLER, query);
  expect(result.ok).toBe(true);
  return (
    findMany.mock.calls[0] as unknown as [{ where: { AND: unknown[] } }]
  )[0].where.AND;
}

async function errorsFor(query: Record<string, unknown>) {
  const { prisma, findMany } = fake();
  const result = await listOrders(prisma, CALLER, query);
  expect(findMany).not.toHaveBeenCalled();
  return result.ok ? [] : result.errors;
}

describe('listOrders: filter registry', () => {
  it('defaults to open orders when no status is given', async () => {
    expect(await whereFor({})).toEqual([{ status: 'open' }]);
  });

  it('maps each filter to its Prisma condition, AND-ed together', async () => {
    expect(
      await whereFor({
        status: 'accepted',
        location: '12',
        minCredits: '2',
        maxCredits: '5',
        expiresBefore: '2026-10-21T00:00:00.000Z',
        expiresAfter: '2026-10-20T00:00:00.000Z',
      }),
    ).toEqual([
      { status: 'accepted' },
      { deliveryLocationId: 12 },
      { credits: { gte: 2 } },
      { credits: { lte: 5 } },
      { completeBy: { lt: new Date('2026-10-21T00:00:00.000Z') } },
      {
        OR: [
          { completeBy: { gt: new Date('2026-10-20T00:00:00.000Z') } },
          { completeBy: null },
        ],
      },
      OWN,
    ]);
  });

  it('expiresAfter also matches orders with no complete-by (they never expire)', async () => {
    const [after, defaultStatus] = await whereFor({
      expiresAfter: '2026-10-20T00:00:00Z',
    });
    expect(defaultStatus).toEqual({ status: 'open' });
    expect(after).toEqual({
      OR: [
        { completeBy: { gt: new Date('2026-10-20T00:00:00Z') } },
        { completeBy: null },
      ],
    });
  });

  it.each([
    'open',
    'accepted',
    'picked_up',
    'delivered',
    'completed',
    'cancelled',
    'expired',
  ])('allows status=%s', async (status) => {
    expect(await whereFor({ status })).toEqual(
      status === 'open' ? [{ status }] : [{ status }, OWN],
    );
  });

  it('keeps the default and status=open listing public (no caller scope)', async () => {
    expect(await whereFor({})).not.toContainEqual(OWN);
    expect(await whereFor({ status: 'open' })).not.toContainEqual(OWN);
  });

  it.each([
    'accepted',
    'picked_up',
    'delivered',
    'completed',
    'cancelled',
    'expired',
  ])(
    'scopes status=%s to orders the caller requested or delivers',
    async (status) => {
      expect(await whereFor({ status, location: '12' })).toContainEqual(OWN);
    },
  );
});

describe('listOrders: 400 cases', () => {
  it.each([
    [
      'pending is hidden',
      { status: 'pending' },
      ErrorCode.INVALID_STATUS,
      'status',
    ],
    [
      'failed is not listable',
      { status: 'failed' },
      ErrorCode.INVALID_STATUS,
      'status',
    ],
    ['unknown status', { status: 'nope' }, ErrorCode.INVALID_STATUS, 'status'],
    [
      'unknown parameter',
      { colour: 'red' },
      ErrorCode.UNKNOWN_QUERY_PARAMETER,
      'colour',
    ],
    [
      'location not an id',
      { location: 'COM1' },
      ErrorCode.INVALID_QUERY_PARAMETER,
      'location',
    ],
    [
      'location zero',
      { location: '0' },
      ErrorCode.INVALID_QUERY_PARAMETER,
      'location',
    ],
    [
      'minCredits negative',
      { minCredits: '-1' },
      ErrorCode.INVALID_QUERY_PARAMETER,
      'minCredits',
    ],
    [
      'maxCredits fractional',
      { maxCredits: '1.5' },
      ErrorCode.INVALID_QUERY_PARAMETER,
      'maxCredits',
    ],
    [
      'min > max',
      { minCredits: '5', maxCredits: '2' },
      ErrorCode.INVALID_QUERY_PARAMETER,
      'maxCredits',
    ],
    [
      'expiresBefore not a date',
      { expiresBefore: 'soon' },
      ErrorCode.INVALID_QUERY_PARAMETER,
      'expiresBefore',
    ],
    [
      'repeated parameter',
      { status: ['open', 'accepted'] },
      ErrorCode.INVALID_QUERY_PARAMETER,
      'status',
    ],
    [
      'unknown sort field',
      { sort: 'description' },
      ErrorCode.INVALID_QUERY_PARAMETER,
      'sort',
    ],
    ['bad order', { order: 'up' }, ErrorCode.INVALID_QUERY_PARAMETER, 'order'],
    [
      'garbage cursor',
      { cursor: 'not-base64-json' },
      ErrorCode.INVALID_CURSOR,
      'cursor',
    ],
  ])('%s', async (_name, query, code, param) => {
    expect(await errorsFor(query)).toContainEqual({ code, param });
  });

  it('rejects a cursor issued for a different sort', async () => {
    const cursor = encodeCursor({ s: 'credits', o: 'asc', v: 4, id: ID });
    expect(await errorsFor({ cursor })).toEqual([
      { code: ErrorCode.INVALID_CURSOR, param: 'cursor' },
    ]);
  });

  it('reports every problem at once', async () => {
    expect(await errorsFor({ colour: 'red', minCredits: 'x' })).toHaveLength(2);
  });
});

describe('listOrders: sorting and paging', () => {
  it('sorts soonest-expiring first by default, no-deadline orders last, id as tie-breaker', async () => {
    const { prisma, findMany } = fake();
    await listOrders(prisma, CALLER, {});
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          { completeBy: { sort: 'asc', nulls: 'last' } },
          { id: 'asc' },
        ],
        take: PAGE_SIZE + 1,
      }),
    );
  });

  it.each([
    ['credits', 'desc', [{ credits: 'desc' }, { id: 'asc' }]],
    ['createdAt', 'asc', [{ createdAt: 'asc' }, { id: 'asc' }]],
    [
      'completeBy',
      'desc',
      [{ completeBy: { sort: 'desc', nulls: 'first' } }, { id: 'asc' }],
    ],
  ])('sort=%s&order=%s', async (sort, order, orderBy) => {
    const { prisma, findMany } = fake();
    await listOrders(prisma, CALLER, { sort, order });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy }));
  });

  it('returns no cursor when everything fits on one page', async () => {
    const { prisma } = fake([{ id: ID, credits: 1 }]);
    await expect(listOrders(prisma, CALLER, {})).resolves.toEqual({
      ok: true,
      orders: [{ id: ID, credits: 1 }],
      nextCursor: null,
    });
  });

  it('returns 50 rows and a cursor at the 50th when a 51st exists', async () => {
    const rows = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => ({
      id: `0192f0c4-0000-7000-8000-${String(i).padStart(12, '0')}`,
      credits: i,
      completeBy: null,
    }));
    const { prisma } = fake(rows);
    const result = await listOrders(prisma, CALLER, { sort: 'credits' });
    if (!result.ok) throw new Error('expected ok');

    expect(result.orders).toHaveLength(PAGE_SIZE);
    expect(result.nextCursor).toBe(
      encodeCursor({ s: 'credits', o: 'asc', v: 49, id: rows[49]!.id }),
    );
  });

  it('applies a cursor as "strictly after" the last row', async () => {
    const at = '2026-10-20T12:00:00.000Z';
    const cursor = encodeCursor({ s: 'completeBy', o: 'asc', v: at, id: ID });
    const where = await whereFor({ cursor });
    expect(where.at(-1)).toEqual({
      OR: [
        { completeBy: { gt: new Date(at) } },
        { completeBy: new Date(at), id: { gt: ID } },
        { completeBy: null },
      ],
    });
  });
});
