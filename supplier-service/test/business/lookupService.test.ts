/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Wrote unit tests for the lookup service per Phase 2 plan Task 4. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5): moved from src/business/lookupService.test.ts to test/business/lookupService.test.ts and updated
 *        the relative imports; no test logic changed. No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review:
 */
import { describe, expect, it, vi } from 'vitest';
import type { LookupRepository } from '../../src/persistence/lookupRepository.js';
import { createLookupService } from '../../src/business/lookupService.js';

function fakeRepo(overrides: Partial<LookupRepository> = {}): LookupRepository {
  return {
    createFaculty: vi.fn().mockResolvedValue({ faculty_id: 1, faculty: 'Computing' }),
    updateFaculty: vi.fn().mockResolvedValue({ faculty_id: 1, faculty: 'Science' }),
    deleteFaculty: vi.fn().mockResolvedValue(true),
    createLocation: vi.fn().mockResolvedValue({ location_id: 1, location: 'L', faculty_id: 1, level: 1 }),
    updateLocation: vi.fn().mockResolvedValue({ location_id: 1, location: 'L', faculty_id: 1, level: 2 }),
    deleteLocation: vi.fn().mockResolvedValue(true),
    createCategory: vi.fn().mockResolvedValue({ category_id: 1, category_type: 'Food' }),
    updateCategory: vi.fn().mockResolvedValue({ category_id: 1, category_type: 'Drinks' }),
    deleteCategory: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('lookup service', () => {
  it('passes creates and updates through', async () => {
    const service = createLookupService(fakeRepo());
    expect(await service.createFaculty('Computing')).toEqual({ faculty_id: 1, faculty: 'Computing' });
    expect(await service.updateCategory(1, 'Drinks')).toEqual({ category_id: 1, category_type: 'Drinks' });
  });

  it('returns 200 body { deleted: true, id } on delete', async () => {
    expect(await createLookupService(fakeRepo()).deleteLocation(4)).toEqual({ deleted: true, id: 4 });
  });

  it.each([
    ['updateFaculty', (s: ReturnType<typeof createLookupService>) => s.updateFaculty(9, 'X')],
    ['updateLocation', (s: ReturnType<typeof createLookupService>) => s.updateLocation(9, { level: 1 })],
    ['updateCategory', (s: ReturnType<typeof createLookupService>) => s.updateCategory(9, 'X')],
  ])('%s throws 404 for an unknown id', async (name, call) => {
    const service = createLookupService(fakeRepo({ [name]: vi.fn().mockResolvedValue(null) }));
    await expect(call(service)).rejects.toMatchObject({ statusCode: 404 });
  });

  it.each([
    ['deleteFaculty', (s: ReturnType<typeof createLookupService>) => s.deleteFaculty(9)],
    ['deleteLocation', (s: ReturnType<typeof createLookupService>) => s.deleteLocation(9)],
    ['deleteCategory', (s: ReturnType<typeof createLookupService>) => s.deleteCategory(9)],
  ])('%s throws 404 for an unknown id', async (name, call) => {
    const service = createLookupService(fakeRepo({ [name]: vi.fn().mockResolvedValue(false) }));
    await expect(call(service)).rejects.toMatchObject({ statusCode: 404 });
  });
});
