/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-22
 * Scope (2026-10-22): Unit tests for withAttemptLog - one line per attempt, result
 *        classification (completed / retrying / failed), errors passed through.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 */

import { UnrecoverableError } from 'bullmq';
import { withAttemptLog, type LoggedJob } from './job-attempt-log.js';

const ORDER = '0192f0c4-0000-7000-8000-000000000001';

const job = (attemptsMade: number, data: unknown = { requestId: ORDER }) =>
  ({
    id: 'outbox-42',
    name: 'credit_reserve',
    data,
    attemptsMade,
    opts: { attempts: 5 },
  }) as LoggedJob;

function harness(processor: () => Promise<void>) {
  const lines: string[] = [];
  let t = 1_000;
  const run = withAttemptLog('queue:order:credit', processor, {
    log: (l) => lines.push(l),
    now: () => (t += 10),
  });
  return { run, lines, parsed: () => lines.map((l) => JSON.parse(l)) };
}

describe('withAttemptLog', () => {
  it('logs one completed line with the correlation fields', async () => {
    const h = harness(async () => {});
    await h.run(job(0));
    expect(h.lines).toHaveLength(1);
    expect(h.parsed()[0]).toEqual({
      event: 'job_attempt',
      ts: expect.any(String),
      queue: 'queue:order:credit',
      task: 'credit_reserve',
      jobId: 'outbox-42',
      orderId: ORDER,
      requestId: ORDER,
      attempt: 1,
      maxAttempts: 5,
      result: 'completed',
      durationMs: 10,
    });
  });

  it('logs retrying with the error and rethrows it while attempts remain', async () => {
    const err = new Error('Credit reserve failed (transient): TIMEOUT');
    const h = harness(async () => {
      throw err;
    });
    await expect(h.run(job(1))).rejects.toBe(err);
    expect(h.parsed()).toEqual([
      expect.objectContaining({
        attempt: 2,
        result: 'retrying',
        error: 'Credit reserve failed (transient): TIMEOUT',
      }),
    ]);
  });

  it('logs failed on the last attempt', async () => {
    const h = harness(async () => {
      throw new Error('boom');
    });
    await expect(h.run(job(4))).rejects.toThrow('boom');
    expect(h.parsed()[0]).toMatchObject({ attempt: 5, result: 'failed' });
  });

  it('logs failed on an UnrecoverableError even with attempts left', async () => {
    const h = harness(async () => {
      throw new UnrecoverableError('Invalid credit_reserve payload.');
    });
    await expect(h.run(job(0))).rejects.toBeInstanceOf(UnrecoverableError);
    expect(h.parsed()[0]).toMatchObject({ attempt: 1, result: 'failed' });
  });

  it('nulls the ids when the payload carries no requestId', async () => {
    const h = harness(async () => {});
    await h.run(job(0, {}));
    expect(h.parsed()[0]).toMatchObject({ orderId: null, requestId: null });
  });
});
