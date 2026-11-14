/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 e (instructions.md) - unit tests for series-rule.ts's RRULE parsing and
 *        occurrence computation (SGT wall-clock shift, upcoming occurrences, invalid rules).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { buildRule, nextOccurrenceAtOrAfter, upcomingOccurrences } from './series-rule.js';

describe('buildRule', () => {
  it('parses a daily rule', () => {
    const rule = buildRule('FREQ=DAILY;INTERVAL=1', new Date('2026-11-09T01:00:00.000Z'));
    expect(rule).not.toBeNull();
  });

  it('rejects garbage text', () => {
    expect(buildRule('not a rule', new Date())).toBeNull();
  });

  it('rejects an empty string', () => {
    expect(buildRule('', new Date())).toBeNull();
  });
});

describe('nextOccurrenceAtOrAfter', () => {
  it('returns dtstart itself when it matches the rule (inclusive)', () => {
    // 2026-11-09 09:00 SGT = 2026-11-09T01:00:00.000Z
    const dtstart = new Date('2026-11-09T01:00:00.000Z');
    const rule = buildRule('FREQ=DAILY;INTERVAL=1', dtstart)!;
    expect(nextOccurrenceAtOrAfter(rule, dtstart)).toEqual(dtstart);
  });

  it('returns the next matching occurrence after dtstart for a weekly rule', () => {
    // Monday 2026-11-09 09:00 SGT, weekly on Wednesday (BYDAY=WE)
    const dtstart = new Date('2026-11-09T01:00:00.000Z');
    const rule = buildRule('FREQ=WEEKLY;BYDAY=WE', dtstart)!;
    const next = nextOccurrenceAtOrAfter(rule, dtstart);
    expect(next).toEqual(new Date('2026-11-11T01:00:00.000Z'));
  });

  it('returns null when the rule has no occurrence at/after the given time (COUNT exhausted)', () => {
    const dtstart = new Date('2026-11-09T01:00:00.000Z');
    const rule = buildRule('FREQ=DAILY;COUNT=1', dtstart)!;
    const afterOnly = nextOccurrenceAtOrAfter(rule, new Date('2026-11-10T01:00:00.000Z'));
    expect(afterOnly).toBeNull();
  });
});

describe('upcomingOccurrences', () => {
  it('returns up to n occurrences strictly after the given time', () => {
    const dtstart = new Date('2026-11-09T01:00:00.000Z'); // 09:00 SGT
    const rule = buildRule('FREQ=DAILY;INTERVAL=1', dtstart)!;
    const dates = upcomingOccurrences(rule, dtstart, 3);
    expect(dates).toEqual([
      new Date('2026-11-10T01:00:00.000Z'),
      new Date('2026-11-11T01:00:00.000Z'),
      new Date('2026-11-12T01:00:00.000Z'),
    ]);
  });

  it('returns fewer than n when the rule runs out', () => {
    const dtstart = new Date('2026-11-09T01:00:00.000Z');
    const rule = buildRule('FREQ=DAILY;COUNT=2', dtstart)!;
    const dates = upcomingOccurrences(rule, dtstart, 5);
    expect(dates).toEqual([new Date('2026-11-10T01:00:00.000Z')]);
  });
});
