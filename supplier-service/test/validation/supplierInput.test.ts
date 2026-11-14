/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Generated tests for parsing/validating supplier create requests (Phase 2 Task 5).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5): moved from src/validation/supplierInput.test.ts to test/validation/supplierInput.test.ts and updated
 *        the relative imports; no test logic changed. No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): added resolveHours tests (Phase 3 Task 2).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { describe, expect, it } from 'vitest';
import { parseCreateSupplier, resolveHours } from '../../src/validation/supplierInput.js';

const store = {
  name: '  Campus Store ',
  type: 'Store',
  location_id: '4',
  category_id: '[2, 3, 3]',
  desc: 'A campus convenience store.',
  openingHours: '[{"day":1,"open":"09:00","close":"18:00"}]',
};
const day8 = { day: 8, open: '00:00', close: '23:59', is24h: true };

describe('parseCreateSupplier — Store', () => {
  it('parses the documented example (Arch §7.4)', () => {
    expect(parseCreateSupplier(store)).toEqual({
      name: 'Campus Store',
      type: 'Store',
      desc: 'A campus convenience store.',
      locationId: 4,
      categoryIds: [2, 3],
      hours: [{ day: 1, open: '09:00', close: '18:00', is24h: false }],
    });
  });

  it('allows Store days that are 00:00-23:59 without the 24/7 flag', () => {
    const result = parseCreateSupplier({
      ...store,
      openingHours: '[{"day":1,"open":"00:00","close":"23:59"},{"day":2,"open":"09:00","close":"18:00"}]',
    });
    expect(result.hours.map((h) => h.is24h)).toEqual([false, false]);
  });

  it('treats a 24/7 Store as a single day-8 entry', () => {
    const result = parseCreateSupplier({
      ...store,
      is24h: 'true',
      openingHours: '[{"day":8,"open":"00:00","close":"23:59"}]',
    });
    expect(result.hours).toEqual([day8]);
  });

  it('rejects is24h without exactly the day-8 entry', () => {
    expect(() => parseCreateSupplier({ ...store, is24h: 'true' })).toThrowError(/24\/7/);
  });

  it('rejects a day-8 entry without is24h', () => {
    expect(() =>
      parseCreateSupplier({ ...store, openingHours: '[{"day":8,"open":"00:00","close":"23:59"}]' }),
    ).toThrowError(/reserved/);
  });

  it('requires operating hours for a Store', () => {
    expect(() => parseCreateSupplier({ ...store, openingHours: '[]' })).toThrowError(/required/);
    expect(() => parseCreateSupplier({ ...store, openingHours: undefined })).toThrowError(/required/);
  });

  it('rejects equal open and close with the 00:00-23:59 hint', () => {
    expect(() =>
      parseCreateSupplier({ ...store, openingHours: '[{"day":1,"open":"09:00","close":"09:00"}]' }),
    ).toThrowError(/00:00–23:59/);
  });

  it('rejects duplicate days, bad days and bad times', () => {
    const dup = '[{"day":1,"open":"09:00","close":"10:00"},{"day":1,"open":"11:00","close":"12:00"}]';
    expect(() => parseCreateSupplier({ ...store, openingHours: dup })).toThrowError(/once/);
    expect(() =>
      parseCreateSupplier({ ...store, openingHours: '[{"day":0,"open":"09:00","close":"10:00"}]' }),
    ).toThrow();
    expect(() =>
      parseCreateSupplier({ ...store, openingHours: '[{"day":1,"open":"9am","close":"10:00"}]' }),
    ).toThrow();
  });

  it('allows an overnight interval', () => {
    const result = parseCreateSupplier({
      ...store,
      openingHours: '[{"day":5,"open":"22:00","close":"02:00"}]',
    });
    expect(result.hours[0]).toMatchObject({ day: 5, open: '22:00', close: '02:00' });
  });
});

describe('parseCreateSupplier — Facility', () => {
  it('ignores client hours and stores the single day-8 entry', () => {
    const result = parseCreateSupplier({ ...store, type: 'Facility' });
    expect(result.hours).toEqual([day8]);
  });

  it('does not need hours at all', () => {
    const result = parseCreateSupplier({ ...store, type: 'Facility', openingHours: undefined });
    expect(result.hours).toEqual([day8]);
  });
});

describe('parseCreateSupplier — fields', () => {
  it('requires name, type and location', () => {
    const error = (() => {
      try {
        parseCreateSupplier({});
      } catch (e) {
        return e as { statusCode: number; details: Array<{ field: string }> };
      }
      throw new Error('expected a throw');
    })();
    expect(error.statusCode).toBe(422);
    expect(error.details.map((d) => d.field)).toEqual(expect.arrayContaining(['name', 'type', 'location_id']));
  });

  it('defaults desc to null and categories to none', () => {
    const result = parseCreateSupplier({ name: 'X', type: 'Facility', location_id: '1' });
    expect(result.desc).toBeNull();
    expect(result.categoryIds).toEqual([]);
  });

  it('answers 400 for malformed JSON in openingHours or category_id', () => {
    expect(() => parseCreateSupplier({ ...store, openingHours: '[{' })).toThrowError(/valid JSON/);
    try {
      parseCreateSupplier({ ...store, category_id: 'nope' });
    } catch (e) {
      expect((e as { statusCode: number }).statusCode).toBe(400);
    }
  });

  it('accepts a single category id', () => {
    expect(parseCreateSupplier({ ...store, category_id: '2' }).categoryIds).toEqual([2]);
  });
});

describe('resolveHours', () => {
  it('returns the day-8 entry for a Facility, ignoring client hours', () => {
    expect(resolveHours('Facility', '[{"day":1,"open":"09:00","close":"18:00"}]', false)).toEqual([
      { day: 8, open: '00:00', close: '23:59', is24h: true },
    ]);
  });

  it('parses Store hours', () => {
    expect(resolveHours('Store', '[{"day":1,"open":"09:00","close":"18:00"}]', false)).toEqual([
      { day: 1, open: '09:00', close: '18:00', is24h: false },
    ]);
  });

  it('rejects a Store with no hours (422)', () => {
    expect(() => resolveHours('Store', undefined, false)).toThrowError(/Operating hours are required/);
  });
});
