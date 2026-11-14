/*
 * AI Assistance Disclosure:
 * Scope (2026-11-10, Codex, model: GPT-6): Updated acceptance notification assertions for the existing actor field.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Updated test fixtures for precise delivery details.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-09-27
 * Scope: HTTP-level tests for POST /orders status codes.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-09-29): Added HTTP-level tests for GET /orders results, filters, and failures.
 * Author review: tng wen xi
 * Scope (2026-10-13): Updated create-order response expectations for generated
 *        order and reservation identifiers.
 * Author review: tng wen xi
 * Scope (2026-10-04): Updated GET /orders HTTP expectations and test doubles to
 *        match the service result contract and controller failure responses.
 * Author review: tng wen xi
 * Scope (2026-10-07): Added POST /orders/:id transition controller coverage for
 *        successful pickup, forbidden actors, and invalid transitions.
 * Author review: tng wen xi
 * Scope (2026-10-08): Added F17 HTTP coverage for requester cancellation of
 *        open and deadline-reached requests and cancellation failures.
 * Author review: tng wen xi
 * Scope (2026-10-12): Added HTTP coverage for unsupported edit-order fields.
 * Author review: tng wen xi
 * Scope (2026-10-12): Updated create-order fixtures for additional-details
 *        validation and added successful, forbidden, and conflict edit-order
 *        HTTP coverage.
 * Author review: tng wen xi
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope (2026-10-20): Issue #6 - requests carry a bearer token (a stub stands in for
 *        Wen Xi's JWKS middleware, which covers all of /orders including the listing);
 *        GET /orders/active coverage.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): Frontend integration - GET /orders/mine coverage.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): Issue #11 - GET /orders coverage for the new listing (default
 *        filter + ordering, 400s); body uses deliveryLocationId.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): Issue #5 - POST /orders/:id/accept HTTP coverage: 200 with the
 *        courier assigned; 403 self-accept; 409 for expired, cancelled, pending, already
 *        assigned, and lost optimistic-lock race.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): Issue #4 - POST /orders now answers 202 with a `pending` order and
 *        an outbox reserve task (no credit call in the request path); dropped the
 *        422/503 credit cases that moved to the worker; fakes gained $transaction/outbox.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): `failed` status - GET /orders/mine leaves failed orders out.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): F18.1.1 - edit returns 409 ORDER_NOT_EDITABLE unless the request is
 *        open; edit fixtures carry status `open`.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-22
 * Scope (2026-10-22): 404 coverage for a missing order and for a non-UUID :id on the
 *        transition and edit routes; the unsupported-field edit test uses a UUID :id.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Scope (2026-10-22): GET /orders/:id coverage (requester / courier / admin / other user
 *        by status, 404s, literal /mine and /active not captured); the auth stub takes an
 *        optional x-role header (default 'user') for the admin cases.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Scope (2026-10-22): authz fix - GET /orders?status=<non-open> is scoped to the caller's
 *        own orders; the default listing is not.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-23
 * Scope (2026-10-23): appWith injects a supplier-service client (stub: everything exists);
 *        HTTP coverage for 422 SUPPLIER_NOT_FOUND / DELIVERY_LOCATION_NOT_FOUND and 503
 *        SUPPLIER_SERVICE_UNAVAILABLE on create and edit, and the caller's token forwarded.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Scope (2026-11-08, Codex, model: GPT-6): Tested status notification HTTP calls and username fallback.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Included courier participant task in acceptance assertions.
 * Author review: tng wen xi
 * Scope (2026-11-09, Claude Code, model: claude-sonnet-5): Added the two new SuppliersClient
 *        worker-only stub methods to the `answering` fake client, per Stage 28 c2's interface
 *        change; no test logic changed. No requirements, architecture, schema, or API decisions
 *        were made by the AI tool.
 * Author review:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-09
 * Scope (2026-11-09): POST /orders reserves synchronously - 201 with the open order,
 *        409 while a pending order exists, 422 / 503 for a refused / unreachable reserve
 *        (George, 2026-11-09). appWith takes a credits client and keeps the created order
 *        in memory for the settle.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 e (instructions.md) - updated the GET /orders/mine where-clause assertion
 *        for the listMyOrders change (failed rows with a failureReason are now included).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import request from 'supertest';
import type { RequestHandler } from 'express';
import { createApp } from '../app.js';
import { bearer } from '../../test/helpers/tokens.js';
import type { PrismaClient } from '../db/prisma.js';
import {
  createStubCreditsClient,
  type CreditCallResult,
  type CreditsClient,
} from '../clients/credits.client.js';
import {
  createStubSuppliersClient,
  type Existence,
  type SuppliersClient,
} from '../clients/suppliers.client.js';

const USER = '0192f0c4-7a1e-7c3a-9b2d-3f4e5a6b7c8d';
const body = {
  supplierId: 1,
  description: '1x chicken rice',
  deliveryLocationId: 12,
  deliveryDetails: 'Nil',
  credits: 4,
  additionalDetails: null,
};

function appWith(
  findMany: (args: {
    where?: { status: string };
  }) => Promise<object[]> = async () => [],
  orderRequestOverrides: Partial<{
    create: (args: { data: object }) => Promise<object>;
    findUnique: (args: { where: { id: string } }) => Promise<object | null>;
    updateMany: (args: {
      where: { id: string; version: number };
      data: object;
    }) => Promise<{ count: number }>;
    findUniqueOrThrow: (args: { where: { id: string } }) => Promise<object>;
    findFirst: () => Promise<object | null>;
  }> = {},
  suppliers: SuppliersClient = createStubSuppliersClient(),
  credits: CreditsClient = createStubCreditsClient(),
) {
  const outbox = { createMany: vi.fn(async () => ({ count: 1 })) };
  // The order POST /orders creates, so the synchronous settle can read and update it.
  let created: Record<string, unknown> | null = null;
  const isCreated = (id: string) => created !== null && created.id === id;
  const prisma = {
    outbox,
    // Interactive transactions run the callback against the same fake client.
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
    $executeRaw: async () => 1,
    orderRequest: {
      create: async ({ data }: { data: object }) => {
        created = { id: 'new', version: 0, ...data };
        return created;
      },
      findMany,
      findFirst: async () => null,
      findUnique: async ({ where }: { where: { id: string } }) =>
        isCreated(where.id) ? created : null,
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { status?: string };
      }) => {
        if (isCreated(where.id)) created = { ...created, status: data.status };
        return { count: 1 };
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) =>
        isCreated(where.id) ? created : { id: 'order-1', status: 'picked_up' },
      ...orderRequestOverrides,
    },
  } as unknown as PrismaClient;
  // Stands in for Wen Xi's JWKS middleware: the bearer token is the user id itself
  // (x-user-id is accepted too); no identity -> 401 as the real middleware answers.
  const authenticate: RequestHandler = (req, res, next) => {
    const auth = req.get('authorization');
    const userId = auth?.startsWith('Bearer ')
      ? auth.slice('Bearer '.length)
      : req.get('x-user-id');
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }
    req.user = { user_id: userId, role: req.get('x-role') ?? 'user' };
    next();
  };
  return Object.assign(
    createApp({ prisma, authenticate, suppliers, credits }),
    {
      outbox,
    },
  );
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('POST /orders', () => {
  /** credit-service answering every reserve with `result`, plus its reserve mock. */
  const creditsAnswering = (result: CreditCallResult) => {
    const reserve = vi.fn(async () => result);
    const client: CreditsClient = {
      reserve,
      release: vi.fn(async (): Promise<CreditCallResult> => ({ ok: true })),
    };
    return { client, reserve };
  };

  it('201 with the open order once credits are reserved in the request', async () => {
    const { client, reserve } = creditsAnswering({ ok: true });
    const res = await request(appWith(undefined, {}, undefined, client))
      .post('/orders')
      .set('authorization', bearer(USER))
      .send(body)
      .expect(201);
    expect(res.body).toMatchObject({ id: 'new', credits: 4, status: 'open' });
    expect(reserve).toHaveBeenCalledWith({
      requestId: 'new',
      userId: USER,
      amount: 4,
    });
  });

  it('409 while the requester has a pending order', async () => {
    const { client, reserve } = creditsAnswering({ ok: true });
    await request(
      appWith(
        undefined,
        { findFirst: async () => ({ id: 'pending-1' }) },
        undefined,
        client,
      ),
    )
      .post('/orders')
      .set('authorization', bearer(USER))
      .send(body)
      .expect(409, {
        message:
          'Another order request is currently pending, please try again.',
      });
    expect(reserve).not.toHaveBeenCalled();
  });

  it.each([
    [
      'insufficient credits',
      {
        ok: false,
        kind: 'permanent',
        status: 422,
        code: 'INSUFFICIENT_UNRESERVED_CREDITS',
      },
      422,
      'You do not have enough credits for this request.',
    ],
    [
      'another refusal',
      { ok: false, kind: 'permanent', status: 400, code: 'VALIDATION_ERROR' },
      422,
      'Your credits could not be reserved. Please try again.',
    ],
    [
      'credit-service unreachable',
      { ok: false, kind: 'transient', code: 'ECONNREFUSED' },
      503,
      'Credits could not be reserved right now. Please try again.',
    ],
  ] as const)(
    '%s -> %i, answered immediately',
    async (_name, result, status, message) => {
      const { client, reserve } = creditsAnswering(result);
      await request(appWith(undefined, {}, undefined, client))
        .post('/orders')
        .set('authorization', bearer(USER))
        .send(body)
        .expect(status, { message });
      expect(reserve).toHaveBeenCalledTimes(1);
    },
  );

  it('400 when complete-by is in the past', async () => {
    await request(appWith())
      .post('/orders')
      .set('authorization', bearer(USER))
      .send({ ...body, completeBy: '2000-01-01T00:00:00.000Z' })
      .expect(400, { message: 'Complete-by time must be in the future.' });
  });
});

