/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Create-errand form values, defaults, and checks mirroring order-service validateCreateErrand,
 *        keyed by the same field names the server uses in its 400 details.
 * Author review: Reviewed and approved by @mattis.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: N2 filling of the form from an extraction (only fields with a value, never ones the
 *        requester edited meanwhile), per the approved N2 spec. Author review: Reviewed and approved by @mattis.
 */
import { ERRAND_LIMITS, type CreateErrandRequest, type ExtractedErrand } from './types'

export interface ItemDraft {
  /** Stable React key; not sent */
  readonly key: number
  readonly name: string
  readonly quantity: string
}

export interface ErrandFormValues {
  readonly supplierId: string
  readonly items: readonly ItemDraft[]
  readonly dropoffLocation: string
  readonly notes: string
  readonly creditAmount: string
  /** `<input type="datetime-local">` values, in the browser's time zone */
  readonly listingDeadline: string
  readonly pickupDeadline: string
  readonly deliveryDeadline: string
}

/** Field name (as in Order Service's 400 details, e.g. "items[0].name") -> message */
export type ErrandFormErrors = Readonly<Record<string, string>>

export type ErrandFormResult =
  | { readonly ok: true; readonly request: CreateErrandRequest }
  | { readonly ok: false; readonly errors: ErrandFormErrors }

const HOUR_MS = 60 * 60 * 1000
const STEP_MS = 15 * 60 * 1000

/** Empty form. Deadlines default to 1, 2 and 3 hours from now, rounded up to the quarter hour. */
export function defaultFormValues(now: Date, supplierId = ''): ErrandFormValues {
  const base = Math.ceil(now.getTime() / STEP_MS) * STEP_MS
  return {
    supplierId,
    items: [{ key: 0, name: '', quantity: '1' }],
    dropoffLocation: '',
    notes: '',
    creditAmount: '',
    listingDeadline: toDateTimeLocal(new Date(base + HOUR_MS)),
    pickupDeadline: toDateTimeLocal(new Date(base + 2 * HOUR_MS)),
    deliveryDeadline: toDateTimeLocal(new Date(base + 3 * HOUR_MS)),
  }
}

/** Checks the form as Order Service would, and builds the request body when it passes. */
export function validateErrandForm(values: ErrandFormValues, now: Date): ErrandFormResult {
  const errors: Record<string, string> = {}

  if (!values.supplierId) errors.supplierId = 'Choose where the items come from.'

  if (values.items.length < 1 || values.items.length > ERRAND_LIMITS.maxItems) {
    errors.items = `Add between 1 and ${ERRAND_LIMITS.maxItems} items.`
  }
  const items = values.items.map((item, index) => {
    const name = item.name.trim()
    if (name.length < 1) errors[`items[${index}].name`] = 'Enter what to get.'
    else if (name.length > ERRAND_LIMITS.maxItemName) {
      errors[`items[${index}].name`] = `Use at most ${ERRAND_LIMITS.maxItemName} characters.`
    }
    const quantity = wholeNumber(item.quantity)
    if (quantity === null || quantity < 1 || quantity > ERRAND_LIMITS.maxItemQuantity) {
      errors[`items[${index}].quantity`] = `1 to ${ERRAND_LIMITS.maxItemQuantity}.`
    }
    return { name, quantity: quantity ?? 0 }
  })

  const dropoffLocation = values.dropoffLocation.trim()
  if (dropoffLocation.length < 1) errors.dropoffLocation = 'Say where the items should be dropped off.'
  else if (dropoffLocation.length > ERRAND_LIMITS.maxDropoff) {
    errors.dropoffLocation = `Use at most ${ERRAND_LIMITS.maxDropoff} characters.`
  }

  const notes = values.notes.trim()
  if (notes.length > ERRAND_LIMITS.maxNotes) errors.notes = `Use at most ${ERRAND_LIMITS.maxNotes} characters.`

  const creditAmount = wholeNumber(values.creditAmount)
  if (creditAmount === null || creditAmount < ERRAND_LIMITS.minCredit || creditAmount > ERRAND_LIMITS.maxCredit) {
    errors.creditAmount = `Offer a whole number of credits from ${ERRAND_LIMITS.minCredit} to ${ERRAND_LIMITS.maxCredit}.`
  }

  const listing = futureDeadline(values.listingDeadline, 'listingDeadline', now, errors)
  const pickup = futureDeadline(values.pickupDeadline, 'pickupDeadline', now, errors)
  const delivery = futureDeadline(values.deliveryDeadline, 'deliveryDeadline', now, errors)
  if (listing && pickup && pickup < listing) errors.pickupDeadline = 'Pickup cannot be before the listing deadline.'
  if (pickup && delivery && delivery < pickup) errors.deliveryDeadline = 'Delivery cannot be before the pickup deadline.'

  if (Object.keys(errors).length > 0 || !listing || !pickup || !delivery || creditAmount === null) {
    return { ok: false, errors }
  }
  return {
    ok: true,
    request: {
      supplierId: values.supplierId,
      items,
      dropoffLocation,
      ...(notes ? { notes } : {}),
      creditAmount,
      listingDeadline: listing.toISOString(),
      pickupDeadline: pickup.toISOString(),
      deliveryDeadline: delivery.toISOString(),
    },
  }
}

