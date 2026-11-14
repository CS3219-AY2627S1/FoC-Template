/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Tests for the transactional outbox writer (Phase 4 plan Task 3). No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import type { PoolConnection } from 'mysql2/promise';
import { describe, expect, it, vi } from 'vitest';
import { insertOutboxRows } from '../../src/persistence/outboxWriter.js';

describe('insertOutboxRows', () => {
  it('inserts one row per task, all with the given supplier version, in a single statement', async () => {
    const query = vi.fn().mockResolvedValue([{}, []]);
    await insertOutboxRows({ query } as unknown as PoolConnection, 6, [
      { taskName: 'image_cleanup', payload: { photo_id: 7, photo_location: 'a' } },
      { taskName: 'image_cleanup', payload: { photo_id: 8, photo_location: 'b' } },
    ]);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toBe('INSERT INTO outbox (task_name, payload, version) VALUES ?');
    expect(params).toEqual([
      [
        ['image_cleanup', '{"photo_id":7,"photo_location":"a"}', 6],
        ['image_cleanup', '{"photo_id":8,"photo_location":"b"}', 6],
      ],
    ]);
  });

  it('does nothing for an empty task list', async () => {
    const query = vi.fn();
    await insertOutboxRows({ query } as unknown as PoolConnection, 6, []);
    expect(query).not.toHaveBeenCalled();
  });
});
