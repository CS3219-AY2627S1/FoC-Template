// AI-assisted (Claude), reviewed and tested by Maliha
import type { Order } from "../App"
import { api, ApiError } from "./client"

// Order as returned by order-service
export type ApiOrder = {
  id: string
  requesterId: string
  courierId: string | null
  supplierId: string
  pickupStore: string
  pickupLocation: string
  requesterName: string
  courierName: string | null
  destination: string
  requestDetails: string
  credits: number
  expiryTime: string
  status: "UNASSIGNED" | "ASSIGNED" | "PICKED_UP" | "DELIVERED" | "CANCELLED"
  cancellationReason: "REQUESTER" | "EXPIRY" | null
  createdAt: string
  acceptedAt: string | null
  pickedUpAt: string | null
  deliveredAt: string | null
  cancelledAt: string | null
}

export type OrderAction = "accept" | "pickup" | "deliver" | "cancel"

// open = everyone else's unassigned orders, requested = mine, assigned = ones I'm delivering
export type OrderScope = "open" | "requested" | "assigned"

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleString("en-SG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })

// order-service status -> the ones StatusBadge knows. An unassigned order past
// its expiry never found a courier, so it shows as expired even before the
// backend gets round to cancelling it.
export function orderStatus(o: ApiOrder): Order["status"] {
  switch (o.status) {
    case "UNASSIGNED": return new Date(o.expiryTime) < new Date() ? "expired" : "open"
    case "ASSIGNED":   return "accepted"
    case "PICKED_UP":  return "picked-up"
    case "DELIVERED":  return "delivered"
    case "CANCELLED":  return o.cancellationReason === "EXPIRY" ? "expired" : "cancelled"
  }
}

const toOrder = (o: ApiOrder): Order => ({
  id: o.id,
  pickupLocation: o.pickupLocation,
  pickupStore: o.pickupStore,
  deliveryLocation: o.destination,
  description: o.requestDetails,
  credits: o.credits,
  deadline: formatTime(o.expiryTime),
  status: orderStatus(o),
  requesterId: o.requesterId,
  requesterName: o.requesterName,
  courierId: o.courierId ?? undefined,
  courierName: o.courierName ?? undefined,
  createdAt: formatTime(o.createdAt),
})

export const listOrders = (scope: OrderScope) =>
  api<{ orders: ApiOrder[] }>(`/orders?scope=${scope}`).then((r) => r.orders.map(toOrder))

export const updateOrder = (id: string, action: OrderAction) =>
  api<{ order: ApiOrder }>(`/orders/${id}/${action}`, { method: "POST", body: "{}" })
    .then((r) => toOrder(r.order))

export type NewOrder = {
  supplierId: string
  destination: string
  requestDetails: string
  credits: number
  expiryTime: string
}

// The key lets order-service spot a retried submit, so the same request
// should be sent with the same key. Comes back pending if credits are still
// being reserved.
export const createOrder = (order: NewOrder, idempotencyKey: string) =>
  api<{ order?: ApiOrder; creationId?: string }>("/orders", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(order),
  }).then((r) => ({ order: r.order ? toOrder(r.order) : undefined, pending: !r.order }))

// order-service sends back short codes like "invalid-transition", so turn
// those into something readable
const ERRORS: Record<string, string> = {
  "dependency-unavailable": "This isn't available yet, order-service can't reach the other services.",
  "dependency-rejected": "That supplier isn't taking orders right now.",
  "invalid-transition": "This order has already changed. Refresh to see the latest.",
  "expired": "This order has expired.",
  "conflict": "Someone else got to this order first.",
  "forbidden": "You can't do that on this order.",
  "not-found": "This order doesn't exist anymore.",
  "invalid-input": "Something in the request was invalid.",
}

export function orderError(err: unknown) {
  if (!(err instanceof ApiError)) return "Something went wrong."
  // a 404 with no error code means order-service has no such endpoint yet (e.g. pickup)
  if (err.status === 404 && !ERRORS[err.message]) return "This step isn't available on order-service yet."
  return ERRORS[err.message] ?? err.message
}

// Admin only: no scope = every order across all statuses, newest first
export const getAllOrders = () =>
  api<{ orders: ApiOrder[] }>("/orders").then((r) => r.orders)