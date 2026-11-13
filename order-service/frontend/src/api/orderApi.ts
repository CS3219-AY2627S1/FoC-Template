import { expireSession, readSession } from '../auth/session'

export type OrderState =
  | 'PENDING_CREDIT'
  | 'OPEN'
  | 'ACCEPTED'
  | 'PICKED_UP'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'RESERVATION_FAILED'

/** Mirrors OrderResponse in order-service (web/dto/OrderResponse.java). */
export type Order = {
  id: string
  requesterId: string
  courierId: string | null
  title: string
  description: string
  pickupLocationId: string
  pickupLocationName: string | null
  dropoffLocationId: string
  dropoffLocationName: string | null
  creditReward: number
  pendingCreditReward: number | null
  pickupDeadline: string
  state: OrderState
  reviewCaseId?: string | null
  reviewResolved?: boolean
  terminalReason: string | null
  version: number
  createdAt: string
  stateChangedAt: string
}

/** Mirrors OrderTransitionResponse. */
export type OrderTransition = {
  action: string
  fromState: OrderState | null
  toState: OrderState
  actorRole: 'REQUESTER' | 'COURIER' | 'SYSTEM'
  actorId: string | null
  courierId: string | null
  reason: string | null
  orderVersion: number
  occurredAt: string
}

/** Mirrors OrderPageResponse (same shape as Supplier's list response). */
export type OrderPage = {
  items: Order[]
  page: number
  size: number
  totalItems: number
  totalPages: number
}

export type PoolSort = 'deadline' | 'reward' | 'pickupLocationName'

export type PoolQuery = {
  minReward?: number
  maxReward?: number
  sort: PoolSort
  page: number
}

export type OrderAction =
  'accept' | 'withdraw' | 'pickup' | 'deliver' | 'complete' | 'cancel'

/** A problem+json rejection; `code` is the Order error code (e.g. ORDER_ALREADY_ACCEPTED). */
export class OrderApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string | null = null,
    readonly currentState: OrderState | null = null,
    /** Field name -> messages from a 400's `errors` map (see the README). */
    readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message)
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = readSession()
  if (!session) throw new OrderApiError(401, 'Sign in is required')
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  headers.set('Authorization', `${session.tokenType} ${session.accessToken}`)
  const response = await fetch(path, { ...init, headers })
  if (response.status === 401) expireSession()
  if (!response.ok) {
    let detail = 'Something went wrong. Please try again.'
    let code: string | null = null
    let currentState: OrderState | null = null
    let fieldErrors: Record<string, string[]> = {}
    try {
      const problem = (await response.json()) as {
        detail?: string
        code?: string
        currentState?: OrderState
        errors?: Record<string, string[]>
      }
      detail = problem.detail ?? detail
      code = problem.code ?? null
      currentState = problem.currentState ?? null
      fieldErrors = problem.errors ?? {}
    } catch {
      // Keep the generic message when the body is not problem+json.
    }
    throw new OrderApiError(
      response.status,
      detail,
      code,
      currentState,
      fieldErrors,
    )
  }
  return (await response.json()) as T
}

export type ReportContext = {
  orderId: string
  status:
    | 'OWN_REPORT'
    | 'ELIGIBLE'
    | 'INELIGIBLE'
    | 'CASE_PARTICIPANT'
    | 'REPORT_REQUEST_AVAILABLE'
    | 'PREPARATION_AVAILABLE' // Compatibility with older Admin deployments.
    | 'PREPARING_REVIEW'
  caseId: string | null
  state: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | null
}
export async function fetchReportContext(
  orderId: string,
): Promise<ReportContext> {
  const value = await request<ReportContext>(
    `/api/admin/orders/${encodeURIComponent(orderId)}/report-context`,
    { cache: 'no-store' },
  )
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (
    !value ||
    value.orderId !== orderId ||
    ![
      'OWN_REPORT',
      'ELIGIBLE',
      'INELIGIBLE',
      'CASE_PARTICIPANT',
      'REPORT_REQUEST_AVAILABLE',
      'PREPARATION_AVAILABLE',
      'PREPARING_REVIEW',
    ].includes(value.status) ||
    (['OWN_REPORT', 'CASE_PARTICIPANT', 'PREPARING_REVIEW'].includes(
      value.status,
    )
      ? typeof value.caseId !== 'string' ||
        !uuid.test(value.caseId) ||
        !['OPEN', 'UNDER_REVIEW', 'RESOLVED'].includes(value.state || '')
      : value.caseId !== null || value.state !== null)
  ) {
    throw new OrderApiError(
      503,
      'We can’t load reports right now. Please try again.',
    )
  }
  return value
}

export function fetchOpenPool(query: PoolQuery): Promise<OrderPage> {
  const params = new URLSearchParams({
    sort: query.sort,
    page: String(query.page),
    size: '20',
  })
  if (query.minReward) params.set('minReward', String(query.minReward))
  if (query.maxReward) params.set('maxReward', String(query.maxReward))
  return request<OrderPage>(`/api/orders?${params}`)
}

export function fetchOrder(id: string): Promise<Order> {
  return request<Order>(`/api/orders/${encodeURIComponent(id)}`)
}

export function fetchHistory(id: string): Promise<OrderTransition[]> {
  return request<OrderTransition[]>(
    `/api/orders/${encodeURIComponent(id)}/history`,
  )
}

/** The caller's own errands: `active` (in progress) or `past` (finished), optionally one state. */
export function fetchMyOrders(
  kind: 'requested' | 'delivered',
  status: 'active' | 'past' | 'review',
  page: number,
  state?: OrderState,
): Promise<OrderPage> {
  const params = new URLSearchParams({ status, page: String(page), size: '20' })
  if (state) params.set('state', state)
  return request<OrderPage>(`/api/orders/me/${kind}?${params}`)
}

export function performAction(id: string, action: OrderAction): Promise<Order> {
  return request<Order>(`/api/orders/${encodeURIComponent(id)}/${action}`, {
    method: 'POST',
  })
}

/** Body of POST /api/orders (CreateOrderRequest). Locations come from Supplier Service. */
export type CreateOrderInput = {
  title: string
  description: string
  pickupLocationId: string
  pickupLocationName: string
  dropoffLocationId: string
  dropoffLocationName: string
  creditReward: number
  pickupDeadline: string
}

/** Body of PATCH /api/orders/{id} (UpdateOrderRequest): every editable field plus the version read. */
export type UpdateOrderInput = CreateOrderInput & { version: number }

export function updateOrder(
  id: string,
  input: UpdateOrderInput,
): Promise<Order> {
  return request<Order>(`/api/orders/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

/**
 * A fresh `Idempotency-Key`. `crypto.randomUUID` exists only in secure contexts (HTTPS or
 * localhost); over plain HTTP the key is built from `crypto.getRandomValues`, which is always there.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

/**
 * POST /api/orders. `idempotencyKey` makes a retry safe: the same key with the same body returns the
 * errand already created instead of posting (and reserving credits for) a second one.
 */
export function createOrder(
  input: CreateOrderInput,
  idempotencyKey?: string,
): Promise<Order> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
  return request<Order>('/api/orders', {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  })
}
