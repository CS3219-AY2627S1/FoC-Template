/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Tests for the every-second relay scheduler wiring, with BullMQ mocked (Phase 4 plan
 *        Task 12). No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  upsertJobScheduler: vi.fn(),
  queueClose: vi.fn(),
  workerClose: vi.fn(),
  workers: [] as Array<{ name: string; processor: () => Promise<void>; opts: Record<string, unknown> }>,
  queues: [] as Array<{ name: string; opts: Record<string, unknown> }>,
}));

vi.mock('bullmq', () => ({
  Queue: class {
    constructor(name: string, opts: Record<string, unknown>) {
      mocks.queues.push({ name, opts });
    }
    upsertJobScheduler = mocks.upsertJobScheduler;
    close = mocks.queueClose;
  },
  Worker: class {
    constructor(name: string, processor: () => Promise<void>, opts: Record<string, unknown>) {
      mocks.workers.push({ name, processor, opts });
    }
    on = vi.fn();
    close = mocks.workerClose;
  },
}));

import { OUTBOX_RELAY_INTERVAL_MS, startRelay } from '../../src/worker/startRelay.js';

describe('startRelay', () => {
  beforeEach(() => {
    mocks.workers.length = 0;
    mocks.queues.length = 0;
    vi.clearAllMocks();
  });

  it('schedules one tick per second on queue:outbox:relay and runs the relay from a single-concurrency worker', async () => {
    const relayOnce = vi.fn().mockResolvedValue(0);

    await startRelay({ host: 'h', port: 1 }, relayOnce);

    expect(OUTBOX_RELAY_INTERVAL_MS).toBe(1000);
    expect(mocks.queues[0]).toMatchObject({ name: 'relay', opts: { prefix: 'queue:outbox' } });
    expect(mocks.upsertJobScheduler).toHaveBeenCalledWith(
      'outbox-relay',
      { every: 1000 },
      expect.objectContaining({ name: 'outbox_relay', opts: expect.objectContaining({ attempts: 1 }) }),
    );
    expect(mocks.workers[0]).toMatchObject({ name: 'relay', opts: { prefix: 'queue:outbox', concurrency: 1 } });

    await mocks.workers[0]?.processor();
    expect(relayOnce).toHaveBeenCalledTimes(1);
  });

  it('closes the worker and the queue', async () => {
    const relay = await startRelay({ host: 'h', port: 1 }, vi.fn());
    await relay.close();
    expect(mocks.workerClose).toHaveBeenCalled();
    expect(mocks.queueClose).toHaveBeenCalled();
    expect(mocks.workerClose.mock.invocationCallOrder[0] ?? 0).toBeLessThan(
      mocks.queueClose.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('closes the queue and creates no worker when scheduling fails', async () => {
    mocks.upsertJobScheduler.mockRejectedValueOnce(new Error('redis down'));

    await expect(startRelay({ host: 'h', port: 1 }, vi.fn())).rejects.toThrow('redis down');

    expect(mocks.queueClose).toHaveBeenCalledTimes(1);
    expect(mocks.workers).toHaveLength(0);
  });
});
