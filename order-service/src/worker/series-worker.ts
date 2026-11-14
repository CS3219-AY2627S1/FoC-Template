/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 f (instructions.md) - the scheduled-errands worker: a 1-second
 *        scheduler (startScheduledTask, like release-redrive.ts) that claims due series
 *        (updateMany guarded by version) and runs the fire-time checks, retry and
 *        catch-up/skip/finished-series-deletion rules from instructions.md's "Firing and
 *        failures" / "Fire-time checks" / "Next opening time" tables. Posting reuses
 *        orders.service.ts's createPendingOrderAndSettle ("the normal create path"),
 *        extracted from createOrder for this purpose in the same stage. The retry
 *        backoff (up to 4 attempts, waits capped 1/2/4 s with full jitter) mirrors
 *        user-service's email.service.ts Stage 19 shape, but is persisted across ticks via
 *        the series row's own retry columns (currentOccurrenceAt/retryType/attemptCount/
 *        nextRetryAt) rather than a blocking in-process loop, since the scheduler must not
 *        block on one series while others are due; the 30 s overall deadline is not
 *        tracked with its own timestamp column (none exists) but is satisfied structurally
 *        by the 4-attempt cap together with each call's own 3 s timeout and the 1/2/4 s
 *        backoff caps (worst case well under 30 s). A requester already having another
 *        pending order at the moment an occurrence posts is not one of instructions.md's
 *        listed outcomes (it predates Stage 28 e/f: George, 2026-11-09 made normal-order
 *        creation synchronous and added that one-pending-order-at-a-time exclusivity);
 *        treated like any other post-time failure (failed row + notice, not retried),
 *        flagged for the team as a deviation. No requirements, architecture, schema, or API
 *        decisions were made by the AI tool; the two notice-wording families (entering a
 *        retry, and failing/skipping) were drafted for this stage and should be reviewed.
 * Author review:
 */

import { randomUUID } from 'node:crypto';
import type { ConnectionOptions } from 'bullmq';
import type { PrismaClient } from '../db/prisma.js';
import { RetryType, type OrderSeries } from '../generated/prisma/client.js';
import { insertOutboxRows } from '../db/outbox.repository.js';
import { buildChatNotificationTask, notifySeriesEvent } from '../queue/tasks.js';
import { startScheduledTask } from '../queue/scheduled-task.js';
import { buildRule, upcomingOccurrences } from '../domain/series-rule.js';
import {
  buildStoppedOccurrenceWrite,
  DEFAULT_DURATION_MINUTES,
  formatSgDateTime,
  SeriesFailureReason,
} from '../services/series.service.js';
import { createPendingOrderAndSettle } from '../services/orders.service.js';
import type { UserClient } from '../clients/user.client.js';
import type { SuppliersClient } from '../clients/suppliers.client.js';
import type { CreditsClient } from '../clients/credits.client.js';
import type { OrderEventPublisher } from '../realtime/order-events.js';

export const SERIES_WORKER_QUEUE_KEY = 'queue:order:series-scheduler';
export const SERIES_WORKER_INTERVAL_MS = 1_000;
export const SERIES_WORKER_BATCH_SIZE = 100;

/** Stage 19 shape, adapted: 4 attempts, waits capped 1/2/4 s with full jitter. */
const MAX_ATTEMPTS = 4;
const BACKOFF_CAP_SECONDS = 4;
/** "Posted late" note threshold (instructions.md): > 1 minute after the scheduled time. */
const LATE_THRESHOLD_MS = 60_000;

export interface SeriesWorkerDeps {
  prisma: PrismaClient;
  users: UserClient;
  suppliers: SuppliersClient;
  credits: CreditsClient;
  events?: OrderEventPublisher;
  /** Defaults to `new Date()`; overridable so tests can pass fixed Dates. */
  now?: () => Date;
}

/** After the n-th failed attempt: random() x min(4, 2^(n-1)) seconds (full jitter). */
function backoffMs(attemptNumber: number): number {
  const capSeconds = Math.min(BACKOFF_CAP_SECONDS, 2 ** (attemptNumber - 1));
  return Math.random() * capSeconds * 1000;
}

type Decision =
  | { kind: 'post' }
  | { kind: 'fail'; reason: string; message: string }
  | {
      kind: 'retry';
      retryType: RetryType;
      attemptCount: number;
      nextRetryAt: Date;
      /** Set only when this is the first time this occurrence enters this retry type
       *  (instructions.md: notice on first failure, except supplier-unreachable). */
      notice?: string;
    };

