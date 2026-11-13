import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { ApiError, request } from '@/lib/http'

export type OrderStatus =
  | 'Pending'
  | 'Open'
  | 'Accepted'
  | 'PickedUp'
  | 'Delivered'
  | 'Completed'
  | 'Cancelled'
  | 'Expired'

export type Order = {
  id: number
  requester_id: string
  courier_id: string | null
  supplier_id: string
  delivery_location: string
  // ISO date strings
  needed_by_time: string
  item_lines: string[]
  credit_reward: number
  status: OrderStatus
  created_at: string
  updated_at: string
  // Both ends of the walk and the walk the order-service measured at creation, see "Walking route" in
  // order-service/README.md. Null on older errands, and the route also when it could not be measured.
  pickup_latitude: number | null
  pickup_longitude: number | null
  delivery_latitude: number | null
  delivery_longitude: number | null
  route_metres: number | null
  route_seconds: number | null
  route_estimated: boolean | null
}

// Mirrors CreateOrderSchema in order-service.
export type CreateOrderInput = {
  supplierId: string
  deliveryLocation: string
  // Undefined until a point is picked; the order-service then names the field.
  deliveryLatitude?: number
  deliveryLongitude?: number
  neededByTime: string // ISO timestamp
  itemLines: string[]
  creditReward: number
}

export type OrderTransition = {
  from_status: OrderStatus
  to_status: OrderStatus
  actor: string
  occurred_at: string
}

// GET /orders/mine adds what the account may do next, so the client never works out the rules itself.
export type MyOrder = Order & {
  role: 'requester' | 'courier'
  allowed_transitions: OrderStatus[]
  transitions: OrderTransition[]
}

export type AdminOrders = {
  orders: Order[]
  page: number
  pageSize: number
  total: number
}

export type MyOrders = { orders: MyOrder[]; accountId: string }

// GET /orders/:id adds what the caller may do next, like /orders/mine.
export type OrderDetail = Order & { allowed_transitions: OrderStatus[] }

// Refetch while the page is visible so couriers see new errands and requesters see progress.
const POLL_MS = 15_000

export function useOpenOrders() {
  return useQuery({
    queryKey: ['order', 'open'],
    queryFn: async ({ signal }) => (await request<{ data: Order[] }>('order', '/orders/open', { signal })).data,
    refetchInterval: POLL_MS,
  })
}

export function useAllOrders(page: number, pageSize = 10, q = '', status = '') {
  return useQuery<AdminOrders>({
    queryKey: ['order', 'admin', page, pageSize, q, status],
    queryFn: async ({ signal }): Promise<AdminOrders> => {
      const response = await request<{ data: AdminOrders }>('order', '/orders/admin', {
        query: { page, pageSize, q: q || undefined, status: status || undefined },
        signal,
      })
      return response.data
    },
    // Keeps the current page on screen while the next one loads, as useSuppliers does.
    placeholderData: keepPreviousData,
  })
}

export function useAdminOrder(id: number) {
  return useQuery({
    queryKey: ['order', 'admin', id],
    queryFn: async ({ signal }) => (await request<{ data: Order }>('order', `/orders/admin/${id}`, { signal })).data,
    enabled: id > 0,
  })
}

export function useAdminCancelOrder() {
  const invalidate = useInvalidateOrders()
  return useMutation({
    mutationFn: (id: number) => request<{ data: Order }>('order', `/orders/admin/${id}/cancel`, { method: 'POST' }),
    onSettled: invalidate,
  })
}

// Orders I requested or am delivering, plus account id (GET /orders/mine).
export function useMyOrders() {
  return useQuery({
    queryKey: ['order', 'mine'],
    queryFn: async ({ signal }): Promise<MyOrders> => {
      const body = await request<{ data: MyOrder[]; accountId: string }>('order', '/orders/mine', { signal })
      return { orders: body.data, accountId: body.accountId }
    },
    refetchInterval: POLL_MS,
  })
}

function useInvalidateOrders() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: ['order'] })
}

export function useCreateOrder() {
  const invalidate = useInvalidateOrders()
  return useMutation({
    mutationFn: (input: CreateOrderInput) =>
      request<{ data: Order }>('order', '/orders', { method: 'POST', body: input }),
    onSettled: invalidate,
  })
}

export function useAcceptOrder() {
  const invalidate = useInvalidateOrders()
  return useMutation({
    mutationFn: (id: number) => request<{ data: Order }>('order', `/orders/${id}/accept`, { method: 'POST' }),
    onSettled: invalidate,
  })
}

export function useUpdateOrderStatus() {
  const invalidate = useInvalidateOrders()
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: OrderStatus }) =>
      request<{ data: Order }>('order', `/orders/${id}/status`, { method: 'PATCH', body: { status } }),
    onSettled: invalidate,
  })
}

// For order details

export function useOrder(id: number) {
  return useQuery({
    queryKey: ['order', 'detail', id],
    queryFn: async ({ signal }) => (await request<{ data: OrderDetail }>('order', `/orders/${id}`, { signal })).data,
    enabled: id > 0,
    refetchInterval: POLL_MS,
  })
}

// ---- Error helpers ----------------------------------------------------------

/** The order-service sends a readable reason with every error, so that is what the student sees. */
export function describeOrderError(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.message ? err.message : fallback
}
