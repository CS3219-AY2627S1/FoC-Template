// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-11-10
// Scope: Implemented the Supplier availability calculation defined by the author at a high level.
// Author review: Reviewed every output, corrected phrasing and syntax, and adjusted implementation
// details to fit project requirements.

import type { OperatingHours, Supplier } from '@relay/contracts/supplier'
import { getEnv } from '../config/env.js'

const dayByShortName: Record<string, number> = {
  Sun: 6,
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

function localParts(now: Date, timezone: string): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return {
    day: dayByShortName[values.weekday],
    minutes: Number(values.hour) * 60 + Number(values.minute),
  }
}

function isWithinOperatingHours(hours: OperatingHours, now = new Date()): boolean {
  const { day, minutes } = localParts(now, getEnv().timezone)
  const opening = timeToMinutes(hours.openingTime)
  const closing = timeToMinutes(hours.closingTime)
  const days = new Set<number>(hours.daysOfWeek)

  if (opening === closing) return days.has(day)
  if (opening < closing) return days.has(day) && minutes >= opening && minutes <= closing

  const previousDay = (day + 6) % 7
  return (days.has(day) && minutes >= opening) || (days.has(previousDay) && minutes <= closing)
}

export function isSupplierActive(supplier: Supplier, now = new Date()): boolean {
  return supplier.isOperational && isWithinOperatingHours(supplier.operatingHours, now)
}
