import type { CampusLocation } from '../api/sharedApi'

/** Field limits from CreateOrderRequest in the Order README. */
export const TITLE_MAX = 120
export const DESCRIPTION_MAX = 2000

export type Fields = {
  title: string
  pickupLocationId: string
  dropoffLocationId: string
  pickupDeadline: string
  creditReward: string
  description: string
}

export type FieldName = keyof Fields
export type Errors = Partial<Record<FieldName | 'form', string>>

export const EMPTY: Fields = {
  title: '',
  pickupLocationId: '',
  dropoffLocationId: '',
  pickupDeadline: '',
  creditReward: '',
  description: '',
}

export function locationLabel(location: CampusLocation): string {
  return location.floor
    ? `${location.name} · ${location.building}, level ${location.floor}`
    : `${location.name} · ${location.building}`
}

/** F1.1.1: block submission and say why when a field is missing or invalid. */
export function validate(fields: Fields, now: Date = new Date()): Errors {
  const errors: Errors = {}
  if (!fields.title.trim()) errors.title = 'Give your errand a title.'
  else if (fields.title.trim().length > TITLE_MAX)
    errors.title = `Keep the title to ${TITLE_MAX} characters.`
  if (!fields.pickupLocationId)
    errors.pickupLocationId = 'Choose where to pick up.'
  if (!fields.dropoffLocationId)
    errors.dropoffLocationId = 'Choose where to drop off.'
  else if (fields.dropoffLocationId === fields.pickupLocationId)
    errors.dropoffLocationId = 'Pickup and drop-off must be different places.'
  if (!fields.pickupDeadline) errors.pickupDeadline = 'Choose a pickup time.'
  else if (!(new Date(fields.pickupDeadline) > now))
    errors.pickupDeadline = 'Choose a time in the future.'
  const reward = Number(fields.creditReward)
  if (!fields.creditReward) errors.creditReward = 'Offer a reward.'
  else if (!Number.isInteger(reward) || reward < 1)
    errors.creditReward = 'Use a whole number of credits, 1 or more.'
  if (!fields.description.trim()) errors.description = 'Say what to collect.'
  else if (fields.description.trim().length > DESCRIPTION_MAX)
    errors.description = `Keep the description to ${DESCRIPTION_MAX} characters.`
  return errors
}

/** What the balance query returned: still loading, failed, no account (null), or a balance. */
export type BalanceStatus =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'no-account' }
  | { kind: 'loaded'; available: number }

/**
 * Whether the requester may post, given their balance (read in the browser from Credit's public
 * API; Order Service never calls Credit). Posting is allowed only once the balance is confirmed and
 * covers the reward. Credit still has the final say: a reservation it rejects later shows as "Not
 * enough credits" on the errand.
 */
export function creditCheck(
  balance: BalanceStatus,
  reward: number | null,
): { canPost: boolean; message: string | null } {
  switch (balance.kind) {
    case 'loading':
      return { canPost: false, message: 'Checking your credits…' }
    case 'unavailable':
      return {
        canPost: false,
        message:
          "We can't check your credits right now. Try again in a moment.",
      }
    case 'no-account':
      return {
        canPost: false,
        message: "Your credit account isn't set up yet.",
      }
    case 'loaded':
      if (reward !== null && reward > balance.available) {
        return {
          canPost: false,
          message: `You have ${balance.available} ${balance.available === 1 ? 'credit' : 'credits'}. Lower the reward to ${balance.available} or less.`,
        }
      }
      return { canPost: true, message: null }
  }
}

/** How long Post errand waits for Credit to answer before handing over to the errand page. */
export const RESERVATION_WAIT_MS = 30_000
export const RESERVATION_POLL_MS = 1_000

/** Where a just-posted errand's reservation stands, from the order's state and terminal reason. */
export type ReservationOutcome =
  | { kind: 'waiting' }
  | { kind: 'reserved' }
  | { kind: 'failed'; message: string; setUpCredits: boolean }

