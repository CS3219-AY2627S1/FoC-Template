/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Tests for the BullMQ producer adapter and retry policy (Phase 4 plan Task 2). No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): the close test now covers both queues (Phase 4 plan Task 2 review follow-up).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_JOB_OPTIONS,
  backoffStrategy,
  createBullJobQueue,
  splitQueueKey,
} from '../../src/queue/bullQueue.js';

describe('splitQueueKey', () => {
  it('splits at the last colon so the team key stays the key base', () => {
    expect(splitQueueKey('queue:image:cleanup')).toEqual({ prefix: 'queue:image', name: 'cleanup' });
    expect(splitQueueKey('queue:supplier:suspension')).toEqual({ prefix: 'queue:supplier', name: 'suspension' });
  });

  it('rejects a key with no group or no name', () => {
    expect(() => splitQueueKey('nocolon')).toThrow();
    expect(() => splitQueueKey(':name')).toThrow();
    expect(() => splitQueueKey('group:')).toThrow();
  });
});

describe('retry policy', () => {
  it('waits 5 s, 25 s, 125 s, 625 s after the 1st..4th failed attempt', () => {
    expect([1, 2, 3, 4].map(backoffStrategy)).toEqual([5000, 25000, 125000, 625000]);
  });

  it('allows 5 attempts with the custom backoff and drops completed jobs', () => {
    expect(DEFAULT_JOB_OPTIONS).toMatchObject({ attempts: 5, backoff: { type: 'custom' }, removeOnComplete: true });
  });
});

describe('bull job queue', () => {
  function build() {
    const queues: Array<{ key: string; add: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }> = [];
    const queue = createBullJobQueue({ host: 'h', port: 1 }, (key) => {
      const fake = { key, add: vi.fn().mockResolvedValue({}), close: vi.fn().mockResolvedValue(undefined) };
      queues.push(fake);
      return fake;
    });
    return { queue, queues };
  }

  it('adds the job with task_name as name, payload as data and id as jobId', async () => {
    const { queue, queues } = build();
    await queue.enqueue('queue:image:cleanup', { id: 'j-1', task_name: 't', payload: { a: 1 } });
    expect(queues[0]?.add).toHaveBeenCalledWith('t', { a: 1 }, { jobId: 'j-1' });
  });

  it('creates one BullMQ queue per key and reuses it', async () => {
    const { queue, queues } = build();
    await queue.enqueue('queue:image:cleanup', { id: 'a', task_name: 't', payload: {} });
    await queue.enqueue('queue:image:cleanup', { id: 'b', task_name: 't', payload: {} });
    await queue.enqueue('queue:supplier:suspension', { id: 'c', task_name: 't', payload: {} });
    expect(queues.map((q) => q.key)).toEqual(['queue:image:cleanup', 'queue:supplier:suspension']);
  });

  it('lets a Redis failure propagate', async () => {
    const queue = createBullJobQueue({ host: 'h', port: 1 }, () => ({
      add: vi.fn().mockRejectedValue(new Error('down')),
      close: vi.fn(),
    }));
    await expect(queue.enqueue('queue:image:cleanup', { id: 'j', task_name: 't', payload: {} })).rejects.toThrow('down');
  });

  it('closes every queue it created', async () => {
    const { queue, queues } = build();
    await queue.enqueue('queue:image:cleanup', { id: 'a', task_name: 't', payload: {} });
    await queue.enqueue('queue:supplier:suspension', { id: 'b', task_name: 't', payload: {} });
    await queue.close();
    expect(queues).toHaveLength(2);
    for (const created of queues) expect(created.close).toHaveBeenCalledTimes(1);
  });
});
