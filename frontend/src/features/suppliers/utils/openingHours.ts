import { DAYS_OF_WEEK } from '../types/supplier.types'
import type {
  DayOfWeek,
  OpeningHours,
  OpenStatus,
} from '../types/supplier.types'

export const dayLabels: Record<DayOfWeek, string> = {
  MONDAY: 'Mon',
  TUESDAY: 'Tue',
  WEDNESDAY: 'Wed',
  THURSDAY: 'Thu',
  FRIDAY: 'Fri',
  SATURDAY: 'Sat',
  SUNDAY: 'Sun',
}

export const toHourMinute = (time: string) => time.slice(0, 5)

// The catalog and admin form represent a full day as 00:00–23:59.
const isFullDay = ({ opensAt, closesAt }: OpeningHours) =>
  toHourMinute(opensAt) === '00:00' && toHourMinute(closesAt) === '23:59'

export const closesAfterMidnight = ({ opensAt, closesAt }: OpeningHours) =>
  toHourMinute(closesAt) < toHourMinute(opensAt)

const campusClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Singapore',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const campusTime = (timestamp: number) => {
  const parts = campusClock.formatToParts(timestamp)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)!.value
  const dayIndex = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(
    part('weekday'),
  )
  return { dayIndex, time: `${part('hour')}:${part('minute')}` }
}

export const getOpenStatus = (
  hours: Array<OpeningHours>,
  now: number,
): OpenStatus => {
  const { dayIndex, time } = campusTime(now)
  const today = DAYS_OF_WEEK[dayIndex]
  const yesterday = DAYS_OF_WEEK[(dayIndex + 6) % 7]

  const activeEntry = hours.find((entry) => {
    const opensAt = toHourMinute(entry.opensAt)
    const closesAt = toHourMinute(entry.closesAt)
    const overnight = closesAt < opensAt
    if (entry.dayOfWeek === today) {
      if (isFullDay(entry)) return true
      return time >= opensAt && (overnight || time < closesAt)
    }
    return entry.dayOfWeek === yesterday && overnight && time < closesAt
  })

  if (!activeEntry) return { isOpen: false }
  if (isFullDay(activeEntry)) return { isOpen: true, is24Hours: true }
  return {
    isOpen: true,
    is24Hours: false,
    closesAt: toHourMinute(activeEntry.closesAt),
  }
}

/** Whether a supplier is open at the given time. */
export const isOpenAt = (hours: Array<OpeningHours>, now: number) =>
  getOpenStatus(hours, now).isOpen

const formatRange = (entry: OpeningHours) => {
  if (isFullDay(entry)) return '24 hours'
  return `${toHourMinute(entry.opensAt)} – ${toHourMinute(entry.closesAt)}${closesAfterMidnight(entry) ? ' (next day)' : ''}`
}

/**
 * design that the grouping consecutive days open same hours will be like
 * ["Mon – Fri 08:00 – 20:00", "Sat 10:00 – 16:00"].
 */
export const formatWeeklyHours = (hours: Array<OpeningHours>) => {
  const byDay = new Map(hours.map((entry) => [entry.dayOfWeek, entry]))
  if (byDay.size === 0) return ['Closed']

  const lines: Array<string> = []
  let start = 0
  while (start < DAYS_OF_WEEK.length) {
    const entry = byDay.get(DAYS_OF_WEEK[start])
    if (!entry) {
      start += 1
      continue
    }
    const range = formatRange(entry)
    let end = start
    while (
      end + 1 < DAYS_OF_WEEK.length &&
      byDay.has(DAYS_OF_WEEK[end + 1]) &&
      formatRange(byDay.get(DAYS_OF_WEEK[end + 1])!) === range
    ) {
      end += 1
    }
    if (start === 0 && end === DAYS_OF_WEEK.length - 1)
      return [`Daily ${range}`]
    const days =
      start === end
        ? dayLabels[DAYS_OF_WEEK[start]]
        : `${dayLabels[DAYS_OF_WEEK[start]]} – ${dayLabels[DAYS_OF_WEEK[end]]}`
    lines.push(`${days} ${range}`)
    start = end + 1
  }
  return lines
}

export const formatTodayHours = (hours: Array<OpeningHours>, now: number) => {
  const { dayIndex } = campusTime(now)
  const entry = hours.find(
    ({ dayOfWeek }) => dayOfWeek === DAYS_OF_WEEK[dayIndex],
  )
  return entry ? formatRange(entry) : 'Closed today'
}
