/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Errand state labels, the viewer's part in an errand, the member actions each part may
 *        take in each state (from the Order Service transition table), item counts, and date/history wording.
 * Author review: Reviewed and approved by @mattis.
 */
import type { Errand, ErrandHistoryEntry, ErrandState, MemberAction } from './types'

export type StateTone = 'pending' | 'open' | 'active' | 'attention' | 'success' | 'closed' | 'failed'

export const STATE_LABELS: Readonly<Record<ErrandState, string>> = {
  PENDING_RESERVATION: 'Reserving credits',
  RESERVATION_REJECTED: 'Credits declined',
  RESERVATION_TIMED_OUT: 'Not posted',
  OPEN: 'Open',
  ACCEPTED: 'Accepted',
  PICKED_UP: 'Picked up',
  DELIVERED: 'Delivered',
  DISPUTED: 'Disputed',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  FAILED: 'Failed',
}

export const STATE_TONES: Readonly<Record<ErrandState, StateTone>> = {
  PENDING_RESERVATION: 'pending',
  RESERVATION_REJECTED: 'failed',
  RESERVATION_TIMED_OUT: 'failed',
  OPEN: 'open',
  ACCEPTED: 'active',
  PICKED_UP: 'active',
  DELIVERED: 'attention',
  DISPUTED: 'attention',
  COMPLETED: 'success',
  CANCELLED: 'closed',
  EXPIRED: 'closed',
  FAILED: 'failed',
}

/** How the viewer relates to an errand. A visitor can only see it while it is OPEN. */
export type ViewerPart = 'requester' | 'courier' | 'visitor'

export function viewerPart(errand: Pick<Errand, 'requesterId' | 'courierId'>, viewerId: string | null): ViewerPart {
  if (viewerId === null) return 'visitor'
  const id = viewerId.toLowerCase()
  if (errand.requesterId.toLowerCase() === id) return 'requester'
  if (errand.courierId !== null && errand.courierId.toLowerCase() === id) return 'courier'
  return 'visitor'
}

// From the transition table in order-service/README.md: who may run each member action, from which state.
const ACTIONS: Readonly<Record<ViewerPart, Partial<Record<ErrandState, readonly MemberAction[]>>>> = {
  requester: {
    OPEN: ['cancel'],
    ACCEPTED: ['cancel'],
    DELIVERED: ['confirm', 'reject'],
  },
  courier: {
    ACCEPTED: ['pickup', 'withdraw'],
    PICKED_UP: ['deliver'],
  },
  visitor: {
    OPEN: ['accept'],
  },
}

export function availableActions(state: ErrandState, part: ViewerPart): readonly MemberAction[] {
  return ACTIONS[part][state] ?? []
}

/** The deadline that matters in each live state; it is highlighted on the detail page. */
export type DeadlineField = 'reservationDeadline' | 'listingDeadline' | 'pickupDeadline' | 'deliveryDeadline' | 'confirmDeadline'

export function activeDeadline(state: ErrandState): DeadlineField | null {
  switch (state) {
    case 'PENDING_RESERVATION':
      return 'reservationDeadline'
    case 'OPEN':
      return 'listingDeadline'
    case 'ACCEPTED':
      return 'pickupDeadline'
    case 'PICKED_UP':
      return 'deliveryDeadline'
    case 'DELIVERED':
      return 'confirmDeadline'
    default:
      return null
  }
}

const REJECTION_REASONS: Readonly<Record<string, string>> = {
  INSUFFICIENT_CREDIT: "you don't have enough available credits",
  ACCOUNT_NOT_FOUND: 'your credit account could not be found',
  ACCOUNT_NOT_ACTIVE: 'your credit account is not active',
  INVALID_AMOUNT: 'the credit amount was not accepted',
}

export function describeRejection(reasonCode: string | null): string {
  if (reasonCode === null) return 'Credit Service declined the reservation.'
  const reason = REJECTION_REASONS[reasonCode]
  return reason ? `Credit Service declined the reservation because ${reason}.` : `Credit Service declined the reservation (${reasonCode}).`
}

