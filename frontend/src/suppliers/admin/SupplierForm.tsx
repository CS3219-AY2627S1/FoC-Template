/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Added the metadata-backed, full-replacement Supplier administrator
 * form for issue #30.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-27. Scope: aligned
 * paired form controls when one field includes guidance text.
 * Author review: Reviewed and approved by @ron.
 */
import type { FormEvent } from 'react'
import {
  SUPPLIER_CATEGORIES,
  SUPPLIER_HOURS_KINDS,
  type SupplierBuildingOption,
  type SupplierCategory,
  type SupplierHoursKind,
} from '../types'
import { formatSupplierCategory, SUPPLIER_HOURS_KIND_LABELS } from '../presentation'
import type { SupplierFormDraft } from './supplierFormModel'

interface SupplierFormProps {
  readonly draft: SupplierFormDraft
  readonly buildings: readonly SupplierBuildingOption[]
  readonly fieldErrors: Readonly<Record<string, string>>
  readonly submitting: boolean
  readonly submitLabel: string
  readonly onChange: (draft: SupplierFormDraft) => void
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void
  readonly onCancel: () => void
}

export function SupplierForm({
  draft,
  buildings,
  fieldErrors,
  submitting,
  submitLabel,
  onChange,
  onSubmit,
  onCancel,
}: SupplierFormProps) {
  const set = <Key extends keyof SupplierFormDraft>(key: Key, value: SupplierFormDraft[Key]) => {
    onChange({ ...draft, [key]: value })
  }
  const toggleCategory = (category: SupplierCategory) => {
    set(
      'categories',
      draft.categories.includes(category)
        ? draft.categories.filter((candidate) => candidate !== category)
        : [...draft.categories, category],
    )
  }

  return (
    <form className="space-y-6" onSubmit={onSubmit} noValidate>
      <div className="grid gap-5 md:grid-cols-2">
        <FormGroup label="Supplier name" htmlFor="supplier-name" error={fieldErrors.name}>
          <input
            id="supplier-name"
            value={draft.name}
            onChange={(event) => set('name', event.target.value)}
            maxLength={120}
            required
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? 'supplier-name-error' : undefined}
            className={inputClass}
          />
        </FormGroup>

        <FormGroup label="Building" htmlFor="supplier-building" error={fieldErrors.buildingCode}>
          <select
            id="supplier-building"
            value={draft.buildingCode}
            onChange={(event) => set('buildingCode', event.target.value as SupplierFormDraft['buildingCode'])}
            required
            aria-invalid={Boolean(fieldErrors.buildingCode)}
            aria-describedby={fieldErrors.buildingCode ? 'supplier-building-error' : undefined}
            className={inputClass}
          >
            <option value="">Choose a Building Code</option>
            {buildings.map((building) => (
              <option key={building.code} value={building.code}>
                {building.label} ({building.code})
              </option>
            ))}
          </select>
        </FormGroup>
      </div>

      <fieldset>
        <legend className="text-sm font-semibold text-navy-900">Categories</legend>
        <p className="mt-1 text-xs text-slate-500">Choose everything this Supplier offers.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SUPPLIER_CATEGORIES.map((category) => (
            <label key={category} className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-300 px-3 py-2">
              <input
                type="checkbox"
                checked={draft.categories.includes(category)}
                onChange={() => toggleCategory(category)}
                className="h-4 w-4 accent-navy-800"
              />
              <span className="text-sm">{formatSupplierCategory(category)}</span>
            </label>
          ))}
        </div>
        <FieldError id="supplier-categories-error" message={fieldErrors.categories} />
      </fieldset>

      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_10rem]">
        <FormGroup
          label="Location description"
          htmlFor="supplier-location"
          error={fieldErrors.locationDescription}
          hint="Directions or identifying details within the building."
        >
          <textarea
            id="supplier-location"
            value={draft.locationDescription}
            onChange={(event) => set('locationDescription', event.target.value)}
            maxLength={300}
            rows={3}
            required
            aria-invalid={Boolean(fieldErrors.locationDescription)}
            aria-describedby={fieldErrors.locationDescription ? 'supplier-location-error' : undefined}
            className={inputClass}
          />
        </FormGroup>
        <FormGroup label="Floor (optional)" htmlFor="supplier-floor" error={fieldErrors.floor}>
          <input
            id="supplier-floor"
            value={draft.floor}
            onChange={(event) => set('floor', event.target.value)}
            maxLength={20}
            aria-invalid={Boolean(fieldErrors.floor)}
            aria-describedby={fieldErrors.floor ? 'supplier-floor-error' : undefined}
            className={inputClass}
          />
        </FormGroup>
      </div>

      <fieldset>
        <legend className="text-sm font-semibold text-navy-900">Coordinates (optional)</legend>
        <p className="mt-1 text-xs text-slate-500">Provide both values or leave both blank.</p>
        <div className="mt-3 grid gap-5 sm:grid-cols-2">
          <FormGroup label="Latitude" htmlFor="supplier-latitude" error={fieldErrors.latitude}>
            <input
              id="supplier-latitude"
              type="number"
              step="any"
              min="-90"
              max="90"
              value={draft.latitude}
              onChange={(event) => set('latitude', event.target.value)}
              aria-invalid={Boolean(fieldErrors.latitude)}
              aria-describedby={fieldErrors.latitude ? 'supplier-latitude-error' : undefined}
              className={inputClass}
            />
          </FormGroup>
          <FormGroup label="Longitude" htmlFor="supplier-longitude" error={fieldErrors.longitude}>
            <input
              id="supplier-longitude"
              type="number"
              step="any"
              min="-180"
              max="180"
              value={draft.longitude}
              onChange={(event) => set('longitude', event.target.value)}
              aria-invalid={Boolean(fieldErrors.longitude)}
              aria-describedby={fieldErrors.longitude ? 'supplier-longitude-error' : undefined}
              className={inputClass}
            />
          </FormGroup>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-navy-900">Typical hours</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {SUPPLIER_HOURS_KINDS.map((kind) => (
            <label key={kind} className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-300 px-3 py-2">
              <input
                type="radio"
                name="hoursKind"
                value={kind}
                checked={draft.hoursKind === kind}
                onChange={() => set('hoursKind', kind as SupplierHoursKind)}
                className="h-4 w-4 accent-navy-800"
              />
              <span className="text-sm">{SUPPLIER_HOURS_KIND_LABELS[kind]}</span>
            </label>
          ))}
        </div>
        <FieldError id="supplier-hours-kind-error" message={fieldErrors.hoursKind} />
      </fieldset>

      {draft.hoursKind === 'INTERVAL' && (
        <div className="grid gap-5 sm:grid-cols-2">
          <FormGroup label="Opens at" htmlFor="supplier-opens" error={fieldErrors.opensAt}>
            <input
              id="supplier-opens"
              type="time"
              value={draft.opensAt}
              onChange={(event) => set('opensAt', event.target.value)}
              required
              aria-invalid={Boolean(fieldErrors.opensAt)}
              aria-describedby={fieldErrors.opensAt ? 'supplier-opens-error' : undefined}
              className={inputClass}
            />
          </FormGroup>
          <FormGroup
            label="Closes at"
            htmlFor="supplier-closes"
            error={fieldErrors.closesAt}
            hint="An earlier closing time means the next day."
          >
            <input
              id="supplier-closes"
              type="time"
              value={draft.closesAt}
              onChange={(event) => set('closesAt', event.target.value)}
              required
              aria-invalid={Boolean(fieldErrors.closesAt)}
              aria-describedby={fieldErrors.closesAt ? 'supplier-closes-error' : undefined}
              className={inputClass}
            />
          </FormGroup>
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-navy-800 hover:bg-slate-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-navy-800 px-4 py-2 font-semibold text-white hover:bg-navy-900 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}

interface FormGroupProps {
  readonly label: string
  readonly htmlFor: string
  readonly error?: string
  readonly hint?: string
  readonly children: React.ReactNode
}

function FormGroup({ label, htmlFor, error, hint, children }: FormGroupProps) {
  return (
    <div className="flex flex-col">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-navy-900">
        {label}
      </label>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      <div className="mt-auto pt-2">{children}</div>
      <FieldError id={`${htmlFor}-error`} message={error} />
    </div>
  )
}

function FieldError({ id, message }: { readonly id: string; readonly message?: string }) {
  if (!message) return null
  return <p id={id} className="mt-1 text-sm text-red-700">{message}</p>
}

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-navy-700 focus:outline-none focus:ring-2 focus:ring-navy-100 aria-invalid:border-red-500'
