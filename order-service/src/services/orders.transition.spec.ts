/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-09-27
 * Scope: Unit tests for the team-authored transitionOrder (optimistic locking).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope (2026-10-20): Issue #4 - fake Prisma gained $transaction and outbox, since
 *        transitions now write any credit task in the same transaction.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 */

import { ErrorCode } from '../constants/errors.js';
import type { PrismaClient } from '../db/prisma.js';
import type { OrderRequest } from '../generated/prisma/client.js';
import { transitionOrder } from './orders.service.js';

const REQUESTER = '0192f0c4-0000-7000-8000-00000000000a';
const COURIER = '0192f0c4-0000-7000-8000-00000000000b';
const ORDER_ID = '0192f0c4-0000-7000-8000-000000000001';

function fakePrisma(
  current: Partial<OrderRequest> | null,
  { updatedRows = 1 } = {},
) {
  const row =
    current && ({ id: ORDER_ID, version: 3, ...current } as OrderRequest);
  const orderRequest = {
    findUnique: vi.fn(async () => row),
    updateMany: vi.fn(async () => ({ count: updatedRows })),
    findUniqueOrThrow: vi.fn(async () => ({ ...row, status: 'UPDATED' })),
  };
  const prisma: Record<string, unknown> = {
    orderRequest,
    outbox: { createMany: vi.fn(async () => ({ count: 1 })) },
  };
  prisma.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn(prisma),
  );
  return {
    prisma: prisma as unknown as PrismaClient,
    orderRequest,
  };
}

const openOrder = {
  status: 'open',
  requesterId: REQUESTER,
  courierId: null,
} as const;

describe('transitionOrder', () => {
  it('404s when the order does not exist', async () => {
    const { prisma, orderRequest } = fakePrisma(null);
    await expect(
      transitionOrder(prisma, ORDER_ID, 'accepted', COURIER),
    ).resolves.toEqual({ ok: false, error: ErrorCode.ORDER_NOT_FOUND });
    expect(orderRequest.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an edge that does not exist, without writing', async () => {
    const { prisma, orderRequest } = fakePrisma(openOrder);
    await expect(
      transitionOrder(prisma, ORDER_ID, 'delivered', COURIER),
    ).resolves.toEqual({ ok: false, error: ErrorCode.INVALID_TRANSITION });
    expect(orderRequest.updateMany).not.toHaveBeenCalled();
  });

  it('rejects the wrong actor, without writing', async () => {
    const { prisma, orderRequest } = fakePrisma(openOrder);
    await expect(
      transitionOrder(prisma, ORDER_ID, 'accepted', REQUESTER),
    ).resolves.toEqual({ ok: false, error: ErrorCode.FORBIDDEN });
    expect(orderRequest.updateMany).not.toHaveBeenCalled();
  });

  it('accept: writes only if the version is unchanged, sets courier + acceptedAt', async () => {
    const { prisma, orderRequest } = fakePrisma(openOrder);
    const result = await transitionOrder(prisma, ORDER_ID, 'accepted', COURIER);

    expect(orderRequest.updateMany).toHaveBeenCalledWith({
      where: { id: ORDER_ID, version: 3 },
      data: {
        status: 'accepted',
        version: { increment: 1 },
        courierId: COURIER,
        acceptedAt: expect.any(Date),
      },
    });
    expect(result).toMatchObject({ ok: true, order: { status: 'UPDATED' } });
  });

  it('deliver: sets deliveredAt and leaves courierId alone', async () => {
    const { prisma, orderRequest } = fakePrisma({
      status: 'picked_up',
      requesterId: REQUESTER,
      courierId: COURIER,
    });
    await transitionOrder(prisma, ORDER_ID, 'delivered', COURIER);

    expect(orderRequest.updateMany).toHaveBeenCalledWith({
      where: { id: ORDER_ID, version: 3 },
      data: {
        status: 'delivered',
        version: { increment: 1 },
        deliveredAt: expect.any(Date),
      },
    });
  });

  it('F17.2: refuses to cancel an ongoing request before complete-by, without writing', async () => {
    const { prisma, orderRequest } = fakePrisma({
      status: 'accepted',
      requesterId: REQUESTER,
      courierId: COURIER,
      completeBy: new Date('2026-09-27T14:00:00.000Z'),
    });
    await expect(
      transitionOrder(
        prisma,
        ORDER_ID,
        'cancelled',
        REQUESTER,
        new Date('2026-09-27T12:00:00.000Z'),
      ),
    ).resolves.toEqual({ ok: false, error: ErrorCode.DEADLINE_NOT_REACHED });
    expect(orderRequest.updateMany).not.toHaveBeenCalled();
  });

  it('returns ORDER_CONFLICT when someone else wrote first (0 rows updated)', async () => {
    const { prisma, orderRequest } = fakePrisma(openOrder, { updatedRows: 0 });
    await expect(
      transitionOrder(prisma, ORDER_ID, 'accepted', COURIER),
    ).resolves.toEqual({ ok: false, error: ErrorCode.ORDER_CONFLICT });
    expect(orderRequest.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
