/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Tests for PUT field parsing (Phase 3 plan Task 3).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { describe, expect, it } from 'vitest';
import { parseUpdateSupplier } from '../../src/validation/supplierUpdateInput.js';

describe('parseUpdateSupplier', () => {
  it('accepts one editable field and leaves every other field undefined', () => {
    expect(parseUpdateSupplier({ version: '3', isActive: 'true' })).toEqual({
      version: 3,
      isActive: true,
      isPhotoDirty: false,
    });
  });

  it('rejects a body with only version (nothing to update) with 422', () => {
    expect(() => parseUpdateSupplier({ version: '3' })).toThrowError(expect.objectContaining({ statusCode: 422 }));
  });

  it('accepts version plus a photo change alone', () => {
    expect(parseUpdateSupplier({ version: '3', isPhotoDirty: 'true', photo_ids: '[]' })).toEqual({
      version: 3,
      isPhotoDirty: true,
      photoIds: [],
    });
  });

  it('parses every editable field', () => {
    const result = parseUpdateSupplier({
      version: '3',
      name: '  New Name ',
      type: 'Store',
      desc: '  ',
      location_id: '5',
      category_id: '[1,2]',
      openingHours: '[{"day":1,"open":"09:00","close":"18:00"}]',
      is24h: 'false',
      isActive: 'false',
      isPhotoDirty: 'true',
      photo_ids: '[2,"ph-1"]',
      placeholder_ids: '["ph-1"]',
    });
    expect(result).toEqual({
      version: 3,
      name: 'New Name',
      type: 'Store',
      desc: null,
      locationId: 5,
      categoryIds: [1, 2],
      openingHours: '[{"day":1,"open":"09:00","close":"18:00"}]',
      is24h: false,
      isActive: false,
      isPhotoDirty: true,
      photoIds: [2, 'ph-1'],
      placeholderIds: ['ph-1'],
    });
  });

  it.each([[{}], [{ version: 'x' }], [{ version: '-1' }]])('rejects a missing or bad version %j with 422', (body) => {
    expect(() => parseUpdateSupplier(body)).toThrowError(expect.objectContaining({ statusCode: 422 }));
  });

  it('rejects an empty name and an unknown type with 422', () => {
    expect(() => parseUpdateSupplier({ version: '1', name: ' ' })).toThrowError(expect.objectContaining({ statusCode: 422 }));
    expect(() => parseUpdateSupplier({ version: '1', type: 'Shop' })).toThrowError(expect.objectContaining({ statusCode: 422 }));
  });

  it('requires photo_ids when isPhotoDirty is true (422)', () => {
    expect(() => parseUpdateSupplier({ version: '1', isPhotoDirty: 'true' })).toThrowError(
      expect.objectContaining({ statusCode: 422 }),
    );
  });

  it('rejects malformed JSON with 400', () => {
    expect(() => parseUpdateSupplier({ version: '1', isPhotoDirty: 'true', photo_ids: '[' })).toThrowError(
      expect.objectContaining({ statusCode: 400 }),
    );
  });

  it('rejects duplicate placeholder ids with 422', () => {
    expect(() =>
      parseUpdateSupplier({ version: '1', isPhotoDirty: 'true', photo_ids: '["a","a"]', placeholder_ids: '["a","a"]' }),
    ).toThrowError(expect.objectContaining({ statusCode: 422 }));
  });
});
