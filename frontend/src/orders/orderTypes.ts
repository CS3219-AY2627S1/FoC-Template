// TEMPORARY order model used by the frontend views until the Order Service
// defines its API contract. When integrating, align these types and the
// status rules with the Order Service response and transition rules.
// The statuses below are the ones already referenced in the existing UI
// (MyRequestsPage / MyTasksPage); none are invented here.

export type OrderStatus =
  | 'OPEN'
  | 'ACCEPTED'
  | 'PICKED_UP'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'

export interface OrderParticipant {
  id: string
  username: string
  firstName: string
  lastName: string
}

export interface OrderPickup {
  supplierId: string
  supplierName: string
  building: string
  floor: string
}

export interface Order {
  id: string
  status: OrderStatus
  /** Display text. Real orders combine Chloe's title and description here. */
  itemDescription: string
  /** Chloe's title, present on orders loaded from Order Service. */
  title?: string
  /** Chloe's description, present on orders loaded from Order Service. */
  description?: string
  pickup: OrderPickup
  deliveryLocation: string
  creditAmount: number
  acceptanceDeadline: string | null
  requester: OrderParticipant
  courier: OrderParticipant | null
  /** Set when the order has a courier id but that user's name is not loaded yet. */
  courierId?: string | null
  createdAt: string
  acceptedAt?: string | null
  pickedUpAt?: string | null
  completedAt?: string | null
  cancelledAt?: string | null
  expiredAt?: string | null
  /** Order Service has no updated_at. Absent on real orders. */
  updatedAt?: string
}

type ChipColor = 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'

export const orderStatusDisplay: Record<
  OrderStatus,
  { label: string; color: ChipColor; description: string }
> = {
  OPEN: {
    label: 'Open',
    color: 'info',
    description: 'Waiting for a courier to accept.',
  },
  ACCEPTED: {
    label: 'Accepted',
    color: 'primary',
    description: 'A courier has accepted the request.',
  },
  PICKED_UP: {
    label: 'Picked up',
    color: 'warning',
    description: 'The courier has collected the item. Confirm once it is delivered.',
  },
  COMPLETED: {
    label: 'Completed',
    color: 'success',
    description: 'Delivery confirmed by the requester.',
  },
  CANCELLED: {
    label: 'Cancelled',
    color: 'default',
    description: 'This request was cancelled before pickup.',
  },
  EXPIRED: {
    label: 'Expired',
    color: 'default',
    description: 'No courier accepted this request before the deadline.',
  },
}

// Happy-path order of statuses, used for the progress stepper.
export const orderProgressSteps: OrderStatus[] = ['OPEN', 'ACCEPTED', 'PICKED_UP', 'COMPLETED']

// UI-only rules for which actions to show. The Order Service remains the
// source of truth and must enforce these transitions itself.
export function canRequesterCancel(status: OrderStatus): boolean {
  return status === 'OPEN' || status === 'ACCEPTED'
}

export function canRequesterConfirmDelivery(status: OrderStatus): boolean {
  return status === 'PICKED_UP'
}

// UI-only courier actions. Order Service must enforce the real transitions.
export function canCourierAccept(status: OrderStatus): boolean {
  return status === 'OPEN'
}

export function canCourierMarkPickedUp(status: OrderStatus): boolean {
  return status === 'ACCEPTED'
}

/** The requester confirms completion. A courier does not mark an order delivered. */
export function canCourierMarkDelivered(_status: OrderStatus): boolean {
  return false
}

export type CourierAction = 'accept' | 'pick-up' | 'deliver'

export function getCourierAction(status: OrderStatus): CourierAction | null {
  if (canCourierAccept(status)) return 'accept'
  if (canCourierMarkPickedUp(status)) return 'pick-up'
  if (canCourierMarkDelivered(status)) return 'deliver'
  return null
}

export function isOrderActive(status: OrderStatus): boolean {
  return status === 'OPEN' || status === 'ACCEPTED' || status === 'PICKED_UP'
}

export function canReorder(status: OrderStatus): boolean {
  return !isOrderActive(status)
}

export function reorderPath(order: Order): string {
  const params = new URLSearchParams({
    supplierId: order.pickup.supplierId,
    reorderFrom: order.id,
  })
  return `/requests/new?${params.toString()}`
}

export function isCourierTaskActive(status: OrderStatus): boolean {
  return status === 'ACCEPTED' || status === 'PICKED_UP'
}

export function formatParticipantName(participant: OrderParticipant): string {
  return `${participant.firstName} ${participant.lastName} (@${participant.username})`
}

export function formatPickupLocation(pickup: OrderPickup): string {
  const place = [pickup.building, pickup.floor ? `Level ${pickup.floor}` : '']
    .filter((part) => part.trim().length > 0)
    .join(', ')
  return place ? `${pickup.supplierName}, ${place}` : pickup.supplierName
}

export function formatOrderId(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`
}