/** One sentence telling the viewer where the errand stands and what happens next. */
export function stateGuidance(errand: Errand, part: ViewerPart): string {
  const credits = formatCredits(errand.creditAmount)
  switch (errand.state) {
    case 'PENDING_RESERVATION':
      return `Reserving ${credits} with Credit Service. This usually takes a few seconds; the page updates by itself.`
    case 'RESERVATION_REJECTED':
      return `${describeRejection(errand.rejectionReason)} The errand was not posted and nothing was charged.`
    case 'RESERVATION_TIMED_OUT':
      return 'Credit Service did not answer in time, so the errand was not posted. Any hold on your credits has been released.'
    case 'OPEN':
      return part === 'requester'
        ? `Waiting for a courier. If nobody accepts by ${formatDateTime(errand.listingDeadline)}, the errand expires and your credits are released.`
        : `Accept by ${formatDateTime(errand.listingDeadline)} to deliver this errand and earn ${credits}.`
    case 'ACCEPTED':
      return part === 'courier'
        ? `Collect the items by ${formatDateTime(errand.pickupDeadline)}. If you don't, the errand is taken back from you.`
        : `A courier has accepted. They must collect the items by ${formatDateTime(errand.pickupDeadline)}.`
    case 'PICKED_UP':
      return part === 'courier'
        ? `Deliver by ${formatDateTime(errand.deliveryDeadline)}. A late delivery is sent to an administrator as a dispute.`
        : `On its way. Delivery is due by ${formatDateTime(errand.deliveryDeadline)}.`
    case 'DELIVERED': {
      const by = errand.confirmDeadline ? ` by ${formatDateTime(errand.confirmDeadline)}` : ''
      return part === 'requester'
        ? `Confirm you received it, or report a problem${by}. If you do neither, the errand completes and the courier is paid.`
        : `Waiting for the requester to confirm${by}. If they don't answer in time, you are paid automatically.`
    }
    case 'DISPUTED':
      return 'An administrator will review this errand and decide. The credits stay held until then.'
    case 'COMPLETED':
      return part === 'courier' ? `Done. You earned ${credits}.` : `Done. ${capitalise(credits)} went to the courier.`
    case 'CANCELLED':
      return 'The requester cancelled this errand. The credits were released to them.'
    case 'EXPIRED':
      return 'No courier accepted it before the listing deadline. The credits were released to the requester.'
    case 'FAILED':
      return "An administrator resolved the dispute in the requester's favour. The credits were released to the requester."
  }
}

export interface ActionCopy {
  /** Button text */
  readonly label: string
  readonly confirmTitle: string
  readonly confirmBody: string
  readonly confirmLabel: string
  readonly tone: 'primary' | 'danger' | 'neutral'
  readonly success: string
}

export function actionCopy(action: MemberAction, errand: Errand): ActionCopy {
  const credits = formatCredits(errand.creditAmount)
  switch (action) {
    case 'accept':
      return {
        label: 'Accept errand',
        confirmTitle: 'Accept this errand?',
        confirmBody: `You become its courier. Collect the items by ${formatDateTime(errand.pickupDeadline)} and deliver by ${formatDateTime(errand.deliveryDeadline)} to earn ${credits}.`,
        confirmLabel: 'Accept errand',
        tone: 'primary',
        success: "You accepted the errand. It's now in My errands under Delivering.",
      }
    case 'withdraw':
      return {
        label: 'Withdraw',
        confirmTitle: 'Withdraw from this errand?',
        confirmBody:
          'You stop being its courier and it goes back to the open list. If its listing deadline has already passed, it expires instead and the requester gets their credits back.',
        confirmLabel: 'Withdraw',
        tone: 'danger',
        success: 'You withdrew from the errand.',
      }
    case 'pickup':
      return {
        label: 'Mark as picked up',
        confirmTitle: 'Have you collected the items?',
        confirmBody: `Mark the errand as picked up from ${errand.supplierName}. You can't withdraw after this.`,
        confirmLabel: 'Mark as picked up',
        tone: 'primary',
        success: 'Marked as picked up.',
      }
    case 'deliver':
      return {
        label: 'Mark as delivered',
        confirmTitle: 'Have you delivered the items?',
        confirmBody: `Mark the errand as delivered to ${errand.dropoffLocation}. The requester then confirms, or reports a problem.`,
        confirmLabel: 'Mark as delivered',
        tone: 'primary',
        success: 'Marked as delivered. Waiting for the requester to confirm.',
      }
    case 'confirm':
      return {
        label: 'Confirm received',
        confirmTitle: 'Confirm you received everything?',
        confirmBody: `The errand completes and ${credits} go to the courier. This can't be undone.`,
        confirmLabel: 'Confirm received',
        tone: 'primary',
        success: 'Thanks. The errand is complete and the courier has been paid.',
      }
    case 'reject':
      return {
        label: 'Report a problem',
        confirmTitle: 'Report a problem with this delivery?',
        confirmBody:
          'The errand becomes disputed and an administrator decides who gets the credits. They stay held until then.',
        confirmLabel: 'Report problem',
        tone: 'danger',
        success: 'Problem reported. An administrator will review the errand.',
      }
    case 'cancel':
      return {
        label: 'Cancel errand',
        confirmTitle: 'Cancel this errand?',
        confirmBody:
          errand.state === 'ACCEPTED'
            ? `The courier is unassigned and your ${credits} are released back to you.`
            : `It's removed from the open list and your ${credits} are released back to you.`,
        confirmLabel: 'Cancel errand',
        tone: 'danger',
        success: 'Errand cancelled. Your credits have been released.',
      }
  }
}