/** The form fields an extraction can fill; each gets its own "From your description" label. */
export const FILLABLE_FIELDS = [
  'supplierId',
  'items',
  'dropoffLocation',
  'notes',
  'creditAmount',
  'listingDeadline',
  'pickupDeadline',
  'deliveryDeadline',
] as const
export type FillableField = (typeof FILLABLE_FIELDS)[number]

/** The fields the extraction gave a value that will be filled, i.e. not ones in `skip` (edited by hand meanwhile). */
export function fieldsToFill(extracted: ExtractedErrand, skip: ReadonlySet<FillableField>): Set<FillableField> {
  return new Set(FILLABLE_FIELDS.filter((field) => extracted[field] !== null && !skip.has(field)))
}

/**
 * Fills the form from an extraction. A null field leaves the form as it is (including its default deadlines
 * and quantity); a field in `skip` is never touched. Returned items replace all item rows; an item with no
 * quantity gets the form's default, 1. Deadlines are shown in the browser's time zone.
 */
export function applyExtraction(
  values: ErrandFormValues,
  extracted: ExtractedErrand,
  skip: ReadonlySet<FillableField>,
): ErrandFormValues {
  const fill = fieldsToFill(extracted, skip)
  const next = { ...values }
  if (fill.has('supplierId')) next.supplierId = extracted.supplierId!
  if (fill.has('items')) {
    const firstKey = Math.max(-1, ...values.items.map((item) => item.key)) + 1
    next.items = extracted.items!.map((item, index) => ({
      key: firstKey + index,
      name: item.name,
      quantity: String(item.quantity ?? 1),
    }))
  }
  if (fill.has('dropoffLocation')) next.dropoffLocation = extracted.dropoffLocation!
  if (fill.has('notes')) next.notes = extracted.notes!
  if (fill.has('creditAmount')) next.creditAmount = String(extracted.creditAmount)
  for (const field of ['listingDeadline', 'pickupDeadline', 'deliveryDeadline'] as const) {
    if (fill.has(field)) next[field] = toDateTimeLocal(new Date(extracted[field]!))
  }
  return next
}

/** "2026-11-09T14:30" in the browser's time zone */
export function toDateTimeLocal(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function futureDeadline(raw: string, field: string, now: Date, errors: Record<string, string>): Date | null {
  // A datetime-local value without an offset is read as local time
  const date = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw) ? new Date(raw) : null
  if (date === null || Number.isNaN(date.getTime())) {
    errors[field] = 'Pick a date and time.'
    return null
  }
  if (date.getTime() <= now.getTime()) {
    errors[field] = 'This must be in the future.'
    return null
  }
  return date
}

function wholeNumber(raw: string): number | null {
  return /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : null
}
