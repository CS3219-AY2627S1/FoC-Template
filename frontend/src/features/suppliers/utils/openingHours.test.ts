import { describe, expect, it } from 'vitest'
import {
  closesAfterMidnight,
  getOpenStatus,
  formatTodayHours,
  formatWeeklyHours,
  isOpenAt,
} from './openingHours'
import { DAYS_OF_WEEK } from '../types/supplier.types'
import type { DayOfWeek, OpeningHours } from '../types/supplier.types'

// say test, 2026-01-05 is Monday
const at = (dayOffset: number, hours: number, minutes = 0) =>
  Date.UTC(2026, 0, 5 + dayOffset, hours - 8, minutes)
const MONDAY = 0
const TUESDAY = 1
const SATURDAY = 5

const on = (
  days: ReadonlyArray<DayOfWeek>,
  opensAt: string,
  closesAt: string,
): Array<OpeningHours> =>
  days.map((dayOfWeek) => ({ dayOfWeek, opensAt, closesAt }))

const weekdays = DAYS_OF_WEEK.slice(0, 5)

describe('isOpenAt', () => {
  it('uses the hours of the current day', () => {
    const hours = on(weekdays, '09:00:00', '18:00:00')
    expect(isOpenAt(hours, at(MONDAY, 8, 59))).toBe(false)
    expect(isOpenAt(hours, at(MONDAY, 9))).toBe(true)
    expect(isOpenAt(hours, at(MONDAY, 18))).toBe(false)
    expect(isOpenAt(hours, at(SATURDAY, 12))).toBe(false)
  })

  it('carries hours past midnight into the next morning', () => {
    const hours = on(['MONDAY'], '18:00', '02:00')
    expect(isOpenAt(hours, at(MONDAY, 23))).toBe(true)
    expect(isOpenAt(hours, at(TUESDAY, 1, 30))).toBe(true)
    expect(isOpenAt(hours, at(TUESDAY, 2))).toBe(false)
    expect(isOpenAt(hours, at(MONDAY, 1))).toBe(false) // Monday's early hours belong to Sunday, which is closed
  })
})

describe('formatWeeklyHours', () => {
  it('labels full-day schedules without an artificial closing time', () => {
    expect(formatWeeklyHours(on(DAYS_OF_WEEK, '00:00', '23:59'))).toEqual([
      'Daily 24 hours',
    ])
    expect(formatWeeklyHours(on(['MONDAY'], '00:00:00', '23:59:00'))).toEqual([
      'Mon 24 hours',
    ])
    expect(
      formatTodayHours(on(['MONDAY'], '00:00', '23:59'), at(MONDAY, 12)),
    ).toBe('24 hours')
  })

  it('groups consecutive days with the same hours', () => {
    expect(
      formatWeeklyHours([
        ...on(weekdays, '08:00:00', '20:00:00'),
        ...on(['SATURDAY'], '10:00:00', '16:00:00'),
      ]),
    ).toEqual(['Mon – Fri 08:00 – 20:00', 'Sat 10:00 – 16:00'])
  })

  it('summarises identical hours on every day', () => {
    expect(formatWeeklyHours(on(DAYS_OF_WEEK, '09:00', '18:00'))).toEqual([
      'Daily 09:00 – 18:00',
    ])
  })

  it('marks hours that run past midnight and handles no hours', () => {
    expect(formatWeeklyHours(on(['FRIDAY'], '18:00', '03:00'))).toEqual([
      'Fri 18:00 – 03:00 (next day)',
    ])
    expect(formatWeeklyHours([])).toEqual(['Closed'])
  })
})

describe('formatTodayHours', () => {
  it("shows today's hours or that it is closed", () => {
    const hours = on(weekdays, '09:00', '18:00')
    expect(formatTodayHours(hours, at(MONDAY, 12))).toBe('09:00 – 18:00')
    expect(formatTodayHours(hours, at(SATURDAY, 12))).toBe('Closed today')
  })
})

describe('getOpenStatus', () => {
  it('recognises full-day hours including the final minute of the day', () => {
    const hours = on(['MONDAY'], '00:00:00', '23:59:00')
    for (const time of [at(MONDAY, 0), at(MONDAY, 12), at(MONDAY, 23, 59)]) {
      expect(getOpenStatus(hours, time)).toEqual({
        isOpen: true,
        is24Hours: true,
      })
      expect(isOpenAt(hours, time)).toBe(true)
    }
    expect(getOpenStatus(hours, at(TUESDAY, 0))).toEqual({ isOpen: false })
  })

  it('does not treat every shop closing at 23:59 as open 24 hours', () => {
    const hours = on(['MONDAY'], '09:00', '23:59')
    expect(getOpenStatus(hours, at(MONDAY, 12))).toEqual({
      isOpen: true,
      is24Hours: false,
      closesAt: '23:59',
    })
    expect(isOpenAt(hours, at(MONDAY, 23, 59))).toBe(false)
  })

  it('uses yesterday’s closing time during an overnight opening', () => {
    const hours = [
      ...on(['TUESDAY'], '09:00', '18:00'),
      ...on(['MONDAY'], '18:00:00', '02:00:00'),
    ]
    expect(getOpenStatus(hours, at(TUESDAY, 1, 30))).toEqual({
      isOpen: true,
      is24Hours: false,
      closesAt: '02:00',
    })
    expect(getOpenStatus(hours, at(TUESDAY, 2))).toEqual({ isOpen: false })
  })

  it('carries Sunday opening hours into Monday and handles empty hours', () => {
    expect(
      getOpenStatus(on(['SUNDAY'], '18:00', '02:00'), at(MONDAY, 1)),
    ).toEqual({
      isOpen: true,
      is24Hours: false,
      closesAt: '02:00',
    })
    expect(getOpenStatus([], at(MONDAY, 12))).toEqual({ isOpen: false })
  })

  it('includes the closing time while the supplier is open', () => {
    const hours = on(['MONDAY'], '09:00', '20:00')
    expect(getOpenStatus(hours, at(MONDAY, 12))).toEqual({
      isOpen: true,
      is24Hours: false,
      closesAt: '20:00',
    })
    expect(getOpenStatus(hours, at(TUESDAY, 12))).toEqual({ isOpen: false })
  })
})

describe('closesAfterMidnight', () => {
  it('is true when the closing time is earlier than the opening time', () => {
    expect(
      closesAfterMidnight({
        dayOfWeek: 'MONDAY',
        opensAt: '18:00',
        closesAt: '02:00',
      }),
    ).toBe(true)
    expect(
      closesAfterMidnight({
        dayOfWeek: 'MONDAY',
        opensAt: '09:00',
        closesAt: '18:00',
      }),
    ).toBe(false)
  })
})
