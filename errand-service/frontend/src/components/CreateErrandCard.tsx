// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-13
// Scope: Generated initial implementation, decomposed App.tsx into separate components
// Author review: I validated correctness and edited for style.

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type {
  ErrandRemoteProps,
  EstimateCreditRequest,
  EstimateCreditResponse,
  ServiceType,
  Supplier,
} from '@relay/contracts'
import {
  ErrorMessage,
  LoadingState,
  RelayButton,
  RelayFormField,
  RelayFormSurface,
} from '@relay/ui'
import { SERVICE_TYPE_LABELS } from '../types'

type CreateForm = {
  name: string
  supplierId: string
  serviceType: ServiceType | ''
  pickupBuildingName: string
  pickupFloorNumber: string
  deliveryBuildingName: string
  deliveryFloorNumber: string
  description: string
  instructions: string
  creditAmount: string
  startAt: string
  expiresAt: string
}

function formatDateTimeLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function defaultStartValue() {
  return formatDateTimeLocal(new Date())
}

function defaultDeadlineValue() {
  const deadline = new Date(Date.now() + 2 * 60 * 60 * 1000)
  return formatDateTimeLocal(deadline)
}

// AI Assistance Disclosure (rongkangw):
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-10-26
// Scope: Integrated the estimation request, validation, accept/reject, and fallback with the UI.
// Author review: Reviewed outputs, corrected phrasing and syntax, and adjusted implementation
// details to fit project requirements.

