/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Tests for the dead_letter_jobs repository (Phase 4 plan Task 9). No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import type { Pool } from 'mysql2/promise';
import { describe, expect, it, vi } from 'vitest';
import { createMysqlDeadLetterRepository } from '../../src/persistence/mysqlDeadLetterRepository.js';

describe('mysql dead-letter repository', () => {
  it('inserts the job columns and leaves status to its UNRESOLVED default', async () => {
    const query = vi.fn().mockResolvedValue([{}, []]);
    const repo = createMysqlDeadLetterRepository({ query } as unknown as Pool);

    await expect(repo.insert({
      jobId: 'j-1',
      taskName: 'supplier_suspension',
      payload: { supplier_id: 101 },
      errorTrace: 'Error: boom',
      failedAt: '2026-09-30 10:00:00',
    })).resolves.toBeUndefined();

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql.replace(/\s+/g, ' ').trim()).toBe(
      'INSERT INTO dead_letter_jobs (job_id, task_name, payload, error_trace, failed_at) VALUES (?, ?, CAST(? AS JSON), ?, ?)',
    );
    expect(params).toEqual(['j-1', 'supplier_suspension', '{"supplier_id":101}', 'Error: boom', '2026-09-30 10:00:00']);
  });

  it('binds the string null when the payload is undefined', async () => {
    const query = vi.fn().mockResolvedValue([{}, []]);
    const repo = createMysqlDeadLetterRepository({ query } as unknown as Pool);

    await repo.insert({ jobId: 'j-2', taskName: 'image_cleanup', payload: undefined, errorTrace: 'e', failedAt: '2026-09-30 10:00:00' });

    const [, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params[2]).toBe('null');
  });

  it('truncates an oversized error trace before binding', async () => {
    const query = vi.fn().mockResolvedValue([{}, []]);
    const repo = createMysqlDeadLetterRepository({ query } as unknown as Pool);

    await repo.insert({ jobId: 'j-3', taskName: 'image_cleanup', payload: {}, errorTrace: 'x'.repeat(100_000), failedAt: '2026-09-30 10:00:00' });

    const [, params] = query.mock.calls[0] as [string, unknown[]];
    expect((params[3] as string).length).toBeLessThanOrEqual(60_000);
  });
});
