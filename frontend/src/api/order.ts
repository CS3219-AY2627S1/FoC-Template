// Frontend API client for the order service. The errand pages call these
// functions instead of using HTTP directly.
import client from './http'

export const ORDER_STATUSES = ['PENDING', 'REJECTED', 'OPEN', 'ACCEPTED', 'COLLECTED', 'DELIVERED', 'CANCELLED', 'EXPIRED'] as const
export type OrderStatus = typeof ORDER_STATUSES[number]

// statuses a user can move an order to; OPEN and EXPIRED are only set by the service
export type TargetStatus = 'ACCEPTED' | 'COLLECTED' | 'DELIVERED' | 'CANCELLED'

// open: errands a courier can accept; requested: mine; delivering: I am the courier; all: admins only
export type OrderScope = 'open' | 'requested' | 'delivering' | 'all'

// SUPPLIER: a registered supplier; BUILDING: any spot in a building, e.g. a friend's room
export type PickupType = 'SUPPLIER' | 'BUILDING'

export interface Order {
  // UUID
  id: string
  idempotencyKey: string | null
  // user ids from the user service
  requesterId: number
  courierId: number | null
  pickupType: PickupType
  // null for a BUILDING pickup
  supplierId: number | null
  // location (building) ids from the supplier service. A SUPPLIER pickup is a preset spot:
  // the supplier's building and floor (floor null if it has none), no room.
  // Floors: ground is 1, basements negative (-1 = B1)
  pickupLocationId: number | null
  pickupFloor: number | null
  pickupRoom: string | null
  // null only on errands made before dropoff had to be a building
  dropoffLocationId: number | null
  dropoffFloor: number | null
  dropoffRoom: string | null
  // readable snapshots made when the order was created,
  // e.g. "Printer @ Com 2, Com 2, Level 1" or "Com 2, Level 3, #01-23, outside the lift"
  pickupLocation: string
  dropoffLocation: string
  itemDescription: string
  creditBounty: number
  additionalDetails: string | null
  status: OrderStatus
  // ISO 8601
  expiresAt: string
  createdAt: string
  updatedAt: string
}

export interface OrderQuery {
  scope: OrderScope
  // only these statuses; all when left out
  statuses?: OrderStatus[]
  // 1-based, 20 orders per page
  page: number
  // admins only: another user's requested or delivering errands instead of the signed-in user's
  userId?: number
}

// same shape as the supplier list
export interface OrderPage {
  data: Order[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPage: number
  }
}

// body of POST /orders; the requester and the readable location text are set by the order service.
// A SUPPLIER pickup sends supplierId only; a BUILDING pickup sends the pickupLocationId/Floor/Room fields
export interface OrderInput {
  pickupType: PickupType
  supplierId?: number
  pickupLocationId?: number
  pickupFloor?: number
  pickupRoom?: string | null
  dropoffLocationId: number
  dropoffFloor: number
  dropoffRoom: string | null
  itemDescription: string
  creditBounty: number
  additionalDetails: string | null
  // how long to wait for a courier (15 min to 24 h); the order service defaults to 24 h
  expiresInMinutes?: number
}

export async function listOrders (query: OrderQuery) {
  const params: Record<string, string> = {
    scope: query.scope,
    page: String(query.page),
  }
  if (query.statuses?.length) {
    params.status = query.statuses.join(',')
  }
  if (query.userId !== undefined) {
    params.userId = String(query.userId)
  }

  const response = await client.get<OrderPage>('/public/order/orders', { params })
  return response.data
}

export async function getOrder (id: string) {
  const response = await client.get<Order>(`/public/order/orders/${id}`)
  return response.data
}

/**
 * Creates an errand as the signed-in user. The idempotency key makes a retried
 * submit (e.g. double click, dropped connection) return the same order instead of a duplicate.
 */
export async function createOrder (body: OrderInput, idempotencyKey: string) {
  const response = await client.post<Order | { order: Order, deduplicated: true }>(
    '/public/order/orders',
    body,
    { headers: { 'Idempotency-Key': idempotencyKey } },
  )
  return 'deduplicated' in response.data ? response.data.order : response.data
}

export async function updateOrderStatus (id: string, targetStatus: TargetStatus) {
  const response = await client.patch<Order>(`/public/order/orders/${id}/status`, { targetStatus })
  return response.data
}
