/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope: Issue #4 - unit tests for one outbox relay tick (mirrors supplier-service's
 *        relay behaviour: enqueue then delete, dead-letter unroutable rows, stop on a
 *        Redis failure).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-21): Credit transfer - credit_transfer rows relay to
 *        queue:credit:transfer.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 */

import type { OutboxRow } from '../db/outbox.repository.js';
import { createOutboxRelay } from './outbox-relay.js';

const NOW = new Date('2026-10-20T12:00:00.000Z');

const row = (id: number, taskName: string): OutboxRow => ({
  id: BigInt(id),
  taskName,
  payload: { requestId: `o-${id}` },
  version: 0,
});

function setup(rows: OutboxRow[], enqueue = vi.fn(async () => {})) {
  const outbox = {
    fetchBatch: vi.fn(async () => rows),
    delete: vi.fn(async () => {}),
  };
  const deadLetters = { insert: vi.fn(async () => {}) };
  const relayOnce = createOutboxRelay({
    outbox,
    queue: { enqueue, close: async () => {} },
    deadLetters,
    log: () => {},
    clock: () => NOW,
  });
  return { relayOnce, outbox, deadLetters, enqueue };
}

describe('outbox relay tick', () => {
  it('enqueues each row as outbox-<id> on its queue, then deletes it', async () => {
    const t = setup([row(1, 'credit_reserve'), row(2, 'credit_release')]);

    await expect(t.relayOnce()).resolves.toBe(2);

    expect(t.enqueue).toHaveBeenNthCalledWith(1, 'queue:order:credit', {
      id: 'outbox-1',
      taskName: 'credit_reserve',
      payload: { requestId: 'o-1' },
    });
    expect(t.enqueue).toHaveBeenNthCalledWith(2, 'queue:order:credit', {
      id: 'outbox-2',
      taskName: 'credit_release',
      payload: { requestId: 'o-2' },
    });
    expect(t.outbox.delete.mock.calls).toEqual([[1n], [2n]]);
  });

  it("routes credit_transfer rows to credit-service's transfer queue", async () => {
    const t = setup([row(1, 'credit_transfer')]);

    await expect(t.relayOnce()).resolves.toBe(1);
    expect(t.enqueue).toHaveBeenCalledWith('queue:credit:transfer', {
      id: 'outbox-1',
      taskName: 'credit_transfer',
      payload: { requestId: 'o-1' },
    });
  });

  it('dead-letters a row with no queue and keeps going', async () => {
    const t = setup([row(1, 'mystery_task'), row(2, 'credit_reserve')]);

    await expect(t.relayOnce()).resolves.toBe(1);

    expect(t.deadLetters.insert).toHaveBeenCalledWith({
      jobId: 'outbox-1',
      taskName: 'mystery_task',
      payload: { requestId: 'o-1' },
      errorTrace: 'No queue is registered for task_name "mystery_task".',
      failedAt: NOW,
    });
    expect(t.outbox.delete.mock.calls).toEqual([[1n], [2n]]);
  });

  it('keeps the row and stops the tick when Redis refuses', async () => {
    const enqueue = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const t = setup(
      [
        row(1, 'credit_reserve'),
        row(2, 'credit_reserve'),
        row(3, 'credit_reserve'),
      ],
      enqueue,
    );

    await expect(t.relayOnce()).resolves.toBe(1);

    expect(t.enqueue).toHaveBeenCalledTimes(2); // row 3 is not attempted
    expect(t.outbox.delete.mock.calls).toEqual([[1n]]); // row 2 stays for the next tick
  });
});