type UserCheckOutcome =
  | { kind: 'ok' }
  | { kind: 'unavailable' }
  | { kind: 'fail'; reason: string; message: string };

type SupplierCheckOutcome =
  | { kind: 'ok' }
  | { kind: 'unavailable' }
  | { kind: 'fail'; reason: string; message: string }
  | { kind: 'closedRetry'; nextOpeningAt: Date };

async function checkUser(
  deps: SeriesWorkerDeps,
  series: OrderSeries,
  scheduledAt: Date,
  now: Date,
): Promise<UserCheckOutcome> {
  const check = await deps.users.statusForWorker(series.requesterId);
  const when = formatSgDateTime(scheduledAt);
  if (check.existence === 'unavailable') return { kind: 'unavailable' };
  if (check.existence === 'not_found') {
    return {
      kind: 'fail',
      reason: SeriesFailureReason.USER_NOT_FOUND,
      message: `Your recurring errand's delivery scheduled for ${when} could not be posted: your account could not be found.`,
    };
  }
  if (check.status === 'pending') {
    return {
      kind: 'fail',
      reason: SeriesFailureReason.USER_PENDING,
      message: `Your recurring errand's delivery scheduled for ${when} could not be posted: your account is still pending verification.`,
    };
  }
  if (check.status === 'suspended') {
    return {
      kind: 'fail',
      reason: SeriesFailureReason.USER_SUSPENDED,
      message: `Your recurring errand's delivery scheduled for ${when} could not be posted: your account is suspended.`,
    };
  }
  if (check.lockedUntil && check.lockedUntil.getTime() > now.getTime()) {
    return {
      kind: 'fail',
      reason: SeriesFailureReason.USER_LOCKED,
      message: `Your recurring errand's delivery scheduled for ${when} could not be posted: your account is temporarily locked.`,
    };
  }
  return { kind: 'ok' };
}

async function checkSupplier(
  deps: SeriesWorkerDeps,
  series: OrderSeries,
  scheduledAt: Date,
  completeBy: Date,
  followingOccurrence: Date | null,
  now: Date,
): Promise<SupplierCheckOutcome> {
  const when = formatSgDateTime(scheduledAt);
  const supplierCheck = await deps.suppliers.supplierStatusForWorker(series.supplierId, now);
  if (supplierCheck.existence === 'unavailable') return { kind: 'unavailable' };
  if (supplierCheck.existence === 'not_found') {
    return {
      kind: 'fail',
      reason: SeriesFailureReason.SUPPLIER_NOT_FOUND,
      message: `Your recurring errand's delivery scheduled for ${when} could not be posted: the supplier could not be found.`,
    };
  }

  const locationExistence = await deps.suppliers.locationExistsForWorker(series.deliveryLocationId);
  if (locationExistence === 'unavailable') return { kind: 'unavailable' };
  if (locationExistence === 'not_found') {
    return {
      kind: 'fail',
      reason: SeriesFailureReason.DELIVERY_LOCATION_NOT_FOUND,
      message: `Your recurring errand's delivery scheduled for ${when} could not be posted: the delivery location could not be found.`,
    };
  }

  if (supplierCheck.hasNoOpeningHours) {
    return {
      kind: 'fail',
      reason: SeriesFailureReason.SUPPLIER_NO_OPENING_HOURS,
      message: `Your recurring errand's delivery scheduled for ${when} could not be posted: the supplier has no opening hours set.`,
    };
  }

  if (!supplierCheck.closed) return { kind: 'ok' };

  const nextOpeningAt = supplierCheck.nextOpeningAt;
  if (!nextOpeningAt || nextOpeningAt.getTime() > completeBy.getTime()) {
    return {
      kind: 'fail',
      reason: SeriesFailureReason.SUPPLIER_CLOSED,
      message: `Your recurring errand's delivery scheduled for ${when} could not be posted: the supplier is closed and would not reopen before the delivery deadline.`,
    };
  }
  if (followingOccurrence && nextOpeningAt.getTime() > followingOccurrence.getTime()) {
    return {
      kind: 'fail',
      reason: SeriesFailureReason.SUPPLIER_CLOSED,
      message: `Your recurring errand's delivery scheduled for ${when} was dropped: the supplier would still be closed at the next scheduled delivery.`,
    };
  }
  return { kind: 'closedRetry', nextOpeningAt };
}

