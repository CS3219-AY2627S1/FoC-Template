/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 g (instructions.md) - frontend client for the scheduled-errands series API
 *        (order-service/src/routes/series.routes.ts, mounted at /orders/series), mirroring
 *        api/orders.js's shape exactly (thin wrappers over request() from ./http). Series
 *        errors carry only `{ message }` (no machine-readable code - instructions.md's "Error
 *        shape" row), so seriesErrorMessage just falls back to that message, unlike
 *        orders.js's code-keyed ERROR_TEXT table. No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review:
 */

import { request } from './http'

// 201 with the created series. payload: { supplierId, description, deliveryLocationId,
// deliveryDetails, credits, rrule, durationMinutes?, additionalDetails?, startAt? | startNow? }
export const createSeries = (payload) => request('/orders/series', { method: 'POST', json: payload })

// { ok, series: [...] }, each with upcomingDates (next 3) and activeOrderCount. Paused series
// included; a one-time series shows until it posts. Retry state and nextFireAt are not exposed.
export const listMySeries = () => request('/orders/series/mine')

// The bare series object (same extra fields as listMySeries's entries).
export const getSeries = (seriesId) => request('/orders/series/' + encodeURIComponent(seriesId))

// Only the sent fields are validated/changed. `status: 'active' | 'inactive'` may be sent
// alongside other fields. 200 with the updated series, or { message } (409 SERIES_CONFLICT on
// a stale version).
export const editSeries = (seriesId, payload) =>
  request('/orders/series/' + encodeURIComponent(seriesId) + '/edit', { method: 'PATCH', json: payload })

// 200 { ok: true }. Orders already posted from this series keep their history; their
// "from series" tag disappears since seriesId is cleared.
export const deleteSeries = (seriesId) =>
  request('/orders/series/' + encodeURIComponent(seriesId), { method: 'DELETE' })

// Series errors have no machine-readable code (instructions.md: "Error shape: { message }"),
// so there is nothing to switch on - just the backend's own message, already human-readable.
export function seriesErrorMessage(error) {
  return error?.message || 'Something went wrong.'
}
