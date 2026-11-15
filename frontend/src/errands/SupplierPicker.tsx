/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Supplier search-and-choose control for the create-errand form, using the live
 *        Supplier catalogue.
 * Author review: Reviewed and approved by @mattis.
 */
import { useEffect, useId, useState } from 'react'
import { getSupplier, listSuppliers } from '../api/supplierApi'
import type { Supplier, SupplierPage } from '../suppliers/types'
import { useRemoteData } from './useRemoteData'

const RESULT_SIZE = 6
const SEARCH_DELAY_MS = 250

interface SupplierPickerProps {
  readonly supplierId: string
  readonly error?: string
  readonly onChange: (supplierId: string) => void
}

export function SupplierPicker({ supplierId, error, onChange }: SupplierPickerProps) {
  const headingId = useId()
  const searchId = useId()
  const errorId = useId()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [chosen, setChosen] = useState<Supplier | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [query])

  // A supplier chosen elsewhere (the ?supplierId= link from a Supplier page) is looked up once
  const needsLookup = supplierId !== '' && chosen?.id !== supplierId
  const lookup = useRemoteData<Supplier | null>(`supplier:${needsLookup ? supplierId : ''}`, (signal) =>
    needsLookup ? getSupplier(supplierId, signal).then((result) => result.supplier) : Promise.resolve(null),
  )
  const selected = chosen?.id === supplierId ? chosen : lookup.data?.id === supplierId ? lookup.data : null

  const results = useRemoteData<SupplierPage | null>(`suppliers:${supplierId ? '' : debouncedQuery}`, (signal) =>
    supplierId ? Promise.resolve(null) : listSuppliers({ q: debouncedQuery || undefined, size: RESULT_SIZE }, signal),
  )

  function choose(supplier: Supplier) {
    setChosen(supplier)
    onChange(supplier.id)
  }

  return (
    <fieldset className="space-y-3" aria-labelledby={headingId} aria-describedby={error ? errorId : undefined}>
      <legend id={headingId} className="text-sm font-medium text-navy-900">
        Where from?
      </legend>

      {supplierId !== '' && (
        <div className="flex flex-col gap-3 rounded-xl border border-navy-100 bg-navy-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          {selected ? (
            <div className="min-w-0">
              <p className="break-words font-semibold text-navy-900">{selected.name}</p>
              <p className="break-words text-sm text-slate-600">
                {selected.buildingLabel}
                {selected.floor ? `, floor ${selected.floor}` : ''} · {selected.locationDescription}
              </p>
            </div>
          ) : lookup.error !== null ? (
            <p className="text-sm text-red-700" role="alert">
              That supplier could not be loaded. It may have been archived; choose another.
            </p>
          ) : (
            <p className="text-sm text-slate-600" role="status">
              Loading supplier…
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              setChosen(null)
              onChange('')
            }}
            className="min-h-11 shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-navy-800 hover:bg-navy-50"
          >
            Change
          </button>
        </div>
      )}

      {supplierId === '' && (
        <>
          <div className="space-y-1">
            <label htmlFor={searchId} className="block text-sm text-slate-600">
              Search the supplier catalogue
            </label>
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. coffee, printer, COM3"
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-100"
            />
          </div>
          {results.error !== null && (
            <p className="text-sm text-red-700" role="alert">
              Suppliers could not be loaded.{' '}
              <button type="button" onClick={results.reload} className="font-semibold underline">
                Try again
              </button>
            </p>
          )}
          {results.error === null && results.data === null && (
            <p className="text-sm text-slate-500" role="status">
              Loading suppliers…
            </p>
          )}
          {results.error === null && results.data && results.data.items.length === 0 && (
            <p className="text-sm text-slate-600">No suppliers match “{debouncedQuery}”.</p>
          )}
          {results.error === null && results.data && results.data.items.length > 0 && (
            <ul className="grid gap-2 sm:grid-cols-2" aria-label="Matching suppliers">
              {results.data.items.map((supplier) => (
                <li key={supplier.id}>
                  <button
                    type="button"
                    onClick={() => choose(supplier)}
                    className="flex h-full w-full min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-navy-700 hover:bg-navy-50"
                  >
                    <span className="break-words text-sm font-semibold text-navy-900">{supplier.name}</span>
                    <span className="break-words text-xs text-slate-600">{supplier.buildingLabel}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {error && (
        <p id={errorId} className="text-xs text-red-600">
          {error}
        </p>
      )}
    </fieldset>
  )
}
