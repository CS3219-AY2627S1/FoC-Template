/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component requests.js from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: <pending — team member to sign>
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 g (instructions.md) - removed the dead `postAt` mock field and the unused
 *        `postAtLabel` helper (no scheduled single-post feature exists; `getRequest`, the
 *        mock `requests` array, `minutesUntil` and `expiryLabel` are still imported
 *        elsewhere, so kept). Added `failed` to STATUSES/STATUS_LABELS and a
 *        FAILURE_REASON_LABELS map for the new failed-order chip/reason text.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-11
 * Scope: removed the mock `requests` seed array, `getRequest` and the seed-only time helpers; the status/label/formatting helpers stay (the demo is gone, all services are live).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

export const STATUSES = [
  'open',
  'accepted',
  'picked_up',
  'delivered',
  'completed',
  'cancelled',
  'expired',
  'failed',
]

export const STATUS_LABELS = {
  open: 'Open',
  accepted: 'Accepted',
  picked_up: 'Picked up',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
  expired: 'Expired',
  failed: 'Failed',
}

// Stage 28 g: `failureReason` on a `failed` order (order-service's SeriesFailureReason
// values, series.service.ts/series-worker.ts) - a scheduled errand that never posted.
// Unrecognised/future reasons fall back to a generic line rather than showing the raw code.
export const FAILURE_REASON_LABELS = {
  SERIES_EDITED_WHILE_RETRYING: 'The recurring errand was edited while this occurrence was waiting to retry.',
  SERIES_DELETED_WHILE_RETRYING: 'The recurring errand was deleted while this occurrence was waiting to retry.',
  SERIES_COMPLETE_BY_IN_PAST: "Its deadline had already passed by the time it was due to post.",
  SERIES_USER_SUSPENDED: 'Your account was suspended at the time it was due to post.',
  SERIES_USER_LOCKED: 'Your account was locked at the time it was due to post.',
  SERIES_USER_PENDING: 'Your account was still pending verification at the time it was due to post.',
  SERIES_USER_NOT_FOUND: 'Your account could not be found at the time it was due to post.',
  SERIES_USER_SERVICE_UNAVAILABLE: "We couldn't reach the user service after several attempts.",
  SERIES_SUPPLIER_NOT_FOUND: 'The supplier could not be found.',
  SERIES_DELIVERY_LOCATION_NOT_FOUND: 'The delivery location could not be found.',
  SERIES_SUPPLIER_NO_OPENING_HOURS: 'The supplier has no opening hours set.',
  SERIES_SUPPLIER_CLOSED: 'The supplier was closed and could not reopen in time.',
  SERIES_SUPPLIER_SERVICE_UNAVAILABLE: "We couldn't reach the supplier after several attempts.",
  SERIES_RETRY_SUPERSEDED: 'The next scheduled occurrence became due before this one could be retried.',
  SERIES_PENDING_ORDER_CONFLICT: 'You already had another order pending at that time.',
}

export const failureReasonLabel = (reason) =>
  (reason && FAILURE_REASON_LABELS[reason]) || "This errand couldn't be posted."

// Small display helpers, kept beside the data so no extra module is introduced.
export const minutesUntil = (iso) => Math.round((new Date(iso).getTime() - Date.now()) / 60000)

export const expiryLabel = (iso) => {
  const m = minutesUntil(iso)
  if (m <= 0) return 'expired'
  if (m < 60) return 'expires in ' + m + ' min'
  const h = Math.floor(m / 60)
  return 'expires in ' + h + ' hr ' + (m % 60) + ' min'
}

export const clockTime = (iso) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

export const fullTime = (iso) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

// "Deliver by 15:30", or the ASAP wording when no deadline was set.
export const completeByLabel = (iso) => (iso ? 'deliver by ' + clockTime(iso) : 'deliver ASAP')

export const completeByShort = (iso) => (iso ? clockTime(iso) : 'ASAP')

export const LIFECYCLE = ['open', 'accepted', 'picked_up', 'delivered', 'completed']

export const LIFECYCLE_LABELS = {
  open: 'Posted',
  accepted: 'Accepted',
  picked_up: 'Picked up',
  delivered: 'Delivered',
  completed: 'Completed',
}
