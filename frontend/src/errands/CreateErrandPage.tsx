/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Member page to post an errand (OS-F1): supplier, items, drop-off, notes, credits and
 *        the three deadlines, with client checks and the server's field errors shown inline.
 * Author review: Reviewed and approved by @mattis.
 */
import { useId, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ApiError } from '../api/client'
import { createErrand } from '../api/errandApi'
import { FormField } from '../components/FormField'
import { TopBar } from '../components/TopBar'
import { describeCreateError, type ErrorCopy } from './errandErrors'
import {
  defaultFormValues,
  validateErrandForm,
  type ErrandFormErrors,
  type ErrandFormValues,
  type ItemDraft,
} from './errandFormModel'
import { SupplierPicker } from './SupplierPicker'
import { ERRAND_LIMITS } from './types'

export function CreateErrandPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [values, setValues] = useState<ErrandFormValues>(() =>
    defaultFormValues(new Date(), searchParams.get('supplierId') ?? ''),
  )
  const [errors, setErrors] = useState<ErrandFormErrors>({})
  const [failure, setFailure] = useState<ErrorCopy | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const notesId = useId()

  function set<K extends keyof ErrandFormValues>(field: K, value: ErrandFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }))
  }

  function setItem(index: number, change: Partial<ItemDraft>) {
    set(
      'items',
      values.items.map((item, i) => (i === index ? { ...item, ...change } : item)),
    )
  }

  function addItem() {
    const key = Math.max(...values.items.map((item) => item.key)) + 1
    set('items', [...values.items, { key, name: '', quantity: '1' }])
  }

  function removeItem(index: number) {
    set(
      'items',
      values.items.filter((_, i) => i !== index),
    )
    // Item errors are keyed by position, so they no longer line up
    setErrors({})
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setFailure(null)
    const result = validateErrandForm(values, new Date())
    if (!result.ok) {
      setErrors(result.errors)
      setFailure({ title: 'Check the highlighted fields', message: '' })
      return
    }
    setErrors({})
    setSubmitting(true)
    try {
      const errand = await createErrand(result.request)
      navigate(`/errands/${errand.id}`, { state: { from: '/errands/mine' } })
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') setErrors(error.details)
      if (error instanceof ApiError && (error.code === 'SUPPLIER_UNAVAILABLE' || error.code === 'SUPPLIER_ARCHIVED')) {
        setErrors({ supplierId: 'Choose another supplier.' })
      }
      setFailure(describeCreateError(error))
      setSubmitting(false)
    }
  }

  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <Link
          to="/errands/mine"
          className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-navy-700 hover:bg-navy-100"
        >
          ← Back to My errands
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy-900">Post an errand</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Say what you need and where it goes. The credits you offer are held when you post, paid to the courier when you
          confirm delivery, and released back to you if the errand is cancelled or expires.
        </p>

        <form onSubmit={submit} noValidate className="mt-6 space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          {failure && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              <p className="font-semibold">{failure.title}</p>
              {failure.message && <p className="mt-1">{failure.message}</p>}
              {errors.body && <p className="mt-1">{errors.body}</p>}
            </div>
          )}

          <SupplierPicker supplierId={values.supplierId} error={errors.supplierId} onChange={(id) => set('supplierId', id)} />

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-navy-900">What to get</legend>
            {values.items.map((item, index) => (
              <div key={item.key} className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_auto]">
                <FormField
                  label={`Item ${index + 1}`}
                  value={item.name}
                  maxLength={ERRAND_LIMITS.maxItemName}
                  onChange={(event) => setItem(index, { name: event.target.value })}
                  error={errors[`items[${index}].name`]}
                />
                <FormField
                  label="Qty"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={ERRAND_LIMITS.maxItemQuantity}
                  value={item.quantity}
                  onChange={(event) => setItem(index, { quantity: event.target.value })}
                  error={errors[`items[${index}].quantity`]}
                />
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  disabled={values.items.length <= 1}
                  aria-label={`Remove item ${index + 1}`}
                  className="col-span-2 min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 sm:col-span-1"
                >
                  Remove
                </button>
              </div>
            ))}
            {errors.items && <p className="text-xs text-red-600">{errors.items}</p>}
            <button
              type="button"
              onClick={addItem}
              disabled={values.items.length >= ERRAND_LIMITS.maxItems}
              className="min-h-10 rounded-lg border border-dashed border-navy-700 px-4 text-sm font-semibold text-navy-800 hover:bg-navy-50 disabled:opacity-40"
            >
              Add another item
            </button>
          </fieldset>

          <FormField
            label="Drop-off location"
            value={values.dropoffLocation}
            maxLength={ERRAND_LIMITS.maxDropoff}
            placeholder="e.g. COM1 level 2 study area, by the window"
            onChange={(event) => set('dropoffLocation', event.target.value)}
            error={errors.dropoffLocation}
          />

          <div className="space-y-1">
            <label htmlFor={notesId} className="block text-sm font-medium text-navy-900">
              Notes for the courier <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <textarea
              id={notesId}
              rows={3}
              value={values.notes}
              maxLength={ERRAND_LIMITS.maxNotes}
              onChange={(event) => set('notes', event.target.value)}
              aria-invalid={errors.notes ? true : undefined}
              className={`block w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 ${
                errors.notes ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:border-navy-700 focus:ring-navy-100'
              }`}
            />
            <div className="flex justify-between gap-2 text-xs">
              <span className="text-red-600">{errors.notes}</span>
              <span className="text-slate-500">
                {values.notes.length}/{ERRAND_LIMITS.maxNotes}
              </span>
            </div>
          </div>

          <div className="max-w-xs">
            <FormField
              label={`Credits offered (${ERRAND_LIMITS.minCredit}–${ERRAND_LIMITS.maxCredit})`}
              type="number"
              inputMode="numeric"
              min={ERRAND_LIMITS.minCredit}
              max={ERRAND_LIMITS.maxCredit}
              value={values.creditAmount}
              onChange={(event) => set('creditAmount', event.target.value)}
              error={errors.creditAmount}
            />
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-navy-900">Deadlines</legend>
            <p className="text-xs leading-5 text-slate-500">
              Each must be in the future and no earlier than the one before. If nobody accepts by the first, the errand
              expires and your credits come back.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField
                label="Accepted by"
                type="datetime-local"
                value={values.listingDeadline}
                onChange={(event) => set('listingDeadline', event.target.value)}
                error={errors.listingDeadline}
              />
              <FormField
                label="Picked up by"
                type="datetime-local"
                value={values.pickupDeadline}
                onChange={(event) => set('pickupDeadline', event.target.value)}
                error={errors.pickupDeadline}
              />
              <FormField
                label="Delivered by"
                type="datetime-local"
                value={values.deliveryDeadline}
                onChange={(event) => set('deliveryDeadline', event.target.value)}
                error={errors.deliveryDeadline}
              />
            </div>
          </fieldset>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
            <Link
              to="/errands/mine"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-5 py-2 text-sm font-semibold text-navy-800 hover:bg-navy-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-11 rounded-lg bg-accent-500 px-5 py-2 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-50"
            >
              {submitting ? 'Posting…' : 'Post errand'}
            </button>
          </div>
        </form>
      </main>
    </>
  )
}