function noticeForEnteringRetry(retryType: RetryType, scheduledAt: Date): string | undefined {
  const when = formatSgDateTime(scheduledAt);
  if (retryType === RetryType.supplier_service_unreachable) return undefined; // notify only when exhausted
  if (retryType === RetryType.user_service_unreachable) {
    return `We're having trouble posting your recurring errand's delivery scheduled for ${when}: we can't reach the user service right now. We'll keep retrying.`;
  }
  return `We're having trouble posting your recurring errand's delivery scheduled for ${when}: the supplier is closed right now. We'll retry when it opens.`;
}

function exhaustedMessage(retryType: RetryType, scheduledAt: Date): string {
  const when = formatSgDateTime(scheduledAt);
  const service = retryType === RetryType.user_service_unreachable ? 'user' : 'supplier';
  return `Your recurring errand's delivery scheduled for ${when} could not be posted: we could not reach the ${service} service after several attempts.`;
}

function decisionFromSupplierOutcome(
  outcome: SupplierCheckOutcome,
  scheduledAt: Date,
  now: Date,
): Decision {
  if (outcome.kind === 'fail') return { kind: 'fail', reason: outcome.reason, message: outcome.message };
  if (outcome.kind === 'unavailable') {
    return {
      kind: 'retry',
      retryType: RetryType.supplier_service_unreachable,
      attemptCount: 1,
      nextRetryAt: new Date(now.getTime() + backoffMs(1)),
      notice: noticeForEnteringRetry(RetryType.supplier_service_unreachable, scheduledAt),
    };
  }
  if (outcome.kind === 'closedRetry') {
    return {
      kind: 'retry',
      retryType: RetryType.supplier_closed,
      attemptCount: 1,
      nextRetryAt: outcome.nextOpeningAt,
      notice: noticeForEnteringRetry(RetryType.supplier_closed, scheduledAt),
    };
  }
  return { kind: 'post' };
}

async function evaluateNewOccurrence(
  deps: SeriesWorkerDeps,
  series: OrderSeries,
  scheduledAt: Date,
  completeBy: Date,
  followingOccurrence: Date | null,
  now: Date,
): Promise<Decision> {
  const user = await checkUser(deps, series, scheduledAt, now);
  if (user.kind === 'fail') return { kind: 'fail', reason: user.reason, message: user.message };
  if (user.kind === 'unavailable') {
    return {
      kind: 'retry',
      retryType: RetryType.user_service_unreachable,
      attemptCount: 1,
      nextRetryAt: new Date(now.getTime() + backoffMs(1)),
      notice: noticeForEnteringRetry(RetryType.user_service_unreachable, scheduledAt),
    };
  }
  const supplier = await checkSupplier(deps, series, scheduledAt, completeBy, followingOccurrence, now);
  return decisionFromSupplierOutcome(supplier, scheduledAt, now);
}

async function evaluateContinuedRetry(
  deps: SeriesWorkerDeps,
  series: OrderSeries,
  scheduledAt: Date,
  completeBy: Date,
  followingOccurrence: Date | null,
  now: Date,
): Promise<Decision> {
  const attemptCount = series.attemptCount ?? 0;
  const retryType = series.retryType as RetryType;

  if (retryType === RetryType.user_service_unreachable) {
    const user = await checkUser(deps, series, scheduledAt, now);
    if (user.kind === 'fail') return { kind: 'fail', reason: user.reason, message: user.message };
    if (user.kind === 'unavailable') {
      const nextAttempt = attemptCount + 1;
      if (nextAttempt > MAX_ATTEMPTS) {
        return {
          kind: 'fail',
          reason: SeriesFailureReason.USER_SERVICE_UNAVAILABLE,
          message: exhaustedMessage(retryType, scheduledAt),
        };
      }
      return {
        kind: 'retry',
        retryType,
        attemptCount: nextAttempt,
        nextRetryAt: new Date(now.getTime() + backoffMs(nextAttempt)),
      };
    }
    const supplier = await checkSupplier(deps, series, scheduledAt, completeBy, followingOccurrence, now);
    return decisionFromSupplierOutcome(supplier, scheduledAt, now);
  }

  if (retryType === RetryType.supplier_service_unreachable) {
    const supplier = await checkSupplier(deps, series, scheduledAt, completeBy, followingOccurrence, now);
    if (supplier.kind === 'unavailable') {
      const nextAttempt = attemptCount + 1;
      if (nextAttempt > MAX_ATTEMPTS) {
        return {
          kind: 'fail',
          reason: SeriesFailureReason.SUPPLIER_SERVICE_UNAVAILABLE,
          message: exhaustedMessage(retryType, scheduledAt),
        };
      }
      return {
        kind: 'retry',
        retryType,
        attemptCount: nextAttempt,
        nextRetryAt: new Date(now.getTime() + backoffMs(nextAttempt)),
      };
    }
    return decisionFromSupplierOutcome(supplier, scheduledAt, now);
  }

  // supplier_closed: "Re-check the USER on every such retry."
  const user = await checkUser(deps, series, scheduledAt, now);
  if (user.kind === 'fail') return { kind: 'fail', reason: user.reason, message: user.message };
  if (user.kind === 'unavailable') {
    return {
      kind: 'retry',
      retryType: RetryType.user_service_unreachable,
      attemptCount: 1,
      nextRetryAt: new Date(now.getTime() + backoffMs(1)),
      notice: noticeForEnteringRetry(RetryType.user_service_unreachable, scheduledAt),
    };
  }
  const supplier = await checkSupplier(deps, series, scheduledAt, completeBy, followingOccurrence, now);
  return decisionFromSupplierOutcome(supplier, scheduledAt, now);
}

