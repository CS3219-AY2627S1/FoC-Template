/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Wrote unit tests for the lookup body validation per Phase 2 plan Task 4. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5): moved from src/validation/lookupInput.test.ts to test/validation/lookupInput.test.ts and updated
 *        the relative imports; no test logic changed. No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review:
 */
import { describe, expect, it } from 'vitest';
import { categoryBody, facultyBody, locationCreateBody, locationUpdateBody } from '../../src/validation/lookupInput.js';

describe('lookup bodies', () => {
  it('trims and requires the faculty name', () => {
    expect(facultyBody.parse({ faculty: '  Computing ' })).toEqual({ faculty: 'Computing' });
    expect(facultyBody.safeParse({ faculty: '   ' }).success).toBe(false);
    expect(facultyBody.safeParse({}).success).toBe(false);
  });

  it('requires location, faculty_id and level on create', () => {
    expect(locationCreateBody.parse({ location: 'Library', faculty_id: '2', level: '1' })).toEqual({
      location: 'Library',
      faculty_id: 2,
      level: 1,
    });
    expect(locationCreateBody.safeParse({ location: 'Library', level: 1 }).success).toBe(false);
  });

  it('accepts any subset on update but not an empty body', () => {
    expect(locationUpdateBody.parse({ level: 3 })).toEqual({ level: 3 });
    expect(locationUpdateBody.safeParse({}).success).toBe(false);
  });

  it('requires category_type', () => {
    expect(categoryBody.parse({ category_type: 'Food' })).toEqual({ category_type: 'Food' });
    expect(categoryBody.safeParse({ category_type: '' }).success).toBe(false);
  });
});
