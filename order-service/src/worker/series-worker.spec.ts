/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 f (instructions.md) - unit tests for series-worker.ts: posting a due
 *        occurrence (and the "posted late" note threshold), skipping an occurrence whose
 *        completeBy has already passed, each fire-time-check failure/retry outcome (user
 *        suspended/locked/pending/not-found, user/supplier unreachable entering and
 *        exhausting retry, supplier closed entering retry), one-retry-slot-per-series
 *        (a due next occurrence drops a stale retry), catch-up across two ticks, finished-
 *        series deletion, and exactly-once posting under two concurrent claims of the same
 *        stale row. Uses an in-memory fake PrismaClient mirroring orders.service.spec.ts's
 *        style, with fixed `Date`s throughout (instructions.md: "pass fixed Dates").
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../db/prisma.js';
import { RetryType } from '../generated/prisma/client.js';
import type { UserClient, UserWorkerCheck } from '../clients/user.client.js';
import type { SuppliersClient, SupplierWorkerCheck } from '../clients/suppliers.client.js';
import type { CreditsClient } from '../clients/credits.client.js';
import { createStubCreditsClient } from '../clients/credits.client.js';
import { SeriesFailureReason } from '../services/series.service.js';
import { createSeriesWorkerTick, type SeriesWorkerDeps } from './series-worker.js';

const SERIES_ID = '0192f0c4-0000-7000-8000-000000000001';
const REQUESTER = '0192f0c4-0000-7000-8000-00000000000a';
const NOW = new Date('2026-11-10T01:00:00.000Z'); // 09:00 SGT, Tuesday

function baseSeriesRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SERIES_ID,
    requesterId: REQUESTER,
    supplierId: 7,
    description: 'Coffee run',
    deliveryLocationId: 3,
    deliveryDetails: 'Leave at desk',
    credits: 4,
    durationMinutes: 120,
    additionalDetails: null,
    rrule: 'FREQ=DAILY;INTERVAL=1',
    startAt: new Date('2026-11-09T01:00:00.000Z'),
    nextFireAt: NOW,
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

type SeriesRow = ReturnType<typeof baseSeriesRow>;

function applyUpdate(row: Record<string, unknown>, data: Record<string, unknown>) {
  const next = { ...row };
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && 'increment' in (value as { increment?: number })) {
      next[key] = (row[key] as number) + (value as { increment: number }).increment;
    } else {
      next[key] = value;
    }
  }
  return next;
}

/** In-memory fake covering both orderSeries (claim logic) and orderRequest/outbox (the
 *  posting path via createPendingOrderAndSettle), mirroring orders.service.spec.ts's `fakes`. */
function fakePrisma(initialSeries: SeriesRow | null) {
  let series: Record<string, unknown> | null = initialSeries ? { ...initialSeries } : null;
  const orders: Record<string, Record<string, unknown>> = {};
  let orderSeq = 0;
  let findManyResult: (() => SeriesRow[]) | null = null;

  const orderSeries = {
    findMany: vi.fn(async () =>
      findManyResult ? findManyResult() : series ? [series as SeriesRow] : [],
    ),
    findUnique: vi.fn(async () => series),
    updateMany: vi.fn(
      async ({ where, data }: { where: { id: string; version: number }; data: Record<string, unknown> }) => {
        if (!series || series.id !== where.id || series.version !== where.version) return { count: 0 };
        series = applyUpdate(series, data);
        return { count: 1 };
      },
    ),
    deleteMany: vi.fn(async ({ where }: { where: { id: string; version: number } }) => {
      if (!series || series.id !== where.id || series.version !== where.version) return { count: 0 };
      series = null;
      return { count: 1 };
    }),
  };

  const orderRequest = {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const id = `order-${++orderSeq}`;
      const row = { id, version: 0, ...data };
      orders[id] = row;
      return row;
    }),
    findFirst: vi.fn(async ({ where }: { where: { requesterId: string; status: string } }) => {
      const match = Object.values(orders).find(
        (o) => o.requesterId === where.requesterId && o.status === where.status,
      );
      return match ? { id: match.id } : null;
    }),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => orders[where.id] ?? null),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => orders[where.id]),
    updateMany: vi.fn(
      async ({ where, data }: { where: { id: string; version: number }; data: Record<string, unknown> }) => {
        const row = orders[where.id];
        if (!row || row.version !== where.version) return { count: 0 };
        orders[where.id] = applyUpdate(row, data);
        return { count: 1 };
      },
    ),
  };

  const outboxTasks: { taskName: string; payload: unknown }[] = [];
  const outbox = {
    createMany: vi.fn(async ({ data }: { data: { taskName: string; payload: unknown }[] }) => {
      outboxTasks.push(...data);
      return { count: data.length };
    }),
  };
  const $executeRaw = vi.fn(async () => 1);
  const base: Record<string, unknown> = { orderSeries, orderRequest, outbox, $executeRaw };
  base.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(base));

  return {
    prisma: base as unknown as PrismaClient,
    orderSeries,
    orderRequest,
    outboxTasks,
    series: () => series,
    orders: () => orders,
    /** Test-only: makes the next tick's candidate list diverge from the live `series` ref,
     *  so two stale copies can be handed to the same tick (simulating two concurrent claims
     *  of the same pre-claim row). */
    setFindManyResult: (fn: () => SeriesRow[]) => {
      findManyResult = fn;
    },
  };
}

