/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Wrote unit tests for the MySQL lookup repository per Phase 2 plan Task 4. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5): moved from src/persistence/mysqlLookupRepository.test.ts to test/persistence/mysqlLookupRepository.test.ts and updated
 *        the relative imports; no test logic changed. No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review:
 */
import type { Pool } from 'mysql2/promise';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/utils/AppError.js';
import { createMysqlLookupRepository } from '../../src/persistence/mysqlLookupRepository.js';

function fakePool(...steps: Array<unknown | Error>) {
  const query = vi.fn();
  for (const step of steps) {
    if (step instanceof Error) query.mockRejectedValueOnce(step);
    else query.mockResolvedValueOnce([step, []]);
  }
  return { pool: { query } as unknown as Pool, query };
}
const dbError = (code: string) => Object.assign(new Error(code), { code });

describe('faculties', () => {
  it('creates and returns the new row', async () => {
    const { pool, query } = fakePool({ insertId: 5 });
    const created = await createMysqlLookupRepository(pool).createFaculty('Computing');
    expect(created).toEqual({ faculty_id: 5, faculty: 'Computing' });
    expect(query.mock.calls[0]).toEqual(['INSERT INTO faculties (faculty) VALUES (?)', ['Computing']]);
  });

  it('maps a duplicate to 422', async () => {
    const { pool } = fakePool(dbError('ER_DUP_ENTRY'));
    await expect(createMysqlLookupRepository(pool).createFaculty('Computing')).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it('updates then reads back, and returns null for an unknown id', async () => {
    const found = fakePool({}, [{ faculty_id: 5, faculty: 'Science' }]);
    expect(await createMysqlLookupRepository(found.pool).updateFaculty(5, 'Science')).toEqual({
      faculty_id: 5,
      faculty: 'Science',
    });

    const missing = fakePool({}, []);
    expect(await createMysqlLookupRepository(missing.pool).updateFaculty(9, 'X')).toBeNull();
  });

  it('deletes: true when a row was removed, false when none, 422 when still referenced', async () => {
    expect(await createMysqlLookupRepository(fakePool({ affectedRows: 1 }).pool).deleteFaculty(5)).toBe(true);
    expect(await createMysqlLookupRepository(fakePool({ affectedRows: 0 }).pool).deleteFaculty(5)).toBe(false);

    const referenced = fakePool(dbError('ER_ROW_IS_REFERENCED_2'));
    await expect(createMysqlLookupRepository(referenced.pool).deleteFaculty(5)).rejects.toBeInstanceOf(AppError);
    await expect(
      createMysqlLookupRepository(fakePool(dbError('ER_ROW_IS_REFERENCED_2')).pool).deleteFaculty(5),
    ).rejects.toMatchObject({ statusCode: 422 });
  });
});

describe('locations', () => {
  it('creates a location and maps a missing faculty to 422', async () => {
    const ok = fakePool({ insertId: 7 });
    expect(
      await createMysqlLookupRepository(ok.pool).createLocation({ location: 'Library', facultyId: 2, level: 1 }),
    ).toEqual({ location_id: 7, location: 'Library', faculty_id: 2, level: 1 });

    const bad = fakePool(dbError('ER_NO_REFERENCED_ROW_2'));
    await expect(
      createMysqlLookupRepository(bad.pool).createLocation({ location: 'Library', facultyId: 99, level: 1 }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('builds the UPDATE from only the supplied fields', async () => {
    const { pool, query } = fakePool({}, [{ location_id: 7, location: 'Library', faculty_id: 2, level: 3 }]);
    await createMysqlLookupRepository(pool).updateLocation(7, { level: 3 });
    expect(query.mock.calls[0]).toEqual(['UPDATE supplier_locations SET level = ? WHERE location_id = ?', [3, 7]]);
  });
});

describe('categories', () => {
  it('creates, updates and deletes', async () => {
    expect(
      await createMysqlLookupRepository(fakePool({ insertId: 3 }).pool).createCategory('Food'),
    ).toEqual({ category_id: 3, category_type: 'Food' });
    expect(
      await createMysqlLookupRepository(fakePool({}, [{ category_id: 3, category_type: 'Drinks' }]).pool).updateCategory(3, 'Drinks'),
    ).toEqual({ category_id: 3, category_type: 'Drinks' });
    expect(await createMysqlLookupRepository(fakePool({ affectedRows: 1 }).pool).deleteCategory(3)).toBe(true);
  });
});
