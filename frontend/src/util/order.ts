import type { Order, OrderStatus, TargetStatus } from '@/api/order'
import axios from 'axios'

export const orderStatusInfo: Record<OrderStatus, { label: string, color: string, icon: string }> = {
  PENDING: { label: 'Checking credits', color: 'grey', icon: 'mdi-progress-clock' },
  REJECTED: { label: 'Rejected', color: 'error', icon: 'mdi-cancel' },
  OPEN: { label: 'Waiting for courier', color: 'info', icon: 'mdi-clock-outline' },
  ACCEPTED: { label: 'Courier on the way', color: 'primary', icon: 'mdi-bike-fast' },
  COLLECTED: { label: 'Collected', color: 'deep-purple', icon: 'mdi-package-variant-closed' },
  DELIVERED: { label: 'Delivered', color: 'success', icon: 'mdi-check-circle-outline' },
  CANCELLED: { label: 'Cancelled', color: 'grey', icon: 'mdi-close-circle-outline' },
  EXPIRED: { label: 'Expired', color: 'warning', icon: 'mdi-timer-off-outline' },
}

// PENDING: the credit service is still holding the bounty; REJECTED: it could not (not enough credits)
export const ACTIVE_STATUSES: OrderStatus[] = ['PENDING', 'OPEN', 'ACCEPTED', 'COLLECTED']
export const PAST_STATUSES: OrderStatus[] = ['DELIVERED', 'CANCELLED', 'EXPIRED', 'REJECTED']

export function isActive (status: OrderStatus): boolean {
  return ACTIVE_STATUSES.includes(status)
}

// the happy path shown as a progress timeline
export const PROGRESS_STEPS: { status: OrderStatus, label: string }[] = [
  { status: 'OPEN', label: 'Requested' },
  { status: 'ACCEPTED', label: 'Accepted' },
  { status: 'COLLECTED', label: 'Collected' },
  { status: 'DELIVERED', label: 'Delivered' },
]

// a courier accepting an errand with this little time left is warned first
export const SHORT_DEADLINE_MINUTES = 15

const time = (iso: string) => new Date(iso).getTime()

/**
 * When the order service will expire this errand: its deadline while it is active
 * (the courier must collect and deliver by then); null when it has ended.
 */
export function expiryTime (order: Order): number | null {
  // a PENDING order is not expired by its deadline; the order service rejects it if credits are not held in time
  return isActive(order.status) && order.status !== 'PENDING' ? time(order.expiresAt) : null
}

// index of the last completed step; -1 when cancelled or expired (off the happy path)
export function progressIndex (status: OrderStatus): number {
  return PROGRESS_STEPS.findIndex(step => step.status === status)
}

// TODO: show nicknames once the user service exposes other users' names
export function personLabel (userId: number | null, myId: number | null): string {
  if (userId === null) {
    return 'Not assigned yet'
  }
  return userId === myId ? 'You' : `User #${userId}`
}

export function formatDateTime (iso: string): string {
  return new Date(iso).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' })
}

// e.g. "3h 20m 5s", "12m 0s", "45s"; rounds up to the second, so it never reaches zero while time is left
function formatDuration (ms: number): string {
  const total = Math.ceil(ms / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  }
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}

// e.g. "Expires in 3h 20m 5s", "Expires in 45s", "Expired"
export function formatTimeLeft (expiresAt: string, now = Date.now()): string {
  const left = time(expiresAt) - now
  return left > 0 ? `Expires in ${formatDuration(left)}` : 'Expired'
}

/**
 * The time line for an active errand, or null once it has ended:
 * "Expires in 3h 0m 0s" while open or accepted, "Due in 20m 0s" once collected
 * (it must be delivered by then), and "Expired" when the deadline passes.
 */
export function deadlineLabel (order: Order, now = Date.now()): string | null {
  if (order.status === 'OPEN' || order.status === 'ACCEPTED') {
    return formatTimeLeft(order.expiresAt, now)
  }
  if (order.status === 'COLLECTED') {
    const left = time(order.expiresAt) - now
    return left > 0 ? `Due in ${formatDuration(left)}` : 'Expired'
  }
  return null
}

