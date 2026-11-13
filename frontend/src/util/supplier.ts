import type { Location, Supplier, SupplierType } from '@/api/supplier'

// opening hours are stored as campus local time
const CAMPUS_TIMEZONE = 'Asia/Singapore'

export const supplierTypeInfo: Record<SupplierType, { label: string, icon: string, color: string }> = {
  food: { label: 'Food', icon: 'mdi-silverware-fork-knife', color: 'orange' },
  coffee: { label: 'Coffee', icon: 'mdi-coffee', color: 'brown' },
  shopping: { label: 'Shopping', icon: 'mdi-shopping', color: 'purple' },
  printing: { label: 'Printing', icon: 'mdi-printer', color: 'blue' },
}

// "09:00:00" -> "09:00"
export function toHourMinute (time: string | null): string | null {
  return time === null ? null : time.slice(0, 5)
}

// floors are stored as numbers: ground is 1, basements negative (-1 = B1), there is no floor 0
export const LOWEST_FLOOR = -10
export const HIGHEST_FLOOR = 100

// 3 -> "Level 3", -1 -> "Level B1", so basements read the same way as other floors
export function formatFloor (floor: number): string {
  return floor < 0 ? `Level B${-floor}` : `Level ${floor}`
}

// what people type -> stored number: "3" or "L3" -> 3, "B1" -> -1, "G" -> 1; null if it is not a floor
export function parseFloor (text: string): number | null {
  if (/^\s*g\s*$/i.test(text)) {
    return 1
  }
  const match = /^\s*(b|l|level\s*)?(\d+)\s*$/i.exec(text)
  if (!match) {
    return null
  }
  const level = Number(match[2])
  const floor = match[1]?.toLowerCase() === 'b' ? -level : level
  return floor === 0 || floor < LOWEST_FLOOR || floor > HIGHEST_FLOOR ? null : floor
}

// a spot in a building as one line, e.g. "Com 3 · B1 · Room 1" or "Central Library · Level 5 · #05-12".
// The room gets a "Room" prefix unless it is a unit number ("#..."), so it is not mistaken for a floor
export function formatSpot (building: string, floor: number, room?: string | null): string {
  const unit = room?.trim()
  const roomText = unit ? (unit.startsWith('#') ? unit : `Room ${unit}`) : null
  return [building, formatFloor(floor), roomText].filter(Boolean).join(' · ')
}

// stored number -> what people type: -1 -> "B1", 3 -> "3"
export function floorInput (floor: number): string {
  return floor < 0 ? `B${-floor}` : String(floor)
}

// suppliers only store locationId, so the name comes from the list of locations
export function formatLocation (supplier: Supplier, locations: Location[]): string {
  const building = locations.find(l => l.id === supplier.locationId)?.name ?? 'Unknown building'
  return supplier.floor === null ? building : `${building}, ${formatFloor(supplier.floor)}`
}

export function formatHours (supplier: Supplier): string {
  if (supplier.opensAt === null || supplier.closesAt === null) {
    return 'Hours not listed'
  }
  return `${toHourMinute(supplier.opensAt)} – ${toHourMinute(supplier.closesAt)}`
}

// current campus time as "HH:MM"
function campusTimeNow (): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: CAMPUS_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date())
}

// null when the supplier has no opening hours listed
export function isOpenNow (supplier: Supplier): boolean | null {
  const opensAt = toHourMinute(supplier.opensAt)
  const closesAt = toHourMinute(supplier.closesAt)
  if (opensAt === null || closesAt === null) {
    return null
  }
  const now = campusTimeNow()
  // closesAt earlier than opensAt means open past midnight
  return opensAt <= closesAt
    ? now >= opensAt && now < closesAt
    : now >= opensAt || now < closesAt
}

export function openStatus (supplier: Supplier): { label: string, color: string } {
  const open = isOpenNow(supplier)
  if (open === null) {
    return { label: 'Hours not listed', color: 'grey' }
  }
  return open
    ? { label: 'Open now', color: 'success' }
    : { label: 'Closed', color: 'error' }
}

// when the open/closed status next changes, e.g. "Closes at 21:30" or "Opens at 08:00"; null without hours
export function nextOpeningChange (supplier: Supplier): string | null {
  const open = isOpenNow(supplier)
  if (open === null) {
    return null
  }
  return open ? `Closes at ${toHourMinute(supplier.closesAt)}` : `Opens at ${toHourMinute(supplier.opensAt)}`
}
