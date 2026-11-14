/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Tests for one outbox relay tick: read, enqueue, delete (Phase 4 plan Task 12). No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { describe, expect, it, vi } from 'vitest';
import { createOutboxRelay } from '../../src/worker/outboxRelay.js';

const suspension = (id: number, version: number) => ({
  id,
  taskName: 'supplier_suspension',
  payload: { supplier_id: 101 },
  version,
});

function build(rows: Array<ReturnType<typeof suspension>>) {
  const outbox = {
    fetchBatch: vi.fn().mockResolvedValue(rows),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const queue = { enqueue: vi.fn().mockResolvedValue(undefined) };
  const deadLetters = { insert: vi.fn().mockResolvedValue(undefined) };
  const log = vi.fn();
  const relayOnce = createOutboxRelay({
    outbox,
    queue,
    deadLetters,
    log,
    clock: () => new Date('2026-09-30T02:00:00Z'),
  });
  return { relayOnce, outbox, queue, deadLetters, log };
}

describe('outbox relay tick', () => {
  it('does nothing when the outbox is empty', async () => {
    const { relayOnce, queue, outbox } = build([]);
    expect(await relayOnce()).toBe(0);
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(outbox.delete).not.toHaveBeenCalled();
  });

  it('reads a batch of 100', async () => {
    const { relayOnce, outbox } = build([]);
    await relayOnce();
    expect(outbox.fetchBatch).toHaveBeenCalledWith(100);
  });

  it('enqueues each row in the order read, as job outbox-<id>, and deletes each only after its enqueue', async () => {
    const { relayOnce, queue, outbox } = build([suspension(4, 6), suspension(5, 7)]);

    expect(await relayOnce()).toBe(2);

    expect(queue.enqueue.mock.calls).toEqual([
      ['queue:supplier:suspension', { id: 'outbox-4', task_name: 'supplier_suspension', payload: { supplier_id: 101 } }],
      ['queue:supplier:suspension', { id: 'outbox-5', task_name: 'supplier_suspension', payload: { supplier_id: 101 } }],
    ]);
    expect(outbox.delete.mock.calls).toEqual([[4], [5]]);
    const order = [
      queue.enqueue.mock.invocationCallOrder[0] ?? 0,
      outbox.delete.mock.invocationCallOrder[0] ?? 0,
      queue.enqueue.mock.invocationCallOrder[1] ?? 0,
      outbox.delete.mock.invocationCallOrder[1] ?? 0,
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('routes an image_cleanup row to the cleanup queue', async () => {
    const { relayOnce, queue } = build([
      { id: 9, taskName: 'image_cleanup', payload: { photo_id: 7, photo_location: 'loc' }, version: 3 },
    ] as never);
    await relayOnce();
    expect(queue.enqueue.mock.calls[0]?.[0]).toBe('queue:image:cleanup');
  });

  it('stops the tick at the first enqueue failure, keeps the row, and tries again next tick', async () => {
    const { relayOnce, queue, outbox, log } = build([suspension(4, 6), suspension(5, 7)]);
    queue.enqueue.mockRejectedValueOnce(new Error('redis down'));

    expect(await relayOnce()).toBe(0);

    expect(queue.enqueue).toHaveBeenCalledTimes(1); // row 5 is not attempted: order is preserved
    expect(outbox.delete).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('dead-letters and removes a row whose task has no queue, then carries on with the next row', async () => {
    const { relayOnce, queue, outbox, deadLetters } = build([
      { id: 3, taskName: 'nope', payload: { a: 1 }, version: 5 },
      suspension(4, 6),
    ] as never);

    expect(await relayOnce()).toBe(1);

    expect(deadLetters.insert).toHaveBeenCalledTimes(1);
    expect(deadLetters.insert.mock.calls[0]?.[0]).toMatchObject({
      jobId: 'outbox-3',
      taskName: 'nope',
      payload: { a: 1 },
      failedAt: '2026-09-30 10:00:00',
    });
    expect(outbox.delete.mock.calls).toEqual([[3], [4]]);
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
  });

  it('fails the tick and keeps the row when the dead-letter insert fails for an unroutable row', async () => {
    const { relayOnce, outbox, deadLetters } = build([{ id: 3, taskName: 'nope', payload: { a: 1 }, version: 5 }] as never);
    deadLetters.insert.mockRejectedValueOnce(new Error('db down'));

    await expect(relayOnce()).rejects.toThrow('db down');

    expect(outbox.delete).not.toHaveBeenCalled();
  });

  it('lets a failed delete propagate so the tick fails and the row is retried (the job id makes the re-enqueue harmless)', async () => {
    const { relayOnce, outbox } = build([suspension(4, 6)]);
    outbox.delete.mockRejectedValueOnce(new Error('db down'));
    await expect(relayOnce()).rejects.toThrow('db down');
  });
});
