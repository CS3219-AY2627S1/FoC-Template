/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 e (instructions.md) - unit tests for series.service.ts: createSeries
 *        validation (including durationMinutes default/startNow/startAt rules), getSeries/
 *        listMySeries ownership and public shape, editSeries semantics (DTSTART reset on
 *        rule change, resume recompute, stop-retry-and-notify), and deleteSeries (stop-retry-
 *        and-notify). Mirrors orders.service.spec.ts's mocked-PrismaClient style.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import type { PrismaClient } from '../db/prisma.js';
import { ErrorCode } from '../constants/errors.js';
import type { CreateSeriesPayload } from '../types/series.js';
import {
  createSeries,
  deleteSeries,
  editSeries,
  getSeries,
  listMySeries,
  SeriesFailureReason,
} from './series.service.js';

const REQUESTER = '0192f0c4-0000-7000-8000-00000000000a';
const OTHER_USER = '0192f0c4-0000-7000-8000-00000000000b';
const SERIES_ID = '0192f0c4-0000-7000-8000-000000000001';
const NOW = new Date('2026-11-09T01:00:00.000Z'); // 09:00 SGT, Monday

const BASE_PAYLOAD = {
  supplierId: 7,
  description: 'Coffee run',
  deliveryLocationId: 3,
  deliveryDetails: 'Leave at desk',
  credits: 4,
  rrule: 'FREQ=DAILY;INTERVAL=1',
  startAt: NOW.toISOString(),
};

function baseSeriesRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SERIES_ID,
    requesterId: REQUESTER,
    supplierId: 7,
    description: 'Coffee run',
    deliveryLocationId: 3,
    deliveryDetails: 'Leave at desk',
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

type SeriesRow = ReturnType<typeof baseSeriesRow>;

function fakePrisma() {
  const orderSeries = {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: SERIES_ID,
      createdAt: NOW,
      updatedAt: NOW,
      version: 0,
      currentOccurrenceAt: null,
      retryType: null,
      attemptCount: null,
      nextRetryAt: null,
      ...data,
    })),
    findUnique: vi.fn(async (): Promise<SeriesRow | null> => baseSeriesRow()),
    findMany: vi.fn(async () => [baseSeriesRow()]),
    updateMany: vi.fn(
      async (_args: { where: object; data: Record<string, unknown> }) => ({ count: 1 }),
    ),
    findUniqueOrThrow: vi.fn(async () => baseSeriesRow()),
    delete: vi.fn(async () => baseSeriesRow()),
  };
  const orderRequest = {
    count: vi.fn(async () => 0),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'order-1',
      version: 0,
      ...data,
    })),
  };
  const outbox = { createMany: vi.fn(async () => ({ count: 1 })) };
  const base: {
    orderSeries: typeof orderSeries;
    orderRequest: typeof orderRequest;
    outbox: typeof outbox;
    $transaction?: unknown;
  } = { orderSeries, orderRequest, outbox };
  base.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(base));
  return base as unknown as PrismaClient & {
    orderSeries: typeof orderSeries;
    orderRequest: typeof orderRequest;
    outbox: typeof outbox;
  };
}