const USER_OK: UserWorkerCheck = { existence: 'found', status: 'active', lockedUntil: null };
const USER_UNAVAILABLE: UserWorkerCheck = { existence: 'unavailable', status: null, lockedUntil: null };
const SUPPLIER_OPEN: SupplierWorkerCheck = {
  existence: 'found',
  hasNoOpeningHours: false,
  closed: false,
  nextOpeningAt: null,
};
const SUPPLIER_UNAVAILABLE: SupplierWorkerCheck = {
  existence: 'unavailable',
  hasNoOpeningHours: false,
  closed: false,
  nextOpeningAt: null,
};
function supplierClosed(nextOpeningAt: Date | null): SupplierWorkerCheck {
  return { existence: 'found', hasNoOpeningHours: false, closed: true, nextOpeningAt };
}

function fakeDeps(
  prisma: PrismaClient,
  overrides: {
    users?: Partial<UserClient>;
    suppliers?: Partial<SuppliersClient>;
    credits?: CreditsClient;
    now?: Date;
  } = {},
): SeriesWorkerDeps {
  const users: UserClient = {
    statusForWorker: vi.fn(async () => USER_OK),
    ...overrides.users,
  };
  const suppliers: SuppliersClient = {
    supplierExists: vi.fn(async () => 'found' as const),
    locationExists: vi.fn(async () => 'found' as const),
    supplierStatusForWorker: vi.fn(async () => SUPPLIER_OPEN),
    locationExistsForWorker: vi.fn(async () => 'found' as const),
    ...overrides.suppliers,
  };
  return {
    prisma,
    users,
    suppliers,
    credits: overrides.credits ?? createStubCreditsClient(),
    now: overrides.now ? () => overrides.now as Date : () => NOW,
  };
}

function findOutboxNotice(outboxTasks: { taskName: string; payload: unknown }[]) {
  return outboxTasks.filter((t) => t.taskName === 'chat_notification');
}

