/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Tests for the Phase 1 business workflows (list incl. the isOpen filter, detail, reference
 *        options) against an in-memory fake repository, per SupplierServiceArchitecture.md §4,
 *        §6.2, §7.2, §7.3. No requirements, architecture, schema, or API decisions were made by the
 *        AI tool.
 * Author review:
 * Scope (2026-09-29, Claude Code, model: claude-sonnet-5): added admin list/detail tests per
 *        Phase 2 plan Task 3. No requirements, architecture, schema, or API decisions were made by
 *        the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5): moved from src/business/supplierService.test.ts to test/business/supplierService.test.ts and updated
 *        the relative imports; no test logic changed. No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review:
  * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): expectations for location_id, faculty_id and
 *        categories as {category, category_id}, per the team's decision in chat.
 * Author review:
 * Scope (2026-11-05, Claude Code, model: claude-sonnet-5-5): Added listSuppliers ids tests, per the 2026-11-05 supplier-bookmarking spec.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/utils/AppError.js';
import type { AdminSupplierRow, SupplierRepository, SupplierRow } from '../../src/persistence/supplierRepository.js';
import { createSupplierService } from '../../src/business/supplierService.js';

const MONDAY_10AM_SGT = new Date('2026-09-28T02:00:00Z');

const store: SupplierRow = {
  supplierId: 1,
  name: 'Campus Store',
  type: 'Store',
  desc: 'A campus convenience store.',
  locationId: 4,
  location: 'Central Library',
  facultyId: 2,
  faculty: 'Computing',
  level: 1,
};
const facility: SupplierRow = {
  supplierId: 2,
  name: 'Gym',
  type: 'Facility',
  desc: null,
  locationId: 5,
  location: 'Sports Hall',
  facultyId: 3,
  faculty: 'Sports',
  level: 2,
};
const kiosk: SupplierRow = {
  supplierId: 3,
  name: 'Night Kiosk',
  type: 'Store',
  desc: null,
  locationId: 4,
  location: 'Central Library',
  facultyId: 2,
  faculty: 'Computing',
  level: 1,
}; // no hours rows: never open

const adminStore: AdminSupplierRow = {
  ...store,
  isActive: false,
  isDeleted: true,
  createdOn: '2026-09-01T09:00:00+08:00',
  createdBy: 'u-1',
  updatedOn: '2026-09-02T10:30:00+08:00',
  version: 3,
};
const adminFacility: AdminSupplierRow = { ...facility, isActive: true, isDeleted: false, createdOn: '2026-09-01T09:00:00+08:00', createdBy: 'u-1', updatedOn: '2026-09-01T09:00:00+08:00', version: 0 };

