/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 g (instructions.md) - unit tests for domain/seriesRule.js: the recurrence
 *        picker's RRULE build/parse round-trip for daily/weekly/monthly (both sub-modes)/
 *        yearly (a single month), the end condition (never/onDate/after), and the
 *        human-readable summary.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { describe, expect, it } from 'vitest'
import {
  buildRuleText,
  defaultRuleState,
  FREQ,
  parseRuleText,
  summarizeRuleState,
} from '../../src/domain/seriesRule'

// A Monday, so weekly/monthly defaults are deterministic.
const START = new Date('2026-11-09T01:00:00.000Z')

describe('defaultRuleState', () => {
  it('defaults to daily, anchored on the start date', () => {
    const state = defaultRuleState(START)
    expect(state.freq).toBe(FREQ.DAILY)
    expect(state.interval).toBe(1)
    expect(state.end).toEqual({ type: 'never' })
  })
})

describe('buildRuleText', () => {
  it('builds a plain daily rule with no "RRULE:" prefix', () => {
    const text = buildRuleText(defaultRuleState(START))
    expect(text).toBe('FREQ=DAILY;INTERVAL=1')
  })

  it('builds weekly on chosen days with an interval', () => {
    const state = { ...defaultRuleState(START), freq: FREQ.WEEKLY, interval: 2, byweekday: [0, 2] }
    expect(buildRuleText(state)).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE')
  })

  it('builds monthly on a plain date', () => {
    const state = { ...defaultRuleState(START), freq: FREQ.MONTHLY, monthlyMode: 'date', bymonthday: 15 }
    expect(buildRuleText(state)).toBe('FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15')
  })

  it('builds monthly on the Nth weekday', () => {
    const state = {
      ...defaultRuleState(START),
      freq: FREQ.MONTHLY,
      monthlyMode: 'nth',
      nth: 2,
      nthUnit: 0, // Monday
    }
    expect(buildRuleText(state)).toBe('FREQ=MONTHLY;INTERVAL=1;BYDAY=MO;BYSETPOS=2')
  })

  it('builds monthly on the last day of the month (the "day" unit)', () => {
    const state = { ...defaultRuleState(START), freq: FREQ.MONTHLY, monthlyMode: 'nth', nth: -1, nthUnit: 'day' }
    expect(buildRuleText(state)).toBe('FREQ=MONTHLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR,SA,SU;BYSETPOS=-1')
  })

  it('builds yearly in a chosen month on the Nth weekend day', () => {
    const state = { ...defaultRuleState(START), freq: FREQ.YEARLY, bymonth: 6, nth: 1, nthUnit: 'weekendday' }
    expect(buildRuleText(state)).toBe('FREQ=YEARLY;INTERVAL=1;BYMONTH=6;BYDAY=SA,SU;BYSETPOS=1')
  })

  it('appends UNTIL for an "on date" end', () => {
    const state = { ...defaultRuleState(START), end: { type: 'onDate', date: '2027-01-01' } }
    expect(buildRuleText(state)).toMatch(/;UNTIL=\d{8}T\d{6}Z?$/)
    expect(parseRuleText(buildRuleText(state), START).end).toEqual({ type: 'onDate', date: '2027-01-01' })
  })

  it('appends COUNT for an "after N" end', () => {
    const state = { ...defaultRuleState(START), end: { type: 'after', count: 5 } }
    expect(buildRuleText(state)).toBe('FREQ=DAILY;INTERVAL=1;COUNT=5')
  })
})

describe('parseRuleText (round-trip)', () => {
  it.each([
    ['daily', { ...defaultRuleState(START), interval: 3 }],
    ['weekly', { ...defaultRuleState(START), freq: FREQ.WEEKLY, interval: 1, byweekday: [1, 3, 5] }],
    ['monthly on a date', { ...defaultRuleState(START), freq: FREQ.MONTHLY, monthlyMode: 'date', bymonthday: 31 }],
    [
      'monthly on the Nth weekend day',
      { ...defaultRuleState(START), freq: FREQ.MONTHLY, monthlyMode: 'nth', nth: -1, nthUnit: 'weekendday' },
    ],
    [
      'yearly in a chosen month on the Nth day',
      { ...defaultRuleState(START), freq: FREQ.YEARLY, bymonth: 11, nth: 3, nthUnit: 'day' },
    ],
  ])('round-trips %s', (_label, state) => {
    const text = buildRuleText(state)
    expect(parseRuleText(text, START)).toEqual(state)
  })

  it('round-trips an "on date" end', () => {
    const state = { ...defaultRuleState(START), end: { type: 'onDate', date: '2027-06-15' } }
    expect(parseRuleText(buildRuleText(state), START).end).toEqual({ type: 'onDate', date: '2027-06-15' })
  })

  it('round-trips an "after N" end', () => {
    const state = { ...defaultRuleState(START), end: { type: 'after', count: 7 } }
    expect(parseRuleText(buildRuleText(state), START).end).toEqual({ type: 'after', count: 7 })
  })

  it('falls back to the default state for unparsable text', () => {
    expect(parseRuleText('not a rule', START)).toEqual(defaultRuleState(START))
  })
})

describe('summarizeRuleState', () => {
  it('summarizes a simple daily rule', () => {
    expect(summarizeRuleState(defaultRuleState(START))).toBe('Every day')
  })

  it('summarizes a weekly rule with an interval and days', () => {
    const state = { ...defaultRuleState(START), freq: FREQ.WEEKLY, interval: 2, byweekday: [0, 2] }
    expect(summarizeRuleState(state)).toBe('Every 2 weeks on Mon, Wed')
  })

  it('summarizes a monthly-on-the-Nth rule with an end date', () => {
    const state = {
      ...defaultRuleState(START),
      freq: FREQ.MONTHLY,
      monthlyMode: 'nth',
      nth: -1,
      nthUnit: 4, // Friday
      end: { type: 'onDate', date: '2026-12-31' },
    }
    expect(summarizeRuleState(state)).toBe('Every month on the last Friday, until 31 Dec 2026')
  })

  it('summarizes a yearly rule with a count end', () => {
    const state = {
      ...defaultRuleState(START),
      freq: FREQ.YEARLY,
      bymonth: 12,
      nth: 1,
      nthUnit: 'weekday',
      end: { type: 'after', count: 3 },
    }
    expect(summarizeRuleState(state)).toBe('Every year in Dec on the first weekday, 3 times')
  })
})