describe('series worker: posting', () => {
  it('posts a due occurrence, advances nextFireAt, and attaches seriesId', async () => {
    const fake = fakePrisma(baseSeriesRow());
    const deps = fakeDeps(fake.prisma);
    const tick = createSeriesWorkerTick(deps);

    const seen = await tick();

    expect(seen).toBe(1);
    const orders = Object.values(fake.orders());
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ seriesId: SERIES_ID, status: 'open' });
    const series = fake.series();
    expect(series?.nextFireAt).toEqual(new Date('2026-11-11T01:00:00.000Z'));
    expect(series?.version).toBe(1);
    // No late note: posted exactly on time.
    expect(findOutboxNotice(fake.outboxTasks)).toHaveLength(0);
  });

  it('adds a "posted late" note once the order is open, more than a minute after scheduled', async () => {
    const scheduledAt = new Date('2026-11-10T00:58:00.000Z'); // 2 minutes before NOW
    const fake = fakePrisma(baseSeriesRow({ nextFireAt: scheduledAt }));
    const deps = fakeDeps(fake.prisma); // now = NOW, 2 minutes after scheduledAt

    await createSeriesWorkerTick(deps)();

    const lateNotes = fake.outboxTasks.filter(
      (t) => t.taskName === 'chat_notification' && (t.payload as { orderId?: string }).orderId,
    );
    expect(lateNotes).toHaveLength(1);
    const [lateNote] = lateNotes;
    expect((lateNote!.payload as { message: string }).message).toMatch(/late/i);
  });

  it('does not add a late note when posted within a minute of the scheduled time', async () => {
    const scheduledAt = new Date('2026-11-10T00:59:30.000Z'); // 30s before NOW
    const fake = fakePrisma(baseSeriesRow({ nextFireAt: scheduledAt }));
    const deps = fakeDeps(fake.prisma);

    await createSeriesWorkerTick(deps)();

    expect(fake.outboxTasks.filter((t) => t.taskName === 'chat_notification')).toHaveLength(0);
  });

  it('deletes a finished series (no next occurrence) after its last occurrence posts, with no retry left', async () => {
    const fake = fakePrisma(baseSeriesRow({ rrule: 'FREQ=DAILY;COUNT=1' }));
    const deps = fakeDeps(fake.prisma);

    await createSeriesWorkerTick(deps)();

    expect(fake.series()).toBeNull();
    expect(Object.values(fake.orders())).toHaveLength(1);
  });
});

describe('series worker: skip (completeBy already past)', () => {
  it('skips the occurrence, writes a failed row with a notice, and advances to the next', async () => {
    // Scheduled yesterday (a real occurrence of the daily rule), with a 1-minute
    // duration: completeBy is long past by NOW.
    const scheduledAt = new Date('2026-11-09T01:00:00.000Z');
    const fake = fakePrisma(baseSeriesRow({ nextFireAt: scheduledAt, durationMinutes: 1 }));
    const deps = fakeDeps(fake.prisma);
    const users = deps.users as { statusForWorker: ReturnType<typeof vi.fn> };

    await createSeriesWorkerTick(deps)();

    // Fire-time checks are never reached for a skip.
    expect(users.statusForWorker).not.toHaveBeenCalled();
    const orders = Object.values(fake.orders());
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      status: 'failed',
      failureReason: SeriesFailureReason.COMPLETE_BY_IN_PAST,
    });
    expect(findOutboxNotice(fake.outboxTasks)).toHaveLength(1);
    expect(fake.series()?.nextFireAt).toEqual(new Date('2026-11-10T01:00:00.000Z'));
  });
});

describe('series worker: user fire-time outcomes', () => {
  it.each([
    ['suspended', { existence: 'found', status: 'suspended', lockedUntil: null }, SeriesFailureReason.USER_SUSPENDED],
    ['pending', { existence: 'found', status: 'pending', lockedUntil: null }, SeriesFailureReason.USER_PENDING],
    ['not found', { existence: 'not_found', status: null, lockedUntil: null }, SeriesFailureReason.USER_NOT_FOUND],
    [
      'locked',
      { existence: 'found', status: 'active', lockedUntil: new Date('2026-11-10T02:00:00.000Z') },
      SeriesFailureReason.USER_LOCKED,
    ],
  ] as const)('%s user: fails the occurrence immediately', async (_label, check, reason) => {
    const fake = fakePrisma(baseSeriesRow());
    const deps = fakeDeps(fake.prisma, {
      users: { statusForWorker: vi.fn(async () => check as UserWorkerCheck) },
    });

    await createSeriesWorkerTick(deps)();

    const orders = Object.values(fake.orders());
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ status: 'failed', failureReason: reason });
    expect(fake.series()?.currentOccurrenceAt).toBeNull();
  });

  it('user-service unreachable: enters retry with a notice, advances nextFireAt', async () => {
    const fake = fakePrisma(baseSeriesRow());
    const deps = fakeDeps(fake.prisma, {
      users: { statusForWorker: vi.fn(async () => USER_UNAVAILABLE) },
    });

    await createSeriesWorkerTick(deps)();

    expect(Object.values(fake.orders())).toHaveLength(0);
    const series = fake.series();
    expect(series?.retryType).toBe(RetryType.user_service_unreachable);
    expect(series?.attemptCount).toBe(1);
    expect(series?.currentOccurrenceAt).toEqual(NOW);
    expect(series?.nextFireAt).toEqual(new Date('2026-11-11T01:00:00.000Z'));
    expect(findOutboxNotice(fake.outboxTasks)).toHaveLength(1);
  });

  it('user-service unreachable: exhausts after 4 attempts, with no extra notice beyond the first', async () => {
    const fake = fakePrisma(
      baseSeriesRow({
        currentOccurrenceAt: NOW,
        nextFireAt: new Date('2026-11-11T01:00:00.000Z'),
        retryType: RetryType.user_service_unreachable,
        attemptCount: 4,
        nextRetryAt: NOW,
      }),
    );
    const deps = fakeDeps(fake.prisma, {
      users: { statusForWorker: vi.fn(async () => USER_UNAVAILABLE) },
    });

    await createSeriesWorkerTick(deps)();

    const orders = Object.values(fake.orders());
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      status: 'failed',
      failureReason: SeriesFailureReason.USER_SERVICE_UNAVAILABLE,
    });
    expect(fake.series()?.currentOccurrenceAt).toBeNull();
    // Exhaustion notice only (the "entering retry" notice was a separate, earlier tick).
    expect(findOutboxNotice(fake.outboxTasks)).toHaveLength(1);
  });
});