/** Claims the series for a successful post: clears any retry state, advances `nextFireAt`
 *  (or deletes the row when there is no next occurrence - instructions.md's "finished
 *  series" rule, safe here since a successful post never leaves a retry in progress). */
async function claimForPost(
  deps: SeriesWorkerDeps,
  series: OrderSeries,
  followingOccurrence: Date | null,
): Promise<boolean> {
  if (followingOccurrence === null) {
    const { count } = await deps.prisma.orderSeries.deleteMany({
      where: { id: series.id, version: series.version },
    });
    return count > 0;
  }
  const { count } = await deps.prisma.orderSeries.updateMany({
    where: { id: series.id, version: series.version },
    data: {
      nextFireAt: followingOccurrence,
      currentOccurrenceAt: null,
      retryType: null,
      attemptCount: null,
      nextRetryAt: null,
      version: { increment: 1 },
    },
  });
  return count > 0;
}

/** Claims the series for a failed/skipped occurrence: same advance/delete as claimForPost,
 *  plus the failed row and notice in the same transaction. */
async function claimForFail(
  deps: SeriesWorkerDeps,
  series: OrderSeries,
  followingOccurrence: Date | null,
  scheduledAt: Date,
  reason: string,
  message: string,
): Promise<boolean> {
  const { create, notice } = buildStoppedOccurrenceWrite(series, scheduledAt, message, reason);
  return deps.prisma.$transaction(async (tx) => {
    if (followingOccurrence === null) {
      const { count } = await tx.orderSeries.deleteMany({
        where: { id: series.id, version: series.version },
      });
      if (count === 0) return false;
    } else {
      const { count } = await tx.orderSeries.updateMany({
        where: { id: series.id, version: series.version },
        data: {
          nextFireAt: followingOccurrence,
          currentOccurrenceAt: null,
          retryType: null,
          attemptCount: null,
          nextRetryAt: null,
          version: { increment: 1 },
        },
      });
      if (count === 0) return false;
    }
    const createdRow = await tx.orderRequest.create({ data: create });
    await insertOutboxRows(tx, createdRow.version, [notice]);
    return true;
  });
}

/** Claims the series to (re)enter a retry state. `isNewOccurrence` controls whether
 *  `currentOccurrenceAt`/`nextFireAt` are being set for the first time (a brand-new
 *  occurrence going straight into retry) or left alone (an existing retry continuing,
 *  possibly switching `retryType`). */
async function claimForRetry(
  deps: SeriesWorkerDeps,
  series: OrderSeries,
  followingOccurrence: Date | null,
  decision: Decision & { kind: 'retry' },
  isNewOccurrence: boolean,
): Promise<boolean> {
  const notice = decision.notice
    ? notifySeriesEvent({ userId: series.requesterId, messageId: randomUUID(), message: decision.notice })
    : null;
  return deps.prisma.$transaction(async (tx) => {
    const { count } = await tx.orderSeries.updateMany({
      where: { id: series.id, version: series.version },
      data: {
        retryType: decision.retryType,
        attemptCount: decision.attemptCount,
        nextRetryAt: decision.nextRetryAt,
        version: { increment: 1 },
        ...(isNewOccurrence && {
          currentOccurrenceAt: series.nextFireAt,
          nextFireAt: followingOccurrence,
        }),
      },
    });
    if (count === 0) return false;
    if (notice) await insertOutboxRows(tx, series.version, [notice]);
    return true;
  });
}

