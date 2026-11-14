/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Tests for the outbox table DDL and the relay-side outbox repository (Phase 4 plan Task 3).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { readFileSync } from 'node:fs';
import type { Pool } from 'mysql2/promise';
import { describe, expect, it, vi } from 'vitest';
import { createMysqlOutboxRepository } from '../../src/persistence/mysqlOutboxRepository.js';

describe('outbox table', () => {
  it('is created by init.sql with the columns the team named', () => {
    const sql = readFileSync(new URL('../../src/db/init.sql', import.meta.url), 'utf8').replace(/\s+/g, ' ');
    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS outbox (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, task_name VARCHAR(255) NOT NULL, payload JSON NOT NULL, version BIGINT UNSIGNED NOT NULL, PRIMARY KEY (id));',
    );
  });
});

describe('mysql outbox repository', () => {
  it('reads the oldest rows first: supplier version, then id', async () => {
    const query = vi.fn().mockResolvedValue([
      [
        { id: 4, task_name: 'supplier_suspension', payload: { supplier_id: 1 }, version: 6 },
        { id: 5, task_name: 'image_cleanup', payload: '{"photo_id":7,"photo_location":"loc"}', version: 6 },
      ],
      [],
    ]);

    const rows = await createMysqlOutboxRepository({ query } as unknown as Pool).fetchBatch(100);

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql.replace(/\s+/g, ' ').trim()).toBe(
      'SELECT id, task_name, payload, version FROM outbox ORDER BY version ASC, id ASC LIMIT ?',
    );
    expect(params).toEqual([100]);
    expect(rows).toEqual([
      { id: 4, taskName: 'supplier_suspension', payload: { supplier_id: 1 }, version: 6 },
      { id: 5, taskName: 'image_cleanup', payload: { photo_id: 7, photo_location: 'loc' }, version: 6 },
    ]);
  });

  it('deletes a row by id', async () => {
    const query = vi.fn().mockResolvedValue([{}, []]);
    await createMysqlOutboxRepository({ query } as unknown as Pool).delete(4);
    expect(query).toHaveBeenCalledWith('DELETE FROM outbox WHERE id = ?', [4]);
  });
});