describe('series worker: supplier fire-time outcomes', () => {
  it('supplier-service unreachable: enters retry with NO notice (notify only when exhausted)', async () => {
    const fake = fakePrisma(baseSeriesRow());
    const deps = fakeDeps(fake.prisma, {
      suppliers: { supplierStatusForWorker: vi.fn(async () => SUPPLIER_UNAVAILABLE) },
    });

    await createSeriesWorkerTick(deps)();

    const series = fake.series();
    expect(series?.retryType).toBe(RetryType.supplier_service_unreachable);
    expect(findOutboxNotice(fake.outboxTasks)).toHaveLength(0);
  });

  it('supplier-service unreachable: exhausts after 4 attempts, sending exactly one (exhaustion) notice', async () => {
    const fake = fakePrisma(
      baseSeriesRow({
        currentOccurrenceAt: NOW,
        nextFireAt: new Date('2026-11-11T01:00:00.000Z'),
        retryType: RetryType.supplier_service_unreachable,
        attemptCount: 4,
        nextRetryAt: NOW,
      }),
    );
    const deps = fakeDeps(fake.prisma, {
      suppliers: { supplierStatusForWorker: vi.fn(async () => SUPPLIER_UNAVAILABLE) },
    });

    await createSeriesWorkerTick(deps)();

    const orders = Object.values(fake.orders());
    expect(orders[0]).toMatchObject({
      status: 'failed',
      failureReason: SeriesFailureReason.SUPPLIER_SERVICE_UNAVAILABLE,
    });
    expect(findOutboxNotice(fake.outboxTasks)).toHaveLength(1);
  });

  it('supplier closed before the next occurrence: enters retry at the next opening time, with a notice', async () => {
    const nextOpeningAt = new Date('2026-11-10T02:00:00.000Z'); // before completeBy (+120min) and the next occurrence
    const fake = fakePrisma(baseSeriesRow());
    const deps = fakeDeps(fake.prisma, {
      suppliers: { supplierStatusForWorker: vi.fn(async () => supplierClosed(nextOpeningAt)) },
    });

    await createSeriesWorkerTick(deps)();

    const series = fake.series();
    expect(series?.retryType).toBe(RetryType.supplier_closed);
    expect(series?.nextRetryAt).toEqual(nextOpeningAt);
    expect(findOutboxNotice(fake.outboxTasks)).toHaveLength(1);
  });

  it('supplier closed past completeBy: fails immediately instead of retrying', async () => {
    const fake = fakePrisma(baseSeriesRow({ durationMinutes: 60 }));
    const deps = fakeDeps(fake.prisma, {
      suppliers: {
        // after completeBy (NOW + 60min)
        supplierStatusForWorker: vi.fn(async () => supplierClosed(new Date('2026-11-10T04:00:00.000Z'))),
      },
    });

    await createSeriesWorkerTick(deps)();

    const orders = Object.values(fake.orders());
    expect(orders[0]).toMatchObject({ status: 'failed', failureReason: SeriesFailureReason.SUPPLIER_CLOSED });
    expect(fake.series()?.currentOccurrenceAt).toBeNull();
  });
});

