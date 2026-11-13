// Requester and courier order screens call Order Service through the gateway.

import type { User } from '../interfaces'
import type { Order, OrderParticipant, OrderPickup, OrderStatus } from '../orders/orderTypes'
import { fetchSupplierById } from './suppliers'
import { fetchCurrentUser, fetchUsersByIds, type PublicUserProfile } from './users'
import { request } from './client'


// ---- Chloe's Order Service JSON (snake_case, separate from the view model) ----

export interface OrderApiRow {
  order_id: string
  requester_id: string
  courier_id: string | null
  status: OrderStatus
  title: string
  description: string
  supplier_id: string
  delivery_location: string
  credit_amount: number
  accept_by: string
  created_at: string
  accepted_at: string | null
  picked_up_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  expired_at: string | null
}

export interface OrderApiPage {
  data: OrderApiRow[]
  total: number
  limit: number
  offset: number
}

const ORDER_PAGE_LIMIT = 100

function itemDescriptionFrom(title: string, description: string): string {
  const extra = description.trim()
  if (!extra) return title
  return `${title} — ${extra}`
}

function toParticipant(user: User): OrderParticipant {
  return {
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
  }
}

function unresolvedParticipant(id: string, role: 'requester' | 'user'): OrderParticipant {
  return {
    id,
    username: 'unresolved',
    firstName: 'Unresolved',
    lastName: role,
  }
}

function toPickup(row: OrderApiRow, supplier: Awaited<ReturnType<typeof fetchSupplierById>>): OrderPickup {
  if (!supplier) {
    return {
      supplierId: row.supplier_id,
      supplierName: 'Supplier unavailable',
      building: '',
      floor: '',
    }
  }
  return {
    supplierId: supplier.id,
    supplierName: supplier.name,
    building: supplier.building,
    floor: supplier.floor,
  }
}

function participantFromProfile(profile: PublicUserProfile): OrderParticipant {
  return {
    id: profile.id,
    username: profile.username,
    firstName: profile.firstName,
    lastName: profile.lastName,
  }
}

/** Maps one Order Service row into the screen model and fills names we can resolve. */
export function mapOrderRow(
  row: OrderApiRow,
  currentUser: User | null,
  supplier: Awaited<ReturnType<typeof fetchSupplierById>>,
  profiles: ReadonlyMap<string, PublicUserProfile> = new Map(),
): Order {
  const requesterProfile = profiles.get(row.requester_id)
  const requester = requesterProfile
    ? participantFromProfile(requesterProfile)
    : currentUser && currentUser.id === row.requester_id
      ? toParticipant(currentUser)
      : unresolvedParticipant(row.requester_id, 'requester')

  const courierProfile = row.courier_id ? profiles.get(row.courier_id) : undefined
  const courier = courierProfile
    ? participantFromProfile(courierProfile)
    : currentUser && row.courier_id === currentUser.id
      ? toParticipant(currentUser)
      : null

  return {
    id: row.order_id,
    status: row.status,
    title: row.title,
    description: row.description,
    itemDescription: itemDescriptionFrom(row.title, row.description),
    pickup: toPickup(row, supplier),
    deliveryLocation: row.delivery_location,
    creditAmount: row.credit_amount,
    acceptanceDeadline: row.accept_by,
    requester,
    courier,
    courierId: row.courier_id,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
    pickedUpAt: row.picked_up_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    expiredAt: row.expired_at,
  }
}

async function loadSupplier(supplierId: string) {
  try {
    return await fetchSupplierById(supplierId, { includeInactive: true })
  } catch (error) {
    console.error(error)
    return null
  }
}

async function loadProfiles(rows: OrderApiRow[]): Promise<Map<string, PublicUserProfile>> {
  const userIds = rows.flatMap((row) =>
    row.courier_id ? [row.requester_id, row.courier_id] : [row.requester_id],
  )
  const profiles = await fetchUsersByIds(userIds)
  return new Map(profiles.map((profile) => [profile.id, profile]))
}

async function enrichRows(rows: OrderApiRow[], currentUser: User | null): Promise<Order[]> {
  const suppliers = new Map<string, Awaited<ReturnType<typeof fetchSupplierById>>>()
  const [profiles] = await Promise.all([
    loadProfiles(rows),
    Promise.all(
      [...new Set(rows.map((row) => row.supplier_id))].map(async (supplierId) => {
        suppliers.set(supplierId, await loadSupplier(supplierId))
      }),
    ),
  ])
  return rows.map((row) =>
    mapOrderRow(row, currentUser, suppliers.get(row.supplier_id) ?? null, profiles),
  )
}

async function requireCurrentUser(): Promise<User> {
  const currentUser = await fetchCurrentUser()
  if (!currentUser) {
    throw new Error('You need to be logged in to view orders.')
  }
  return currentUser
}