describe('PATCH /orders/:id/edit', () => {
  const orderId = '0192f0c4-0000-7000-8000-000000000001';
  const requesterId = '0192f0c4-0000-7000-8000-00000000000a';

  it('200 with the updated order when the requester edits it', async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const updatedOrder = {
      id: orderId,
      requesterId,
      status: 'open',
      description: 'Updated description',
      version: 4,
    };
    const res = await request(
      appWith(async () => [], {
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValueOnce({
            ...updatedOrder,
            version: 3,
          })
          .mockResolvedValueOnce(updatedOrder),
        updateMany,
      }),
    )
      .patch(`/orders/${orderId}/edit`)
      .set('authorization', bearer(requesterId))
      .send({ description: 'Updated description', deliveryDetails: 'Nil' })
      .expect(200);

    expect(res.body).toEqual(updatedOrder);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: orderId, version: 3, status: 'open' },
      data: {
        description: 'Updated description',
        deliveryDetails: 'Nil',
        version: { increment: 1 },
      },
    });
  });

  it('403 when a non-requester edits the order', async () => {
    await request(
      appWith(async () => [], {
        findUniqueOrThrow: async () => ({
          id: orderId,
          requesterId: USER,
          version: 3,
        }),
      }),
    )
      .patch(`/orders/${orderId}/edit`)
      .set('authorization', bearer(requesterId))
      .send({ description: 'Updated description', deliveryDetails: 'Nil' })
      .expect(403, {
        message: 'You are not allowed to perform this action.',
      });
  });

  it('409 ORDER_NOT_EDITABLE when the order is no longer open (F18.1.1)', async () => {
    await request(
      appWith(async () => [], {
        findUniqueOrThrow: async () => ({
          id: orderId,
          requesterId,
          status: 'accepted',
          version: 3,
        }),
      }),
    )
      .patch(`/orders/${orderId}/edit`)
      .set('authorization', bearer(requesterId))
      .send({ description: 'Updated description', deliveryDetails: 'Nil' })
      .expect(409, { message: 'Only open requests can be edited.' });
  });

  it('409 when the order changed before the edit was saved', async () => {
    await request(
      appWith(async () => [], {
        findUniqueOrThrow: async () => ({
          id: orderId,
          requesterId,
          status: 'open',
          version: 3,
        }),
        updateMany: async () => ({ count: 0 }),
      }),
    )
      .patch(`/orders/${orderId}/edit`)
      .set('authorization', bearer(requesterId))
      .send({ description: 'Updated description', deliveryDetails: 'Nil' })
      .expect(409, {
        message:
          'This order was changed by someone else. Refresh and try again.',
      });
  });

  it('returns a user-facing validation message for unsupported fields', async () => {
    await request(appWith())
      .patch(`/orders/${orderId}/edit`)
      .set('authorization', bearer(USER))
      .send({ unsupported: true, deliveryDetails: 'Nil' })
      .expect(400, {
        message: 'Payload contains an unsupported field.',
      });
  });
});

