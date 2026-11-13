// AI-assisted (Claude Opus 5.5), 2026-11-12: keep supplierId for the pickup place lookup; see ui/ai-usage/usage-log.md, entry 002
// AI Assistance Disclosure: ChatGPT (Codex, GPT-6), 2026-11-12.
// Scope: UI order editing, credit-history details, confirmation wrapping, and regression checks.
// Human review pending. Exact prompts and verification: ui/ai-usage/ui-order-fix.md.
// ChatGPT (Codex), 2026-11-06: Complete lifecycle snapshots and UI contract handling; review pending; see order-service/usage-log.md.
// ChatGPT (Codex), 2026-11-03: Single-order retrieval with approved visibility rules; review pending; see order-service/usage-log.md.
// ChatGPT (Codex), 2026-11-02: Selected destination ID contract; review pending; see ../../order-service/usage-log.md.
// AI-assisted (Claude), reviewed and tested by Maliha
import type { Order } from "../App"
import { api, apiResponse, ApiError } from "./client"

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
  destinationLocationId: string | null
  destination: string
  requestDetails: string
  credits: number
  expiryTime: string
  status: "UNASSIGNED" | "ASSIGNED" | "PICKED_UP" | "DELIVERED" | "CANCELLED"
  cancellationReason: "REQUESTER" | "EXPIRY" | null
  creditState: "RESERVED" | "SETTLEMENT_PENDING" | "SETTLED" | "REFUND_PENDING" | "REFUNDED"
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
  supplierId: o.supplierId,
  deliveryLocation: o.destination,
  description: o.requestDetails,
  credits: o.credits,
  deadline: formatTime(o.expiryTime),
  expiryTime: o.expiryTime,
  status: orderStatus(o),
  requesterId: o.requesterId,
  requesterName: o.requesterName,
  courierId: o.courierId ?? undefined,
  courierName: o.courierName ?? undefined,
  creditState: o.creditState,
  createdAt: formatTime(o.createdAt),
})

export const listOrders = (scope: OrderScope, signal?: AbortSignal) =>
  api<{ orders: ApiOrder[] }>(`/orders?scope=${scope}`, { signal }).then((r) => r.orders.map(toOrder))

export const getOrder = (id: string, signal?: AbortSignal) =>
  api<{ order: ApiOrder }>(`/orders/${encodeURIComponent(id)}`, { signal })
    .then((r) => toOrder(r.order))

export const updateOrder = (id: string, action: OrderAction) =>
  api<{ order: ApiOrder }>(`/orders/${id}/${action}`, { method: "POST", body: "{}" })
    .then((r) => toOrder(r.order))

export type NewOrder = {
  destinationLocationId: string
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
  "invalid-destination": "Select a building from the destination search results.",
  "dependency-unavailable": "This isn't available yet, order-service can't reach the other services.",
  "dependency-rejected": "A service rejected this request. Check the order details and your credit balance.",
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

// Only a confirmed settlement may be presented as credits received.
export function deliveryFeedback(order: Pick<Order, 'creditState' | 'credits'> | null) {
  return order?.creditState === "SETTLED"
    ? { accent: `+${order.credits} Credits`, subtitle: "Credits have been added to your balance." }
    : { accent: "Credit transfer pending", subtitle: "Your delivery is recorded. Credits have not been confirmed yet; check your balance again later." }
}

export function isValidOrderDeadline(timestamp: number, now: number) {
  return Number.isFinite(timestamp) && timestamp - now >= 60 * 60 * 1000
}

export type OrderPatch = Pick<NewOrder, "requestDetails" | "credits" | "expiryTime">

export async function editOrder(id: string, patch: OrderPatch, key: string) {
  const response = await apiResponse<{ order: ApiOrder }>(`/orders/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Idempotency-Key": key },
    body: JSON.stringify(patch),
  })
  return { pending: response.status === 202 }
}

// crypto.randomUUID only exists on secure pages (HTTPS or localhost), and the
// deployed link is plain http, so fall back to a v4 UUID from getRandomValues
export function newRequestKey() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID()
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16),
  )
}