export function CreateErrandCard({
  initialSupplierId,
  onClose,
  onCreated,
  errandApi,
  supplierApi,
  authenticatedSubject,
  creditBalance,
}: {
  initialSupplierId?: string
  onClose: () => void
  onCreated: () => void
  errandApi: ErrandRemoteProps['errandApi']
  supplierApi: ErrandRemoteProps['supplierApi']
  authenticatedSubject: ErrandRemoteProps['authenticatedSubject']
  creditBalance: ErrandRemoteProps['creditBalance']
}) {
  const availableCredit = creditBalance?.availableCredit
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loadingSuppliers, setLoadingSuppliers] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [isEstimating, setIsEstimating] = useState(false)
  const [estimate, setEstimate] = useState<EstimateCreditResponse | null>(null)
  const [estimateStatus, setEstimateStatus] = useState<
    'success' | 'rate-limited' | 'invalid' | 'unavailable' | null
  >(null)
  const [form, setForm] = useState<CreateForm>({
    name: '',
    supplierId: initialSupplierId ?? '',
    serviceType: '',
    pickupBuildingName: '',
    pickupFloorNumber: '',
    deliveryBuildingName: '',
    deliveryFloorNumber: '',
    description: '',
    instructions: '',
    creditAmount: '',
    startAt: defaultStartValue(),
    expiresAt: defaultDeadlineValue(),
  })

  const handleEstimateCredits = async () => {
    if (!authenticatedSubject) {
      setErrorMessage('Sign in before estimating credits.')
      return
    }
    if (availableCredit === undefined) {
      setErrorMessage('Your credit balance is still loading. Try again shortly.')
      return
    }

    // Validate required fields
    if (!form.name.trim()) {
      setErrorMessage('Please fill in the errand name before estimating.')
      return
    }
    if (!form.description.trim()) {
      setErrorMessage('Please fill in the description before estimating.')
      return
    }
    if (form.serviceType === '') {
      setErrorMessage('Please select a service type before estimating.')
      return
    }

    const startAt = new Date(form.startAt)
    const expiresAt = new Date(form.expiresAt)
    if (
      Number.isNaN(startAt.getTime()) ||
      Number.isNaN(expiresAt.getTime()) ||
      expiresAt.getTime() <= Math.max(startAt.getTime(), Date.now())
    ) {
      setErrorMessage('Choose a valid start time and a future deadline before estimating.')
      return
    }

    setIsEstimating(true)
    setErrorMessage('')
    setEstimate(null)
    setEstimateStatus(null)

    try {
      const response = await fetch('/api/errands/estimate-credit', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim(),
          serviceType: form.serviceType as ServiceType,
          instructions: form.instructions.trim(),
          startAt: startAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
          userId: authenticatedSubject,
          availableCredit,
        } satisfies EstimateCreditRequest),
      })

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { code?: string } | null
        if (errorData?.code === 'CREDIT_ESTIMATION_RATE_LIMITED' || response.status === 429) {
          setEstimateStatus('rate-limited')
          setErrorMessage('')
        } else if (errorData?.code === 'CREDIT_ESTIMATION_UNAVAILABLE' || response.status >= 500) {
          setEstimateStatus('unavailable')
          setErrorMessage('')
        } else {
          setErrorMessage(`Estimation failed: ${response.status}`)
        }
        return
      }

      const data = (await response.json()) as EstimateCreditResponse

      if (data.minCredits === -1 || data.maxCredits === -1) {
        setEstimate(null)
        setEstimateStatus('invalid')
        return
      }

      const suggestedCredits = Math.round((data.minCredits + data.maxCredits) / 2)
      setEstimate(data)
      setEstimateStatus('success')
      if (suggestedCredits > availableCredit) return

      setForm((current) => ({
        ...current,
        creditAmount: String(suggestedCredits),
      }))
    } catch {
      setErrorMessage('')
      setEstimate(null)
      setEstimateStatus('unavailable')
    } finally {
      setIsEstimating(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    setLoadingSuppliers(true)
    const activeSupplierApi = supplierApi
    void activeSupplierApi
      .getSuppliers()
      .then(({ suppliers: loaded }) => {
        if (cancelled) return
        setSuppliers(loaded)
        const selected = loaded.find((supplier) => supplier.id === initialSupplierId) ?? loaded[0]
        if (selected) {
          setForm((current) => ({
            ...current,
            supplierId: selected.id,
            serviceType: selected.serviceTypes[0] ?? '',
            pickupBuildingName: selected.location.buildingName,
            pickupFloorNumber: String(selected.location.floorNumber),
          }))
        }
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load suppliers.')
      })
      .finally(() => {
        if (!cancelled) setLoadingSuppliers(false)
      })
    return () => {
      cancelled = true
    }
  }, [initialSupplierId, supplierApi])

  const selectedSupplier = suppliers.find((supplier) => supplier.id === form.supplierId)
  const serviceTypes = useMemo(() => selectedSupplier?.serviceTypes ?? [], [selectedSupplier])
  const update = <K extends keyof CreateForm>(key: K, value: CreateForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }
  const errorFor = (...keys: string[]) => keys.map((key) => fieldErrors[key]).find(Boolean)

  function setSubmissionError(error: unknown) {
    const candidate = error as { message?: string; fieldErrors?: Record<string, string> }
    setErrorMessage(candidate.message ?? 'Unable to create the errand.')
    setFieldErrors(candidate.fieldErrors ?? {})
  }

  function handleSupplierChange(supplierId: string) {
    const supplier = suppliers.find((item) => item.id === supplierId)
    update('supplierId', supplierId)
    update('serviceType', supplier?.serviceTypes[0] ?? '')
    if (supplier) {
      update('pickupBuildingName', supplier.location.buildingName)
      update('pickupFloorNumber', String(supplier.location.floorNumber))
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    setErrorMessage('')
    setFieldErrors({})
    const validationErrors: Record<string, string> = {}
    const creditAmount = Number(form.creditAmount)
    const start = form.startAt ? new Date(form.startAt) : undefined
    const deadline = form.expiresAt ? new Date(form.expiresAt) : undefined
    if (!form.name.trim()) validationErrors.name = 'Enter an errand name.'
    else if (form.name.trim().length > 200) validationErrors.name = 'Use 200 characters or fewer.'
    if (!form.supplierId) validationErrors.supplierId = 'Select a supplier.'
    if (form.serviceType === '') validationErrors.serviceType = 'Select a service type.'
    else if (selectedSupplier && !selectedSupplier.serviceTypes.includes(form.serviceType))
      validationErrors.serviceType = 'This service type is not offered by the selected supplier.'
    if (!form.deliveryBuildingName.trim())
      validationErrors.deliveryBuildingName = 'Enter a delivery building.'
    if (!form.deliveryFloorNumber.trim())
      validationErrors.deliveryFloorNumber = 'Enter a delivery floor.'
    else if (!Number.isInteger(Number(form.deliveryFloorNumber)))
      validationErrors.deliveryFloorNumber = 'Floor must be a number.'
    if (!form.description.trim()) validationErrors.description = 'Enter a description.'
    else if (form.description.trim().length > 5000)
      validationErrors.description = 'Use 5,000 characters or fewer.'
    if (form.instructions.trim().length > 5000)
      validationErrors.instructions = 'Use 5,000 characters or fewer.'
    if (!form.creditAmount.trim() || !Number.isInteger(creditAmount) || creditAmount < 0)
      validationErrors.creditAmount = 'Enter a whole number of credits that is 0 or greater.'
    if (!start) validationErrors.startAt = 'Choose a start time.'
    else if (Number.isNaN(start.getTime())) validationErrors.startAt = 'Choose a valid start time.'
    if (!deadline) validationErrors.expiresAt = 'Choose a deadline.'
    else if (Number.isNaN(deadline.getTime()) || deadline.getTime() <= Date.now())
      validationErrors.expiresAt = 'Choose a future deadline.'
    if (start && deadline && !Number.isNaN(start.getTime()) && start.getTime() > deadline.getTime())
      validationErrors.startAt = 'Start time must be on or before the deadline.'
    if (!selectedSupplier) validationErrors.supplierId = 'Select a supplier.'
    if (!errandApi) setErrorMessage('Errand service is unavailable.')
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors)
      setErrorMessage('Check the highlighted fields.')
      return
    }
    if (!errandApi || !selectedSupplier || !start || !deadline) return
    setSubmitting(true)
    void errandApi
      .createErrand({
        supplierDetails: {
          supplierId: selectedSupplier.id,
          supplierName: selectedSupplier.name,
          serviceType: form.serviceType as ServiceType,
        },
        name: form.name.trim(),
        pickupLocation: selectedSupplier.location,
        targetLocation: {
          // TODO: replace placeholder coordinates with target-location integration.
          lat: 0,
          lng: 0,
          buildingName: form.deliveryBuildingName.trim(),
          floorNumber: Number(form.deliveryFloorNumber),
        },
        deliveryDetails: {
          description: form.description.trim(),
          ...(form.instructions.trim() ? { instructions: form.instructions.trim() } : {}),
        },
        creditAmount,
        startAt: start.toISOString(),
        expiresAt: deadline.toISOString(),
      })
      .then(() => onCreated())
      .catch(setSubmissionError)
      .finally(() => setSubmitting(false))
  }

  if (loadingSuppliers) return <LoadingState label="Loading suppliers" />

  return (
    <RelayFormSurface
      headerVariant="card"
      className="create-errand-card relay-mobile-sheet-surface"
      title="Create an errand"
      description="Tell us what you need delivered."
      onClose={onClose}
    >
      {errorMessage && <ErrorMessage message={errorMessage} />}
      <form className="errand-form" onSubmit={submit}>
        <RelayFormField label="What do you need?" required error={errorFor('name')}>
          <input
            required
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="e.g. Graphing calculator"
            maxLength={200}
          />
        </RelayFormField>
        <RelayFormField label="Supplier" required error={errorFor('supplierId')}>
          <select
            required
            value={form.supplierId}
            onChange={(e) => handleSupplierChange(e.target.value)}
          >
            <option value="">Select a supplier</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </RelayFormField>
        <RelayFormField label="Service type" required error={errorFor('serviceType')}>
          <select
            required
            value={form.serviceType}
            onChange={(e) =>
              update(
                'serviceType',
                e.target.value === '' ? '' : (Number(e.target.value) as ServiceType),
              )
            }
          >
            <option value="">Select a service type</option>
            {serviceTypes.map((type) => (
              <option key={type} value={type}>
                {SERVICE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </RelayFormField>
        <div className="errand-form-grid">
          <div className="errand-field">
            <span>
              Pickup building <b aria-hidden="true">*</b>
            </span>
            <div className="errand-readonly-value">{form.pickupBuildingName}</div>
          </div>
          <div className="errand-field">
            <span>
              Floor <b aria-hidden="true">*</b>
            </span>
            <div className="errand-readonly-value">Level {form.pickupFloorNumber}</div>
          </div>
        </div>
        <div className="errand-form-grid">
          <label className="errand-field">
            <span>
              Delivery building <b aria-hidden="true">*</b>
            </span>
            <input
              required
              value={form.deliveryBuildingName}
              onChange={(e) => update('deliveryBuildingName', e.target.value)}
              placeholder="e.g. Kent Ridge MRT"
            />
          </label>
          <label className="errand-field">
            <span>
              Floor <b aria-hidden="true">*</b>
            </span>
            <input
              type="number"
              required
              step="1"
              value={form.deliveryFloorNumber}
              onChange={(e) => update('deliveryFloorNumber', e.target.value)}
              onInvalid={(e) => {
                e.currentTarget.setCustomValidity(
                  e.currentTarget.value.trim() ? 'Floor must be a number.' : '',
                )
              }}
              onInput={(e) => e.currentTarget.setCustomValidity('')}
            />
          </label>
        </div>
        <RelayFormField
          label="Description"
          required
          error={errorFor('description', 'deliveryDetails.description')}
        >
          <textarea
            required
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
            placeholder="Describe what needs to be picked up or delivered."
            maxLength={5000}
            rows={3}
          />
        </RelayFormField>
        <RelayFormField
          label="Instructions (optional)"
          error={errorFor('instructions', 'deliveryDetails.instructions')}
        >
          <textarea
            value={form.instructions}
            onChange={(e) => update('instructions', e.target.value)}
            placeholder="Add any handling or collection instructions."
            maxLength={5000}
            rows={2}
          />
        </RelayFormField>
        <div className="errand-reward-grid">
          <div className="errand-field has-input-button">
            <span>Reward credits</span>
            {estimateStatus === 'success' && estimate && (
              <div className="errand-estimate-pill" role="status">
                <span>
                  Suggested range: {estimate.minCredits}–{estimate.maxCredits} credits
                </span>
                <button
                  type="button"
                  className="relay-icon-button errand-estimate-help"
                  aria-label="Why this credit range was suggested"
                >
                  ?
                </button>
                <div className="errand-estimate-reason" role="tooltip">
                  {estimate.reason}
                </div>
              </div>
            )}
            {estimateStatus === 'success' &&
              estimate &&
              availableCredit !== undefined &&
              availableCredit < estimate.minCredits && (
                <div className="errand-estimate-pill errand-estimate-pill-balance" role="status">
                  You have {Math.floor(availableCredit)} credits; the suggested minimum is{' '}
                  {estimate.minCredits}.
                </div>
              )}
            {estimateStatus === 'rate-limited' && (
              <div className="errand-estimate-pill errand-estimate-pill-rate-limited" role="status">
                Estimation is busy. Try again shortly.
              </div>
            )}
            {estimateStatus === 'invalid' && (
              <div className="errand-estimate-pill errand-estimate-pill-invalid" role="status">
                Unable to estimate credits.
              </div>
            )}
            {estimateStatus === 'unavailable' && (
              <div className="errand-estimate-pill errand-estimate-pill-invalid" role="alert">
                Credit estimation is currently unavailable. Enter the reward credits manually.
              </div>
            )}
            <div className="errand-credit-input-wrapper">
              <input
                type="number"
                required
                min="0"
                step="1"
                value={form.creditAmount}
                onChange={(e) => update('creditAmount', e.target.value)}
                placeholder="15"
              />
              <button
                type="button"
                onClick={handleEstimateCredits}
                disabled={
                  isEstimating ||
                  !form.name.trim() ||
                  !form.description.trim() ||
                  form.serviceType === '' ||
                  !authenticatedSubject ||
                  availableCredit === undefined
                }
                title={
                  !authenticatedSubject
                    ? 'Sign in to estimate credits'
                    : availableCredit === undefined
                      ? 'Waiting for your credit balance'
                      : 'Estimate credits based on errand details'
                }
                className="relay-icon-button errand-estimate-button"
              >
                {/* AI icon by Icons8: https://icons8.com/icon/ET5veKixlQKy/ai */}
                <svg
                  className="errand-estimate-icon"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="m17.469 9.286-2.156-.957a7.14 7.14 0 0 1-3.683-3.801l-.82-1.974c-.152-.367-.481-.55-.81-.55s-.658.183-.81.55l-.819 1.974a7.14 7.14 0 0 1-3.684 3.801l-2.156.957c-.708.314-.708 1.344 0 1.658l2.226.988a7.13 7.13 0 0 1 3.631 3.678l.809 1.852c.155.356.479.534.803.534s.648-.178.804-.534l.809-1.852a7.14 7.14 0 0 1 3.631-3.678l2.226-.988c.707-.314.707-1.344-.001-1.658M10 14.34a9.1 9.1 0 0 0-4.408-4.225A9.1 9.1 0 0 0 10 5.78a9.08 9.08 0 0 0 4.408 4.334A9.1 9.1 0 0 0 10 14.34m8.713 6.785-.247.565a.506.506 0 0 1-.934 0l-.247-.565a4.36 4.36 0 0 0-2.219-2.249l-.76-.337a.53.53 0 0 1 0-.962l.717-.319a4.36 4.36 0 0 0 2.251-2.324l.253-.611a.506.506 0 0 1 .941 0l.253.611a4.36 4.36 0 0 0 2.251 2.324l.717.319a.53.53 0 0 1 0 .962l-.76.337a4.37 4.37 0 0 0-2.216 2.249" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div className="errand-form-grid">
          <RelayFormField label="Start time" required error={errorFor('startAt')}>
            <input
              type="datetime-local"
              required
              value={form.startAt}
              onChange={(e) => update('startAt', e.target.value)}
            />
          </RelayFormField>
          <label className="errand-field">
            <span>Deadline</span>
            <input
              type="datetime-local"
              required
              value={form.expiresAt}
              onChange={(e) => update('expiresAt', e.target.value)}
            />
          </label>
        </div>
        <RelayButton variant="primary" type="submit" disabled={submitting}>
          {submitting ? 'Creating request…' : 'Create request'}
        </RelayButton>
      </form>
    </RelayFormSurface>
  )
}