export function reservationOutcome(
  state: string,
  terminalReason: string | null,
  reward: number,
): ReservationOutcome {
  if (state === 'PENDING_CREDIT') return { kind: 'waiting' }
  if (state === 'RESERVATION_FAILED') {
    if (terminalReason === 'INSUFFICIENT_CREDITS')
      return {
        kind: 'failed',
        message: `You don't have enough credits for a reward of ${reward}. Lower it and post again.`,
        setUpCredits: false,
      }
    if (terminalReason === 'CREDIT_ACCOUNT_NOT_FOUND')
      return {
        kind: 'failed',
        message: "Your credits aren't set up yet, so the errand wasn't posted.",
        setUpCredits: true,
      }
    return {
      kind: 'failed',
      message: "We couldn't post your errand. Please try again.",
      setUpCredits: false,
    }
  }
  if (state === 'EXPIRED' && terminalReason === 'CREDIT_RESERVATION_TIMEOUT')
    return {
      kind: 'failed',
      message:
        "We couldn't post your errand this time. Your credits are safe. Please try again.",
      setUpCredits: false,
    }
  if (state === 'EXPIRED')
    return {
      kind: 'failed',
      message:
        'The pickup time has already passed. Choose a later time and post again.',
      setUpCredits: false,
    }
  return { kind: 'reserved' }
}

/** The `datetime-local` value for an ISO instant, in the browser's time zone. */
export function toLocalInput(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** An existing errand as form values (the reward shown is the one currently reserved). */
export function fieldsFromOrder(order: {
  title: string
  description: string
  pickupLocationId: string
  dropoffLocationId: string
  creditReward: number
  pickupDeadline: string
}): Fields {
  return {
    title: order.title,
    description: order.description,
    pickupLocationId: order.pickupLocationId,
    dropoffLocationId: order.dropoffLocationId,
    creditReward: String(order.creditReward),
    pickupDeadline: toLocalInput(order.pickupDeadline),
  }
}

/**
 * "Post again": an earlier errand's details for a new one. Pick up by is left for the requester to
 * choose. A location Supplier no longer lists is left empty with a note naming it.
 */
export function fieldsForRepost(
  order: {
    title: string
    description: string
    pickupLocationId: string
    pickupLocationName: string | null
    dropoffLocationId: string
    dropoffLocationName: string | null
    creditReward: number
  },
  locations: CampusLocation[] | undefined,
): { fields: Fields; errors: Errors } {
  const fields: Fields = {
    ...fieldsFromOrder({ ...order, pickupDeadline: new Date().toISOString() }),
    pickupDeadline: '',
  }
  const errors: Errors = {}
  if (locations) {
    const listed = new Set(locations.map((location) => location.id))
    const gone = (name: string | null) =>
      `${name ?? 'That location'} is no longer available. Choose another location.`
    if (!listed.has(order.pickupLocationId)) {
      fields.pickupLocationId = ''
      errors.pickupLocationId = gone(order.pickupLocationName)
    }
    if (!listed.has(order.dropoffLocationId)) {
      fields.dropoffLocationId = ''
      errors.dropoffLocationId = gone(order.dropoffLocationName)
    }
  }
  return { fields, errors }
}

/**
 * Whether a reward change is affordable. Only an increase needs more credits: Credit reserves the
 * difference from the available balance. A decrease (or no change) is always allowed.
 */
export function rewardChangeCheck(
  balance: BalanceStatus,
  current: number,
  next: number | null,
): { canSave: boolean; message: string | null } {
  if (next === null || next <= current) return { canSave: true, message: null }
  const extra = next - current
  switch (balance.kind) {
    case 'loading':
      return { canSave: false, message: 'Checking your credits…' }
    case 'unavailable':
      return {
        canSave: false,
        message: "We can't check your credits right now. Try again in a moment.",
      }
    case 'no-account':
      return { canSave: false, message: "Your credit account isn't set up yet." }
    case 'loaded':
      if (extra > balance.available)
        return {
          canSave: false,
          message: `You don't have enough credits for ${next}. Choose ${current + balance.available} or less.`,
        }
      return { canSave: true, message: null }
  }
}

/** How a requested reward change ended, from the errand and its history. */
export type RewardChangeOutcome =
  | { kind: 'waiting' }
  | { kind: 'applied' }
  | { kind: 'rejected'; message: string }
  | { kind: 'ended' }

export function rewardChangeOutcome(
  order: { state: string; creditReward: number; pendingCreditReward: number | null },
  history: { action: string; orderVersion: number }[],
  requested: number,
  sinceVersion: number,
): RewardChangeOutcome {
  if (order.pendingCreditReward !== null) return { kind: 'waiting' }
  if (order.state !== 'OPEN') return { kind: 'ended' }
  const answer = history
    .filter((entry) => entry.orderVersion > sinceVersion)
    .find((entry) => entry.action === 'REWARD_CHANGE_APPLIED' || entry.action === 'REWARD_CHANGE_REJECTED')
  if (answer?.action === 'REWARD_CHANGE_REJECTED' || order.creditReward !== requested)
    return {
      kind: 'rejected',
      message: `You don't have enough credits for a reward of ${requested}, so it stays at ${order.creditReward}.`,
    }
  return { kind: 'applied' }
}