const HISTORY_ACTIONS: Readonly<Record<string, string>> = {
  create: 'Posted',
  reserved: 'Credits reserved, errand opened',
  reservation_rejected: 'Credit reservation declined',
  reservationTimeout: 'Credit Service did not answer in time',
  late_reserve_released: 'Late reservation released',
  late_reply_after_timeout: 'Late Credit Service reply ignored',
  accept: 'Accepted by a courier',
  withdraw: 'Courier withdrew',
  pickup: 'Picked up',
  deliver: 'Delivered',
  confirm: 'Receipt confirmed',
  reject: 'Problem reported',
  cancel: 'Cancelled',
  resolveForCourier: 'Dispute resolved for the courier',
  resolveForRequester: 'Dispute resolved for the requester',
  expire: 'Expired: nobody accepted in time',
  pickupTimeout: 'Courier missed the pickup deadline',
  deliveryTimeout: 'Courier missed the delivery deadline',
  confirmTimeout: 'Completed automatically: no answer by the confirmation deadline',
}

export function describeHistoryEntry(entry: ErrandHistoryEntry): string {
  return HISTORY_ACTIONS[entry.action] ?? entry.action
}

/** Who did it, as far as the viewer is allowed to know. */
export function describeActor(entry: ErrandHistoryEntry, viewerId: string | null, errand: Errand): string | null {
  if (entry.actorType === 'SYSTEM') return 'Automatic'
  if (entry.actorType === 'CREDIT') return 'Credit Service'
  if (entry.actorId === null) return null
  const id = entry.actorId.toLowerCase()
  if (viewerId !== null && id === viewerId.toLowerCase()) return 'You'
  if (id === errand.requesterId.toLowerCase()) return 'Requester'
  if (errand.courierId !== null && id === errand.courierId.toLowerCase()) return 'Courier'
  // A courier who later withdrew, or an administrator
  return 'Another member'
}

export function formatCredits(amount: number): string {
  return `${amount} ${amount === 1 ? 'credit' : 'credits'}`
}

/** Total quantity across the lines: 2 × latte + 1 croissant is "3 items". */
export function formatItemCount(items: Errand['items']): string {
  const total = items.reduce((sum, item) => sum + item.quantity, 0)
  return `${total} ${total === 1 ? 'item' : 'items'}`
}

export function formatItemsSummary(items: Errand['items']): string {
  return items.map((item) => (item.quantity > 1 ? `${item.quantity} × ${item.name}` : item.name)).join(', ')
}

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso))
}

/** "in 25 min", "in 3 h", "2 days ago". */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const diffMs = new Date(iso).getTime() - now
  const minutes = Math.round(Math.abs(diffMs) / 60_000)
  let amount: string
  if (minutes < 1) return diffMs >= 0 ? 'in under a minute' : 'just now'
  if (minutes < 60) amount = `${minutes} min`
  else if (minutes < 48 * 60) amount = `${Math.round(minutes / 60)} h`
  else amount = `${Math.round(minutes / (24 * 60))} days`
  return diffMs >= 0 ? `in ${amount}` : `${amount} ago`
}

export function isPast(iso: string, now: number = Date.now()): boolean {
  return new Date(iso).getTime() <= now
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
