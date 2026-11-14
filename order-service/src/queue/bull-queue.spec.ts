/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-21
 * Scope: Credit transfer - unit tests for per-queue job options and job ids (fake BullMQ
 *        queues; no Redis in the test environment).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 */

import {
  createBullJobQueue,
  DEFAULT_JOB_OPTIONS,
  jobOptionsFor,
  TRANSFER_JOB_OPTIONS,
} from './bull-queue.js';

describe('jobOptionsFor', () => {
  it('transfer jobs: 5 attempts with the consumer-defined (custom) backoff', () => {
    expect(jobOptionsFor('queue:credit:transfer')).toEqual({
      attempts: 5,
      backoff: { type: 'custom' },
      removeOnComplete: true,
    });
    expect(jobOptionsFor('queue:credit:transfer')).toBe(TRANSFER_JOB_OPTIONS);
  });

  it("order-service's own credit queue keeps its exponential defaults", () => {
    expect(jobOptionsFor('queue:order:credit')).toBe(DEFAULT_JOB_OPTIONS);
  });
});

describe('createBullJobQueue', () => {
  it('adds each job under its task name with the outbox job id, one queue per key', async () => {
    const add = vi.fn(async () => ({}));
    const makeQueue = vi.fn(() => ({ add, close: async () => {} }));
    const queue = createBullJobQueue({}, makeQueue);

    await queue.enqueue('queue:credit:transfer', {
      id: 'outbox-7',
      taskName: 'credit_transfer',
      payload: { requestId: 'o-1', courierId: 'c-1' },
    });
    await queue.enqueue('queue:credit:transfer', {
      id: 'outbox-8',
      taskName: 'credit_transfer',
      payload: { requestId: 'o-2', courierId: 'c-2' },
    });

    expect(makeQueue).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenNthCalledWith(
      1,
      'credit_transfer',
      { requestId: 'o-1', courierId: 'c-1' },
      { jobId: 'outbox-7' },
    );
  });
});