describe('createSeries', () => {
  it('creates a series with all fields, defaulting durationMinutes to 60 (matches the normal-order default)', async () => {
    const prisma = fakePrisma();
    const result = await createSeries(prisma, REQUESTER, { ...BASE_PAYLOAD }, NOW);
    expect(result.ok).toBe(true);
    expect(prisma.orderSeries.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        requesterId: REQUESTER,
        durationMinutes: 60,
        status: 'active',
        startAt: NOW,
        nextFireAt: NOW, // DTSTART matches the daily rule, so it's the first occurrence
      }),
    });
  });

  it('accepts an explicit durationMinutes within 1-1440', async () => {
    const prisma = fakePrisma();
    const result = await createSeries(
      prisma,
      REQUESTER,
      { ...BASE_PAYLOAD, durationMinutes: 120 },
      NOW,
    );
    expect(result.ok).toBe(true);
    expect(prisma.orderSeries.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ durationMinutes: 120 }),
    });
  });

  it('rejects durationMinutes > 1440', async () => {
    const prisma = fakePrisma();
    const result = await createSeries(
      prisma,
      REQUESTER,
      { ...BASE_PAYLOAD, durationMinutes: 1441 },
      NOW,
    );
    expect(result).toEqual({ ok: false, errors: [ErrorCode.INVALID_DURATION] });
  });

  it('rejects durationMinutes <= 0', async () => {
    const prisma = fakePrisma();
    const result = await createSeries(
      prisma,
      REQUESTER,
      { ...BASE_PAYLOAD, durationMinutes: 0 },
      NOW,
    );
    expect(result).toEqual({ ok: false, errors: [ErrorCode.INVALID_DURATION] });
  });

  it('startNow wins over startAt and sets DTSTART to now', async () => {
    const prisma = fakePrisma();
    const result = await createSeries(
      prisma,
      REQUESTER,
      { ...BASE_PAYLOAD, startAt: '2099-01-01T00:00:00.000Z', startNow: true },
      NOW,
    );
    expect(result.ok).toBe(true);
    expect(prisma.orderSeries.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ startAt: NOW }),
    });
  });

  it('MISSING_START_TIME when neither startAt nor startNow is given', async () => {
    const { startAt: _startAt, ...payload } = BASE_PAYLOAD;
    const prisma = fakePrisma();
    const result = await createSeries(
      prisma,
      REQUESTER,
      payload as unknown as CreateSeriesPayload,
      NOW,
    );
    expect(result).toEqual({ ok: false, errors: [ErrorCode.MISSING_START_TIME] });
  });

  it('INVALID_START for an unparseable startAt', async () => {
    const prisma = fakePrisma();
    const result = await createSeries(
      prisma,
      REQUESTER,
      { ...BASE_PAYLOAD, startAt: 'not-a-date' },
      NOW,
    );
    expect(result).toEqual({ ok: false, errors: [ErrorCode.INVALID_START] });
  });

  it('MISSING_RULE when rrule is absent', async () => {
    const { rrule: _rrule, ...payload } = BASE_PAYLOAD;
    const prisma = fakePrisma();
    const result = await createSeries(
      prisma,
      REQUESTER,
      payload as unknown as CreateSeriesPayload,
      NOW,
    );
    expect(result).toEqual({ ok: false, errors: [ErrorCode.MISSING_RULE] });
  });

  it('INVALID_RULE for unparseable rrule text', async () => {
    const prisma = fakePrisma();
    const result = await createSeries(
      prisma,
      REQUESTER,
      { ...BASE_PAYLOAD, rrule: 'garbage' },
      NOW,
    );
    expect(result).toEqual({ ok: false, errors: [ErrorCode.INVALID_RULE] });
  });

  it('INVALID_RULE when the rule has no occurrence at/after DTSTART', async () => {
    const prisma = fakePrisma();
    const result = await createSeries(
      prisma,
      REQUESTER,
      { ...BASE_PAYLOAD, rrule: 'FREQ=DAILY;UNTIL=20260101T000000Z' },
      NOW,
    );
    expect(result).toEqual({ ok: false, errors: [ErrorCode.INVALID_RULE] });
  });

  it('mirrors createOrder-style field validation (missing supplier)', async () => {
    const { supplierId: _supplierId, ...payload } = BASE_PAYLOAD;
    const prisma = fakePrisma();
    const result = await createSeries(
      prisma,
      REQUESTER,
      payload as unknown as CreateSeriesPayload,
      NOW,
    );
    expect(result).toEqual({ ok: false, errors: [ErrorCode.MISSING_SUPPLIER] });
  });

  it('does not check supplier/location existence at create time', async () => {
    const prisma = fakePrisma();
    await createSeries(prisma, REQUESTER, { ...BASE_PAYLOAD }, NOW);
    expect(prisma.orderSeries.create).toHaveBeenCalled();
  });
});

describe('getSeries / listMySeries', () => {
  it('returns the public shape without retry state or nextFireAt', async () => {
    const prisma = fakePrisma();
    const result = await getSeries(prisma, REQUESTER, SERIES_ID, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.series).not.toHaveProperty('nextFireAt');
      expect(result.series).not.toHaveProperty('currentOccurrenceAt');
      expect(result.series).not.toHaveProperty('retryType');
      expect(result.series).not.toHaveProperty('attemptCount');
      expect(result.series).not.toHaveProperty('nextRetryAt');
      expect(result.series.upcomingDates.length).toBe(3);
      expect(result.series.activeOrderCount).toBe(0);
    }
  });

  it('FORBIDDEN for a non-owner', async () => {
    const prisma = fakePrisma();
    const result = await getSeries(prisma, OTHER_USER, SERIES_ID, NOW);
    expect(result).toEqual({ ok: false, errors: [ErrorCode.FORBIDDEN] });
  });

  it('SERIES_NOT_FOUND when the row does not exist', async () => {
    const prisma = fakePrisma();
    prisma.orderSeries.findUnique.mockResolvedValueOnce(null);
    const result = await getSeries(prisma, REQUESTER, SERIES_ID, NOW);
    expect(result).toEqual({ ok: false, errors: [ErrorCode.SERIES_NOT_FOUND] });
  });

  it('listMySeries returns every row scoped to the requester, with extras', async () => {
    const prisma = fakePrisma();
    const rows = await listMySeries(prisma, REQUESTER, NOW);
    expect(prisma.orderSeries.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { requesterId: REQUESTER } }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveProperty('upcomingDates');
  });
});

