/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 g (instructions.md) - converts the recurrence picker's own state to and
 *        from the plain RRULE text order-service stores (no DTSTART in it, per the Model
 *        table; "Library: rrule (npm), backend and frontend"), and builds a human-readable
 *        summary for the Scheduled section. Mirrors order-service's
 *        domain/series-rule.ts (same library, same "end condition lives inside the RRULE"
 *        convention), but frontend-only: this file has no DTSTART/timezone handling of its
 *        own since the picker never computes occurrences itself (the backend's
 *        `upcomingDates` on each series is the only source of actual occurrence times).
 *        Monthly "on the Nth weekday/day/weekend day" and yearly's equivalent use RFC 5545's
 *        BYSETPOS over a BYDAY candidate set (first/second/.../last within the period).
 *        Yearly only ever picks a single month (BYMONTH), not several, because BYSETPOS counts
 *        across the whole chosen set combined rather than per month (an RFC 5545 property of
 *        BYSETPOS, not a choice made here); a single month keeps "the Nth ___" unambiguous.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { RRule } from 'rrule'

export const FREQ = { DAILY: 'DAILY', WEEKLY: 'WEEKLY', MONTHLY: 'MONTHLY', YEARLY: 'YEARLY' }

// Mon=0 .. Sun=6, matching RRule's own weekday numbering.
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const RRULE_WEEKDAYS = [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA, RRule.SU]
const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export const NTH_OPTIONS = [1, 2, 3, 4, 5, -1]
const NTH_LABELS = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth', '-1': 'last' }

/** The three day-set choices for "on the Nth ___ of the month/year", plus a specific weekday. */
export const NTH_UNITS = ['day', 'weekday', 'weekendday']
const NTH_UNIT_DAYS = { day: [0, 1, 2, 3, 4, 5, 6], weekday: [0, 1, 2, 3, 4], weekendday: [5, 6] }
const NTH_UNIT_LABELS = { day: 'day', weekday: 'weekday', weekendday: 'weekend day' }

const RRULE_FREQ = { DAILY: RRule.DAILY, WEEKLY: RRule.WEEKLY, MONTHLY: RRule.MONTHLY, YEARLY: RRule.YEARLY }
const FREQ_BY_RRULE_VALUE = { [RRule.DAILY]: FREQ.DAILY, [RRule.WEEKLY]: FREQ.WEEKLY, [RRule.MONTHLY]: FREQ.MONTHLY, [RRule.YEARLY]: FREQ.YEARLY }

const pad = (n) => String(n).padStart(2, '0')
const toYmd = (date) => date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
const weekdayOf = (date) => (date.getDay() + 6) % 7 // JS: Sun=0..Sat=6 -> Mon=0..Sun=6

/** Returns the day-set (array of 0-6) for an nth-unit choice: a number is a specific weekday. */
function dayset(nthUnit) {
  return typeof nthUnit === 'number' ? [nthUnit] : NTH_UNIT_DAYS[nthUnit]
}

/**
 * The picker's own state shape. `startDate` (a JS Date, the series' own start/DTSTART) feeds
 * sensible defaults when switching frequency - it is not stored in the rule text itself.
 */
export function defaultRuleState(startDate = new Date()) {
  return {
    freq: FREQ.DAILY,
    interval: 1,
    byweekday: [weekdayOf(startDate)],
    monthlyMode: 'date',
    bymonthday: startDate.getDate(),
    nth: 1,
    nthUnit: weekdayOf(startDate),
    bymonth: startDate.getMonth() + 1,
    end: { type: 'never' },
  }
}

/** Builds the plain RRULE text (no "RRULE:" prefix, no DTSTART) order-service stores. */
export function buildRuleText(state) {
  const options = { freq: RRULE_FREQ[state.freq], interval: Math.max(1, state.interval || 1) }

  if (state.freq === FREQ.WEEKLY) {
    options.byweekday = (state.byweekday.length ? state.byweekday : [0]).map((d) => RRULE_WEEKDAYS[d])
  } else if (state.freq === FREQ.MONTHLY) {
    if (state.monthlyMode === 'date') {
      options.bymonthday = [state.bymonthday]
    } else {
      options.byweekday = dayset(state.nthUnit).map((d) => RRULE_WEEKDAYS[d])
      options.bysetpos = [state.nth]
    }
  } else if (state.freq === FREQ.YEARLY) {
    options.bymonth = [state.bymonth || 1]
    options.byweekday = dayset(state.nthUnit).map((d) => RRULE_WEEKDAYS[d])
    options.bysetpos = [state.nth]
  }

  if (state.end.type === 'onDate') {
    // RFC 5545 UNTIL is a date-time; midnight local covers the whole chosen day.
    options.until = new Date(state.end.date + 'T00:00:00')
  } else if (state.end.type === 'after') {
    options.count = Math.max(1, state.end.count || 1)
  }

  return RRule.optionsToString(options).replace(/^RRULE:/, '')
}