// an active errand whose time ran out; the order service marks it EXPIRED within a minute
export function hasExpired (order: Order, now = Date.now()): boolean {
  const expiry = expiryTime(order)
  return expiry !== null && expiry <= now
}

// milliseconds until the soonest of these errands expires, or null if none can expire
export function msUntilNextExpiry (orders: Order[], now = Date.now()): number | null {
  const times = orders
    .map(o => expiryTime(o))
    .filter((t): t is number => t !== null)
    .map(t => t - now)
  return times.length > 0 ? Math.max(0, Math.min(...times)) : null
}

export interface OrderAction {
  target: TargetStatus
  label: string
  icon: string
  color: string
  // shown in the confirmation dialog
  confirm: string
  // shown as a warning in the confirmation dialog, e.g. too little time left to collect
  warning?: string
}

const credits = (n: number) => `${n} credit${n === 1 ? '' : 's'}`

/**
 * The status changes the viewer may make right now. Mirrors the order service's rules,
 * which still check everything; this only decides which buttons to show.
 * Admins act like any other user here: they cannot change other people's errands.
 */
export function availableActions (order: Order, myId: number | null, now = Date.now()): OrderAction[] {
  const isRequester = myId !== null && order.requesterId === myId
  const isCourier = myId !== null && order.courierId === myId
  const actions: OrderAction[] = []

  // an errand whose time ran out can no longer be changed
  if (hasExpired(order, now)) {
    return actions
  }

  if (order.status === 'OPEN' && !isRequester) {
    const minutesLeft = Math.ceil((time(order.expiresAt) - now) / 60_000)
    actions.push({
      target: 'ACCEPTED',
      label: 'Accept errand',
      icon: 'mdi-hand-okay',
      color: 'primary',
      confirm: `Accept this errand? You will be its courier, and must deliver the item by ${formatDateTime(order.expiresAt)}.`,
      warning: minutesLeft <= SHORT_DEADLINE_MINUTES
        ? `Only ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'} left. If you haven't delivered the item by then, the errand expires and you won't earn the credits. Accept anyway?`
        : undefined,
    })
  }
  if (order.status === 'ACCEPTED' && isCourier) {
    actions.push({ target: 'COLLECTED', label: 'Mark as collected', icon: 'mdi-package-variant-closed', color: 'primary', confirm: 'Have you collected the item from the pickup location?' })
  }
  if (order.status === 'COLLECTED' && isCourier) {
    actions.push({ target: 'DELIVERED', label: 'Mark as delivered', icon: 'mdi-check-circle-outline', color: 'success', confirm: `Have you handed the item to the requester? You will earn ${credits(order.creditBounty)}.` })
  }
  // only before collection: once the courier has the item, nobody can cancel
  if ((order.status === 'OPEN' || order.status === 'ACCEPTED') && isRequester) {
    actions.push({ target: 'CANCELLED', label: 'Cancel errand', icon: 'mdi-close-circle-outline', color: 'error', confirm: 'Cancel this errand? Your reserved credits will be returned to you.' })
  }
  return actions
}

/**
 * A readable message from a failed API call: the server's error (with the first
 * field message, if any), or the fallback when there is no response body.
 */
export function apiErrorMessage (error: unknown, fallback: string): string {
  const data = axios.isAxiosError(error) ? error.response?.data : undefined
  if (!data?.error) {
    return fallback
  }
  const fieldMessage = data.fields ? Object.values<string[]>(data.fields)[0]?.[0] : undefined
  return fieldMessage ?? data.error
}

// how long an errand waits for a courier; the order service allows 15 min to 24 h
export const EXPIRY_OPTIONS: { title: string, value: number }[] = [
  { title: '30 minutes', value: 30 },
  { title: '1 hour', value: 60 },
  { title: '2 hours', value: 120 },
  { title: '4 hours', value: 240 },
  { title: '12 hours', value: 720 },
  { title: '24 hours', value: 1440 },
]

// the order service's default, and the original fixed expiry
export const DEFAULT_EXPIRY_MINUTES = 1440