describe('editSeries', () => {
  it('validates only the fields sent and rejects an unsupported field', async () => {
    const prisma = fakePrisma();
    const result = await editSeries(prisma, REQUESTER, SERIES_ID, { foo: 1 } as never, NOW);
    expect(result).toEqual({ ok: false, errors: [ErrorCode.INVALID_FIELD] });
  });

  it('SERIES_NOT_FOUND for a missing series', async () => {
    const prisma = fakePrisma();
    prisma.orderSeries.findUnique.mockResolvedValueOnce(null);
    const result = await editSeries(prisma, REQUESTER, SERIES_ID, { credits: 5 }, NOW);
    expect(result).toEqual({ ok: false, errors: [ErrorCode.SERIES_NOT_FOUND] });
  });

  it('FORBIDDEN for a non-owner', async () => {
    const prisma = fakePrisma();
    const result = await editSeries(prisma, OTHER_USER, SERIES_ID, { credits: 5 }, NOW);
    expect(result).toEqual({ ok: false, errors: [ErrorCode.FORBIDDEN] });
  });

  it('a plain field edit (credits) does not touch startAt/nextFireAt', async () => {
    const prisma = fakePrisma();
    const result = await editSeries(prisma, REQUESTER, SERIES_ID, { credits: 9 }, NOW);
    expect(result.ok).toBe(true);
    expect(prisma.orderSeries.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ credits: 9 }),
      }),
    );
    const data = prisma.orderSeries.updateMany.mock.calls[0]![0].data;
    expect(data).not.toHaveProperty('startAt');
    expect(data).not.toHaveProperty('nextFireAt');
  });

  it('changing rrule resets DTSTART to the edit time and recomputes nextFireAt', async () => {
    const prisma = fakePrisma();
    const result = await editSeries(
      prisma,
      REQUESTER,
      SERIES_ID,
      { rrule: 'FREQ=WEEKLY;BYDAY=MO' },
      NOW,
    );
    expect(result.ok).toBe(true);
    expect(prisma.orderSeries.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rrule: 'FREQ=WEEKLY;BYDAY=MO',
          startAt: NOW,
          nextFireAt: NOW,
        }),
      }),
    );
  });

  it('sending the same rrule text is not a change: DTSTART and nextFireAt are untouched', async () => {
    const prisma = fakePrisma();
    const result = await editSeries(
      prisma,
      REQUESTER,
      SERIES_ID,
      { rrule: 'FREQ=DAILY;INTERVAL=1' },
      NOW,
    );
    expect(result.ok).toBe(true);
    const data = prisma.orderSeries.updateMany.mock.calls[0]![0].data;
    expect(data).not.toHaveProperty('startAt');
    expect(data).not.toHaveProperty('nextFireAt');
  });

  it('resuming (inactive -> active) recomputes nextFireAt from the resume time, keeping DTSTART', async () => {
    const prisma = fakePrisma();
    prisma.orderSeries.findUnique.mockResolvedValueOnce(
      baseSeriesRow({ status: 'inactive', startAt: new Date('2026-01-01T01:00:00.000Z') }),
    );
    const resumeAt = new Date('2026-11-09T05:00:00.000Z');
    const result = await editSeries(
      prisma,
      REQUESTER,
      SERIES_ID,
      { status: 'active' },
      resumeAt,
    );
    expect(result.ok).toBe(true);
    const data = prisma.orderSeries.updateMany.mock.calls[0]![0].data;
    expect(data.status).toBe('active');
    expect(data).not.toHaveProperty('startAt'); // DTSTART only resets on a rule change
    expect(data.nextFireAt).toEqual(new Date('2026-11-10T01:00:00.000Z'));
  });

  it('INVALID_STATUS for a bad status value', async () => {
    const prisma = fakePrisma();
    const result = await editSeries(
      prisma,
      REQUESTER,
      SERIES_ID,
      { status: 'bogus' } as never,
      NOW,
    );
    expect(result).toEqual({ ok: false, errors: [ErrorCode.INVALID_STATUS] });
  });

  it('SERIES_CONFLICT when the optimistic-lock update matches no row', async () => {
    const prisma = fakePrisma();
    prisma.orderSeries.updateMany.mockResolvedValueOnce({ count: 0 });
    const result = await editSeries(prisma, REQUESTER, SERIES_ID, { credits: 5 }, NOW);
    expect(result).toEqual({ ok: false, errors: [ErrorCode.SERIES_CONFLICT] });
  });

  it('an edit while a retry is in progress stops it, inserting a failed row and a notice', async () => {
    const prisma = fakePrisma();
    const retryingAt = new Date('2026-11-08T01:00:00.000Z');
    prisma.orderSeries.findUnique.mockResolvedValueOnce(
      baseSeriesRow({ currentOccurrenceAt: retryingAt }),
    );
    const result = await editSeries(prisma, REQUESTER, SERIES_ID, { credits: 5 }, NOW);
    expect(result.ok).toBe(true);

    expect(prisma.orderRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'failed',
        failureReason: SeriesFailureReason.EDITED_WHILE_RETRYING,
        completeBy: new Date(retryingAt.getTime() + 1440 * 60_000),
      }),
    });
    expect(prisma.outbox.createMany).toHaveBeenCalled();
    const updateData = prisma.orderSeries.updateMany.mock.calls[0]![0].data;
    expect(updateData).toMatchObject({
      currentOccurrenceAt: null,
      retryType: null,
      attemptCount: null,
      nextRetryAt: null,
    });
  });

  it('does not touch retry state or write a failed row when nothing was retrying', async () => {
    const prisma = fakePrisma();
    await editSeries(prisma, REQUESTER, SERIES_ID, { credits: 5 }, NOW);
    expect(prisma.orderRequest.create).not.toHaveBeenCalled();
    expect(prisma.outbox.createMany).not.toHaveBeenCalled();
  });
});