async function writeFailureAfterAdvance(
  deps: SeriesWorkerDeps,
  series: OrderSeries,
  scheduledAt: Date,
  reason: string,
  message: string,
): Promise<void> {
  const { create, notice } = buildStoppedOccurrenceWrite(series, scheduledAt, message, reason);
  await deps.prisma.$transaction(async (tx) => {
    const createdRow = await tx.orderRequest.create({ data: create });
    await insertOutboxRows(tx, createdRow.version, [notice]);
  });
}

async function postOccurrence(
  deps: SeriesWorkerDeps,
  series: OrderSeries,
  scheduledAt: Date,
  completeBy: Date,
  now: Date,
): Promise<void> {
  const settled = await createPendingOrderAndSettle(
    deps.prisma,
    {
      requesterId: series.requesterId,
      supplierId: series.supplierId,
      description: series.description,
      deliveryLocationId: series.deliveryLocationId,
      deliveryDetails: series.deliveryDetails,
      credits: series.credits,
      completeBy,
      additionalDetails: series.additionalDetails,
      seriesId: series.id,
    },
    deps.credits,
    deps.events,
  );
  if (!settled) {
    // Deviation (see file header): the requester already had another pending order at
    // fire time. Not one of instructions.md's listed outcomes; the series has already
    // advanced past this occurrence, so it is treated like any other post-time failure.
    await writeFailureAfterAdvance(
      deps,
      series,
      scheduledAt,
      SeriesFailureReason.PENDING_ORDER_CONFLICT,
      `Your recurring errand's delivery scheduled for ${formatSgDateTime(scheduledAt)} could not be posted: you already had another order pending at that time.`,
    );
    return;
  }

  const { order } = settled;
  if (order.status === 'open' && now.getTime() - scheduledAt.getTime() > LATE_THRESHOLD_MS) {
    await deps.prisma.$transaction(async (tx) => {
      await insertOutboxRows(tx, order.version, [
        buildChatNotificationTask(
          order.id,
          "This errand was posted late because the recurring schedule couldn't be run on time.",
        ),
      ]);
    });
  }
}

async function applyDecision(
  deps: SeriesWorkerDeps,
  series: OrderSeries,
  followingOccurrence: Date | null,
  scheduledAt: Date,
  completeBy: Date,
  now: Date,
  decision: Decision,
  isNewOccurrence: boolean,
): Promise<void> {
  if (decision.kind === 'post') {
    const claimed = await claimForPost(deps, series, followingOccurrence);
    if (!claimed) return; // lost the claim race; another tick/worker already handled it
    await postOccurrence(deps, series, scheduledAt, completeBy, now);
    return;
  }
  if (decision.kind === 'fail') {
    await claimForFail(deps, series, followingOccurrence, scheduledAt, decision.reason, decision.message);
    return;
  }
  await claimForRetry(deps, series, followingOccurrence, decision, isNewOccurrence);
}

function nextOccurrenceAfter(series: OrderSeries, afterUtc: Date): Date | null {
  const rule = buildRule(series.rrule, series.startAt);
  if (!rule) return null;
  return upcomingOccurrences(rule, afterUtc, 1)[0] ?? null;
}

async function startOccurrence(deps: SeriesWorkerDeps, series: OrderSeries, now: Date): Promise<void> {
  const scheduledAt = series.nextFireAt as Date;
  const followingOccurrence = nextOccurrenceAfter(series, scheduledAt);
  const durationMinutes = series.durationMinutes ?? DEFAULT_DURATION_MINUTES;
  const completeBy = new Date(scheduledAt.getTime() + durationMinutes * 60_000);

  if (completeBy.getTime() <= now.getTime()) {
    await claimForFail(
      deps,
      series,
      followingOccurrence,
      scheduledAt,
      SeriesFailureReason.COMPLETE_BY_IN_PAST,
      `Your recurring errand's delivery scheduled for ${formatSgDateTime(scheduledAt)} was skipped: its deadline had already passed by the time we tried to post it.`,
    );
    return;
  }

  const decision = await evaluateNewOccurrence(deps, series, scheduledAt, completeBy, followingOccurrence, now);
  await applyDecision(deps, series, followingOccurrence, scheduledAt, completeBy, now, decision, true);
}

