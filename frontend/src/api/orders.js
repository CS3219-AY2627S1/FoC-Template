/*
 * AI Assistance Disclosure:
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented precise delivery details per the team spec.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Tool: Copilot SDK (model: unspecified by runtime), date: 2026-10-16
 * Scope: Added the frontend client for the order-service list endpoint. The endpoint path and
 * response shape follow order-service/src/routes/orders.routes.ts and its controller.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 *
 * Tool: Copilot SDK (model: unspecified by runtime), date: 2026-10-20
 * Scope: Added the frontend client for creating orders with the existing POST /orders contract.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-09
 * Scope (2026-11-09): createOrder's comment describes the synchronous POST /orders (George,
 *        2026-11-09); reserveFailureMessage, used only by the removed socket wait, is gone.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 */

/*
 * AI Assistance Disclosure:
 * Tool: Copilot SDK (model: unspecified by runtime), date: 2026-10-20
 * Scope: Added the edit-order API client for PATCH /orders/:id/edit.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 *
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope: Order Service frontend integration - clients for create (202, pending), the filtered
 *        and cursor-paged listing, the caller's own orders, active deliveries and the lifecycle
 *        transitions, restating order-service/src/routes/orders.routes.ts. User-facing wording
 *        for the service's error codes and reserve-failure reasons.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): editOrder for PATCH /orders/:id/edit, carried over from Wen Xi's client.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): Rebased onto PR #115. George chose to keep this implementation, so the
 *        version of this file described in Wen Xi's entries above was replaced.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): `failed` status - reserve-failure reasons arrive on order:failed.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 */

/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Stage 24 of instructions.md - added getOrder (GET /orders/:id) and listUserOrders
 *        (GET /orders/admin/users/:userId), for the new admin user-history pages.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { request } from './http'

// 201 with the open order: credits are reserved before the response. 409 while another order of
// the caller's is pending, 422 / 503 when the reserve is refused / credit-service is down.
// payload: { supplierId, description, deliveryLocationId, deliveryDetails, credits, completeBy?, additionalDetails? }
export const createOrder = (payload) => request('/orders', { method: 'POST', json: payload })

// Listing (needs a token). query: { status, location, minCredits, maxCredits, expiresBefore, expiresAfter,
// sort, order, cursor } -> { ok, orders, nextCursor }
export const listOrders = (query = {}) => request('/orders', { query })

// The caller's own orders, newest first (pending included). as: 'requester' | 'courier'
export const listMyOrders = (as = 'requester') => request('/orders/mine', { query: { as } })

// The caller's accepted / picked-up / delivered deliveries (F12.1.3).
export const listActiveDeliveries = () => request('/orders/active')

const transition = (action) => (id) =>
  request('/orders/' + encodeURIComponent(id) + '/' + action, { method: 'POST' })

// F18: edit an open errand. payload: { supplierId?, description?, deliveryLocationId?, deliveryDetails, completeBy?,
// additionalDetails? } (credits are fixed). 200 with the updated order, or { message }.
export const editOrder = (id, payload) =>
  request('/orders/' + encodeURIComponent(id) + '/edit', { method: 'PATCH', json: payload })

// The bare order object. Admins can fetch any order. 404 { message } for a missing or
// non-viewable order.
export const getOrder = (id) => request('/orders/' + encodeURIComponent(id))

// Admin/super admin only. 200 { totalCount, currentPage, pageSize: 10, totalPages, orders:
// [{ order, role }] }, newest first, every status. 400 bad id/page, 403, 404 user not found,
// 503 user-service unavailable. Errors here have no `code`, only `message` - tell them apart
// by status.
export const listUserOrders = (userId, page) =>
  request('/orders/admin/users/' + encodeURIComponent(userId), { query: { page } })

// Each answers 200 { ok: true, order } or an error { ok: false, error: <code> }.
export const acceptOrder = transition('accept')
export const pickupOrder = transition('pickup')
export const deliverOrder = transition('deliver')
export const completeOrder = transition('complete')
export const cancelOrder = transition('cancel')

const ERROR_TEXT = {
  FORBIDDEN: 'You can’t do that on this errand.',
  INVALID_TRANSITION: 'This errand has already moved on. Refresh to see where it is.',
  ORDER_CONFLICT: 'Someone else changed this errand at the same time. Refresh and try again.',
  ORDER_EXPIRED: 'This errand has expired.',
  ORDER_NOT_FOUND: 'This errand no longer exists.',
  DEADLINE_NOT_REACHED: 'An errand in progress can only be cancelled after its deliver-by time.',
}

// Accept has its own 403 wording: the only forbidden accept is accepting your own errand.
const ACCEPT_TEXT = {
  ...ERROR_TEXT,
  FORBIDDEN: 'You can’t accept your own errand.',
  INVALID_TRANSITION: 'Someone else accepted this errand first.',
  ORDER_CONFLICT: 'Someone else accepted this errand first.',
}

export function orderErrorMessage(error, action) {
  const code = error?.body?.error
  const table = action === 'accept' ? ACCEPT_TEXT : ERROR_TEXT
  return (typeof code === 'string' && table[code]) || error?.message || 'Something went wrong.'
}
