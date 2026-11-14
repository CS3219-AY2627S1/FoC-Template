/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Wrote the tests for the MySQL write repository from the Phase 2 plan (Task 7).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-29 update): Reactivation now also replaces supplier_name with the submitted spelling (Phase 2 Task 7 review fix).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5): moved from src/persistence/mysqlSupplierWriteRepository.test.ts to test/persistence/mysqlSupplierWriteRepository.test.ts and updated
 *        the relative imports; no test logic changed. No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): added updateSupplier and findCurrent tests (Phase 3 Task 5).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): added softDelete tests (Phase 4 plan Task 4).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): added updateSupplier outbox-row tests (Phase 4 plan Task 7).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): replaced the reactivateSupplier tests with updateSupplier reactivation-mode tests (Phase 4 plan Task 8).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): added a reactivation case asserting a single is_active = TRUE and no is_active = ? placeholder.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-11, Claude Code, model: claude-sonnet-5-5): findCurrent test covers is_active.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import type { Pool } from 'mysql2/promise';
import { describe, expect, it, vi } from 'vitest';
import { createMysqlSupplierWriteRepository } from '../../src/persistence/mysqlSupplierWriteRepository.js';
import type { NewSupplier } from '../../src/persistence/supplierWriteRepository.js';
import { buildPhotoCleanupTask } from '../../src/queue/tasks.js';

const input: NewSupplier = {
  name: 'Campus Store',
  type: 'Store',
  desc: 'desc',
  locationId: 4,
  categoryIds: [2, 3],
  hours: [{ day: 1, open: '09:00', close: '18:00', is24h: false }],
  photoLocations: ['loc-a', 'loc-b'],
  createdBy: 'u-1',
  now: '2026-09-29 10:00:00',
};

function fakePool(steps: Array<unknown | Error>) {
  const conn = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    query: vi.fn(),
  };
  for (const step of steps) {
    if (step instanceof Error) conn.query.mockRejectedValueOnce(step);
    else conn.query.mockResolvedValueOnce([step, []]);
  }
  const pool = { getConnection: vi.fn().mockResolvedValue(conn), query: vi.fn() };
  return { pool: pool as unknown as Pool, conn, poolQuery: pool.query };
}

const sqls = (conn: { query: { mock: { calls: unknown[][] } } }) =>
  conn.query.mock.calls.map((c) => String(c[0]).replace(/\s+/g, ' ').trim());

