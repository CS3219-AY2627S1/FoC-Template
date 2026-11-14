/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 e (instructions.md) - HTTP-level tests for the /orders/series routes:
 *        status-code mapping (201/200/403/404/409/401), route order (series not captured by
 *        GET /:id), and ownership. Mirrors orders.controller.spec.ts's createApp + supertest
 *        style. No requirements, architecture, schema, or API decisions were made by the
 *        AI tool.
 * Author review:
 */

import request from 'supertest';
import type { RequestHandler } from 'express';
import { createApp } from '../app.js';
import { bearer } from '../../test/helpers/tokens.js';
import type { PrismaClient } from '../db/prisma.js';
import { createStubSuppliersClient } from '../clients/suppliers.client.js';

const REQUESTER = '0192f0c4-0000-7000-8000-00000000000a';
const OTHER_USER = '0192f0c4-0000-7000-8000-00000000000b';
const SERIES_ID = '0192f0c4-0000-7000-8000-000000000001';
const NOW = new Date('2026-11-09T01:00:00.000Z');

const CREATE_BODY = {
  supplierId: 1,
  description: '1x chicken rice',
  deliveryLocationId: 12,
  deliveryDetails: 'Nil',
  credits: 4,
  rrule: 'FREQ=DAILY;INTERVAL=1',
  startAt: NOW.toISOString(),
};

function baseSeriesRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SERIES_ID,
    requesterId: REQUESTER,
    supplierId: 1,
    description: '1x chicken rice',
    deliveryLocationId: 12,
    deliveryDetails: 'Nil',
    credits: 4,
    durationMinutes: 1440,
    additionalDetails: null,
    rrule: 'FREQ=DAILY;INTERVAL=1',
    startAt: NOW,
    nextFireAt: new Date('2026-11-10T01:00:00.000Z'),
    status: 'active',
    currentOccurrenceAt: null,
    retryType: null,
    attemptCount: null,
    nextRetryAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    version: 0,
    ...overrides,
  };
}

function appWith(
  orderSeriesOverrides: Partial<{
    findUnique: (args: { where: { id: string } }) => Promise<object | null>;
    updateMany: (args: object) => Promise<{ count: number }>;
    delete: (args: object) => Promise<object>;
  }> = {},
) {
  const outbox = { createMany: vi.fn(async () => ({ count: 1 })) };
  const orderRequest = {
    create: vi.fn(async ({ data }: { data: object }) => ({ id: 'order-1', version: 0, ...data })),
    count: vi.fn(async () => 0),
  };
  const prisma = {
    outbox,
    orderRequest,
    orderSeries: {
      create: async ({ data }: { data: object }) => ({
        id: SERIES_ID,
        createdAt: NOW,
        updatedAt: NOW,
        version: 0,
        currentOccurrenceAt: null,
        retryType: null,
        attemptCount: null,
        nextRetryAt: null,
        ...data,
      }),
      findUnique: async () => baseSeriesRow(),
      findMany: async () => [baseSeriesRow()],
      updateMany: async () => ({ count: 1 }),
      findUniqueOrThrow: async () => baseSeriesRow(),
      delete: async () => baseSeriesRow(),
      ...orderSeriesOverrides,
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  } as unknown as PrismaClient;
  const authenticate: RequestHandler = (req, res, next) => {
    const auth = req.get('authorization');
    const userId = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length) : undefined;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }
    req.user = { user_id: userId, role: 'user' };
    next();
  };
  return createApp({ prisma, authenticate, suppliers: createStubSuppliersClient() });
}

describe('POST /orders/series', () => {
  it('201 with the created series', async () => {
    const res = await request(appWith())
      .post('/orders/series')
      .set('authorization', bearer(REQUESTER))
      .send(CREATE_BODY)
      .expect(201);
    expect(res.body).toMatchObject({ id: SERIES_ID, status: 'active' });
  });

  it('401 with no bearer token', async () => {
    await request(appWith())
      .post('/orders/series')
      .send(CREATE_BODY)
      .expect(401);
  });

  it('400 MISSING_START_TIME when neither startAt nor startNow is sent', async () => {
    const { startAt: _startAt, ...body } = CREATE_BODY;
    await request(appWith())
      .post('/orders/series')
      .set('authorization', bearer(REQUESTER))
      .send(body)
      .expect(400);
  });
});

describe('GET /orders/series/mine', () => {
  it('200 with the owner-scoped series, registered before /orders/:id', async () => {
    const res = await request(appWith())
      .get('/orders/series/mine')
      .set('authorization', bearer(REQUESTER))
      .expect(200);
    expect(res.body).toEqual({ ok: true, series: expect.any(Array) });
  });
});

describe('GET /orders/series/:seriesId', () => {
  it('200 for the owner', async () => {
    const res = await request(appWith())
      .get(`/orders/series/${SERIES_ID}`)
      .set('authorization', bearer(REQUESTER))
      .expect(200);
    expect(res.body.id).toBe(SERIES_ID);
  });

  it('403 for a non-owner', async () => {
    await request(appWith())
      .get(`/orders/series/${SERIES_ID}`)
      .set('authorization', bearer(OTHER_USER))
      .expect(403);
  });

  it('404 SERIES_NOT_FOUND when the row does not exist', async () => {
    await request(appWith({ findUnique: async () => null }))
      .get(`/orders/series/${SERIES_ID}`)
      .set('authorization', bearer(REQUESTER))
      .expect(404);
  });
});

describe('PATCH /orders/series/:seriesId/edit', () => {
  it('200 with the updated series', async () => {
    const res = await request(appWith())
      .patch(`/orders/series/${SERIES_ID}/edit`)
      .set('authorization', bearer(REQUESTER))
      .send({ credits: 9 })
      .expect(200);
    expect(res.body.id).toBe(SERIES_ID);
  });

  it('409 SERIES_CONFLICT on a lost optimistic lock', async () => {
    await request(appWith({ updateMany: async () => ({ count: 0 }) }))
      .patch(`/orders/series/${SERIES_ID}/edit`)
      .set('authorization', bearer(REQUESTER))
      .send({ credits: 9 })
      .expect(409);
  });

  it('403 for a non-owner', async () => {
    await request(appWith())
      .patch(`/orders/series/${SERIES_ID}/edit`)
      .set('authorization', bearer(OTHER_USER))
      .send({ credits: 9 })
      .expect(403);
  });
});

describe('DELETE /orders/series/:seriesId', () => {
  it('200 { ok: true }', async () => {
    await request(appWith())
      .delete(`/orders/series/${SERIES_ID}`)
      .set('authorization', bearer(REQUESTER))
      .expect(200, { ok: true });
  });

  it('403 for a non-owner', async () => {
    await request(appWith())
      .delete(`/orders/series/${SERIES_ID}`)
      .set('authorization', bearer(OTHER_USER))
      .expect(403);
  });
});
