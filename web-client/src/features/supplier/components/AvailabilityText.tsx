import type { SupplierAvailability, Weekday } from '@/api/supplier/types'

const shortDays: Record<Weekday, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
}

type AvailabilityTextProps = {
  availability: SupplierAvailability
}

// The supplier-service works out open or closed on the campus clock; this only puts it in words.
export function AvailabilityText({ availability }: AvailabilityTextProps) {
  const { open, closesAt, nextOpensAt } = availability
  if (open) return <span>{closesAt ? `Open until ${closesAt}` : 'Open around the clock'}</span>
  if (nextOpensAt) return <span className="text-muted">{`Closed, opens ${shortDays[nextOpensAt.day]} ${nextOpensAt.time}`}</span>
  return <span className="text-muted">Closed</span>
}
