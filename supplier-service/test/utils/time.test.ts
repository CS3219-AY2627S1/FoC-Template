/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: gpt-5.6-luna), date: 2026-09-28
 * Scope: Generated Phase0 Task5 tests for SGT timestamp formatting.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-09-29 update): Added the sgtDatetime helper tests (Phase 2 Task 5).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 *        Tool: Claude Code (model: claude-sonnet-5).
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5): moved from src/utils/time.test.ts to test/utils/time.test.ts and updated
 *        the relative imports; no test logic changed. No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review:
 */
import { describe, expect, it } from 'vitest';
import { sgtDatetime, sgtTimestamp } from '../../src/utils/time.js';

describe('sgtTimestamp', () => {
  it('formats a UTC date as an SGT timestamp', () => {
    expect(sgtTimestamp(new Date('2026-09-27T02:00:00.000Z'))).toBe(
      '2026-09-27T10:00:00+08:00',
    );
  });

  it('formats dates crossing midnight in Singapore correctly', () => {
    expect(sgtTimestamp(new Date('2026-09-27T17:30:00.000Z'))).toBe(
      '2026-09-28T01:30:00+08:00',
    );
  });
});

describe('sgtDatetime', () => {
  it('formats a Date as Singapore wall-clock time for MySQL DATETIME', () => {
    expect(sgtDatetime(new Date('2026-09-29T02:00:00Z'))).toBe('2026-09-29 10:00:00');
    expect(sgtDatetime(new Date('2026-09-29T17:30:15Z'))).toBe('2026-09-30 01:30:15');
  });
});
