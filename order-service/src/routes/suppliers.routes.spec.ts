/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-11
 * Scope: Tests for POST /suppliers/:supplierId/cancel-orders and cancelOrdersForSupplier, per the
 *        team decision in chat, 2026-11-11. No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-11
 * Scope: covers pending requests (credit release, no chat notice) (team decision in chat, 2026-11-11: pending counts as not yet collected).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-11
 * Scope: pending request: the notice goes through the order-less route to the requester (team decision in chat, 2026-11-11: a pending request gets the same message through the order-less system-message route).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import request from 'supertest';
import { createApp } from '../app.js';
import type { PrismaClient } from '../db/prisma.js';

const KEY = 'test-service-key';
const HEADER = 'order-supplier-service-key';
const NAME = 'Campus Store';
const MESSAGE = `${NAME} has been shut down temporarily. Your request has been automatically cancelled and reserved credits are refunded`;

function fakePrisma(orders: Record<string, unknown>[]) {
  const byId = new Map(orders.map((o) => [o.id as string, o]));
  const orderRequest = {
    findMany: vi.fn(async () => orders),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
      byId.get(where.id),
    ),
    updateMany: vi.fn(async () => ({ count: 1 })),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => ({
      ...byId.get(where.id),
      status: 'cancelled',
    })),
  };
  const outbox = { createMany: vi.fn(async () => ({ count: 1 })) };
  const prisma: Record<string, unknown> = { orderRequest, outbox };
  prisma.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn(prisma),
  );
  return { prisma: prisma as unknown as PrismaClient, orderRequest, outbox };
}

const order = (id: string, status: string) => ({
  id,
  status,
  version: 1,
  requesterId: '0192f0c4-0000-7000-8000-00000000000a',
  courierId: status === 'accepted' ? '0192f0c4-0000-7000-8000-00000000000b' : null,
  completeBy: new Date('2999-01-01T00:00:00Z'), // future: the requester could not cancel yet
});

describe('POST /suppliers/:supplierId/cancel-orders', () => {
  it('401 without the key, 401 with a wrong key, 503 when no key is configured', async () => {
    const { prisma, orderRequest } = fakePrisma([]);
    const app = createApp({ prisma, supplierServiceKey: KEY });
    await request(app)
      .post('/suppliers/7/cancel-orders')
      .send({ supplierName: NAME })
      .expect(401);
    await request(app)
      .post('/suppliers/7/cancel-orders')
      .set(HEADER, 'wrong')
      .send({ supplierName: NAME })
      .expect(401);
    await request(createApp({ prisma }))
      .post('/suppliers/7/cancel-orders')
      .set(HEADER, KEY)
      .send({ supplierName: NAME })
      .expect(503);
    expect(orderRequest.findMany).not.toHaveBeenCalled();
  });

  it.each([
    ['abc', { supplierName: NAME }],
    ['0', { supplierName: NAME }],
    ['7', {}],
    ['7', { supplierName: '  ' }],
  ])('400 for id %s and body %j', async (id, body) => {
    const { prisma } = fakePrisma([]);
    await request(createApp({ prisma, supplierServiceKey: KEY }))
      .post(`/suppliers/${id}/cancel-orders`)
      .set(HEADER, KEY)
      .send(body)
      .expect(400);
  });

  it('cancels pending, open and accepted orders, with the shut-down message and a credit release', async () => {
    const { prisma, orderRequest, outbox } = fakePrisma([
      order('0192f0c4-0000-7000-8000-000000000001', 'open'),
      order('0192f0c4-0000-7000-8000-000000000002', 'accepted'),
      order('0192f0c4-0000-7000-8000-000000000003', 'pending'),
    ]);
    await request(createApp({ prisma, supplierServiceKey: KEY }))
      .post('/suppliers/7/cancel-orders')
      .set(HEADER, KEY)
      .send({ supplierName: NAME })
      .expect(200, { cancelled: 3 });

    expect(orderRequest.findMany).toHaveBeenCalledWith({
      where: { supplierId: 7, status: { in: ['pending', 'open', 'accepted'] } },
    });
    expect(orderRequest.updateMany).toHaveBeenCalledTimes(3);
    const tasks = outbox.createMany.mock.calls.flatMap(
      (call: unknown[]) => (call[0] as { data: { taskName: string; payload: unknown }[] }).data,
    );
    expect(tasks.map((t) => t.taskName).sort()).toEqual([
      'chat_notification',
      'chat_notification',
      'chat_notification', // the pending request's, sent order-less to its requester
      'credit_release',
      'credit_release',
      'credit_release',
    ]);
    const notices = tasks
      .filter((t) => t.taskName === 'chat_notification')
      .map((t) => t.payload as Record<string, unknown>);
    expect(notices.every((n) => n.message === MESSAGE)).toBe(true);
    const orderless = notices.filter((n) => n.orderId === null);
    expect(orderless).toHaveLength(1);
    expect(orderless[0]).toMatchObject({ recipient: '0192f0c4-0000-7000-8000-00000000000a' });
    expect(orderless[0]).not.toHaveProperty('archiveAfter');
    expect(notices.filter((n) => n.archiveAfter === true)).toHaveLength(2);
  });

  it('200 with zero when the supplier has no uncollected orders', async () => {
    const { prisma } = fakePrisma([]);
    await request(createApp({ prisma, supplierServiceKey: KEY }))
      .post('/suppliers/7/cancel-orders')
      .set(HEADER, KEY)
      .send({ supplierName: NAME })
      .expect(200, { cancelled: 0 });
  });
});
