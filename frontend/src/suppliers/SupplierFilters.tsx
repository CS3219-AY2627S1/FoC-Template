/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Implemented metadata-backed Supplier search, filter, sort, and page
 * size controls for issue #29.
 * Author review: Reviewed and approved by @ron.
 */
import { useState, type FormEvent } from 'react'
import {
  SUPPLIER_CATEGORIES,
  type BuildingCode,
  type SupplierBuildingOption,
  type SupplierCategory,
  type SupplierSort,
} from './types'
import { formatSupplierCategory } from './presentation'

interface SupplierFiltersProps {
  readonly q: string
  readonly buildingCode?: BuildingCode
  readonly category?: SupplierCategory
  readonly sort: SupplierSort
  readonly size: number
  readonly buildingOptions: readonly SupplierBuildingOption[]
  readonly metadataLoading: boolean
  readonly metadataError: boolean
  readonly onSearch: (q: string) => void
  readonly onBuildingChange: (value: BuildingCode | undefined) => void
  readonly onCategoryChange: (value: SupplierCategory | undefined) => void
  readonly onSortChange: (value: SupplierSort) => void
  readonly onSizeChange: (value: number) => void
  readonly onRetryMetadata: () => void
  readonly onClear: () => void
}

export function SupplierFilters({
  q,
  buildingCode,
  category,
  sort,
  size,
  buildingOptions,
  metadataLoading,
  metadataError,
  onSearch,
  onBuildingChange,
  onCategoryChange,
  onSortChange,
  onSizeChange,
  onRetryMetadata,
  onClear,
}: SupplierFiltersProps) {
  const [searchDraft, setSearchDraft] = useState(q)

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSearch(searchDraft.trim())
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="catalogue-filters-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="catalogue-filters-heading" className="text-base font-bold text-navy-900">Find a Supplier</h2>
        <button
          type="button"
          onClick={onClear}
          className="min-h-11 rounded-lg px-3 py-2 text-sm font-semibold text-navy-700 hover:bg-navy-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
        >
          Clear filters
        </button>
      </div>

      <form onSubmit={submitSearch} className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-sm font-medium text-slate-700">Search name or location</span>
          <input
            type="search"
            value={searchDraft}
            maxLength={300}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="e.g. printer or LT19"
            className="min-h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-accent-500 focus:ring-2 focus:ring-orange-100"
          />
        </label>
        <button
          type="submit"
          className="min-h-11 self-end rounded-lg bg-navy-800 px-5 py-2 text-sm font-semibold text-white transition hover:bg-navy-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
        >
          Search
        </button>
      </form>

      <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="min-w-0 text-sm font-medium text-slate-700">
          Building
          <select
            value={buildingCode ?? ''}
            onChange={(event) => onBuildingChange(event.target.value ? event.target.value as BuildingCode : undefined)}
            disabled={metadataLoading || metadataError}
            className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
          >
            <option value="">All buildings</option>
            {buildingOptions.map((option) => (
              <option key={option.code} value={option.code}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="min-w-0 text-sm font-medium text-slate-700">
          Category
          <select
            value={category ?? ''}
            onChange={(event) => onCategoryChange(event.target.value ? event.target.value as SupplierCategory : undefined)}
            className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">All categories</option>
            {SUPPLIER_CATEGORIES.map((value) => (
              <option key={value} value={value}>{formatSupplierCategory(value)}</option>
            ))}
          </select>
        </label>

        <label className="min-w-0 text-sm font-medium text-slate-700">
          Sort by
          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value as SupplierSort)}
            className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="name,asc">Name A–Z</option>
            <option value="name,desc">Name Z–A</option>
            <option value="updatedAt,desc">Recently updated</option>
          </select>
        </label>

        <label className="min-w-0 text-sm font-medium text-slate-700">
          Results per page
          <select
            value={size}
            onChange={(event) => onSizeChange(Number(event.target.value))}
            className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="12">12</option>
            <option value="24">24</option>
            <option value="48">48</option>
          </select>
        </label>
      </div>

      {metadataLoading && <p className="mt-3 text-xs text-slate-500" role="status">Loading building options…</p>}
      {metadataError && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          Building options are temporarily unavailable.{' '}
          <button type="button" onClick={onRetryMetadata} className="font-semibold underline">Try again</button>
        </p>
      )}
    </section>
  )
}