describe('series worker: one retry slot per series', () => {
  it('drops a stale retry and posts the new occurrence once it becomes due', async () => {
    // A retry has been sitting since an earlier occurrence; the series' next occurrence
    // is now also due.
    const fake = fakePrisma(
      baseSeriesRow({
        currentOccurrenceAt: new Date('2026-11-09T01:00:00.000Z'),
        nextFireAt: NOW, // the next occurrence is due now
        retryType: RetryType.supplier_closed,
        attemptCount: 1,
        nextRetryAt: new Date('2026-11-12T00:00:00.000Z'), // far in the future
      }),
    );
    const deps = fakeDeps(fake.prisma);

    await createSeriesWorkerTick(deps)();

    const orders = Object.values(fake.orders());
    // One failed row for the dropped retry, one posted order for the new occurrence.
    const failed = orders.find((o) => o.status === 'failed');
    const posted = orders.find((o) => o.status === 'open');
    expect(failed).toMatchObject({ failureReason: SeriesFailureReason.RETRY_SUPERSEDED });
    expect(posted).toMatchObject({ seriesId: SERIES_ID });
    expect(fake.series()?.currentOccurrenceAt).toBeNull();
  });
});

describe('series worker: catch-up after downtime', () => {
  it("judges each missed occurrence on its own completeBy, one per tick", async () => {
    // Daily series, last fired 3 days ago; a short duration means the two oldest missed
    // occurrences are already past their own completeBy and get skipped, one per tick.
    const day1 = new Date('2026-11-07T01:00:00.000Z');
    const fake = fakePrisma(baseSeriesRow({ startAt: day1, nextFireAt: day1, durationMinutes: 30 }));
    const deps = fakeDeps(fake.prisma); // now = NOW = 2026-11-10T01:00, 3 days later

    await createSeriesWorkerTick(deps)(); // day1: completeBy (01:30) long past -> skip
    expect(fake.series()?.nextFireAt).toEqual(new Date('2026-11-08T01:00:00.000Z'));
    expect(Object.values(fake.orders())).toHaveLength(1);
    expect(Object.values(fake.orders())[0]).toMatchObject({ failureReason: SeriesFailureReason.COMPLETE_BY_IN_PAST });

    await createSeriesWorkerTick(deps)(); // day2: still past -> skip again
    expect(fake.series()?.nextFireAt).toEqual(new Date('2026-11-09T01:00:00.000Z'));
    expect(Object.values(fake.orders())).toHaveLength(2);

    await createSeriesWorkerTick(deps)(); // day3: still past -> skip
    expect(fake.series()?.nextFireAt).toEqual(new Date('2026-11-10T01:00:00.000Z'));
    expect(Object.values(fake.orders())).toHaveLength(3);

    await createSeriesWorkerTick(deps)(); // day4 == NOW: completeBy (01:30) is after now -> posts
    expect(fake.series()?.nextFireAt).toEqual(new Date('2026-11-11T01:00:00.000Z'));
    const orders = Object.values(fake.orders());
    expect(orders).toHaveLength(4);
    expect(orders[3]).toMatchObject({ status: 'open' });
  });
});

describe('series worker: exactly once under two concurrent claims', () => {
  it('only one of two claimants posts the occurrence; the other finds the version gone', async () => {
    const row = baseSeriesRow();
    const fake = fakePrisma(row);
    // Simulate two workers racing on the same stale snapshot within one tick.
    fake.setFindManyResult(() => [{ ...row }, { ...row }]);
    const deps = fakeDeps(fake.prisma);

    const seen = await createSeriesWorkerTick(deps)();

    expect(seen).toBe(2);
    expect(Object.values(fake.orders())).toHaveLength(1); // posted exactly once
    expect(fake.series()?.version).toBe(1); // claimed exactly once
  });
});
