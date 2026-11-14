/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Tests for the MySQL read queries behind the Phase 1 endpoints, using a fake pool. They
 *        check the visibility rule (§7), search/filter/sort/paging (§7.2, §6.3) and row mapping. No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-29, Claude Code, model: claude-sonnet-5): added tests for the admin read queries
 *        per Phase 2 plan Task 3. No requirements, architecture, schema, or API decisions were
 *        made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5): moved from src/persistence/mysqlSupplierRepository.test.ts to test/persistence/mysqlSupplierRepository.test.ts and updated
 *        the relative imports; no test logic changed. No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review:
  * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): updated rows for location_id, faculty_id and
 *        category_id in supplier reads, per the team's decision in chat.
 * Author review:
 * Scope (2026-11-05, Claude Code, model: claude-sonnet-5-5): Added supplierIds and findStatusesByIds tests, per the 2026-11-05 supplier-bookmarking spec.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import type { Pool } from 'mysql2/promise';
import { describe, expect, it, vi } from 'vitest';
import { createMysqlSupplierRepository } from '../../src/persistence/mysqlSupplierRepository.js';

function fakePool(...results: unknown[][]) {
  const query = vi.fn();
  for (const rows of results) {
    query.mockResolvedValueOnce([rows, []]);
  }
  return { pool: { query } as unknown as Pool, query };
}

const baseFilter = { sortOrder: 'A-Z' as const, limit: 50, offset: 0 };

describe('findVisiblePage', () => {
  it('applies the visibility rule, orders A-Z with a stable tie-break, and pages', async () => {
    const { pool, query } = fakePool(
      [{ total: 125 }],
      [
        {
          supplier_id: 101,
          supplier_name: 'Campus Store',
          supplier_type: 'Store',
          supplier_desc: null,
          location_id: 4,
          location: 'Central Library',
          faculty_id: 2,
          faculty: 'Computing',
          level: 1,
        },
      ],
    );

    const result = await createMysqlSupplierRepository(pool).findVisiblePage({ ...baseFilter, offset: 100 });

    expect(result.total).toBe(125);
    expect(result.rows).toEqual([
      {
        supplierId: 101,
        name: 'Campus Store',
        type: 'Store',
        desc: null,
        locationId: 4,
        location: 'Central Library',
        facultyId: 2,
        faculty: 'Computing',
        level: 1,
      },
    ]);

    const [countSql] = query.mock.calls[0] as [string, unknown[]];
    const [pageSql, pageParams] = query.mock.calls[1] as [string, unknown[]];
    for (const sql of [countSql, pageSql]) {
      expect(sql).toContain('s.is_deleted = FALSE');
      expect(sql).toContain('s.is_active = TRUE');
    }
    expect(pageSql).toContain('ORDER BY s.supplier_name ASC, s.supplier_id ASC');
    expect(pageSql).toContain('LIMIT ? OFFSET ?');
    expect(pageParams.slice(-2)).toEqual([50, 100]);
  });

  it('orders Z-A when requested', async () => {
    const { pool, query } = fakePool([{ total: 0 }], []);
    await createMysqlSupplierRepository(pool).findVisiblePage({ ...baseFilter, sortOrder: 'Z-A' });
    expect((query.mock.calls[1] as [string])[0]).toContain('ORDER BY s.supplier_name DESC, s.supplier_id ASC');
  });

  it('adds location and category filters as bound parameters', async () => {
    const { pool, query } = fakePool([{ total: 0 }], []);
    await createMysqlSupplierRepository(pool).findVisiblePage({ ...baseFilter, locationId: 4, categoryId: 2 });

    const [countSql, countParams] = query.mock.calls[0] as [string, unknown[]];
    expect(countSql).toContain('s.location_id = ?');
    expect(countSql).toContain('cm.category_id = ?');
    expect(countParams).toEqual([4, 2]);
  });

  it('searches name, location and category case-insensitively, never the description', async () => {
    const { pool, query } = fakePool([{ total: 0 }], []);
    await createMysqlSupplierRepository(pool).findVisiblePage({ ...baseFilter, search: 'StOrE' });

    const [countSql, countParams] = query.mock.calls[0] as [string, unknown[]];
    expect(countSql).toContain('LOWER(s.supplier_name) LIKE ?');
    expect(countSql).toContain('LOWER(l.location) LIKE ?');
    expect(countSql).toContain('LOWER(c.category_type) LIKE ?');
    expect(countSql).not.toContain('supplier_desc');
    expect(countParams).toEqual(['%store%', '%store%', '%store%']);
  });

  it('escapes LIKE wildcards in the search text', async () => {
    const { pool, query } = fakePool([{ total: 0 }], []);
    await createMysqlSupplierRepository(pool).findVisiblePage({ ...baseFilter, search: '50%_off\\' });
    const [, params] = query.mock.calls[0] as [string, string[]];
    expect(params[0]).toBe('%50\\%\\_off\\\\%');
  });
});