function fakeRepo(overrides: Partial<SupplierRepository> = {}): SupplierRepository {
  return {
    findVisiblePage: vi.fn().mockResolvedValue({ rows: [store, facility], total: 125 }),
    findAllVisible: vi.fn().mockResolvedValue([store, facility, kiosk]),
    findVisibleById: vi.fn().mockResolvedValue(store),
    findAdminPage: vi.fn().mockResolvedValue({ rows: [adminStore], total: 1 }),
    findAllAdmin: vi.fn().mockResolvedValue([adminStore, adminFacility]),
    findAdminById: vi.fn().mockResolvedValue(adminStore),
    findStatusesByIds: vi.fn().mockResolvedValue([]),
    findCategoryLinks: vi.fn().mockResolvedValue([
      { supplierId: 1, categoryId: 3, category: 'Drinks' },
      { supplierId: 1, categoryId: 2, category: 'Food' },
    ]),
    findHours: vi.fn().mockResolvedValue([
      { supplierId: 1, dayOfWeek: 2, open: '10:00', close: '12:00' },
      { supplierId: 1, dayOfWeek: 1, open: '09:00', close: '18:00' },
      { supplierId: 2, dayOfWeek: 1, open: '00:00', close: '23:59' },
    ]),
    findPhotos: vi.fn().mockResolvedValue([
      { supplierId: 1, photoId: 201, photoLocation: 'https://x/201.png', displayOrder: 1 },
    ]),
    listLocations: vi.fn().mockResolvedValue([]),
    listCategories: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

const service = (repo: SupplierRepository) => createSupplierService(repo, () => MONDAY_10AM_SGT);

describe('listSuppliers', () => {
  it('builds summaries with categories, photos and isOpen, without desc/openingHours', async () => {
    const result = await service(fakeRepo()).listSuppliers({ page: 1, sortOrder: 'A-Z' });

    expect(result.data[0]).toEqual({
      id: 1,
      name: 'Campus Store',
      type: 'Store',
      location_id: 4,
      location: 'Central Library',
      faculty_id: 2,
      faculty: 'Computing',
      level: 1,
      categories: [
        { category: 'Drinks', category_id: 3 },
        { category: 'Food', category_id: 2 },
      ],
      photos: [{ photoId: 201, photoLocation: 'https://x/201.png', displayOrder: 1 }],
      isOpen: true,
    });
    expect(result.data[1]).toMatchObject({ id: 2, categories: [], photos: [], isOpen: true });
    expect(result.data[0]).not.toHaveProperty('desc');
    expect(result.data[0]).not.toHaveProperty('openingHours');
  });

  it('builds pagination metadata with the fixed 50-entry limit', async () => {
    const result = await service(fakeRepo()).listSuppliers({ page: 1, sortOrder: 'A-Z' });
    expect(result.metadata).toEqual({ totalRecords: 125, currPage: 1, limit: 50, totalPages: 3 });
  });

  it('passes filters, sort and the page offset to the repository', async () => {
    const repo = fakeRepo();
    await service(repo).listSuppliers({
      page: 3,
      search: 'store',
      locationId: 4,
      categoryId: 2,
      sortOrder: 'Z-A',
    });
    expect(repo.findVisiblePage).toHaveBeenCalledWith({
      search: 'store',
      locationId: 4,
      categoryId: 2,
      sortOrder: 'Z-A',
      limit: 50,
      offset: 100,
    });
    expect(repo.findAllVisible).not.toHaveBeenCalled();
  });

  it('reports zero pages and no data when nothing matches', async () => {
    const repo = fakeRepo({ findVisiblePage: vi.fn().mockResolvedValue({ rows: [], total: 0 }) });
    const result = await service(repo).listSuppliers({ page: 1, sortOrder: 'A-Z' });
    expect(result).toEqual({
      metadata: { totalRecords: 0, currPage: 1, limit: 50, totalPages: 0 },
      data: [],
    });
  });

  it('returns empty data, not an error, for a page past the last page', async () => {
    const repo = fakeRepo({ findVisiblePage: vi.fn().mockResolvedValue({ rows: [], total: 125 }) });
    const result = await service(repo).listSuppliers({ page: 9, sortOrder: 'A-Z' });
    expect(result).toEqual({
      metadata: { totalRecords: 125, currPage: 9, limit: 50, totalPages: 3 },
      data: [],
    });
  });

  it('reports a Store as closed outside its hours', async () => {
    const evening = createSupplierService(fakeRepo(), () => new Date('2026-09-28T12:00:00Z')); // 20:00 SGT
    const result = await evening.listSuppliers({ page: 1, sortOrder: 'A-Z' });
    expect(result.data[0]?.isOpen).toBe(false);
    expect(result.data[1]?.isOpen).toBe(true); // Gym has a 00:00-23:59 Monday row
  });
});

describe('listSuppliers with the isOpen filter', () => {
  it('returns only currently open suppliers for isOpen=true', async () => {
    const repo = fakeRepo();
    const result = await service(repo).listSuppliers({ page: 1, sortOrder: 'A-Z', isOpen: true });

    expect(result.data.map((item) => item.id)).toEqual([1, 2]);
    expect(result.metadata).toEqual({ totalRecords: 2, currPage: 1, limit: 50, totalPages: 1 });
    expect(repo.findAllVisible).toHaveBeenCalledWith({
      search: undefined,
      locationId: undefined,
      categoryId: undefined,
      sortOrder: 'A-Z',
    });
    expect(repo.findVisiblePage).not.toHaveBeenCalled();
  });

  it('returns only currently closed suppliers for isOpen=false', async () => {
    const result = await service(fakeRepo()).listSuppliers({ page: 1, sortOrder: 'A-Z', isOpen: false });
    expect(result.data.map((item) => item.id)).toEqual([3]);
    expect(result.metadata.totalRecords).toBe(1);
  });

  it('cuts the page after filtering, and a page past the end is empty', async () => {
    const result = await service(fakeRepo()).listSuppliers({ page: 2, sortOrder: 'A-Z', isOpen: true });
    expect(result).toEqual({
      metadata: { totalRecords: 2, currPage: 2, limit: 50, totalPages: 1 },
      data: [],
    });
  });

  it('pages the filtered set 50 at a time', async () => {
    const many = Array.from({ length: 120 }, (_, i) => ({ ...facility, supplierId: 1000 + i }));
    const repo = fakeRepo({
      findAllVisible: vi.fn().mockResolvedValue(many),
      findHours: vi.fn().mockResolvedValue(
        many.map((row) => ({ supplierId: row.supplierId, dayOfWeek: 1, open: '00:00', close: '23:59' })),
      ),
    });
    const result = await service(repo).listSuppliers({ page: 3, sortOrder: 'A-Z', isOpen: true });
    expect(result.data).toHaveLength(20);
    expect(result.metadata).toEqual({ totalRecords: 120, currPage: 3, limit: 50, totalPages: 3 });
  });
});

describe('getSupplier', () => {
  it('returns the detail shape with desc and day-ordered openingHours', async () => {
    const detail = await service(fakeRepo()).getSupplier(1);
    expect(detail).toMatchObject({
      id: 1,
      desc: 'A campus convenience store.',
      isOpen: true,
      openingHours: [
        { day: 1, open: '09:00', close: '18:00' },
        { day: 2, open: '10:00', close: '12:00' },
      ],
    });
  });

  it('throws a 404 AppError when the supplier is missing or hidden', async () => {
    const repo = fakeRepo({ findVisibleById: vi.fn().mockResolvedValue(null) });
    await expect(service(repo).getSupplier(99)).rejects.toMatchObject({
      statusCode: 404,
      error: 'Not Found',
    });
    await expect(service(repo).getSupplier(99)).rejects.toBeInstanceOf(AppError);
  });
});

describe('reference options', () => {
  it('maps locations to the §7.3 snake_case contract', async () => {
    const repo = fakeRepo({
      listLocations: vi.fn().mockResolvedValue([
        { locationId: 4, location: 'Central Library', facultyId: 2, faculty: 'Computing' },
      ]),
    });
    expect(await service(repo).listLocations()).toEqual({
      locations: [{ location_id: 4, location: 'Central Library', faculty_id: 2, faculty: 'Computing' }],
    });
  });

  it('maps categories to the §7.3 contract, with category as the category value', async () => {
    const repo = fakeRepo({
      listCategories: vi.fn().mockResolvedValue([{ categoryId: 2, category: 'Food' }]),
    });
    expect(await service(repo).listCategories()).toEqual({
      categories: [{ category_id: 2, category: 'Food' }],
    });
  });
});

describe('admin reads', () => {
  it('lists with status fields and no visibility filtering', async () => {
    const repo = fakeRepo();
    const service = createSupplierService(repo, () => MONDAY_10AM_SGT);
    const result = await service.listAdminSuppliers({ page: 1, sortOrder: 'A-Z' });

    expect(repo.findAdminPage).toHaveBeenCalledWith({ sortOrder: 'A-Z', limit: 50, offset: 0 });
    expect(result.data[0]).toMatchObject({ id: 1, isActive: false, isDeleted: true });
    expect(result.metadata).toEqual({ totalRecords: 1, currPage: 1, limit: 50, totalPages: 1 });
  });

  it('applies the isOpen filter over all admin rows before paging', async () => {
    const repo = fakeRepo();
    const service = createSupplierService(repo, () => MONDAY_10AM_SGT);
    const result = await service.listAdminSuppliers({ page: 1, isOpen: true, sortOrder: 'A-Z' });

    expect(repo.findAllAdmin).toHaveBeenCalled();
    expect(result.data.every((item) => item.isOpen)).toBe(true);
  });

  it('returns the admin detail with audit fields and version', async () => {
    const service = createSupplierService(fakeRepo(), () => MONDAY_10AM_SGT);
    const detail = await service.getAdminSupplier(1);

    expect(detail).toMatchObject({
      id: 1,
      desc: 'A campus convenience store.',
      isActive: false,
      isDeleted: true,
      createdOn: '2026-09-01T09:00:00+08:00',
      createdBy: 'u-1',
      updatedOn: '2026-09-02T10:30:00+08:00',
      version: 3,
    });
    expect(detail.openingHours.length).toBeGreaterThan(0);
  });

  it('throws 404 for an unknown admin id', async () => {
    const repo = fakeRepo({ findAdminById: vi.fn().mockResolvedValue(null) });
    await expect(createSupplierService(repo).getAdminSupplier(99)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('listSuppliers with ids', () => {
  const statuses = [
    { supplierId: 1, isActive: true, isDeleted: false },
    { supplierId: 7, isActive: false, isDeleted: false },
    { supplierId: 12, isActive: false, isDeleted: true },
    { supplierId: 13, isActive: true, isDeleted: true },
  ];
  const withStatuses = () => fakeRepo({ findStatusesByIds: vi.fn().mockResolvedValue(statuses) });
  const ids = (valid: number[], invalid: string[] = []) => ({ valid, invalid });

  it('restricts the page query to the ids and keeps the other filters', async () => {
    const repo = withStatuses();

    await service(repo).listSuppliers({ page: 1, sortOrder: 'Z-A', search: 'store', ids: ids([1, 7]) });

    expect(repo.findVisiblePage).toHaveBeenCalledWith(
      expect.objectContaining({ supplierIds: [1, 7], search: 'store', sortOrder: 'Z-A' }),
    );
  });

  it('restricts the unpaged read used by the isOpen filter too', async () => {
    const repo = withStatuses();

    await service(repo).listSuppliers({ page: 1, sortOrder: 'A-Z', isOpen: true, ids: ids([1, 7]) });

    expect(repo.findAllVisible).toHaveBeenCalledWith(expect.objectContaining({ supplierIds: [1, 7] }));
  });

  it('lists hidden, deleted and unknown ids in the order sent, skipping visible ones', async () => {
    const result = await service(withStatuses()).listSuppliers({
      page: 1,
      sortOrder: 'A-Z',
      ids: ids([12, 1, 99, 7]),
    });

    expect(result.unavailable).toEqual([
      { id: 12, status: 'deleted' },
      { id: 99, status: 'deleted' },
      { id: 7, status: 'hidden' },
    ]);
  });

  it('reports a supplier that is both deleted and inactive as deleted', async () => {
    const result = await service(withStatuses()).listSuppliers({
      page: 1,
      sortOrder: 'A-Z',
      ids: ids([12, 13]),
    });

    expect(result.unavailable).toEqual([
      { id: 12, status: 'deleted' },
      { id: 13, status: 'deleted' },
    ]);
  });

  it('reports malformed items as invalid, after the well-formed ones, without blocking them', async () => {
    const repo = withStatuses();

    const result = await service(repo).listSuppliers({
      page: 1,
      sortOrder: 'A-Z',
      ids: ids([7, 1], ['abc', '0']),
    });

    expect(repo.findVisiblePage).toHaveBeenCalledWith(expect.objectContaining({ supplierIds: [7, 1] }));
    expect(result.unavailable).toEqual([
      { id: 7, status: 'hidden' },
      { id: 'abc', status: 'invalid' },
      { id: '0', status: 'invalid' },
    ]);
  });

  it('returns an empty payload without touching the database when no id is well-formed', async () => {
    const repo = withStatuses();

    const result = await service(repo).listSuppliers({ page: 3, sortOrder: 'A-Z', ids: ids([], ['abc']) });

    expect(result).toEqual({
      metadata: { totalRecords: 0, currPage: 3, limit: 50, totalPages: 0 },
      data: [],
      unavailable: [{ id: 'abc', status: 'invalid' }],
    });
    expect(repo.findVisiblePage).not.toHaveBeenCalled();
    expect(repo.findAllVisible).not.toHaveBeenCalled();
    expect(repo.findStatusesByIds).not.toHaveBeenCalled();
  });

  it('returns an empty payload with an empty unavailable array for an empty ids list', async () => {
    const result = await service(withStatuses()).listSuppliers({ page: 1, sortOrder: 'A-Z', ids: ids([]) });

    expect(result.data).toEqual([]);
    expect(result.metadata.totalRecords).toBe(0);
    expect(result.unavailable).toEqual([]);
  });

  it('always includes unavailable (empty) when every id is visible', async () => {
    const result = await service(withStatuses()).listSuppliers({ page: 1, sortOrder: 'A-Z', ids: ids([1]) });

    expect(result.unavailable).toEqual([]);
  });

  it('checks every well-formed id, whatever the other filters are', async () => {
    const repo = withStatuses();

    await service(repo).listSuppliers({
      page: 2,
      sortOrder: 'A-Z',
      search: 'zzz',
      locationId: 4,
      ids: ids([1, 7, 12]),
    });

    expect(repo.findStatusesByIds).toHaveBeenCalledWith([1, 7, 12]);
  });

  it('adds no unavailable field and does no status lookup without ids', async () => {
    const repo = fakeRepo();

    const result = await service(repo).listSuppliers({ page: 1, sortOrder: 'A-Z' });

    expect(result).not.toHaveProperty('unavailable');
    expect(repo.findStatusesByIds).not.toHaveBeenCalled();
  });
});
