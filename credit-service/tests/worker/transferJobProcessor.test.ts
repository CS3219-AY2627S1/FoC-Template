// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-10-22
//  2026-10-22: Credit transfer consumer - the job processor against a real database:
//    a real reservation is transferred, redelivery is a no-op, each permanent code
//    dead-letters on the first attempt, and a transient failure retries four times
//    before being recorded. Requires a running credit-db.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import { UnrecoverableError } from 'bullmq';
import { afterAll, describe, expect, it, vi } from 'vitest';
import pool from '../../src/db/pool.js';
import { AppError } from '../../src/utils/AppError.js';
import {
  findDeadLettersByJobId,
  insertDeadLetter,
} from '../../src/db/queries/deadLetter.queries.js';
import {
  createTransferJobProcessor,
  isFinalFailure,
  type ProcessableJob,
} from '../../src/worker/transferJobProcessor.js';
import { MAX_ATTEMPTS, TRANSFER_TASK_NAME } from '../../src/queue/transferQueue.js';
import {
  closePool,
  countTransactionsForRequest,
  givenFundedUser,
  givenReservation,
  newRequestId,
  newUserId,
  readBalance,
} from '../helpers/db.js';

afterAll(async () => {
  await closePool();
});

let nextJobId = 0;
/** A job shaped the way order-service's relay publishes one. */
function transferJob(
  payload: unknown,
  { attemptsMade = 0, name = TRANSFER_TASK_NAME } = {},
): ProcessableJob {
  nextJobId += 1;
  return {
    id: `outbox-${nextJobId}`,
    name,
    data: payload,
    attemptsMade,
    opts: { attempts: MAX_ATTEMPTS },
  };
}

/** The real processor, with logging silenced and the real dead-letter write. */
function processor(overrides: Parameters<typeof createTransferJobProcessor>[0] | object = {}) {
  return createTransferJobProcessor({
    insertDeadLetter: (entry) => insertDeadLetter(pool, entry),
    log: () => {},
    logError: () => {},
    ...overrides,
  });
}

describe('credit_transfer job — the happy path', () => {
  it('moves both balances and writes the transfer row', async () => {
    const { requesterId, requestId } = await givenReservation(5);
    const courierId = await givenFundedUser();

    await processor()(transferJob({ requestId, courierId }));

    // Same arithmetic as the HTTP route, because it is the same service function.
    expect(await readBalance(requesterId)).toEqual({ total: 15, reserved: 0 });
    expect(await readBalance(courierId)).toEqual({ total: 25, reserved: 0 });
    expect(await countTransactionsForRequest(requestId)).toBe(2);
  });

  it('writes no dead letter when it succeeds', async () => {
    const { requestId } = await givenReservation(3);
    const courierId = await givenFundedUser();
    const job = transferJob({ requestId, courierId });

    await processor()(job);

    expect(await findDeadLettersByJobId(pool, job.id!)).toHaveLength(0);
  });
});

describe('redelivery — at-least-once means the same job arrives twice', () => {
  it('transfers once and treats the second delivery as success', async () => {
    const { requesterId, requestId } = await givenReservation(6);
    const courierId = await givenFundedUser();
    const run = processor();

    await run(transferJob({ requestId, courierId }));
    // Same payload again: BullMQ dedupes on jobId, but a genuinely re-created job
    // (a replayed outbox row) would reach the processor like this.
    await expect(run(transferJob({ requestId, courierId }))).resolves.toBeUndefined();

    expect(await readBalance(requesterId)).toEqual({ total: 14, reserved: 0 });
    expect(await readBalance(courierId)).toEqual({ total: 26, reserved: 0 });
    // One reservation + one transfer. The redelivery wrote nothing.
    expect(await countTransactionsForRequest(requestId)).toBe(2);
  });

  it('does not dead-letter an already-transferred request', async () => {
    const { requestId } = await givenReservation(2);
    const courierId = await givenFundedUser();
    const run = processor();
    await run(transferJob({ requestId, courierId }));

    const second = transferJob({ requestId, courierId });
    await run(second);

    expect(await findDeadLettersByJobId(pool, second.id!)).toHaveLength(0);
  });
});