describe('deleteSeries', () => {
  it('deletes the series row (FK ON DELETE SET NULL clears seriesId on its orders)', async () => {
    const prisma = fakePrisma();
    const result = await deleteSeries(prisma, REQUESTER, SERIES_ID);
    expect(result).toEqual({ ok: true });
    expect(prisma.orderSeries.delete).toHaveBeenCalledWith({ where: { id: SERIES_ID } });
  });

  it('SERIES_NOT_FOUND for a missing series', async () => {
    const prisma = fakePrisma();
    prisma.orderSeries.findUnique.mockResolvedValueOnce(null);
    const result = await deleteSeries(prisma, REQUESTER, SERIES_ID);
    expect(result).toEqual({ ok: false, errors: [ErrorCode.SERIES_NOT_FOUND] });
  });

  it('FORBIDDEN for a non-owner', async () => {
    const prisma = fakePrisma();
    const result = await deleteSeries(prisma, OTHER_USER, SERIES_ID);
    expect(result).toEqual({ ok: false, errors: [ErrorCode.FORBIDDEN] });
  });

  it('deleting while a retry is in progress inserts a failed row and a notice in the same step', async () => {
    const prisma = fakePrisma();
    const retryingAt = new Date('2026-11-08T01:00:00.000Z');
    prisma.orderSeries.findUnique.mockResolvedValueOnce(
      baseSeriesRow({ currentOccurrenceAt: retryingAt }),
    );
    const result = await deleteSeries(prisma, REQUESTER, SERIES_ID);
    expect(result).toEqual({ ok: true });
    expect(prisma.orderRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'failed',
        failureReason: SeriesFailureReason.DELETED_WHILE_RETRYING,
      }),
    });
    expect(prisma.outbox.createMany).toHaveBeenCalled();
    expect(prisma.orderSeries.delete).toHaveBeenCalledWith({ where: { id: SERIES_ID } });
  });

  it('no failed row or notice when nothing was retrying', async () => {
    const prisma = fakePrisma();
    await deleteSeries(prisma, REQUESTER, SERIES_ID);
    expect(prisma.orderRequest.create).not.toHaveBeenCalled();
    expect(prisma.outbox.createMany).not.toHaveBeenCalled();
  });
});
