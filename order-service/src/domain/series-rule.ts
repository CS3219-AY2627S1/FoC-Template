/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 e (instructions.md) - RRULE parsing and occurrence computation for
 *        scheduled-errands series, using the `rrule` npm package per the stage's Model
 *        decisions table ("Library: rrule (npm), backend and frontend"). Singapore time
 *        (UTC+8, no DST) is handled with the same wall-clock-shift trick as
 *        clients/openingHours.ts, since `rrule` otherwise treats Date objects as literal
 *        UTC. No requirements, architecture, schema, or API decisions were made by the
 *        AI tool.
 * Author review:
 * Scope (2026-11-10, Codex, model: GPT-6): Fixed rrule CommonJS interoperability under native ESM.
 * Author review: tng wen xi
 */

import rrule, { type RRule as RRuleInstance } from 'rrule';

const { RRule } = rrule;

const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

export function toSgWallClock(date: Date): Date {
  return new Date(date.getTime() + SGT_OFFSET_MS);
}

export function fromSgWallClock(wall: Date): Date {
  return new Date(wall.getTime() - SGT_OFFSET_MS);
}

/**
 * Builds an RRule from the series' stored RRULE text (no DTSTART in it; see
 * instructions.md's Model table) and its DTSTART, or null when the text does not parse.
 */
export function buildRule(
  ruleText: string,
  dtstartUtc: Date,
): RRuleInstance | null {
  let options;
  try {
    options = RRule.parseString(ruleText);
  } catch {
    return null;
  }
  if (options.freq === undefined) return null;
  return new RRule({ ...options, dtstart: toSgWallClock(dtstartUtc) });
}

/** The first occurrence at/after `afterUtc` (inclusive), or null when the rule has none. */
export function nextOccurrenceAtOrAfter(
  rule: RRuleInstance,
  afterUtc: Date,
): Date | null {
  const wall = rule.after(toSgWallClock(afterUtc), true);
  return wall ? fromSgWallClock(wall) : null;
}

/** Up to `n` occurrences strictly after `afterUtc`, in order. */
export function upcomingOccurrences(
  rule: RRuleInstance,
  afterUtc: Date,
  n: number,
): Date[] {
  const out: Date[] = [];
  let cursor = toSgWallClock(afterUtc);
  for (let i = 0; i < n; i++) {
    const next = rule.after(cursor, false);
    if (!next) break;
    out.push(fromSgWallClock(next));
    cursor = next;
  }
  return out;
}