/** Parses stored RRULE text back into picker state, for editing an existing series. Falls
 *  back to `defaultRuleState` fields the text doesn't specify. */
export function parseRuleText(ruleText, startDate = new Date()) {
  const base = defaultRuleState(startDate)
  let parsed
  try {
    parsed = RRule.parseString(ruleText)
  } catch {
    return base
  }
  const freq = FREQ_BY_RRULE_VALUE[parsed.freq]
  if (!freq) return base

  const state = { ...base, freq, interval: parsed.interval ?? 1 }
  const byweekday = (parsed.byweekday ?? []).map((w) => (typeof w === 'number' ? w : w.weekday))
  const bysetposList = Array.isArray(parsed.bysetpos) ? parsed.bysetpos : parsed.bysetpos !== undefined ? [parsed.bysetpos] : []

  if (freq === FREQ.WEEKLY) {
    state.byweekday = byweekday.length ? byweekday : base.byweekday
  } else if (freq === FREQ.MONTHLY) {
    if (bysetposList.length) {
      state.monthlyMode = 'nth'
      state.nth = bysetposList[0]
      state.nthUnit = matchNthUnit(byweekday)
    } else {
      state.monthlyMode = 'date'
      state.bymonthday = Array.isArray(parsed.bymonthday) ? parsed.bymonthday[0] : parsed.bymonthday ?? base.bymonthday
    }
  } else if (freq === FREQ.YEARLY) {
    state.bymonth = Array.isArray(parsed.bymonth) ? parsed.bymonth[0] : parsed.bymonth ?? base.bymonth
    if (bysetposList.length) {
      state.nth = bysetposList[0]
      state.nthUnit = matchNthUnit(byweekday)
    }
  }

  if (parsed.until) {
    state.end = { type: 'onDate', date: toYmd(parsed.until) }
  } else if (parsed.count !== undefined) {
    state.end = { type: 'after', count: parsed.count }
  } else {
    state.end = { type: 'never' }
  }

  return state
}

/** Matches a parsed BYDAY list back to one of the three day-set choices, or the single
 *  specific weekday it names. */
function matchNthUnit(byweekday) {
  const sorted = [...byweekday].sort((a, b) => a - b)
  for (const unit of NTH_UNITS) {
    const candidate = [...NTH_UNIT_DAYS[unit]].sort((a, b) => a - b)
    if (sorted.length === candidate.length && sorted.every((d, i) => d === candidate[i])) return unit
  }
  return sorted[0] ?? 0
}

function endSummary(state) {
  if (state.end.type === 'onDate') {
    return 'until ' + new Date(state.end.date + 'T00:00:00').toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
  }
  if (state.end.type === 'after') {
    return state.end.count + (state.end.count === 1 ? ' time' : ' times')
  }
  return ''
}

function weekdayListLabel(days) {
  const sorted = [...days].sort((a, b) => a - b)
  return sorted.map((d) => WEEKDAY_LABELS[d]).join(', ')
}

function nthUnitLabel(nthUnit) {
  return typeof nthUnit === 'number' ? WEEKDAY_FULL[nthUnit] : NTH_UNIT_LABELS[nthUnit]
}

/** A short, human-readable summary of the picker state (for the "rule summary" the Scheduled
 *  section shows), e.g. "Every 2 weeks on Mon, Wed, until 31 Dec 2026". */
export function summarizeRuleState(state) {
  const every = state.interval > 1 ? 'Every ' + state.interval + ' ' : 'Every '
  let body
  if (state.freq === FREQ.DAILY) {
    body = every + (state.interval > 1 ? 'days' : 'day')
  } else if (state.freq === FREQ.WEEKLY) {
    body = every + (state.interval > 1 ? 'weeks' : 'week') + ' on ' + weekdayListLabel(state.byweekday)
  } else if (state.freq === FREQ.MONTHLY) {
    const period = every + (state.interval > 1 ? 'months' : 'month')
    body = state.monthlyMode === 'date'
      ? period + ' on day ' + state.bymonthday
      : period + ' on the ' + NTH_LABELS[String(state.nth)] + ' ' + nthUnitLabel(state.nthUnit)
  } else {
    const period = every + (state.interval > 1 ? 'years' : 'year')
    body = period + ' in ' + MONTH_LABELS[state.bymonth - 1] + ' on the ' + NTH_LABELS[String(state.nth)] + ' ' + nthUnitLabel(state.nthUnit)
  }
  const end = endSummary(state)
  return end ? body + ', ' + end : body
}

/** Convenience for the Scheduled section: summarizes a series' own stored RRULE text. */
export function summarizeRuleText(ruleText, startDate) {
  return summarizeRuleState(parseRuleText(ruleText, startDate))
}
