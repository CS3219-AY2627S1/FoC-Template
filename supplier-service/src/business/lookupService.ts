/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Implemented the lookup business service per Phase 2 plan Task 4. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import type { LocationPatch, LookupRepository } from '../persistence/lookupRepository.js';
import { AppError } from '../utils/AppError.js';

function notFound(subject: string): AppError {
  return new AppError(404, 'Not Found', `${subject} not found.`);
}

export function createLookupService(repo: LookupRepository) {
  async function updated<T>(result: Promise<T | null>, subject: string): Promise<T> {
    const value = await result;
    if (value === null) throw notFound(subject);
    return value;
  }

  async function deleted(result: Promise<boolean>, id: number, subject: string) {
    if (!(await result)) throw notFound(subject);
    return { deleted: true as const, id };
  }

  return {
    createFaculty: (faculty: string) => repo.createFaculty(faculty),
    updateFaculty: (id: number, faculty: string) => updated(repo.updateFaculty(id, faculty), 'Faculty'),
    deleteFaculty: (id: number) => deleted(repo.deleteFaculty(id), id, 'Faculty'),

    createLocation: (input: { location: string; facultyId: number; level: number }) =>
      repo.createLocation(input),
    updateLocation: (id: number, patch: LocationPatch) => updated(repo.updateLocation(id, patch), 'Location'),
    deleteLocation: (id: number) => deleted(repo.deleteLocation(id), id, 'Location'),

    createCategory: (categoryType: string) => repo.createCategory(categoryType),
    updateCategory: (id: number, categoryType: string) =>
      updated(repo.updateCategory(id, categoryType), 'Category'),
    deleteCategory: (id: number) => deleted(repo.deleteCategory(id), id, 'Category'),
  };
}

export type LookupService = ReturnType<typeof createLookupService>;
