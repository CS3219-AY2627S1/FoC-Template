/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 e (instructions.md) - series service: createSeries, getSeries,
 *        listMySeries, editSeries, deleteSeries, and the failed-row insert helper used both
 *        here (edit/delete stopping an in-progress retry) and by Stage f's worker. Mirrors
 *        orders.service.ts's createOrder/editOrder validation and optimistic-lock patterns.
 *        durationMinutes omitted on create defaults to 60 minutes (1h) - the stage's open
 *        [DECIDE] placeholder ("default 1440 or required; waiting for George's completeBy
 *        change") was resolved once that change merged to main with a 1-hour default for
 *        normal orders (not the 24h instructions.md assumed); confirmed with the team to
 *        match it. The two notice messages (edited/paused vs deleted while retrying) were
 *        drafted and approved before use, per the stage's instructions.
 *        No other requirements, architecture, schema, or API decisions were made by the
 *        AI tool.
 * Author review:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 f (instructions.md) - exported formatSgDateTime, DEFAULT_DURATION_MINUTES
 *        and stoppedRetryWriteFor (as buildStoppedOccurrenceWrite) so the worker can build the
 *        same failed-row/notice shape for its own fire-time failure/skip outcomes; extended
 *        SeriesFailureReason with the worker's own reasons. No requirements, architecture,
 *        schema, or API decisions were made by the AI tool.
 * Author review:
 */

import type { PrismaClient } from '../db/prisma.js';
import type { Prisma, OrderSeries } from '../generated/prisma/client.js';
import { insertOutboxRows } from '../db/outbox.repository.js';
import { notifySeriesEvent } from '../queue/tasks.js';
import { ErrorCode } from '../constants/errors.js';
import {
  isNonEmptyString,
  isPositiveInt,
  isIsoDateString,
} from '../utils/validation.js';
import {
  buildRule,
  nextOccurrenceAtOrAfter,
  upcomingOccurrences,
} from '../domain/series-rule.js';
import type { CreateSeriesPayload, EditSeriesPayload } from '../types/series.js';
import { randomUUID } from 'node:crypto';

const MAX_DURATION_MINUTES = 1440;
// Matches orders.service.ts's DEFAULT_COMPLETE_BY_MS (George, 2026-11-09: normal orders
// default to 1 hour, not 24h as instructions.md's Stage 28 assumed before that change
// merged). My call per the stage's open [DECIDE] placeholder, confirmed with the team
// after the discrepancy was flagged.
export const DEFAULT_DURATION_MINUTES = 60;
const UPCOMING_DATES_COUNT = 3;

/** failureReason values this file writes; named UPPER_SNAKE like RESERVE_RETRIES_EXHAUSTED. */
export const SeriesFailureReason = {
  EDITED_WHILE_RETRYING: 'SERIES_EDITED_WHILE_RETRYING',
  DELETED_WHILE_RETRYING: 'SERIES_DELETED_WHILE_RETRYING',
  // Stage 28 f (worker) outcomes below.
  COMPLETE_BY_IN_PAST: 'SERIES_COMPLETE_BY_IN_PAST',
  USER_SUSPENDED: 'SERIES_USER_SUSPENDED',
  USER_LOCKED: 'SERIES_USER_LOCKED',
  USER_PENDING: 'SERIES_USER_PENDING',
  USER_NOT_FOUND: 'SERIES_USER_NOT_FOUND',
  USER_SERVICE_UNAVAILABLE: 'SERIES_USER_SERVICE_UNAVAILABLE',
  SUPPLIER_NOT_FOUND: 'SERIES_SUPPLIER_NOT_FOUND',
  DELIVERY_LOCATION_NOT_FOUND: 'SERIES_DELIVERY_LOCATION_NOT_FOUND',
  SUPPLIER_NO_OPENING_HOURS: 'SERIES_SUPPLIER_NO_OPENING_HOURS',
  SUPPLIER_CLOSED: 'SERIES_SUPPLIER_CLOSED',
  SUPPLIER_SERVICE_UNAVAILABLE: 'SERIES_SUPPLIER_SERVICE_UNAVAILABLE',
  RETRY_SUPERSEDED: 'SERIES_RETRY_SUPERSEDED',
  PENDING_ORDER_CONFLICT: 'SERIES_PENDING_ORDER_CONFLICT',
} as const;

const checkDeliveryDetails = (
  value: unknown,
): { error: ErrorCode } | { value: string } => {
  if (value === undefined || value === null)
    return { error: ErrorCode.MISSING_DELIVERY_DETAILS };
  if (typeof value !== 'string')
    return { error: ErrorCode.INVALID_DELIVERY_DETAILS };
  const trimmed = value.trim();
  if (!trimmed) return { error: ErrorCode.MISSING_DELIVERY_DETAILS };
  if (trimmed.length > 250) return { error: ErrorCode.INVALID_DELIVERY_DETAILS };
  return { value: trimmed };
};

const validateCredits = (credits: unknown): credits is number =>
  typeof credits === 'number' && Number.isInteger(credits) && credits > 0;

const validateAdditionalDetails = (value: unknown): boolean =>
  value === null || typeof value === 'string';

const validateDuration = (value: unknown): value is number =>
  isPositiveInt(value) && value <= MAX_DURATION_MINUTES;

/** Singapore-time, human-readable, for notice text (e.g. "9 Nov 2026, 3:00 PM"). */
export function formatSgDateTime(date: Date): string {
  return date.toLocaleString('en-SG', {
    timeZone: 'Asia/Singapore',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export type CreateSeriesResult =
  | { ok: true; series: OrderSeries }
  | { ok: false; errors: ErrorCode[] };

export const createSeries = async (
  prisma: PrismaClient,
  requesterId: string,
  payload: CreateSeriesPayload,
  now: Date = new Date(),
): Promise<CreateSeriesResult> => {
  const errors: ErrorCode[] = [];

  if (!payload.supplierId) {
    errors.push(ErrorCode.MISSING_SUPPLIER);
  } else if (!isPositiveInt(payload.supplierId)) {
    errors.push(ErrorCode.INVALID_SUPPLIER);
  }
  if (!payload.description) {
    errors.push(ErrorCode.MISSING_DESCRIPTION);
  } else if (!isNonEmptyString(payload.description)) {
    errors.push(ErrorCode.INVALID_DESCRIPTION);
  }
  if (payload.deliveryLocationId === undefined || payload.deliveryLocationId === null) {
    errors.push(ErrorCode.MISSING_DELIVERY_LOCATION);
  } else if (!isPositiveInt(payload.deliveryLocationId)) {
    errors.push(ErrorCode.INVALID_DELIVERY_LOCATION);
  }
  const details = checkDeliveryDetails(payload.deliveryDetails);
  if ('error' in details) errors.push(details.error);
  if (payload.credits === undefined || payload.credits === null) {
    errors.push(ErrorCode.MISSING_CREDITS_OFFERED);
  } else if (!validateCredits(payload.credits)) {
    errors.push(ErrorCode.INVALID_CREDITS_OFFERED);
  }
  if (
    payload.additionalDetails !== undefined &&
    !validateAdditionalDetails(payload.additionalDetails)
  ) {
    errors.push(ErrorCode.INVALID_ADDITIONAL_DETAILS);
  }

  if (!isNonEmptyString(payload.rrule)) {
    errors.push(ErrorCode.MISSING_RULE);
  }

  let durationMinutes = DEFAULT_DURATION_MINUTES;
  if (payload.durationMinutes !== undefined) {
    if (!validateDuration(payload.durationMinutes)) {
      errors.push(ErrorCode.INVALID_DURATION);
    } else {
      durationMinutes = payload.durationMinutes;
    }
  }

  let dtstart: Date;
  if (payload.startNow === true) {
    dtstart = now;
  } else if (payload.startAt !== undefined) {
    if (!isIsoDateString(payload.startAt)) {
      errors.push(ErrorCode.INVALID_START);
      dtstart = now;
    } else {
      dtstart = new Date(payload.startAt);
    }
  } else {
    errors.push(ErrorCode.MISSING_START_TIME);
    dtstart = now;
  }

  if (errors.length) return { ok: false, errors };

  const rule = buildRule(payload.rrule, dtstart);
  if (!rule) return { ok: false, errors: [ErrorCode.INVALID_RULE] };
  const nextFireAt = nextOccurrenceAtOrAfter(rule, dtstart);
  if (!nextFireAt) return { ok: false, errors: [ErrorCode.INVALID_RULE] };

  const series = await prisma.orderSeries.create({
    data: {
      requesterId,
      supplierId: payload.supplierId,
      description: payload.description,
      deliveryLocationId: payload.deliveryLocationId,
      deliveryDetails: 'value' in details ? details.value : '',
      credits: payload.credits,
      durationMinutes,
      additionalDetails: payload.additionalDetails ?? null,
      rrule: payload.rrule,
      startAt: dtstart,
      nextFireAt,
      status: 'active',
    },
  });
  return { ok: true, series };
};

/** Fields exposed over the API: retry state and nextFireAt are not (instructions.md). */
export interface PublicSeries {
  id: string;
  requesterId: string;
  supplierId: number;
  description: string;
  deliveryLocationId: number;
  deliveryDetails: string;
  credits: number;
  durationMinutes: number | null;
  additionalDetails: string | null;
  rrule: string;
  startAt: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  upcomingDates: string[];
  activeOrderCount: number;
}

async function toPublicSeries(
  prisma: PrismaClient,
  series: OrderSeries,
  now: Date,
): Promise<PublicSeries> {
  const {
    currentOccurrenceAt: _currentOccurrenceAt,
    retryType: _retryType,
    attemptCount: _attemptCount,
    nextRetryAt: _nextRetryAt,
    nextFireAt: _nextFireAt,
    ...rest
  } = series;
  const rule = buildRule(series.rrule, series.startAt);
  const upcomingDates = rule
    ? upcomingOccurrences(rule, now, UPCOMING_DATES_COUNT).map((d) => d.toISOString())
    : [];
  const activeOrderCount = await prisma.orderRequest.count({
    where: { seriesId: series.id, status: { in: ['pending', 'open'] } },
  });
  return { ...rest, upcomingDates, activeOrderCount };
}

export type GetSeriesResult =
  | { ok: true; series: PublicSeries }
  | { ok: false; errors: ErrorCode[] };

export const getSeries = async (
  prisma: PrismaClient,
  actorId: string,
  seriesId: string,
  now: Date = new Date(),
): Promise<GetSeriesResult> => {
  const series = await prisma.orderSeries.findUnique({ where: { id: seriesId } });
  if (!series) return { ok: false, errors: [ErrorCode.SERIES_NOT_FOUND] };
  if (series.requesterId !== actorId) return { ok: false, errors: [ErrorCode.FORBIDDEN] };
  return { ok: true, series: await toPublicSeries(prisma, series, now) };
};

export const listMySeries = async (
  prisma: PrismaClient,
  requesterId: string,
  now: Date = new Date(),
): Promise<PublicSeries[]> => {
  const rows = await prisma.orderSeries.findMany({
    where: { requesterId },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });
  return Promise.all(rows.map((series) => toPublicSeries(prisma, series, now)));
};

/**
 * Builds the failed/skipped-row + notice tasks for one occurrence of `series`, scheduled at
 * `scheduledAt` (its own `completeBy` is `scheduledAt` + the series' duration). Used here
 * (edit/delete stopping an in-progress retry, `scheduledAt` = `currentOccurrenceAt`) and by
 * Stage f's worker for its own fire-time failure/skip outcomes.
 */
export function buildStoppedOccurrenceWrite(
  series: OrderSeries,
  scheduledAt: Date,
  message: string,
  failureReason: string,
): {
  create: Prisma.OrderRequestCreateInput;
  notice: ReturnType<typeof notifySeriesEvent>;
} {
  const durationMinutes = series.durationMinutes ?? DEFAULT_DURATION_MINUTES;
  const completeBy = new Date(scheduledAt.getTime() + durationMinutes * 60_000);
  return {
    create: {
      requesterId: series.requesterId,
      supplierId: series.supplierId,
      description: series.description,
      deliveryLocationId: series.deliveryLocationId,
      deliveryDetails: series.deliveryDetails,
      credits: series.credits,
      completeBy,
      additionalDetails: series.additionalDetails,
      status: 'failed',
      series: { connect: { id: series.id } },
      failureReason,
    },
    notice: notifySeriesEvent({
      userId: series.requesterId,
      messageId: randomUUID(),
      message,
    }),
  };
}

/** Inserts a series failure/skip row and its notice in one transaction. Used here (edit/delete
 *  stopping an in-progress retry) and by Stage f's worker for its own failure/skip outcomes. */
export async function insertFailedSeriesRow(
  tx: Prisma.TransactionClient,
  row: Prisma.OrderRequestCreateInput,
  notice: { userId: string; messageId: string; message: string },
): Promise<void> {
  const created = await tx.orderRequest.create({ data: row });
  await insertOutboxRows(tx, created.version, [notifySeriesEvent(notice)]);
}

const EDITABLE_SERIES_FIELDS = new Set([
  'supplierId',
  'description',
  'deliveryLocationId',
  'deliveryDetails',
  'credits',
  'durationMinutes',
  'additionalDetails',
  'rrule',
  'status',
]);

export type EditSeriesResult =
  | { ok: true; series: PublicSeries }
  | { ok: false; errors: ErrorCode[] };

export const editSeries = async (
  prisma: PrismaClient,
  actorId: string,
  seriesId: string,
  payload: EditSeriesPayload,
  now: Date = new Date(),
): Promise<EditSeriesResult> => {
  const errors: ErrorCode[] = [];
  let detailsValue: string | undefined;
  for (const [key, value] of Object.entries(payload)) {
    if (!EDITABLE_SERIES_FIELDS.has(key)) {
      errors.push(ErrorCode.INVALID_FIELD);
      continue;
    }
    if (key === 'supplierId') {
      if (!isPositiveInt(value)) errors.push(ErrorCode.INVALID_SUPPLIER);
    } else if (key === 'description') {
      if (!isNonEmptyString(value)) errors.push(ErrorCode.INVALID_DESCRIPTION);
    } else if (key === 'deliveryLocationId') {
      if (!isPositiveInt(value)) errors.push(ErrorCode.INVALID_DELIVERY_LOCATION);
    } else if (key === 'deliveryDetails') {
      const details = checkDeliveryDetails(value);
      if ('error' in details) errors.push(details.error);
      else detailsValue = details.value;
    } else if (key === 'credits') {
      if (!validateCredits(value)) errors.push(ErrorCode.INVALID_CREDITS_OFFERED);
    } else if (key === 'durationMinutes') {
      if (!validateDuration(value)) errors.push(ErrorCode.INVALID_DURATION);
    } else if (key === 'additionalDetails') {
      if (!validateAdditionalDetails(value))
        errors.push(ErrorCode.INVALID_ADDITIONAL_DETAILS);
    } else if (key === 'rrule') {
      if (!isNonEmptyString(value)) errors.push(ErrorCode.MISSING_RULE);
    } else if (key === 'status') {
      if (value !== 'active' && value !== 'inactive')
        errors.push(ErrorCode.INVALID_STATUS);
    }
  }
  if (errors.length) return { ok: false, errors };

  const series = await prisma.orderSeries.findUnique({ where: { id: seriesId } });
  if (!series) return { ok: false, errors: [ErrorCode.SERIES_NOT_FOUND] };
  if (series.requesterId !== actorId) return { ok: false, errors: [ErrorCode.FORBIDDEN] };

  const newRruleText =
    typeof payload.rrule === 'string' ? payload.rrule : series.rrule;
  const ruleChanged = typeof payload.rrule === 'string' && payload.rrule !== series.rrule;
  const resuming = series.status === 'inactive' && payload.status === 'active';

  const dtstart = ruleChanged ? now : series.startAt;
  let nextFireAt = series.nextFireAt;
  if (ruleChanged || resuming) {
    const rule = buildRule(newRruleText, dtstart);
    if (!rule) return { ok: false, errors: [ErrorCode.INVALID_RULE] };
    const next = nextOccurrenceAtOrAfter(rule, now);
    if (!next) return { ok: false, errors: [ErrorCode.INVALID_RULE] };
    nextFireAt = next;
  }

  const wasRetrying = series.currentOccurrenceAt !== null;
  const updated = await prisma.$transaction(async (tx) => {
    const data: Prisma.OrderSeriesUpdateManyMutationInput = {
      ...(payload.supplierId !== undefined && { supplierId: payload.supplierId }),
      ...(payload.description !== undefined && { description: payload.description }),
      ...(payload.deliveryLocationId !== undefined && {
        deliveryLocationId: payload.deliveryLocationId,
      }),
      ...(detailsValue !== undefined && { deliveryDetails: detailsValue }),
      ...(payload.credits !== undefined && { credits: payload.credits }),
      ...(payload.durationMinutes !== undefined && {
        durationMinutes: payload.durationMinutes,
      }),
      ...(payload.additionalDetails !== undefined && {
        additionalDetails: payload.additionalDetails,
      }),
      ...(ruleChanged && { rrule: newRruleText, startAt: dtstart }),
      ...(payload.status !== undefined && { status: payload.status }),
      ...((ruleChanged || resuming) && { nextFireAt }),
      ...(wasRetrying && {
        currentOccurrenceAt: null,
        retryType: null,
        attemptCount: null,
        nextRetryAt: null,
      }),
      version: { increment: 1 },
    };
    const { count } = await tx.orderSeries.updateMany({
      where: { id: series.id, version: series.version },
      data,
    });
    if (count === 0) return null;

    if (wasRetrying) {
      const { create, notice } = buildStoppedOccurrenceWrite(
        series,
        series.currentOccurrenceAt as Date,
        `We couldn't complete your recurring errand's delivery scheduled for ` +
          `${formatSgDateTime(series.currentOccurrenceAt as Date)}: the series was changed ` +
          `while we were waiting to retry it. Later occurrences are not affected.`,
        SeriesFailureReason.EDITED_WHILE_RETRYING,
      );
      const createdRow = await tx.orderRequest.create({ data: create });
      await insertOutboxRows(tx, createdRow.version, [notice]);
    }
    return tx.orderSeries.findUniqueOrThrow({ where: { id: series.id } });
  });
  if (!updated) return { ok: false, errors: [ErrorCode.SERIES_CONFLICT] };
  return { ok: true, series: await toPublicSeries(prisma, updated, now) };
};

export type DeleteSeriesResult =
  | { ok: true }
  | { ok: false; errors: ErrorCode[] };

/**
 * Deletes the series (its FK ON DELETE SET NULL clears seriesId on posted orders). If a
 * retry was in progress, the stopped occurrence's failed row and notice are written in the
 * same transaction as the delete, per instructions.md's Notifications section.
 */
export const deleteSeries = async (
  prisma: PrismaClient,
  actorId: string,
  seriesId: string,
): Promise<DeleteSeriesResult> => {
  const series = await prisma.orderSeries.findUnique({ where: { id: seriesId } });
  if (!series) return { ok: false, errors: [ErrorCode.SERIES_NOT_FOUND] };
  if (series.requesterId !== actorId) return { ok: false, errors: [ErrorCode.FORBIDDEN] };

  await prisma.$transaction(async (tx) => {
    if (series.currentOccurrenceAt !== null) {
      const { create, notice } = buildStoppedOccurrenceWrite(
        series,
        series.currentOccurrenceAt as Date,
        `We couldn't complete your recurring errand's delivery scheduled for ` +
          `${formatSgDateTime(series.currentOccurrenceAt as Date)}: the series was deleted ` +
          `while we were waiting to retry it.`,
        SeriesFailureReason.DELETED_WHILE_RETRYING,
      );
      const createdRow = await tx.orderRequest.create({ data: create });
      await insertOutboxRows(tx, createdRow.version, [notice]);
    }
    await tx.orderSeries.delete({ where: { id: series.id } });
  });
  return { ok: true };
};