describe('permanent failures dead-letter on the first attempt, not the fifth', () => {
  it('dead-letters an unknown courier', async () => {
    const { requestId } = await givenReservation(4);
    const job = transferJob({ requestId, courierId: newUserId() });

    await expect(processor()(job)).rejects.toThrow(UnrecoverableError);

    const rows = await findDeadLettersByJobId(pool, job.id!);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      task_name: TRANSFER_TASK_NAME,
      status: 'UNRESOLVED',
    });
    expect(rows[0]!.error_trace).toContain('COURIER_NOT_FOUND');
    // attemptsMade was 0, so BullMQ had four retries left and we refused them all.
    expect(job.attemptsMade).toBe(0);
  });

  it('dead-letters a request that was never reserved', async () => {
    const courierId = await givenFundedUser();
    const job = transferJob({ requestId: newRequestId(), courierId });

    await expect(processor()(job)).rejects.toThrow(UnrecoverableError);

    const rows = await findDeadLettersByJobId(pool, job.id!);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.error_trace).toContain('RESERVATION_NOT_FOUND');
  });

  it('dead-letters a request whose credits were already released', async () => {
    const { requestId } = await givenReservation(4);
    const courierId = await givenFundedUser();
    const { releaseCredits } = await import('../../src/services/credits.service.js');
    await releaseCredits(requestId);

    const job = transferJob({ requestId, courierId });
    await expect(processor()(job)).rejects.toThrow(UnrecoverableError);

    const rows = await findDeadLettersByJobId(pool, job.id!);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.error_trace).toContain('ALREADY_RELEASED');
  });

  it('dead-letters a malformed payload without touching the database', async () => {
    const job = transferJob({ requestId: 'not-a-uuid', courierId: newUserId() });
    await expect(processor()(job)).rejects.toThrow(UnrecoverableError);

    const rows = await findDeadLettersByJobId(pool, job.id!);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.error_trace).toContain('Invalid credit_transfer payload');
  });

  it('dead-letters a job published under the wrong name', async () => {
    const { requestId } = await givenReservation(1);
    const courierId = await givenFundedUser();
    const job = transferJob({ requestId, courierId }, { name: 'credit_reserve' });

    await expect(processor()(job)).rejects.toThrow(UnrecoverableError);
    expect(await findDeadLettersByJobId(pool, job.id!)).toHaveLength(1);
  });

  it('records the payload so the job can be replayed by hand', async () => {
    const requestId = newRequestId();
    const courierId = newUserId();
    const job = transferJob({ requestId, courierId });

    await expect(processor()(job)).rejects.toThrow(UnrecoverableError);

    const [row] = await findDeadLettersByJobId(pool, job.id!);
    expect(row!.payload).toEqual({ requestId, courierId });
  });
});

describe('transient failures retry, and are recorded only when attempts run out', () => {
  const transientError = (): never => {
    throw new AppError(500, 'Internal server error.', 'INTERNAL_ERROR');
  };

  it('rethrows without dead-lettering while attempts remain', async () => {
    const run = processor({ transfer: async () => transientError() });
    // attemptsMade 0..3 — the first four of five attempts.
    for (const attemptsMade of [0, 1, 2, 3]) {
      const job = transferJob({ requestId: newRequestId(), courierId: newUserId() }, {
        attemptsMade,
      });
      await expect(run(job)).rejects.toThrow('Internal server error.');
      expect(await findDeadLettersByJobId(pool, job.id!)).toHaveLength(0);
    }
  });

  it('dead-letters on the final attempt', async () => {
    const run = processor({ transfer: async () => transientError() });
    const job = transferJob({ requestId: newRequestId(), courierId: newUserId() }, {
      attemptsMade: MAX_ATTEMPTS - 1,
    });

    await expect(run(job)).rejects.toThrow('Internal server error.');

    const rows = await findDeadLettersByJobId(pool, job.id!);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('UNRESOLVED');
    expect(rows[0]!.error_trace).toContain('INTERNAL_ERROR');
  });

  it('rethrows the original error, so BullMQ schedules the retry', async () => {
    // If the processor swallowed it, BullMQ would mark the job completed and the
    // transfer would be lost.
    const run = processor({ transfer: async () => transientError() });
    await expect(
      run(transferJob({ requestId: newRequestId(), courierId: newUserId() })),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe('a dead-letter write failure must leave a trace', () => {
  it('logs the whole job to stderr and still fails the job', async () => {
    const logError = vi.fn();
    const run = createTransferJobProcessor({
      insertDeadLetter: async () => {
        throw new Error('credit-db unreachable');
      },
      log: () => {},
      logError,
    });
    const requestId = newRequestId();
    const courierId = newUserId();

    // Permanent failure, so it tries to dead-letter; the write then fails.
    await expect(run(transferJob({ requestId, courierId }))).rejects.toThrow(
      UnrecoverableError,
    );

    const printed = logError.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('DEAD-LETTER WRITE FAILED');
    // Everything needed to replay it by hand.
    expect(printed).toContain(requestId);
    expect(printed).toContain(courierId);
    expect(printed).toContain('credit-db unreachable');
  });
});

describe('isFinalFailure', () => {
  it('is true for an UnrecoverableError whatever the attempt', () => {
    const job = transferJob({}, { attemptsMade: 0 });
    expect(isFinalFailure(job, new UnrecoverableError('no'))).toBe(true);
  });

  it('is true once attemptsMade reaches the attempt limit', () => {
    expect(isFinalFailure(transferJob({}, { attemptsMade: MAX_ATTEMPTS }), new Error('x'))).toBe(
      true,
    );
    expect(isFinalFailure(transferJob({}, { attemptsMade: 1 }), new Error('x'))).toBe(false);
  });
});