describe('findAllVisible', () => {
  it('applies the visibility rule and filters but no LIMIT', async () => {
    const { pool, query } = fakePool([
      {
        supplier_id: 5,
        supplier_name: 'Kiosk',
        supplier_type: 'Store',
        supplier_desc: null,
        location_id: 4,
        location: 'Central Library',
        faculty_id: 2,
        faculty: 'Computing',
        level: 1,
      },
    ]);

    const rows = await createMysqlSupplierRepository(pool).findAllVisible({
      sortOrder: 'Z-A',
      locationId: 4,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ supplierId: 5, name: 'Kiosk' });
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('s.is_deleted = FALSE');
    expect(sql).toContain('s.is_active = TRUE');
    expect(sql).toContain('ORDER BY s.supplier_name DESC, s.supplier_id ASC');
    expect(sql).not.toContain('LIMIT');
    expect(params).toEqual([4]);
  });
});

describe('findVisibleById', () => {
  it('returns the mapped row with the visibility rule applied', async () => {
    const { pool, query } = fakePool([
      {
        supplier_id: 7,
        supplier_name: 'Gym',
        supplier_type: 'Facility',
        supplier_desc: 'Open gym',
        location_id: 4,
        location: 'Sports Hall',
        faculty_id: 2,
        faculty: 'Sports',
        level: 2,
      },
    ]);

    const row = await createMysqlSupplierRepository(pool).findVisibleById(7);

    expect(row).toMatchObject({ supplierId: 7, name: 'Gym', desc: 'Open gym' });
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('s.is_deleted = FALSE');
    expect(sql).toContain('s.is_active = TRUE');
    expect(params).toEqual([7]);
  });

  it('returns null when no visible row matches', async () => {
    const { pool } = fakePool([]);
    expect(await createMysqlSupplierRepository(pool).findVisibleById(9)).toBeNull();
  });
});

