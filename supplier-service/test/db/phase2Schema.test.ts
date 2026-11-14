/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Unit tests for the Phase 2 schema upgrade of an existing database
 *        (SupplierServiceArchitecture.md §6.4, §9 item 21). No requirements, architecture, schema,
 *        or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5): moved from src/db/phase2Schema.test.ts to test/db/phase2Schema.test.ts and updated
 *        the relative imports; no test logic changed. No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review:
 */
import type { Pool } from 'mysql2/promise';
import { describe, expect, it, vi } from 'vitest';
import { upgradeHoursSchema } from '../../src/db/phase2Schema.js';

function fakePool(hasIs24hColumn: boolean, checkClause: string | null) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('information_schema.COLUMNS')) {
      return [hasIs24hColumn ? [{ COLUMN_NAME: 'is_24h' }] : [], []];
    }
    if (sql.includes('information_schema.CHECK_CONSTRAINTS')) {
      return [checkClause === null ? [] : [{ CHECK_CLAUSE: checkClause }], []];
    }
    return [{}, []];
  });
  return { pool: { query } as unknown as Pool, query };
}

const executed = (query: ReturnType<typeof fakePool>['query']) =>
  query.mock.calls.map(([sql]) => String(sql).replace(/\s+/g, ' ').trim()).filter(
    (sql) => !sql.includes('information_schema'),
  );

describe('upgradeHoursSchema', () => {
  it('adds is_24h, converts Sunday 0 to 7 and replaces the check on an old schema', async () => {
    const { pool, query } = fakePool(false, '(`day_of_week` between 0 and 6)');
    await upgradeHoursSchema(pool);

    expect(executed(query)).toEqual([
      'ALTER TABLE supplier_hours ADD COLUMN is_24h BOOLEAN NOT NULL DEFAULT FALSE AFTER close_time',
      'ALTER TABLE supplier_hours DROP CHECK chk_supplier_hours_day',
      'UPDATE supplier_hours SET day_of_week = 7 WHERE day_of_week = 0',
      'ALTER TABLE supplier_hours ADD CONSTRAINT chk_supplier_hours_day CHECK (day_of_week BETWEEN 1 AND 8)',
    ]);
  });

  it('does nothing on an already upgraded schema', async () => {
    const { pool, query } = fakePool(true, '(`day_of_week` between 1 and 8)');
    await upgradeHoursSchema(pool);
    expect(executed(query)).toEqual([]);
  });

  it('finishes a half-applied upgrade where the check was already dropped', async () => {
    const { pool, query } = fakePool(true, null);
    await upgradeHoursSchema(pool);

    expect(executed(query)).toEqual([
      'UPDATE supplier_hours SET day_of_week = 7 WHERE day_of_week = 0',
      'ALTER TABLE supplier_hours ADD CONSTRAINT chk_supplier_hours_day CHECK (day_of_week BETWEEN 1 AND 8)',
    ]);
  });
});
