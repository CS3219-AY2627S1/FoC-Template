/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28a (Scheduled Errands) per instructions.md - real-database coverage for the
 *        OrderSeries migration's FK behaviour (deleting a series sets seriesId null on its
 *        orders; failureReason is independent of seriesId).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { randomUUID } from 'node:crypto';
import { config as loadDotenv } from 'dotenv';
import { loadEnv } from '../src/config/env.js';
import { createPrismaClient } from '../src/db/prisma.js';

// Requires a migrated Postgres at DATABASE_URL (e.g. `docker compose up -d order-db`).
loadDotenv({ quiet: true });
const prisma = createPrismaClient(loadEnv().DATABASE_URL);

const REQUESTER = '0192f0c4-0000-7000-8000-00000000000a';
const SUPPLIER_ID = 1;
const LOCATION_ID = 1;

function seriesFixture(
  overrides: Partial<
    Parameters<typeof prisma.orderSeries.create>[0]['data']
  > = {},
) {
  const now = new Date();
  return {
    requesterId: REQUESTER,
    supplierId: SUPPLIER_ID,
    description: 'Daily coffee run',
    deliveryLocationId: LOCATION_ID,
    credits: 5,
    rrule: 'FREQ=DAILY',
    startAt: now,
    nextFireAt: now,
    ...overrides,
  };
}

function orderFixture(
  overrides: Partial<
    Parameters<typeof prisma.orderRequest.create>[0]['data']
  > = {},
) {
  return {
    requesterId: REQUESTER,
    supplierId: SUPPLIER_ID,
    description: 'Daily coffee run',
    deliveryLocationId: LOCATION_ID,
    credits: 5,
    status: 'pending' as const,
    ...overrides,
  };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('OrderSeries schema (e2e)', () => {
  it('deleting a series sets seriesId null on its orders', async () => {
    const series = await prisma.orderSeries.create({ data: seriesFixture() });
    const order = await prisma.orderRequest.create({
      data: orderFixture({ seriesId: series.id }),
    });

    await prisma.orderSeries.delete({ where: { id: series.id } });

    const reloaded = await prisma.orderRequest.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(reloaded.seriesId).toBeNull();

    await prisma.orderRequest.delete({ where: { id: order.id } });
  });

  it('rejects a seriesId that does not reference an existing series', async () => {
    await expect(
      prisma.orderRequest.create({
        data: orderFixture({ seriesId: randomUUID() }),
      }),
    ).rejects.toThrow();
  });

  it('retry-state columns default to null, and failureReason is independent of seriesId', async () => {
    const series = await prisma.orderSeries.create({ data: seriesFixture() });
    expect(series.currentOccurrenceAt).toBeNull();
    expect(series.retryType).toBeNull();
    expect(series.attemptCount).toBeNull();
    expect(series.nextRetryAt).toBeNull();
    expect(series.status).toBe('active');

    const failedOrder = await prisma.orderRequest.create({
      data: orderFixture({
        status: 'failed',
        failureReason: 'supplier closed',
      }),
    });
    expect(failedOrder.seriesId).toBeNull();
    expect(failedOrder.failureReason).toBe('supplier closed');

    await prisma.orderRequest.delete({ where: { id: failedOrder.id } });
    await prisma.orderSeries.delete({ where: { id: series.id } });
  });
});