describe('detail lookups', () => {
  it('skips the query entirely for an empty id list', async () => {
    const { pool, query } = fakePool();
    const repo = createMysqlSupplierRepository(pool);
    expect(await repo.findCategoryLinks([])).toEqual([]);
    expect(await repo.findHours([])).toEqual([]);
    expect(await repo.findPhotos([])).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('maps category links', async () => {
    const { pool } = fakePool([{ supplier_id: 1, category_id: 2, category_type: 'Food' }]);
    expect(await createMysqlSupplierRepository(pool).findCategoryLinks([1])).toEqual([
      { supplierId: 1, categoryId: 2, category: 'Food' },
    ]);
  });

  it('trims TIME values to HH:MM', async () => {
    const { pool } = fakePool([{ supplier_id: 1, day_of_week: 1, open_time: '09:00:00', close_time: '18:30:00' }]);
    expect(await createMysqlSupplierRepository(pool).findHours([1])).toEqual([
      { supplierId: 1, dayOfWeek: 1, open: '09:00', close: '18:30' },
    ]);
  });

  it('maps photos in the order returned', async () => {
    const { pool, query } = fakePool([
      { supplier_id: 1, photo_id: 201, photo_location: 'https://x/1.png', display_order: 1 },
    ]);
    expect(await createMysqlSupplierRepository(pool).findPhotos([1])).toEqual([
      { supplierId: 1, photoId: 201, photoLocation: 'https://x/1.png', displayOrder: 1 },
    ]);
    expect((query.mock.calls[0] as [string])[0]).toContain('ORDER BY supplier_id, display_order');
  });
});

describe('reference lookups', () => {
  it('maps locations with their faculty', async () => {
    const { pool } = fakePool([{ location_id: 4, location: 'Central Library', faculty_id: 2, faculty: 'Computing' }]);
    expect(await createMysqlSupplierRepository(pool).listLocations()).toEqual([
      { locationId: 4, location: 'Central Library', facultyId: 2, faculty: 'Computing' },
    ]);
  });

  it('maps categories', async () => {
    const { pool } = fakePool([{ category_id: 2, category_type: 'Food' }]);
    expect(await createMysqlSupplierRepository(pool).listCategories()).toEqual([
      { categoryId: 2, category: 'Food' },
    ]);
  });
});

describe('admin reads', () => {
  const adminRow = {
    supplier_id: 9,
    supplier_name: 'Old Kiosk',
    supplier_type: 'Store',
    supplier_desc: null,
    location_id: 4,
    location: 'Central Library',
    faculty_id: 2,
    faculty: 'Computing',
    level: 1,
    is_active: 0,
    is_deleted: 1,
    created_on: '2026-09-01T09:00:00+08:00',
    created_by: 'u-1',
    updated_on: '2026-09-02T10:30:00+08:00',
    version: 3,
  };

  it('findAdminPage applies no visibility filter and maps status fields', async () => {
    const { pool, query } = fakePool([{ total: 1 }], [adminRow]);
    const result = await createMysqlSupplierRepository(pool).findAdminPage({ ...baseFilter });

    expect(result.total).toBe(1);
    expect(result.rows[0]).toMatchObject({
      supplierId: 9,
      isActive: false,
      isDeleted: true,
      createdOn: '2026-09-01T09:00:00+08:00',
      createdBy: 'u-1',
      updatedOn: '2026-09-02T10:30:00+08:00',
      version: 3,
    });
    for (const call of query.mock.calls) {
      expect(call[0]).not.toContain('is_deleted = FALSE');
      expect(call[0]).not.toContain('is_active = TRUE');
    }
  });

  it('findAdminById returns a deleted or inactive supplier, and null when missing', async () => {
    const found = fakePool([adminRow]);
    expect(await createMysqlSupplierRepository(found.pool).findAdminById(9)).toMatchObject({ isDeleted: true });
    expect(found.query.mock.calls[0]?.[0]).not.toContain('is_deleted = FALSE');

    const missing = fakePool([]);
    expect(await createMysqlSupplierRepository(missing.pool).findAdminById(9)).toBeNull();
  });

  it('findAllAdmin returns every matching row without paging', async () => {
    const { pool, query } = fakePool([adminRow]);
    const rows = await createMysqlSupplierRepository(pool).findAllAdmin({ sortOrder: 'Z-A' });
    expect(rows).toHaveLength(1);
    expect(String(query.mock.calls[0]?.[0])).not.toContain('LIMIT');
  });
});

describe('supplierIds criterion', () => {
  it('filters the visible page and its count by the given ids', async () => {
    const { pool, query } = fakePool([{ total: 0 }], []);

    await createMysqlSupplierRepository(pool).findVisiblePage({ ...baseFilter, supplierIds: [3, 7] });

    const [countSql, countParams] = query.mock.calls[0] as [string, unknown[]];
    const [pageSql, pageParams] = query.mock.calls[1] as [string, unknown[]];
    for (const sql of [countSql, pageSql]) {
      expect(sql).toContain('s.supplier_id IN (?)');
      expect(sql).toContain('s.is_deleted = FALSE');
    }
    expect(countParams).toEqual([[3, 7]]);
    expect(pageParams).toEqual([[3, 7], 50, 0]);
  });

  it('applies to the unpaged read used by the isOpen filter', async () => {
    const { pool, query } = fakePool([]);

    await createMysqlSupplierRepository(pool).findAllVisible({ sortOrder: 'A-Z', supplierIds: [3, 7] });

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('s.supplier_id IN (?)');
    expect(params).toEqual([[3, 7]]);
  });

  it('adds no id condition when the criterion is absent', async () => {
    const { pool, query } = fakePool([{ total: 0 }], []);

    await createMysqlSupplierRepository(pool).findVisiblePage(baseFilter);

    expect((query.mock.calls[1] as [string, unknown[]])[0]).not.toContain('s.supplier_id IN');
  });
});

describe('findStatusesByIds', () => {
  it('returns the visibility flags of the rows that exist, from the supplier table', async () => {
    const { pool, query } = fakePool([
      { supplier_id: 3, is_active: 1, is_deleted: 0 },
      { supplier_id: 7, is_active: 0, is_deleted: 0 },
    ]);

    const result = await createMysqlSupplierRepository(pool).findStatusesByIds([3, 7, 99]);

    expect(result).toEqual([
      { supplierId: 3, isActive: true, isDeleted: false },
      { supplierId: 7, isActive: false, isDeleted: false },
    ]);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('FROM supplier WHERE supplier_id IN (?)');
    expect(params).toEqual([[3, 7, 99]]);
  });

  it('does not query when given no ids', async () => {
    const { pool, query } = fakePool();

    expect(await createMysqlSupplierRepository(pool).findStatusesByIds([])).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
