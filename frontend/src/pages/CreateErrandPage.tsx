/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-10-17
 * Scope (AI-18): Built and tested the requested errand creation preview and entry points.
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-10-23
 * Scope (AI-21): Displayed the real balance in the UI and tested its display.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 */

import { useEffect, useMemo, useRef, useState, type SubmitEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { AiErrandAssistant } from '../components/errands/AiErrandAssistant'
import { CreditOfferCard } from '../components/errands/CreditOfferCard'
import { FormField } from '../components/ui/FormField'
import type { AiErrandDraft } from '../features/ai-assistant/ai-assistant.api'
import { createErrand, ErrandApiError } from '../features/errands/errand.api'
import { useCredits } from '../features/credits/useCredits'
import type {
  CreateErrandRequest,
  ErrandDraft,
  ErrandDraftErrors,
  ErrandDraftField,
  ErrandValidationIssue,
} from '../features/errands/errand.types'
import { listSupplierBuildings, listSuppliers } from '../features/suppliers/supplier.api'
import type { Supplier, SupplierReference } from '../features/suppliers/supplier.types'

const inputClassName =
  'h-12 w-full rounded-xl border border-[#dde3de] bg-white px-3.5 text-sm text-[#17211d] outline-none transition placeholder:text-[#929c95] focus:border-[#175c45] focus:ring-4 focus:ring-[#175c45]/10 aria-invalid:border-[#d92d20] aria-invalid:ring-[#d92d20]/10'

const textareaClassName = `${inputClassName} h-[82px] resize-y py-3.5 leading-5`

const apiFieldToDraftField: Partial<Record<string, ErrandDraftField>> = {
  supplier_id: 'supplierId',
  required_item: 'requiredItem',
  credit_value: 'creditValue',
  delivery_building_id: 'deliveryBuildingId',
  delivery_floor: 'deliveryFloor',
  delivery_description: 'deliveryDescription',
  expires_at: 'expiresAt',
}

function toLocalDateTimeValue(date: Date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 16)
}

function validateDraft(draft: ErrandDraft, availableCredits: number) {
  const errors: ErrandDraftErrors = {}
  const creditValue = Number(draft.creditValue)
  const expiresAt = new Date(draft.expiresAt)
  const now = new Date()
  const maximumExpiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  if (!draft.supplierId) errors.supplierId = 'Choose a pickup supplier.'
  if (!draft.requiredItem.trim()) errors.requiredItem = 'Describe the items you need.'
  if (!draft.deliveryBuildingId) errors.deliveryBuildingId = 'Choose a delivery building.'
  if (!draft.deliveryFloor.trim()) errors.deliveryFloor = 'Enter the delivery floor.'
  if (!draft.deliveryDescription.trim()) {
    errors.deliveryDescription = 'Add instructions so the courier can find you.'
  }

  if (!draft.expiresAt || Number.isNaN(expiresAt.getTime())) {
    errors.expiresAt = 'Choose a collection deadline.'
  } else if (expiresAt <= now) {
    errors.expiresAt = 'The collection deadline must be in the future.'
  } else if (expiresAt > maximumExpiry) {
    errors.expiresAt = 'The collection deadline cannot be more than seven days away.'
  }

  if (!Number.isInteger(creditValue) || creditValue < 1) {
    errors.creditValue = 'Enter a whole number of at least 1 credit.'
  } else if (creditValue > availableCredits) {
    errors.creditValue = `You only have ${availableCredits} credits available.`
  }

  return errors
}

function mapValidationIssues(issues: ErrandValidationIssue[]) {
  return issues.reduce<ErrandDraftErrors>((errors, issue) => {
    const apiField = [...issue.loc].reverse().find((part) => typeof part === 'string')
    const draftField = apiField ? apiFieldToDraftField[apiField] : undefined

    if (draftField && !errors[draftField]) errors[draftField] = issue.msg
    return errors
  }, {})
}