async function continueRetry(deps: SeriesWorkerDeps, series: OrderSeries, now: Date): Promise<void> {
  const scheduledAt = series.currentOccurrenceAt as Date;
  const followingOccurrence = series.nextFireAt; // set when the retry began
  const durationMinutes = series.durationMinutes ?? DEFAULT_DURATION_MINUTES;
  const completeBy = new Date(scheduledAt.getTime() + durationMinutes * 60_000);

  const decision = await evaluateContinuedRetry(deps, series, scheduledAt, completeBy, followingOccurrence, now);
  await applyDecision(deps, series, followingOccurrence, scheduledAt, completeBy, now, decision, false);
}

/** One retry slot per series: drops a stale retry when the next occurrence has become
 *  due, writing its failed row + notice, and returns the refreshed row so the caller can
 *  go on to start that new occurrence in the same tick. Null if the claim was lost. */
async function dropStaleRetryForNewOccurrence(
  deps: SeriesWorkerDeps,
  series: OrderSeries,
): Promise<OrderSeries | null> {
  const scheduledAt = series.currentOccurrenceAt as Date;
  const message = `We couldn't complete your recurring errand's delivery scheduled for ${formatSgDateTime(scheduledAt)}: the next occurrence became due before we could finish retrying it.`;
  const { create, notice } = buildStoppedOccurrenceWrite(
    series,
    scheduledAt,
    message,
    SeriesFailureReason.RETRY_SUPERSEDED,
  );
  const claimed = await deps.prisma.$transaction(async (tx) => {
    const { count } = await tx.orderSeries.updateMany({
      where: { id: series.id, version: series.version },
      data: {
        currentOccurrenceAt: null,
        retryType: null,
        attemptCount: null,
        nextRetryAt: null,
        version: { increment: 1 },
      },
    });
    if (count === 0) return false;
    const createdRow = await tx.orderRequest.create({ data: create });
    await insertOutboxRows(tx, createdRow.version, [notice]);
    return true;
  });
  if (!claimed) return null;
  return deps.prisma.orderSeries.findUnique({ where: { id: series.id } });
}

async function processSeries(deps: SeriesWorkerDeps, seriesIn: OrderSeries, now: Date): Promise<void> {
  let series = seriesIn;

  if (
    series.currentOccurrenceAt !== null &&
    series.nextFireAt !== null &&
    series.nextFireAt.getTime() <= now.getTime()
  ) {
    const refreshed = await dropStaleRetryForNewOccurrence(deps, series);
    if (!refreshed) return; // lost the claim race this tick
    series = refreshed;
  }

  if (series.currentOccurrenceAt !== null) {
    if (series.nextRetryAt === null || series.nextRetryAt.getTime() > now.getTime()) return;
    await continueRetry(deps, series, now);
    return;
  }

  if (series.nextFireAt !== null && series.nextFireAt.getTime() <= now.getTime()) {
    await startOccurrence(deps, series, now);
  }
}

/** Returns a function that runs one tick: claims and processes every due series, one at a
 *  time. Resolves to the number of candidates seen (for logging), not the number acted on
 *  (a lost claim race is not an error). */
export function createSeriesWorkerTick(deps: SeriesWorkerDeps) {
  return async function runSeriesTick(): Promise<number> {
    const now = deps.now ? deps.now() : new Date();
    const candidates = await deps.prisma.orderSeries.findMany({
      where: { OR: [{ nextFireAt: { lte: now } }, { nextRetryAt: { lte: now } }] },
      orderBy: [{ id: 'asc' }],
      take: SERIES_WORKER_BATCH_SIZE,
    });
    for (const series of candidates) {
      await processSeries(deps, series, now);
    }
    return candidates.length;
  };
}

/** Runs one series tick every second with a BullMQ job scheduler (startScheduledTask). */
export function startSeriesWorker(
  connection: ConnectionOptions,
  tick: () => Promise<number>,
  log: (message: string) => void = console.error,
): Promise<{ close(): Promise<void> }> {
  return startScheduledTask(
    connection,
    {
      queueKey: SERIES_WORKER_QUEUE_KEY,
      schedulerId: 'series-worker',
      jobName: 'series_tick',
      everyMs: SERIES_WORKER_INTERVAL_MS,
    },
    tick,
    log,
  );
}