describe('insertSupplier', () => {
  it('inserts supplier, categories, hours and 0-based photos in one transaction', async () => {
    const { pool, conn } = fakePool([{ insertId: 11 }, {}, {}, {}]);
    const id = await createMysqlSupplierWriteRepository(pool).insertSupplier(input);

    expect(id).toBe(11);
    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
    expect(conn.query.mock.calls[0]?.[1]).toEqual(['Campus Store', 'Store', 'desc', 4, '2026-09-29 10:00:00', 'u-1', '2026-09-29 10:00:00']);
    expect(conn.query.mock.calls[1]?.[1]).toEqual([[[11, 2], [11, 3]]]);
    expect(conn.query.mock.calls[2]?.[1]).toEqual([[[11, 1, '09:00', '18:00', 0]]]);
    expect(conn.query.mock.calls[3]?.[1]).toEqual([[[11, 'loc-a', 0], [11, 'loc-b', 1]]]);
  });

  it('skips empty child inserts', async () => {
    const { pool, conn } = fakePool([{ insertId: 5 }, {}]);
    await createMysqlSupplierWriteRepository(pool).insertSupplier({ ...input, categoryIds: [], photoLocations: [] });
    expect(sqls(conn)).toHaveLength(2); // supplier + hours
  });

  it('rolls back and maps a duplicate-key race to 422', async () => {
    const dup = Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
    const { pool, conn } = fakePool([dup]);

    await expect(createMysqlSupplierWriteRepository(pool).insertSupplier(input)).rejects.toMatchObject({
      statusCode: 422,
    });
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  it('rolls back on any other failure and rethrows it', async () => {
    const { pool, conn } = fakePool([{ insertId: 5 }, new Error('boom')]);
    await expect(createMysqlSupplierWriteRepository(pool).insertSupplier(input)).rejects.toThrow('boom');
    expect(conn.rollback).toHaveBeenCalled();
  });
});

describe('updateSupplier in reactivation mode', () => {
  const now = '2026-09-30 10:00:00';

  it('matches a soft-deleted row and restores the flags in the same UPDATE as the edit', async () => {
    const { pool, conn } = fakePool([{ affectedRows: 1 }]);

    await createMysqlSupplierWriteRepository(pool).updateSupplier(5, {
      version: 3,
      now,
      name: 'Campus Store',
      reactivate: true,
    });

    expect(sqls(conn)[0]).toBe(
      'UPDATE supplier SET supplier_name = ?, is_deleted = FALSE, is_active = TRUE, updated_on = ?, version = version + 1 WHERE supplier_id = ? AND version = ? AND is_deleted = TRUE',
    );
    expect(conn.query.mock.calls[0]?.[1]).toEqual(['Campus Store', now, 5, 3]);
    expect(conn.commit).toHaveBeenCalled();
  });

  it('writes is_active = TRUE once, as a literal, even when the change carries isActive: false', async () => {
    const { pool, conn } = fakePool([{ affectedRows: 1 }]);

    await createMysqlSupplierWriteRepository(pool).updateSupplier(5, {
      version: 3,
      now,
      name: 'Campus Store',
      isActive: false,
      reactivate: true,
    });

    const sql = sqls(conn)[0] as string;
    expect(sql).toBe(
      'UPDATE supplier SET supplier_name = ?, is_deleted = FALSE, is_active = TRUE, updated_on = ?, version = version + 1 WHERE supplier_id = ? AND version = ? AND is_deleted = TRUE',
    );
    expect(sql.match(/is_active = TRUE/g)).toHaveLength(1);
    expect(sql).not.toContain('is_active = ?');
    expect(conn.query.mock.calls[0]?.[1]).toEqual(['Campus Store', now, 5, 3]);
  });

  it('an ordinary update still requires a live row and does not touch the flags', async () => {
    const { pool, conn } = fakePool([{ affectedRows: 1 }]);

    await createMysqlSupplierWriteRepository(pool).updateSupplier(5, { version: 3, now, name: 'Campus Store' });

    expect(sqls(conn)[0]).toBe(
      'UPDATE supplier SET supplier_name = ?, updated_on = ?, version = version + 1 WHERE supplier_id = ? AND version = ? AND is_deleted = FALSE',
    );
  });

  it('rolls back, committing nothing, when a later statement of the edit fails', async () => {
    const { pool, conn } = fakePool([{ affectedRows: 1 }, new Error('category insert failed')]);

    await expect(
      createMysqlSupplierWriteRepository(pool).updateSupplier(5, { version: 3, now, categoryIds: [2], reactivate: true }),
    ).rejects.toThrow('category insert failed');

    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });
});

describe('lookups', () => {
  it('findByIdentity maps the row', async () => {
    const { pool, poolQuery } = fakePool([]);
    poolQuery.mockResolvedValueOnce([[{ supplier_id: 3, is_deleted: 1 }], []]);
    expect(await createMysqlSupplierWriteRepository(pool).findByIdentity('A', 'Store', 4)).toEqual({
      supplierId: 3,
      isDeleted: true,
    });
  });

  it('findMissingCategoryIds returns only the ids that were not found', async () => {
    const { pool, poolQuery } = fakePool([]);
    poolQuery.mockResolvedValueOnce([[{ category_id: 2 }], []]);
    expect(await createMysqlSupplierWriteRepository(pool).findMissingCategoryIds([2, 9])).toEqual([9]);
  });

  it('locationExists is true only when a row is found', async () => {
    const { pool, poolQuery } = fakePool([]);
    poolQuery.mockResolvedValueOnce([[{ location_id: 4 }], []]).mockResolvedValueOnce([[], []]);
    const repo = createMysqlSupplierWriteRepository(pool);
    expect(await repo.locationExists(4)).toBe(true);
    expect(await repo.locationExists(5)).toBe(false);
  });
});

describe('updateSupplier', () => {
  const now = '2026-09-29 10:00:00';

  it('updates only the sent columns with a version-matched WHERE and bumps version', async () => {
    const { pool, conn } = fakePool([{ affectedRows: 1 }]);
    const result = await createMysqlSupplierWriteRepository(pool).updateSupplier(101, { version: 3, now, name: 'New' });

    expect(result).toEqual({ removedPhotos: [] });
    expect(sqls(conn)[0]).toBe(
      'UPDATE supplier SET supplier_name = ?, updated_on = ?, version = version + 1 WHERE supplier_id = ? AND version = ? AND is_deleted = FALSE',
    );
    expect(conn.query.mock.calls[0]?.[1]).toEqual(['New', now, 101, 3]);
    expect(conn.commit).toHaveBeenCalled();
  });

  it('rejects with 409 and rolls back when no row matches the version', async () => {
    const { pool, conn } = fakePool([{ affectedRows: 0 }]);
    await expect(
      createMysqlSupplierWriteRepository(pool).updateSupplier(101, { version: 2, now, name: 'New' }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });

  it('replaces categories and hours when sent', async () => {
    const { pool, conn } = fakePool([{ affectedRows: 1 }, {}, {}, {}, {}]);
    await createMysqlSupplierWriteRepository(pool).updateSupplier(101, {
      version: 3,
      now,
      categoryIds: [2],
      hours: [{ day: 8, open: '00:00', close: '23:59', is24h: true }],
    });
    const statements = sqls(conn);
    expect(statements[1]).toBe('DELETE FROM supplier_category_map WHERE supplier_id = ?');
    expect(conn.query.mock.calls[2]?.[1]).toEqual([[[101, 2]]]);
    expect(statements[3]).toBe('DELETE FROM supplier_hours WHERE supplier_id = ?');
    expect(conn.query.mock.calls[4]?.[1]).toEqual([[[101, 8, '00:00', '23:59', 1]]]);
  });

  it('deletes excluded photos, moves kept rows aside, then writes the final order', async () => {
    const rows = [
      { photo_id: 1, photo_location: 'a' },
      { photo_id: 2, photo_location: 'b' },
    ];
    // supplier UPDATE, SELECT photos, DELETE excluded, offset UPDATE, INSERT new, UPDATE kept
    const { pool, conn } = fakePool([{ affectedRows: 1 }, rows, {}, {}, {}, {}]);
    const result = await createMysqlSupplierWriteRepository(pool).updateSupplier(101, {
      version: 3,
      now,
      photos: [{ kind: 'new', location: 'c' }, { kind: 'existing', photoId: 2 }],
    });

    expect(result).toEqual({ removedPhotos: [{ photoId: 1, location: 'a' }] });
    const statements = sqls(conn);
    expect(statements[1]).toContain('SELECT photo_id, photo_location FROM supplier_photos WHERE supplier_id = ?');
    expect(statements[2]).toBe('DELETE FROM supplier_photos WHERE supplier_id = ? AND photo_id IN (?)');
    expect(conn.query.mock.calls[2]?.[1]).toEqual([101, [1]]);
    expect(statements[3]).toBe('UPDATE supplier_photos SET display_order = display_order + 1000000 WHERE supplier_id = ?');
    expect(statements[4]).toBe('INSERT INTO supplier_photos (supplier_id, photo_location, display_order) VALUES (?, ?, ?)');
    expect(conn.query.mock.calls[4]?.[1]).toEqual([101, 'c', 0]);
    expect(statements[5]).toBe('UPDATE supplier_photos SET display_order = ? WHERE photo_id = ? AND supplier_id = ?');
    expect(conn.query.mock.calls[5]?.[1]).toEqual([1, 2, 101]);
  });

  it('maps a duplicate-key error to 422', async () => {
    const dup = Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
    const { pool } = fakePool([dup]);
    await expect(
      createMysqlSupplierWriteRepository(pool).updateSupplier(101, { version: 3, now, name: 'X' }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });
});

describe('findCurrent', () => {
  it('returns the supplier with its photos in display order, or null', async () => {
    const { pool, poolQuery } = fakePool([]);
    poolQuery
      .mockResolvedValueOnce([[{ supplier_id: 101, supplier_name: 'S', supplier_type: 'Store', location_id: 4, is_deleted: 0, is_active: 1, version: '3' }], []])
      .mockResolvedValueOnce([[{ photo_id: 1, photo_location: 'a' }], []])
      .mockResolvedValueOnce([[], []]);
    const repo = createMysqlSupplierWriteRepository(pool);

    expect(await repo.findCurrent(101)).toEqual({
      supplierId: 101, name: 'S', type: 'Store', locationId: 4, isDeleted: false, isActive: true, version: 3,
      photos: [{ photoId: 1, location: 'a' }],
    });
    expect(await repo.findCurrent(999)).toBeNull();
  });
});

describe('softDelete', () => {
  const now = '2026-09-30 10:00:00';
  const tasks = [{ taskName: 'supplier_suspension', payload: { supplier_id: 7 } }];

  it('updates the row and writes the outbox rows, stamped with the new supplier version, in one transaction', async () => {
    const { pool, conn } = fakePool([{ affectedRows: 1 }, [{ version: 6 }], {}]);

    const changed = await createMysqlSupplierWriteRepository(pool).softDelete(7, now, tasks);

    expect(changed).toBe(true);
    expect(sqls(conn)).toEqual([
      'UPDATE supplier SET is_deleted = TRUE, updated_on = ?, version = version + 1 WHERE supplier_id = ? AND is_deleted = FALSE',
      'SELECT version FROM supplier WHERE supplier_id = ?',
      'INSERT INTO outbox (task_name, payload, version) VALUES ?',
    ]);
    expect(conn.query.mock.calls[0]?.[1]).toEqual([now, 7]);
    expect(conn.query.mock.calls[2]?.[1]).toEqual([[['supplier_suspension', '{"supplier_id":7}', 6]]]);
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
    expect(conn.beginTransaction.mock.invocationCallOrder[0]).toBeLessThan(conn.query.mock.invocationCallOrder[0] ?? 0);
    expect(conn.query.mock.invocationCallOrder[2]).toBeLessThan(conn.commit.mock.invocationCallOrder[0] ?? 0);
  });

  it('rolls back, committing neither the delete nor the outbox row, when the outbox insert fails', async () => {
    const { pool, conn } = fakePool([{ affectedRows: 1 }, [{ version: 6 }], new Error('outbox insert failed')]);

    await expect(createMysqlSupplierWriteRepository(pool).softDelete(7, now, tasks)).rejects.toThrow(
      'outbox insert failed',
    );

    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  it('returns false and writes no outbox row when no live row matched (unknown or already deleted)', async () => {
    const { pool, conn } = fakePool([{ affectedRows: 0 }]);

    expect(await createMysqlSupplierWriteRepository(pool).softDelete(7, now, tasks)).toBe(false);
    expect(sqls(conn)).toHaveLength(1);
    expect(conn.release).toHaveBeenCalled();
    expect(conn.rollback).not.toHaveBeenCalled();
  });

  it('with no tasks still updates and reads the version, writes no outbox row, and returns true', async () => {
    const { pool, conn } = fakePool([{ affectedRows: 1 }, [{ version: 6 }]]);

    expect(await createMysqlSupplierWriteRepository(pool).softDelete(7, now, [])).toBe(true);
    expect(sqls(conn)).toEqual([
      'UPDATE supplier SET is_deleted = TRUE, updated_on = ?, version = version + 1 WHERE supplier_id = ? AND is_deleted = FALSE',
      'SELECT version FROM supplier WHERE supplier_id = ?',
    ]);
    expect(conn.commit).toHaveBeenCalled();
  });
});

describe('updateSupplier outbox rows', () => {
  const now = '2026-09-30 10:00:00';
  const onPhotosRemoved = (removed: Array<{ photoId: number; location: string }>) => removed.map(buildPhotoCleanupTask);

  it('writes one image_cleanup outbox row per removed photo, stamped with the bumped supplier version, before committing', async () => {
    // supplier UPDATE, SELECT photos, DELETE removed photos, shift display_order, outbox INSERT
    const { pool, conn } = fakePool([
      { affectedRows: 1 },
      [{ photo_id: 7, photo_location: 'loc-7' }],
      {},
      {},
      {},
    ]);

    await createMysqlSupplierWriteRepository(pool).updateSupplier(5, {
      version: 3,
      now,
      photos: [],
      onPhotosRemoved,
    });

    const calls = sqls(conn);
    expect(calls.at(-1)).toBe('INSERT INTO outbox (task_name, payload, version) VALUES ?');
    expect(conn.query.mock.calls.at(-1)?.[1]).toEqual([
      [['image_cleanup', '{"photo_id":7,"photo_location":"loc-7"}', 4]],
    ]);
    expect(conn.commit).toHaveBeenCalled();
    const insertOrder = conn.query.mock.invocationCallOrder.at(-1) ?? Infinity;
    expect(insertOrder).toBeLessThan(conn.commit.mock.invocationCallOrder[0] ?? 0);
  });

  it('writes no outbox row when no photo was removed', async () => {
    const { pool, conn } = fakePool([{ affectedRows: 1 }, [], {}]);

    await createMysqlSupplierWriteRepository(pool).updateSupplier(5, { version: 3, now, photos: [], onPhotosRemoved });

    expect(sqls(conn).some((sql) => sql.startsWith('INSERT INTO outbox'))).toBe(false);
  });

  it('writes no outbox row when the caller supplies no onPhotosRemoved', async () => {
    const { pool, conn } = fakePool([{ affectedRows: 1 }, [{ photo_id: 7, photo_location: 'loc-7' }], {}, {}]);

    await createMysqlSupplierWriteRepository(pool).updateSupplier(5, { version: 3, now, photos: [] });

    expect(sqls(conn).some((sql) => sql.startsWith('INSERT INTO outbox'))).toBe(false);
  });

  it('rolls back the edit when the outbox insert fails', async () => {
    const { pool, conn } = fakePool([
      { affectedRows: 1 },
      [{ photo_id: 7, photo_location: 'loc-7' }],
      {},
      {},
      new Error('outbox insert failed'),
    ]);

    await expect(
      createMysqlSupplierWriteRepository(pool).updateSupplier(5, { version: 3, now, photos: [], onPhotosRemoved }),
    ).rejects.toThrow('outbox insert failed');
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });
});