async function fetchOrderPage(params: URLSearchParams): Promise<OrderApiPage> {
  const response = await request(`/orders?${params.toString()}`)
  return (await response.json()) as OrderApiPage
}

async function fetchAllRows(filters: Record<string, string>): Promise<OrderApiRow[]> {
  const rows: OrderApiRow[] = []
  let offset = 0
  let total = 0

  do {
    const params = new URLSearchParams({
      ...filters,
      limit: String(ORDER_PAGE_LIMIT),
      offset: String(offset),
    })
    const page = await fetchOrderPage(params)
    rows.push(...page.data)
    total = page.total
    offset += page.data.length
    if (page.data.length === 0) break
  } while (rows.length < total)

  return rows
}

async function enrichOne(row: OrderApiRow): Promise<Order> {
  const [orders] = await enrichRows([row], await fetchCurrentUser())
  return orders
}

// ---- API functions --------------------------------------------------------

export async function fetchMyRequests(): Promise<Order[]> {
  const currentUser = await requireCurrentUser()
  const rows = await fetchAllRows({ requester_id: currentUser.id })
  return enrichRows(rows, currentUser)
}

export interface CreateOrderInput {
  title: string
  description: string
  supplierId: string
  deliveryLocation: string
  creditAmount: number
  acceptBy: string
}

/** POST /orders. The requester id comes from the token, not this body. */
export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const response = await request('/orders', {
    method: 'POST',
    body: JSON.stringify({
      title: input.title,
      description: input.description,
      supplier_id: input.supplierId,
      delivery_location: input.deliveryLocation,
      credit_amount: input.creditAmount,
      accept_by: input.acceptBy,
    }),
  })
  return enrichOne((await response.json()) as OrderApiRow)
}

export async function fetchOrderById(orderId: string): Promise<Order> {
  const response = await request(`/orders/${encodeURIComponent(orderId)}`)
  const row = (await response.json()) as OrderApiRow
  return enrichOne(row)
}

export interface AdminOrderPage {
  orders: Order[]
  total: number
  limit: number
  offset: number
}

/**
 * GET /orders?status=&limit=&offset=
 * Chloe's list treats a request with no owner as the public open-order view
 * unless status is set. An admin may pass any one status and receive that
 * status for every requester. There is no single query for every status.
 */
export async function fetchAdminOrders(options: {
  status: OrderStatus
  limit: number
  offset: number
}): Promise<AdminOrderPage> {
  const currentUser = await requireCurrentUser()
  const params = new URLSearchParams({
    status: options.status,
    limit: String(options.limit),
    offset: String(options.offset),
  })
  const page = await fetchOrderPage(params)
  return {
    orders: await enrichRows(page.data, currentUser),
    total: page.total,
    limit: page.limit,
    offset: page.offset,
  }
}

/** GET /orders with no owner filter. Order Service returns OPEN orders that have not expired. */
export async function fetchAvailableRequests(): Promise<Order[]> {
  const currentUser = await requireCurrentUser()
  const rows = await fetchAllRows({})
  return enrichRows(rows, currentUser)
}

/** GET /orders?courier_id={current user}. Includes every status assigned to this courier. */
export async function fetchMyCourierTasks(): Promise<Order[]> {
  const currentUser = await requireCurrentUser()
  const rows = await fetchAllRows({ courier_id: currentUser.id })
  return enrichRows(rows, currentUser)
}

export async function cancelOrder(orderId: string): Promise<Order> {
  const response = await request(`/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: 'POST',
  })
  return enrichOne((await response.json()) as OrderApiRow)
}

/** Requester confirms delivery. Order Service calls this complete, not the courier. */
export async function confirmDelivery(orderId: string): Promise<Order> {
  const response = await request(`/orders/${encodeURIComponent(orderId)}/complete`, {
    method: 'POST',
  })
  return enrichOne((await response.json()) as OrderApiRow)
}

export async function acceptOrder(orderId: string): Promise<Order> {
  const response = await request(`/orders/${encodeURIComponent(orderId)}/accept`, {
    method: 'POST',
  })
  return enrichOne((await response.json()) as OrderApiRow)
}

export async function markOrderPickedUp(orderId: string): Promise<Order> {
  const response = await request(`/orders/${encodeURIComponent(orderId)}/pickup`, {
    method: 'POST',
  })
  return enrichOne((await response.json()) as OrderApiRow)
}

/** Courier completion is not an Order Service action. The requester calls complete. */
export async function markOrderDelivered(orderId: string): Promise<Order> {
  void orderId
  throw new Error('Only the requester can confirm that a delivery is complete.')
}

export function isOrderApiConnected(): boolean {
  return true
}
