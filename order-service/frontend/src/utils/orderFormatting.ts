import type { OrderState } from '../api/orderApi'

const STATE_LABELS: Record<OrderState, string> = {
  PENDING_CREDIT: 'Reserving credits',
  OPEN: 'Open',
  ACCEPTED: 'Accepted',
  PICKED_UP: 'Picked up',
  DELIVERED: 'Delivered',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  RESERVATION_FAILED: 'Not posted',
}

export function stateLabel(state: OrderState): string {
  return STATE_LABELS[state]
}

/** Why Credit refused the reservation of a RESERVATION_FAILED errand, from its terminalReason. */
export function reservationFailure(terminalReason: string | null): {
  label: string
  title: string
  detail: string
  setUpCredits: boolean
} {
  if (terminalReason === 'INSUFFICIENT_CREDITS')
    return {
      label: 'Not enough credits',
      title: 'Not enough credits',
      detail: "You didn't have enough credits for this reward.",
      setUpCredits: false,
    }
  if (terminalReason === 'CREDIT_ACCOUNT_NOT_FOUND')
    return {
      label: 'No credit account',
      title: 'Credit account not set up',
      detail: 'Set up your credits, then post it again.',
      setUpCredits: true,
    }
  return {
    label: 'Not posted',
    title: 'Errand not posted',
    detail: 'Something went wrong. Please post it again.',
    setUpCredits: false,
  }
}

/** Short reference shown in the design ("Errand FOC-1042"); derived from the UUID. */
export function errandReference(id: string): string {
  return `FOC-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`
}

export function credits(amount: number): string {
  return `${amount} ${amount === 1 ? 'credit' : 'credits'}`
}

/** "Today, 12:45", "Tomorrow, 09:00", otherwise "09 Sep 2026, 12:45" (local time). */
export function formatDeadline(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((day(date) - day(now)) / 86_400_000)
  if (diffDays === 0) return `Today, ${time}`
  if (diffDays === 1) return `Tomorrow, ${time}`
  const dayText = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  return `${dayText}, ${time}`
}

export function locationName(name: string | null): string {
  return name ?? 'Location not recorded'
}

/** Ended errands a requester can post again as a new one ("Post again"). */
export const REPOSTABLE_STATES: readonly OrderState[] = ['COMPLETED', 'CANCELLED', 'EXPIRED', 'RESERVATION_FAILED']

export function repostPath(orderId: string): string {
  return `/errands/new?from=${encodeURIComponent(orderId)}`
}