describe('GET /orders', () => {
  const orders = [
    { id: 'open-1', status: 'open', deliveryLocationId: 12, credits: 4 },
  ];

  it('200 with { ok, orders, nextCursor }', async () => {
    const findMany = vi.fn(async () => orders);
    const res = await request(appWith(findMany))
      .get('/orders')
      .set('authorization', bearer(USER))
      .expect(200);

    expect(res.body).toEqual({
      ok: true,
      orders: [
        { id: 'open-1', status: 'open', deliveryLocationId: 12, credits: 4 },
      ],
      nextCursor: null,
    });
  });

  it('defaults to open orders, soonest-expiring first, 51 rows to detect a next page', async () => {
    const findMany = vi.fn(async () => []);
    await request(appWith(findMany))
      .get('/orders')
      .set('authorization', bearer(USER))
      .expect(200);

    expect(findMany).toHaveBeenCalledWith({
      where: { AND: [{ status: 'open' }] },
      orderBy: [{ completeBy: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
      take: 51,
    });
  });

  it.each([
    [{ status: 'pending' }, 'Status provided is invalid. (status)'],
    [{ status: 'nope' }, 'Status provided is invalid. (status)'],
    [{ colour: 'red' }, 'Unknown query parameter. (colour)'],
    [{ minCredits: '-1' }, 'Invalid query parameter value. (minCredits)'],
    [
      { cursor: 'garbage' },
      'The page cursor is invalid or was issued for a different sort. (cursor)',
    ],
  ])('400 for %o without querying the database', async (query, message) => {
    const findMany = vi.fn(async () => []);
    await request(appWith(findMany))
      .get('/orders')
      .set('authorization', bearer(USER))
      .query(query)
      .expect(400, { message });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('500 when the database fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const findMany = vi.fn(async () => {
      throw new Error('db down');
    });
    await request(appWith(findMany))
      .get('/orders')
      .set('authorization', bearer(USER))
      .expect(500, { message: 'Internal server error.' });
  });
});

describe('GET /orders/mine', () => {
  const me = '0192f0c4-0000-7000-8000-00000000000a';

  it.each([
    [{}, { requesterId: me }],
    [{ as: 'requester' }, { requesterId: me }],
    [{ as: 'courier' }, { courierId: me }],
  ])(
    '%o -> where %o, credit-reservation failures left out (series failures included), newest first',
    async (query, where) => {
      const findMany = vi.fn(async () => []);
      await request(appWith(findMany))
        .get('/orders/mine')
        .query(query)
        .set('authorization', bearer(me))
        .expect(200, { ok: true, orders: [] });
      expect(findMany).toHaveBeenCalledWith({
        where: {
          ...where,
          OR: [
            { status: { not: 'failed' } },
            { status: 'failed', failureReason: { not: null } },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      });
    },
  );

  it.each([
    [{ as: 'admin' }, 'Invalid query parameter value. (as)'],
    [{ status: 'open' }, 'Unknown query parameter. (status)'],
  ])('400 for %o', async (query, message) => {
    await request(appWith())
      .get('/orders/mine')
      .query(query)
      .set('authorization', bearer(me))
      .expect(400, { message });
  });

  it('401 without a token', async () => {
    await request(appWith()).get('/orders/mine').expect(401);
  });
});

describe('GET /orders/active (F12.1.3)', () => {
  const courierId = '0192f0c4-0000-7000-8000-00000000000b';

  it("returns the caller's accepted, picked-up and delivered orders", async () => {
    const findMany = vi.fn(async () => [{ id: 'o-1', status: 'accepted' }]);
    const res = await request(appWith(findMany))
      .get('/orders/active')
      .set('authorization', bearer(courierId))
      .expect(200);

    expect(res.body).toEqual({
      ok: true,
      orders: [{ id: 'o-1', status: 'accepted' }],
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          courierId,
          status: { in: ['accepted', 'picked_up', 'delivered'] },
        },
      }),
    );
  });

  it('401 without a token', async () => {
    await request(appWith()).get('/orders/active').expect(401);
  });
});

describe('POST /orders/:id/accept', () => {
  const orderId = '0192f0c4-0000-7000-8000-000000000001';
  const requesterId = '0192f0c4-0000-7000-8000-00000000000a';
  const courierId = '0192f0c4-0000-7000-8000-00000000000b';
  const otherCourier = '0192f0c4-0000-7000-8000-00000000000c';

  const openOrder = {
    id: orderId,
    status: 'open',
    requesterId,
    courierId: null,
    completeBy: null,
    version: 1,
  };

  function acceptApp(current: object, updatedRows = 1) {
    const updateMany = vi.fn(async () => ({ count: updatedRows }));
    const app = appWith(async () => [], {
      findUnique: async () => current,
      updateMany,
      findUniqueOrThrow: async () => ({
        ...current,
        status: 'accepted',
        courierId,
        version: 2,
      }),
    });
    return { app, updateMany };
  }

  it('200: assigns the accepting user as courier (F12.1.1, F12.1.4)', async () => {
    const { app, updateMany } = acceptApp(openOrder);
    const res = await request(app)
      .post(`/orders/${orderId}/accept`)
      .set('authorization', bearer(courierId))
      .expect(200);

    expect(res.body).toMatchObject({
      ok: true,
      order: { id: orderId, status: 'accepted', courierId },
    });
    // F12.2.1: conditional on the version read, with the server's clock.
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: orderId, version: 1 },
      data: {
        status: 'accepted',
        version: { increment: 1 },
        courierId,
        acceptedAt: expect.any(Date),
      },
    });
  });

  it('403 when the requester accepts their own order (F11.2.1)', async () => {
    const { app, updateMany } = acceptApp(openOrder);
    await request(app)
      .post(`/orders/${orderId}/accept`)
      .set('authorization', bearer(requesterId))
      .expect(403);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('409 when the order is past its complete-by (F11.2.2)', async () => {
    const { app, updateMany } = acceptApp({
      ...openOrder,
      completeBy: new Date('2000-01-01T00:00:00.000Z'),
    });
    const res = await request(app)
      .post(`/orders/${orderId}/accept`)
      .set('authorization', bearer(courierId))
      .expect(409);
    expect(res.body).toMatchObject({ ok: false, error: 'ORDER_EXPIRED' });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['expired', { status: 'expired' }],
    ['cancelled', { status: 'cancelled' }],
    ['still pending its credit reservation', { status: 'pending' }],
    [
      'already assigned (F11.2.3)',
      { status: 'accepted', courierId: otherCourier },
    ],
  ])('409 when the order is %s', async (_name, override) => {
    const { app, updateMany } = acceptApp({ ...openOrder, ...override });
    const res = await request(app)
      .post(`/orders/${orderId}/accept`)
      .set('authorization', bearer(courierId))
      .expect(409);
    expect(res.body).toMatchObject({ ok: false, error: 'INVALID_TRANSITION' });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('409 to the loser of a concurrent accept (F12.2.1)', async () => {
    const { app } = acceptApp(openOrder, 0);
    const res = await request(app)
      .post(`/orders/${orderId}/accept`)
      .set('authorization', bearer(courierId))
      .expect(409);
    expect(res.body).toMatchObject({ ok: false, error: 'ORDER_CONFLICT' });
  });

  it('401 when the authenticated identity is not a user id', async () => {
    const { app } = acceptApp(openOrder);
    await request(app)
      .post(`/orders/${orderId}/accept`)
      .set('x-user-id', 'not-a-uuid') // the test authenticate stub copies this to req.user
      .expect(401);
  });
});

describe('POST /orders/:id/pickup', () => {
  const orderId = '0192f0c4-0000-7000-8000-000000000001';
  const requesterId = '0192f0c4-0000-7000-8000-00000000000a';
  const courierId = '0192f0c4-0000-7000-8000-00000000000b';

  it('200 when the courier is allowed to pick up the order', async () => {
    const res = await request(
      appWith(async () => [], {
        findUnique: async () => ({
          id: orderId,
          status: 'accepted',
          requesterId,
          courierId,
          version: 3,
        }),
        updateMany: async () => ({ count: 1 }),
        findUniqueOrThrow: async () => ({
          id: orderId,
          status: 'picked_up',
          requesterId,
          courierId,
          version: 4,
        }),
      }),
    )
      .post(`/orders/${orderId}/pickup`)
      .set('authorization', bearer(courierId))
      .expect(200);

    expect(res.body).toMatchObject({
      ok: true,
      order: { id: orderId, status: 'picked_up', courierId },
    });
  });

  it('403 when the actor is not allowed to pick up the order', async () => {
    await request(
      appWith(async () => [], {
        findUnique: async () => ({
          id: orderId,
          status: 'accepted',
          requesterId,
          courierId,
          version: 3,
        }),
      }),
    )
      .post(`/orders/${orderId}/pickup`)
      .set('authorization', bearer(requesterId))
      .expect(403, { ok: false, error: 'FORBIDDEN' });
  });

  it('409 when the requested transition is not valid from the current status', async () => {
    await request(
      appWith(async () => [], {
        findUnique: async () => ({
          id: orderId,
          status: 'open',
          requesterId,
          courierId: null,
          version: 3,
        }),
      }),
    )
      .post(`/orders/${orderId}/deliver`)
      .set('authorization', bearer(courierId))
      .expect(409, { ok: false, error: 'INVALID_TRANSITION' });
  });
});

describe('POST /orders/:id/cancel', () => {
  const orderId = '0192f0c4-0000-7000-8000-000000000001';
  const requesterId = '0192f0c4-0000-7000-8000-00000000000a';
  const courierId = '0192f0c4-0000-7000-8000-00000000000b';

  it('200 when the requester cancels an open order', async () => {
    const res = await request(
      appWith(async () => [], {
        findUnique: async () => ({
          id: orderId,
          status: 'open',
          requesterId,
          courierId: null,
          version: 3,
        }),
        updateMany: async () => ({ count: 1 }),
        findUniqueOrThrow: async () => ({
          id: orderId,
          status: 'cancelled',
          requesterId,
          courierId: null,
          version: 4,
        }),
      }),
    )
      .post(`/orders/${orderId}/cancel`)
      .set('authorization', bearer(requesterId))
      .expect(200);

    expect(res.body).toMatchObject({
      ok: true,
      order: { id: orderId, status: 'cancelled' },
    });
  });

  it('200 when the requester cancels an ongoing order after complete-by', async () => {
    const res = await request(
      appWith(async () => [], {
        findUnique: async () => ({
          id: orderId,
          status: 'accepted',
          requesterId,
          courierId,
          completeBy: new Date('2000-01-01T00:00:00.000Z'),
          version: 3,
        }),
        updateMany: async () => ({ count: 1 }),
        findUniqueOrThrow: async () => ({
          id: orderId,
          status: 'cancelled',
          requesterId,
          courierId,
          version: 4,
        }),
      }),
    )
      .post(`/orders/${orderId}/cancel`)
      .set('authorization', bearer(requesterId))
      .expect(200);

    expect(res.body).toMatchObject({
      ok: true,
      order: { status: 'cancelled' },
    });
  });

  it('400 when an ongoing order has not reached complete-by', async () => {
    await request(
      appWith(async () => [], {
        findUnique: async () => ({
          id: orderId,
          status: 'accepted',
          requesterId,
          courierId,
          completeBy: new Date('2099-01-01T00:00:00.000Z'),
          version: 3,
        }),
      }),
    )
      .post(`/orders/${orderId}/cancel`)
      .set('authorization', bearer(requesterId))
      .expect(400, { ok: false, error: 'DEADLINE_NOT_REACHED' });
  });

  it('403 when a courier tries to cancel an order', async () => {
    await request(
      appWith(async () => [], {
        findUnique: async () => ({
          id: orderId,
          status: 'accepted',
          requesterId,
          courierId,
          completeBy: new Date('2000-01-01T00:00:00.000Z'),
          version: 3,
        }),
      }),
    )
      .post(`/orders/${orderId}/cancel`)
      .set('authorization', bearer(courierId))
      .expect(403, { ok: false, error: 'FORBIDDEN' });
  });
});

describe('404 ORDER_NOT_FOUND on /orders/:id routes', () => {
  const userId = '0192f0c4-0000-7000-8000-00000000000b';

  it('404 when the order does not exist', async () => {
    const res = await request(appWith())
      .post('/orders/0192f0c4-0000-7000-8000-0000000000ff/accept')
      .set('authorization', bearer(userId))
      .expect(404);
    expect(res.body).toMatchObject({ ok: false, error: 'ORDER_NOT_FOUND' });
  });

  it.each(['accept', 'pickup', 'deliver', 'complete', 'cancel'])(
    '404 for a non-UUID :id on POST /orders/:id/%s, without querying the database',
    async (action) => {
      const findUnique = vi.fn(async () => null);
      await request(appWith(async () => [], { findUnique }))
        .post(`/orders/not-a-uuid/${action}`)
        .set('authorization', bearer(userId))
        .expect(404);
      expect(findUnique).not.toHaveBeenCalled();
    },
  );

  it('404 for a non-UUID :id on PATCH /orders/:id/edit', async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    await request(appWith(async () => [], { updateMany }))
      .patch('/orders/123/edit')
      .set('authorization', bearer(userId))
      .send({ description: 'x' })
      .expect(404);
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe('GET /orders/:id', () => {
  const REQUESTER = USER;
  const COURIER = '0192f0c4-7a1e-7c3a-9b2d-3f4e5a6b7c8e';
  const OTHER = '0192f0c4-7a1e-7c3a-9b2d-3f4e5a6b7c8f';
  const ORDER_ID = '0192f0c4-0000-7000-8000-000000000001';
  const order = (status: string) => ({
    id: ORDER_ID,
    requesterId: REQUESTER,
    courierId: status === 'open' || status === 'pending' ? null : COURIER,
    status,
    credits: 4,
  });
  const appFor = (status: string | null) =>
    appWith(async () => [], {
      findUnique: async () => (status ? order(status) : null),
    });

  it.each(['pending', 'open', 'accepted', 'delivered', 'cancelled', 'failed'])(
    '200 for the requester on a %s order',
    async (status) => {
      const res = await request(appFor(status))
        .get(`/orders/${ORDER_ID}`)
        .set('authorization', bearer(REQUESTER))
        .expect(200);
      expect(res.body).toMatchObject({ id: ORDER_ID, status });
    },
  );

  it.each(['accepted', 'picked_up', 'completed'])(
    '200 for the courier on a %s order',
    async (status) => {
      await request(appFor(status))
        .get(`/orders/${ORDER_ID}`)
        .set('authorization', bearer(COURIER))
        .expect(200);
    },
  );

  it('200 for another user while the order is open', async () => {
    const res = await request(appFor('open'))
      .get(`/orders/${ORDER_ID}`)
      .set('authorization', bearer(OTHER))
      .expect(200);
    expect(res.body).toMatchObject({ id: ORDER_ID, status: 'open' });
  });

  it.each([
    'pending',
    'accepted',
    'picked_up',
    'completed',
    'expired',
    'failed',
  ])(
    '404 for another user on a %s order, as if it did not exist',
    async (status) => {
      const res = await request(appFor(status))
        .get(`/orders/${ORDER_ID}`)
        .set('authorization', bearer(OTHER))
        .expect(404);
      expect(res.body).toEqual({ message: 'Order not found.' });
    },
  );

  it.each(['admin', 'super admin'])(
    '200 for %s on an order they are not part of',
    async (role) => {
      await request(appFor('accepted'))
        .get(`/orders/${ORDER_ID}`)
        .set('authorization', bearer(OTHER))
        .set('x-role', role)
        .expect(200);
    },
  );

  it('404 when the order does not exist', async () => {
    await request(appFor(null))
      .get(`/orders/${ORDER_ID}`)
      .set('authorization', bearer(REQUESTER))
      .expect(404);
  });

  it('404 for a non-UUID :id without querying the database', async () => {
    const findUnique = vi.fn(async () => null);
    await request(appWith(async () => [], { findUnique }))
      .get('/orders/not-a-uuid')
      .set('authorization', bearer(REQUESTER))
      .expect(404);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('401 without a token', async () => {
    await request(appFor('open')).get(`/orders/${ORDER_ID}`).expect(401);
  });

  it('does not capture /orders/mine or /orders/active as ids', async () => {
    const findUnique = vi.fn(async () => null);
    const app = appWith(async () => [], { findUnique });
    await request(app)
      .get('/orders/mine')
      .set('authorization', bearer(REQUESTER))
      .expect(200);
    await request(app)
      .get('/orders/active')
      .set('authorization', bearer(REQUESTER))
      .expect(200);
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe('GET /orders: non-open statuses are scoped to the caller', () => {
  it.each(['accepted', 'picked_up', 'completed'])(
    '?status=%s only queries orders the caller requested or delivers',
    async (status) => {
      const findMany = vi.fn(async () => []);
      await request(appWith(findMany))
        .get(`/orders?status=${status}`)
        .set('authorization', bearer(USER))
        .expect(200);
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              { status },
              { OR: [{ requesterId: USER }, { courierId: USER }] },
            ],
          },
        }),
      );
    },
  );

  it('the open listing is not scoped', async () => {
    const findMany = vi.fn(async () => []);
    await request(appWith(findMany))
      .get('/orders?status=open')
      .set('authorization', bearer(USER))
      .expect(200);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { AND: [{ status: 'open' }] } }),
    );
  });
});

describe('supplier-service existence check over HTTP', () => {
  const ORDER_ID = '0192f0c4-0000-7000-8000-000000000001';
  const answering = (supplier: Existence, location: Existence) => ({
    supplierExists: vi.fn(async () => supplier),
    locationExists: vi.fn(async () => location),
    supplierStatusForWorker: vi.fn(async () => ({
      existence: supplier,
      hasNoOpeningHours: false,
      closed: false,
      nextOpeningAt: null,
    })),
    locationExistsForWorker: vi.fn(async () => location),
  });
  const openOrder = {
    findUniqueOrThrow: async () => ({
      id: ORDER_ID,
      requesterId: USER,
      status: 'open',
      version: 0,
    }),
  };

  it('forwards the caller token and answers 201 when both ids exist', async () => {
    const suppliers = answering('found', 'found');
    await request(appWith(undefined, {}, suppliers))
      .post('/orders')
      .set('authorization', bearer(USER))
      .send(body)
      .expect(201);
    expect(suppliers.supplierExists).toHaveBeenCalledWith(1, bearer(USER));
    expect(suppliers.locationExists).toHaveBeenCalledWith(12, bearer(USER));
  });

  it.each([
    [
      'not_found',
      'found',
      422,
      'That supplier does not exist or is unavailable.',
    ],
    ['found', 'not_found', 422, 'That delivery location does not exist.'],
    [
      'unavailable',
      'found',
      503,
      'Supplier details could not be checked right now. Please try again.',
    ],
  ] as const)(
    'POST /orders: supplier %s, location %s -> %i',
    async (supplier, location, status, message) => {
      const app = appWith(undefined, {}, answering(supplier, location));
      const res = await request(app)
        .post('/orders')
        .set('authorization', bearer(USER))
        .send(body)
        .expect(status);
      expect(res.body).toEqual({ message });
      expect(app.outbox.createMany).not.toHaveBeenCalled();
    },
  );

  it('PATCH /orders/:id/edit: 422 for an unknown supplier', async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    await request(
      appWith(
        undefined,
        { ...openOrder, updateMany },
        answering('not_found', 'found'),
      ),
    )
      .patch(`/orders/${ORDER_ID}/edit`)
      .set('authorization', bearer(USER))
      .send({ supplierId: 999, deliveryDetails: 'Nil' })
      .expect(422);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('PATCH /orders/:id/edit: 503 when supplier-service is down', async () => {
    await request(
      appWith(undefined, openOrder, answering('found', 'unavailable')),
    )
      .patch(`/orders/${ORDER_ID}/edit`)
      .set('authorization', bearer(USER))
      .send({ deliveryLocationId: 7, deliveryDetails: 'Nil' })
      .expect(503);
  });
});

// AI-generated
describe('acceptance notification username', () => {
  it.each(['success', 'http failure', 'network failure', 'invalid json'])(
    'forwards bearer and handles %s',
    async (scenario) => {
      const courier = '0192f0c4-0000-7000-8000-00000000000b';
      const id = '0192f0c4-0000-7000-8000-000000000001';
      const lookup = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async () => {
          if (scenario === 'network failure') throw new Error('unreachable');
          return new Response(
            scenario === 'invalid json'
              ? '{'
              : JSON.stringify({ username: 'courier_name' }),
            { status: scenario === 'http failure' ? 503 : 200 },
          );
        });
      try {
        const app = appWith(undefined, {
          findUnique: async () => ({
            id,
            requesterId: USER,
            courierId: null,
            status: 'open',
            completeBy: null,
            version: 0,
          }),
          findUniqueOrThrow: async () => ({
            id,
            requesterId: USER,
            courierId: courier,
            status: 'accepted',
            version: 1,
          }),
        });
        await request(app)
          .post(`/orders/${id}/accept`)
          .set('authorization', bearer(courier))
          .expect(200);
        expect(lookup).toHaveBeenCalledWith(
          new URL('http://localhost:3001/users/me'),
          { headers: { authorization: bearer(courier) } },
        );
        expect(app.outbox.createMany).toHaveBeenCalledWith({
          data: [
            expect.objectContaining({
              taskName: 'chat_participant',
              payload: { orderId: id, userId: courier, role: 'COURIER' },
            }),
            expect.objectContaining({
              taskName: 'chat_notification',
              payload: {
                orderId: id,
                messageId: expect.any(String),
                triggeredByUserId: courier,
                message:
                  scenario === 'success'
                    ? 'The order has been accepted by courier_name'
                    : 'The order has been accepted',
              },
            }),
          ],
        });
      } finally {
        lookup.mockRestore();
      }
    },
  );
});
