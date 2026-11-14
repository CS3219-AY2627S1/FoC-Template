/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Tests for placeholder resolution (Phase 3 plan Task 4).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { describe, expect, it } from 'vitest';
import { buildPhotoPlan } from '../../src/business/photoPlan.js';

const current = [
  { photoId: 1, location: 'a' },
  { photoId: 2, location: 'b' },
  { photoId: 3, location: 'c' },
];

describe('buildPhotoPlan', () => {
  it('keeps, reorders, adds by placeholder index, and reports removed photos', () => {
    const plan = buildPhotoPlan(current, [3, 'p-2', 1, 'p-1'], ['p-1', 'p-2'], 2);
    expect(plan.entries).toEqual([
      { kind: 'existing', photoId: 3 },
      { kind: 'new', fileIndex: 1 },
      { kind: 'existing', photoId: 1 },
      { kind: 'new', fileIndex: 0 },
    ]);
    expect(plan.removed).toEqual([{ photoId: 2, location: 'b' }]);
  });

  it('allows removing every photo', () => {
    const plan = buildPhotoPlan(current, [], [], 0);
    expect(plan.entries).toEqual([]);
    expect(plan.removed).toHaveLength(3);
  });

  it.each([
    ['an id that is not this supplier\'s', [9], [], 0],
    ['the same existing id twice', [1, 1], [], 0],
    ['a placeholder that was not declared', ['p-x'], [], 0],
    ['a declared placeholder that is never used', [1], ['p-1'], 1],
    ['a placeholder used twice', ['p-1', 'p-1'], ['p-1'], 1],
    ['a file count that differs from placeholder_ids', ['p-1'], ['p-1'], 2],
  ])('rejects %s with 422', (_label, ids, placeholders, files) => {
    expect(() => buildPhotoPlan(current, ids as Array<number | string>, placeholders as string[], files as number)).toThrowError(
      expect.objectContaining({ statusCode: 422 }),
    );
  });

  it('rejects more than 10 photos with 422', () => {
    const placeholders = Array.from({ length: 11 }, (_, i) => `p-${i}`);
    expect(() => buildPhotoPlan([], placeholders, placeholders, 11)).toThrowError(expect.objectContaining({ statusCode: 422 }));
  });
});
