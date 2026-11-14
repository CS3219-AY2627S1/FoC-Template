/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Unit tests for list-query and path-id validation per SupplierServiceArchitecture.md §7.2
 *        and §7.1.1. No requirements, architecture, schema, or API decisions were made by the AI
 *        tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5): moved from src/validation/supplierQuery.test.ts to test/validation/supplierQuery.test.ts and updated
 *        the relative imports; no test logic changed. No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-05, Claude Code, model: claude-sonnet-5-5): Added listQuerySchema ids tests, per the 2026-11-05
 *        supplier-bookmarking spec. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/utils/AppError.js';
import { idParamSchema, listQuerySchema, parseOrThrow } from '../../src/validation/supplierQuery.js';

function catchAppError(fn: () => unknown): AppError {
  try {
    fn();
  } catch (err) {
    if (err instanceof AppError) return err;
    throw err;
  }
  throw new Error('expected an AppError');
}

describe('listQuerySchema via parseOrThrow', () => {
  it('applies defaults: page 1, sortOrder A-Z', () => {
    const q = parseOrThrow(listQuerySchema, {}, 'query');
    expect(q).toMatchObject({ page: 1, sortOrder: 'A-Z' });
  });

  it('coerces numeric strings and keeps filters', () => {
    const q = parseOrThrow(
      listQuerySchema,
      { page: '3', search: '  store ', location_id: '4', category_id: '2', sortOrder: 'Z-A', limit: '50' },
      'query',
    );
    expect(q).toMatchObject({ page: 3, search: 'store', location_id: 4, category_id: 2, sortOrder: 'Z-A' });
  });

  it.each([
    ['true', true],
    ['false', false],
  ])('parses isOpen=%s', (raw, expected) => {
    expect(parseOrThrow(listQuerySchema, { isOpen: raw }, 'query').isOpen).toBe(expected);
  });

  it('leaves isOpen undefined when omitted', () => {
    expect(parseOrThrow(listQuerySchema, {}, 'query').isOpen).toBeUndefined();
  });

  it('rejects limit other than 50 with a 422 naming the field', () => {
    const err = catchAppError(() => parseOrThrow(listQuerySchema, { limit: '51' }, 'query'));
    expect(err.statusCode).toBe(422);
    expect(err.details?.[0]).toMatchObject({ field: 'limit', location: 'query' });
  });

  it.each([
    ['page', '0'],
    ['page', 'abc'],
    ['location_id', '-1'],
    ['category_id', 'x'],
    ['sortOrder', 'newest'],
    ['limit', '0'],
    ['isOpen', 'maybe'],
    ['isOpen', '1'],
  ])('rejects invalid %s=%s with 422', (field, value) => {
    const err = catchAppError(() => parseOrThrow(listQuerySchema, { [field]: value }, 'query'));
    expect(err.statusCode).toBe(422);
    expect(err.error).toBe('Unprocessable Entity');
    expect(err.details?.[0]?.field).toBe(field);
  });
});

describe('idParamSchema via parseOrThrow', () => {
  it('parses a positive integer id', () => {
    expect(parseOrThrow(idParamSchema, { id: '101' }, 'path')).toEqual({ id: 101 });
  });

  it.each(['0', 'abc', '1.5', '-3'])('rejects id=%s with 422', (id) => {
    const err = catchAppError(() => parseOrThrow(idParamSchema, { id }, 'path'));
    expect(err.statusCode).toBe(422);
    expect(err.details?.[0]).toMatchObject({ field: 'id', location: 'path' });
  });
});

describe('listQuerySchema ids', () => {
  const ids = (raw: unknown) => parseOrThrow(listQuerySchema, { ids: raw }, 'query').ids;

  it('leaves ids undefined when omitted', () => {
    expect(parseOrThrow(listQuerySchema, {}, 'query').ids).toBeUndefined();
  });

  it('splits a comma-separated list into well-formed numbers', () => {
    expect(ids('3,7,12')).toEqual({ valid: [3, 7, 12], invalid: [] });
  });

  it('ignores duplicates, keeping first-seen order', () => {
    expect(ids('7,3,7')).toEqual({ valid: [7, 3], invalid: [] });
  });

  it('treats an empty value as no ids rather than an error', () => {
    expect(ids('')).toEqual({ valid: [], invalid: [] });
  });

  it('ignores empty items such as a trailing comma', () => {
    expect(ids('3,,7,')).toEqual({ valid: [3, 7], invalid: [] });
  });

  it('reports malformed items as invalid without rejecting the request', () => {
    expect(ids('3,x,0,1.5,-2,07,7')).toEqual({ valid: [3, 7], invalid: ['x', '0', '1.5', '-2', '07'] });
  });

  it('treats an id above 2147483647 as invalid', () => {
    expect(ids('2147483647,2147483648')).toEqual({ valid: [2147483647], invalid: ['2147483648'] });
  });

  it('accepts exactly 20 values', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => i + 1).join(',');
    expect(ids(twenty)?.valid).toHaveLength(20);
  });

  it.each([
    ['21 values', Array.from({ length: 21 }, (_, i) => i + 1).join(',')],
    ['a repeated parameter', ['1', '2']],
  ])('rejects %s with a 422 naming ids', (_label, raw) => {
    const err = catchAppError(() => ids(raw));
    expect(err.statusCode).toBe(422);
    expect(err.details?.[0]).toMatchObject({ location: 'query' });
    expect((err.details?.[0] as { field: string }).field).toMatch(/^ids/);
  });
});
