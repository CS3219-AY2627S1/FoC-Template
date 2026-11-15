/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Errand API models copied from Order Service's serializeErrand, serializeDetail,
 *        serializePage and validateCreateErrand.
 * Author review: Reviewed and approved by @mattis.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: N2 extraction models (status and the extracted fields), per the approved N2 spec.
 * Author review: Reviewed and approved by @mattis.
 */

// Same order as order-service/src/domain/states.ts
export const ERRAND_STATES = [
  'PENDING_RESERVATION',
  'RESERVATION_REJECTED',
  'RESERVATION_TIMED_OUT',
  'OPEN',
  'ACCEPTED',
  'PICKED_UP',
  'DELIVERED',
  'DISPUTED',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'FAILED',
] as const
export type ErrandState = (typeof ERRAND_STATES)[number]

export const TERMINAL_STATES: ReadonlySet<ErrandState> = new Set<ErrandState>([
  'RESERVATION_REJECTED',
  'RESERVATION_TIMED_OUT',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'FAILED',
])

export interface ErrandItem {
  readonly name: string
  readonly quantity: number
}

/** serializeErrand: every timestamp is an ISO string or null. */
export interface Errand {
  readonly id: string
  readonly requesterId: string
  readonly courierId: string | null
  readonly supplierId: string
  readonly supplierName: string
  readonly supplierBuildingCode: string
  readonly supplierLocationDescription: string
  readonly items: readonly ErrandItem[]
  readonly dropoffLocation: string
  readonly notes: string | null
  readonly creditAmount: number
  readonly state: ErrandState
  readonly rejectionReason: string | null
  readonly reservationDeadline: string
  readonly listingDeadline: string
  readonly pickupDeadline: string
  readonly deliveryDeadline: string
  readonly confirmDeadline: string | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly acceptedAt: string | null
  readonly pickedUpAt: string | null
  readonly deliveredAt: string | null
  readonly closedAt: string | null
}

/** One errand_history row. actorId is null for system and credit actors, and for viewers who are not a party. */
export interface ErrandHistoryEntry {
  readonly fromState: ErrandState | null
  readonly toState: ErrandState
  readonly action: string
  readonly actorType: string
  readonly actorId: string | null
  readonly reason: string | null
  readonly at: string
}

export interface ErrandDetail extends Errand {
  readonly history: readonly ErrandHistoryEntry[]
}

/** serializePage. There is no totalPages; compute it from totalItems and size. */
export interface ErrandPage {
  readonly items: readonly Errand[]
  readonly page: number
  readonly size: number
  readonly totalItems: number
}

export type ErrandRole = 'requester' | 'courier'

export interface MyErrandsQuery {
  readonly as: ErrandRole
  readonly state?: ErrandState
  readonly page?: number
  readonly size?: number
}

/** Body of POST /errands. Deadlines are ISO 8601 with an offset. */
export interface CreateErrandRequest {
  readonly supplierId: string
  readonly items: readonly ErrandItem[]
  readonly dropoffLocation: string
  readonly notes?: string
  readonly creditAmount: number
  readonly listingDeadline: string
  readonly pickupDeadline: string
  readonly deliveryDeadline: string
}

/** The member actions, each POST /errands/:id/<action>. Admin resolve is not here. */
export type MemberAction = 'accept' | 'withdraw' | 'pickup' | 'deliver' | 'confirm' | 'reject' | 'cancel'

// Limits from order-service/src/domain/validation.ts
export const ERRAND_LIMITS = {
  maxItems: 20,
  maxItemName: 100,
  maxItemQuantity: 99,
  maxDropoff: 200,
  maxNotes: 500,
  minCredit: 1,
  maxCredit: 1000,
  maxReason: 500,
} as const

export const ERRAND_LIST_DEFAULT_SIZE = 20

/** GET /errands/extract/status */
export interface ExtractionStatus {
  readonly available: boolean
  readonly reason: null | 'DISABLED' | 'NOT_CONFIGURED'
}

/** POST /errands/extract: the POST /errands field names, each null when it couldn't be worked out. */
export interface ExtractedErrand {
  readonly supplierId: string | null
  readonly items: readonly { readonly name: string; readonly quantity: number | null }[] | null
  readonly dropoffLocation: string | null
  readonly notes: string | null
  readonly creditAmount: number | null
  readonly listingDeadline: string | null
  readonly pickupDeadline: string | null
  readonly deliveryDeadline: string | null
}

/** At most this many characters (JavaScript string length) go to POST /errands/extract */
export const MAX_DESCRIPTION = 1000