function toCreateRequest(draft: ErrandDraft): CreateErrandRequest {
  return {
    supplier_id: draft.supplierId,
    required_item: draft.requiredItem.trim(),
    credit_value: Number(draft.creditValue),
    delivery_building_id: draft.deliveryBuildingId,
    delivery_floor: draft.deliveryFloor.trim() || null,
    delivery_description: draft.deliveryDescription.trim() || null,
    expires_at: new Date(draft.expiresAt).toISOString(),
  }
}

export function CreateErrandPage() {
  const {
    availableBalance,
    status: creditStatus,
    error: creditError,
    refreshBalance,
  } = useCredits()
  const [searchParams] = useSearchParams()
  const requestedSupplierId = searchParams.get('supplierId') ?? ''
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [deliveryBuildings, setDeliveryBuildings] = useState<SupplierReference[]>([])
  const [optionsStatus, setOptionsStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [optionsError, setOptionsError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [draft, setDraft] = useState<ErrandDraft>({
    supplierId: requestedSupplierId,
    requiredItem: '',
    deliveryBuildingId: '',
    deliveryFloor: '',
    deliveryDescription: '',
    expiresAt: '',
    creditValue: '5',
  })
  const [errors, setErrors] = useState<ErrandDraftErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [createdErrandId, setCreatedErrandId] = useState<string | null>(null)
  const [aiDraftNotice, setAiDraftNotice] = useState<string | null>(null)
  const submitControllerRef = useRef<AbortController | null>(null)

  const selectedSupplier = suppliers.find((supplier) => supplier.id === draft.supplierId)
  const optionsReady = optionsStatus === 'ready'
  const canSubmit =
    optionsReady &&
    suppliers.length > 0 &&
    deliveryBuildings.length > 0 &&
    creditStatus === 'ready' &&
    availableBalance !== null
  const dateBounds = useMemo(() => {
    const now = new Date()
    return {
      min: toLocalDateTimeValue(now),
      max: toLocalDateTimeValue(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)),
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    Promise.all([
      listSuppliers({ size: 100 }, controller.signal),
      listSupplierBuildings(controller.signal),
    ])
      .then(([supplierResponse, buildingResponse]) => {
        if (!active) return

        setSuppliers(supplierResponse.items)
        setDeliveryBuildings(buildingResponse.items)
        setDraft((current) => ({
          ...current,
          supplierId: supplierResponse.items.some(
            (supplier) => supplier.id === current.supplierId,
          )
            ? current.supplierId
            : '',
        }))
        setOptionsStatus('ready')
      })
      .catch((error: unknown) => {
        if (!active || (error instanceof DOMException && error.name === 'AbortError')) return

        setSuppliers([])
        setDeliveryBuildings([])
        setOptionsError(
          error instanceof Error ? error.message : 'Unable to load suppliers and buildings.',
        )
        setOptionsStatus('error')
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [retryCount])

  useEffect(
    () => () => {
      submitControllerRef.current?.abort()
    },
    [],
  )

  function updateDraft(field: ErrandDraftField, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setSubmitError(null)
    setCreatedErrandId(null)
  }

  function applyAiDraft(aiDraft: AiErrandDraft) {
    // A field is only overwritten when the assistant filled it; when the message named
    // no location (null), the current value is kept. The dropdowns hold UUIDs: if the
    // assistant returns an ID that is not one of the options, reset to "" so the
    // dropdown shows "Select a supplier" / "Select a building".
    const supplierId =
      aiDraft.supplier_id === null
        ? draft.supplierId
        : suppliers.some((supplier) => supplier.id === aiDraft.supplier_id)
          ? aiDraft.supplier_id
          : ''
    const deliveryBuildingId =
      aiDraft.delivery_building_id === null
        ? draft.deliveryBuildingId
        : deliveryBuildings.some((building) => building.id === aiDraft.delivery_building_id)
          ? aiDraft.delivery_building_id
          : ''
    const parsedExpiry = aiDraft.expires_at ? new Date(aiDraft.expires_at) : null
    const next: ErrandDraft = {
      supplierId,
      requiredItem: aiDraft.required_item ?? draft.requiredItem,
      deliveryBuildingId,
      deliveryFloor: aiDraft.delivery_floor ?? draft.deliveryFloor,
      deliveryDescription: aiDraft.delivery_description ?? draft.deliveryDescription,
      expiresAt:
        parsedExpiry && !Number.isNaN(parsedExpiry.getTime())
          ? toLocalDateTimeValue(parsedExpiry)
          : draft.expiresAt,
      creditValue: String(aiDraft.credit_value),
    }

    setDraft(next)
    setErrors({})
    setSubmitError(null)
    setCreatedErrandId(null)

    // Only fields that are still empty after applying the draft need the user's input.
    const missing = [
      !next.supplierId && 'pickup supplier',
      !next.requiredItem.trim() && 'items',
      !next.deliveryBuildingId && 'delivery building',
      !next.deliveryFloor.trim() && 'floor',
      !next.expiresAt && 'deadline',
    ].filter(Boolean)
    setAiDraftNotice(
      `Filled in by the AI assistant. Please review before creating. ${aiDraft.credit_reason}` +
        (missing.length > 0 ? ` Please fill in: ${missing.join(', ')}.` : ''),
    )
  }

  function retryOptionsRequest() {
    setOptionsStatus('loading')
    setOptionsError(null)
    setRetryCount((current) => current + 1)
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return

    setSubmitError(null)
    setCreatedErrandId(null)
    if (availableBalance === null) return
    const nextErrors = validateDraft(draft, availableBalance)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      const firstInvalidField = Object.keys(nextErrors)[0]
      document.querySelector<HTMLElement>(`[name="${firstInvalidField}"]`)?.focus()
      return
    }

    const controller = new AbortController()
    submitControllerRef.current = controller
    setIsSubmitting(true)

    try {
      const createdErrand = await createErrand(toCreateRequest(draft), controller.signal)
      if (!controller.signal.aborted) {
        setCreatedErrandId(createdErrand.id)
        void refreshBalance()
      }
    } catch (error) {
      if (controller.signal.aborted) return

      if (error instanceof ErrandApiError) {
        const backendErrors = mapValidationIssues(error.issues)

        if (Object.keys(backendErrors).length > 0) {
          setErrors((current) => ({ ...current, ...backendErrors }))
          const firstInvalidField = Object.keys(backendErrors)[0]
          document.querySelector<HTMLElement>(`[name="${firstInvalidField}"]`)?.focus()
        } else if (error.status === 401) {
          setSubmitError('Your session has expired. Please sign in again.')
        } else {
          setSubmitError(error.message)
        }
      } else {
        setSubmitError('Unable to create the errand right now. Please try again.')
      }
    } finally {
      if (submitControllerRef.current === controller) submitControllerRef.current = null
      if (!controller.signal.aborted) setIsSubmitting(false)
    }
  }

  return (
    <section>
      <div>
        <p className="text-xs font-medium tracking-[0.04em] text-[#175c45] sm:text-sm">
          NEW REQUEST
        </p>
        <h1 className="mt-2 text-[2rem] font-medium leading-tight tracking-[-0.035em] text-[#17211d] sm:text-[2.375rem]">
          Create an errand
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#68736c] sm:text-base">
          Tell couriers what you need and where it should go.
        </p>
      </div>

      <form
        className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_326px] xl:gap-6"
        onSubmit={handleSubmit}
        noValidate
      >
        <div className="rounded-[18px] border border-[#dde3de] bg-white p-4 shadow-[0_8px_24px_rgba(22,59,42,0.07)] sm:p-6">
          <h2 className="text-xl font-medium tracking-[-0.015em] text-[#17211d] sm:text-2xl">
            What do you need?
          </h2>

          {aiDraftNotice ? (
            <div
              className="mt-5 flex items-start justify-between gap-3 rounded-xl bg-[#ddf3e7] px-4 py-3 text-sm text-[#175c45]"
              role="status"
            >
              <p>{aiDraftNotice}</p>
              <button
                type="button"
                onClick={() => setAiDraftNotice(null)}
                aria-label="Dismiss AI assistant notice"
                className="cursor-pointer text-lg leading-none"
              >
                &times;
              </button>
            </div>
          ) : null}

          {optionsError ? (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3" role="alert">
              <p className="text-sm font-medium text-red-900">Could not load form options</p>
              <p className="mt-1 text-sm text-red-700">{optionsError}</p>
              <button
                type="button"
                onClick={retryOptionsRequest}
                className="mt-3 cursor-pointer rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-800"
              >
                Try again
              </button>
            </div>
          ) : null}

          {optionsReady && suppliers.length === 0 ? (
            <p className="mt-5 rounded-xl bg-[#f4f7f4] px-4 py-3 text-sm text-[#68736c]" role="status">
              No active suppliers are currently available.
            </p>
          ) : null}

          {optionsReady && deliveryBuildings.length === 0 ? (
            <p className="mt-5 rounded-xl bg-[#f4f7f4] px-4 py-3 text-sm text-[#68736c]" role="status">
              No delivery buildings are currently available.
            </p>
          ) : null}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <FormField
              htmlFor="supplier-id"
              label="Pickup supplier"
              error={errors.supplierId}
              required
            >
              <select
                id="supplier-id"
                name="supplierId"
                value={draft.supplierId}
                onChange={(event) => updateDraft('supplierId', event.target.value)}
                aria-invalid={Boolean(errors.supplierId)}
                aria-describedby={errors.supplierId ? 'supplier-id-error' : undefined}
                disabled={!optionsReady || suppliers.length === 0}
                className={`${inputClassName} cursor-pointer disabled:cursor-not-allowed disabled:bg-[#f4f7f4] disabled:text-[#929c95]`}
              >
                <option value="">
                  {optionsStatus === 'loading'
                    ? 'Loading suppliers…'
                    : suppliers.length === 0
                      ? 'No suppliers available'
                      : 'Select a supplier'}
                </option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField htmlFor="supplier-category" label="Category">
              <input
                id="supplier-category"
                type="text"
                value={selectedSupplier?.category.name ?? ''}
                placeholder="Choose a supplier first"
                readOnly
                aria-readonly="true"
                className={`${inputClassName} cursor-default bg-[#f8faf8] text-[#68736c]`}
              />
            </FormField>
          </div>

          <div className="mt-4">
            <FormField
              htmlFor="required-item"
              label="Requested items"
              error={errors.requiredItem}
              required
            >
              <textarea
                id="required-item"
                name="requiredItem"
                value={draft.requiredItem}
                onChange={(event) => updateDraft('requiredItem', event.target.value)}
                placeholder="e.g. Two sandwiches and one coffee"
                aria-invalid={Boolean(errors.requiredItem)}
                aria-describedby={errors.requiredItem ? 'required-item-error' : undefined}
                className={textareaClassName}
              />
            </FormField>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
            <FormField
              htmlFor="delivery-building"
              label="Delivery building"
              error={errors.deliveryBuildingId}
              required
            >
              <select
                id="delivery-building"
                name="deliveryBuildingId"
                value={draft.deliveryBuildingId}
                onChange={(event) => updateDraft('deliveryBuildingId', event.target.value)}
                aria-invalid={Boolean(errors.deliveryBuildingId)}
                aria-describedby={
                  errors.deliveryBuildingId ? 'delivery-building-error' : undefined
                }
                disabled={!optionsReady || deliveryBuildings.length === 0}
                className={`${inputClassName} cursor-pointer disabled:cursor-not-allowed disabled:bg-[#f4f7f4] disabled:text-[#929c95]`}
              >
                <option value="">
                  {optionsStatus === 'loading'
                    ? 'Loading buildings…'
                    : deliveryBuildings.length === 0
                      ? 'No buildings available'
                      : 'Select a building'}
                </option>
                {deliveryBuildings.map((building) => (
                  <option key={building.id} value={building.id}>
                    {building.name}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField
              htmlFor="delivery-floor"
              label="Floor"
              error={errors.deliveryFloor}
              required
            >
              <input
                id="delivery-floor"
                name="deliveryFloor"
                type="text"
                value={draft.deliveryFloor}
                onChange={(event) => updateDraft('deliveryFloor', event.target.value)}
                placeholder="e.g. 3"
                aria-invalid={Boolean(errors.deliveryFloor)}
                aria-describedby={errors.deliveryFloor ? 'delivery-floor-error' : undefined}
                className={inputClassName}
              />
            </FormField>
          </div>

          <div className="mt-4">
            <FormField
              htmlFor="expires-at"
              label="Collect before"
              error={errors.expiresAt}
              hint="Choose a time within the next seven days."
              required
            >
              <input
                id="expires-at"
                name="expiresAt"
                type="datetime-local"
                min={dateBounds.min}
                max={dateBounds.max}
                value={draft.expiresAt}
                onChange={(event) => updateDraft('expiresAt', event.target.value)}
                aria-invalid={Boolean(errors.expiresAt)}
                aria-describedby={errors.expiresAt ? 'expires-at-error' : 'expires-at-hint'}
                className={inputClassName}
              />
            </FormField>
          </div>

          <div className="mt-4">
            <FormField
              htmlFor="delivery-description"
              label="Delivery instructions"
              error={errors.deliveryDescription}
              required
            >
              <textarea
                id="delivery-description"
                name="deliveryDescription"
                value={draft.deliveryDescription}
                onChange={(event) => updateDraft('deliveryDescription', event.target.value)}
                placeholder="e.g. Meet outside room 03-12 and message me when you arrive"
                aria-invalid={Boolean(errors.deliveryDescription)}
                aria-describedby={
                  errors.deliveryDescription ? 'delivery-description-error' : undefined
                }
                className={textareaClassName}
              />
            </FormField>
          </div>
        </div>

        <aside className="space-y-3.5 xl:sticky xl:top-[106px]">
          <CreditOfferCard
            availableCredits={availableBalance}
            balanceLoading={creditStatus === 'loading'}
            balanceError={creditError}
            onRetryBalance={() => void refreshBalance()}
            value={draft.creditValue}
            error={errors.creditValue}
            onChange={(value) => updateDraft('creditValue', value)}
          />

          <button
            type="submit"
            disabled={!canSubmit || isSubmitting || Boolean(createdErrandId)}
            className="flex h-12 w-full cursor-pointer items-center justify-center rounded-lg bg-[#d8f06b] px-4 text-sm font-semibold text-[#0d3c2d] transition hover:bg-[#cce85b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#175c45] disabled:cursor-not-allowed disabled:bg-[#e6eadf] disabled:text-[#929c95]"
          >
            {isSubmitting ? 'Creating errand…' : createdErrandId ? 'Errand created' : 'Create errand'}
          </button>

          {createdErrandId ? (
            <div className="rounded-xl bg-[#ddf3e7] px-4 py-3 text-sm text-[#175c45]">
              <p role="status">Errand created successfully. Reference: {createdErrandId}</p>
              <Link className="mt-2 inline-block font-semibold underline" to={`/errands/${createdErrandId}`}>
                View errand
              </Link>
            </div>
          ) : null}

          {submitError ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              {submitError}
            </p>
          ) : null}
        </aside>
      </form>

      <AiErrandAssistant onDraft={applyAiDraft} disabled={!optionsReady} />
    </section>
  )
}
