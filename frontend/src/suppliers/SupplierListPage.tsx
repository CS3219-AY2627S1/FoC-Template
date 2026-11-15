/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Implemented the live, URL-backed, responsive member Supplier
 * catalogue for issue #29.
 * Author review: Reviewed and approved by @ron.
 */
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { getSupplierMetadata, listSuppliers } from '../api/supplierApi'
import { TopBar } from '../components/TopBar'
import { SupplierCard } from './SupplierCard'
import { SupplierFilters } from './SupplierFilters'
import { SupplierPagination } from './SupplierPagination'
import { SupplierRequestError } from './SupplierRequestError'
import {
  SUPPLIER_CATEGORIES,
  SUPPLIER_LIST_DEFAULT_PAGE,
  SUPPLIER_LIST_DEFAULT_SIZE,
  SUPPLIER_SORTS,
  type BuildingCode,
  type SupplierBuildingOption,
  type SupplierCategory,
  type SupplierListQuery,
  type SupplierPage,
  type SupplierSort,
} from './types'

const DEFAULT_SORT: SupplierSort = 'name,asc'
const ALLOWED_PAGE_SIZES = [12, 24, 48] as const

export function SupplierListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = useMemo(() => queryFromSearchParams(searchParams), [searchParams])
  const [listRetry, setListRetry] = useState(0)
  const [metadataRetry, setMetadataRetry] = useState(0)
  const listRequestKey = `${searchParams.toString()}:${listRetry}`
  const metadataRequestKey = String(metadataRetry)
  const [listState, setListState] = useState<{
    readonly key: string
    readonly page: SupplierPage | null
    readonly error: unknown
  }>({ key: '', page: null, error: null })
  const [metadataState, setMetadataState] = useState<{
    readonly key: string
    readonly options: readonly SupplierBuildingOption[]
    readonly error: boolean
  }>({ key: '', options: [], error: false })
  const loading = listState.key !== listRequestKey
  const page = loading ? null : listState.page
  const error = loading ? null : listState.error
  const metadataLoading = metadataState.key !== metadataRequestKey
  const buildingOptions = metadataState.options
  const metadataError = !metadataLoading && metadataState.error

  useEffect(() => {
    const controller = new AbortController()
    let current = true
    listSuppliers(query, controller.signal)
      .then((result) => {
        if (!current) return
        setListState({ key: listRequestKey, page: result, error: null })
      })
      .catch((requestError: unknown) => {
        if (!current || isAbortError(requestError)) return
        setListState({ key: listRequestKey, page: null, error: requestError })
      })

    return () => {
      current = false
      controller.abort()
    }
  }, [query, listRequestKey])

  useEffect(() => {
    const controller = new AbortController()
    let current = true
    getSupplierMetadata(controller.signal)
      .then((metadata) => {
        if (!current) return
        setMetadataState({ key: metadataRequestKey, options: metadata.buildingCodes, error: false })
      })
      .catch((requestError: unknown) => {
        if (!current || isAbortError(requestError)) return
        setMetadataState((currentState) => ({
          key: metadataRequestKey,
          options: currentState.options,
          error: true,
        }))
      })

    return () => {
      current = false
      controller.abort()
    }
  }, [metadataRequestKey])

  function updateQuery(name: string, value: string | undefined, resetPage = true) {
    const next = new URLSearchParams(searchParams)
    if (value === undefined || value === '') next.delete(name)
    else next.set(name, value)
    if (resetPage) next.delete('page')
    setSearchParams(next)
  }

  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-600">Campus catalogue</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy-900 sm:text-4xl">Find a Supplier</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
            Search campus errand origins, compare their typical hours, and open a location for full details.
          </p>
        </div>

        <div className="mt-6">
          <SupplierFilters
            key={query.q ?? ''}
            q={query.q ?? ''}
            buildingCode={query.buildingCode}
            category={query.category}
            sort={query.sort ?? DEFAULT_SORT}
            size={query.size ?? SUPPLIER_LIST_DEFAULT_SIZE}
            buildingOptions={buildingOptions}
            metadataLoading={metadataLoading}
            metadataError={metadataError}
            onSearch={(value) => updateQuery('q', value)}
            onBuildingChange={(value) => updateQuery('buildingCode', value)}
            onCategoryChange={(value) => updateQuery('category', value)}
            onSortChange={(value) => updateQuery('sort', value === DEFAULT_SORT ? undefined : value)}
            onSizeChange={(value) => updateQuery('size', value === SUPPLIER_LIST_DEFAULT_SIZE ? undefined : String(value))}
            onRetryMetadata={() => setMetadataRetry((value) => value + 1)}
            onClear={() => setSearchParams(new URLSearchParams())}
          />
        </div>

        <section className="mt-7" aria-labelledby="supplier-results-heading" aria-busy={loading}>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="supplier-results-heading" className="text-xl font-bold text-navy-900">Suppliers</h2>
              {!loading && page && (
                <p className="mt-1 text-sm text-slate-500" aria-live="polite">
                  {page.totalItems} {page.totalItems === 1 ? 'result' : 'results'}
                </p>
              )}
            </div>
          </div>

          {loading && <SupplierListSkeleton />}
          {!loading && error !== null && <div className="mt-4"><SupplierRequestError error={error} onRetry={() => setListRetry((value) => value + 1)} /></div>}
          {!loading && !error && page?.items.length === 0 && (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
              <h3 className="text-lg font-bold text-navy-900">No Suppliers match these filters</h3>
              <p className="mt-2 text-sm text-slate-600">Try a broader search or clear the selected filters.</p>
              <button
                type="button"
                onClick={() => setSearchParams(new URLSearchParams())}
                className="mt-4 min-h-11 rounded-lg bg-navy-800 px-5 py-2 text-sm font-semibold text-white hover:bg-navy-700"
              >
                Clear filters
              </button>
            </div>
          )}
          {!loading && !error && page && page.items.length > 0 && (
            <>
              <div className="mt-4 grid min-w-0 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {page.items.map((supplier) => <SupplierCard key={supplier.id} supplier={supplier} />)}
              </div>
              <div className="mt-6">
                <SupplierPagination
                  page={page.page}
                  totalPages={page.totalPages}
                  totalItems={page.totalItems}
                  onPageChange={(value) => updateQuery('page', value === SUPPLIER_LIST_DEFAULT_PAGE ? undefined : String(value), false)}
                />
              </div>
            </>
          )}
        </section>
      </main>
    </>
  )
}

function queryFromSearchParams(searchParams: URLSearchParams): SupplierListQuery {
  const q = searchParams.get('q')?.trim() || undefined
  const buildingCode = searchParams.get('buildingCode') as BuildingCode | null
  const categoryValue = searchParams.get('category')
  const category = SUPPLIER_CATEGORIES.find((value) => value === categoryValue) as SupplierCategory | undefined
  const sortValue = searchParams.get('sort')
  const sort = SUPPLIER_SORTS.find((value) => value === sortValue) ?? DEFAULT_SORT
  const page = nonnegativeInteger(searchParams.get('page'), SUPPLIER_LIST_DEFAULT_PAGE)
  const requestedSize = nonnegativeInteger(searchParams.get('size'), SUPPLIER_LIST_DEFAULT_SIZE)
  const size = ALLOWED_PAGE_SIZES.find((value) => value === requestedSize) ?? SUPPLIER_LIST_DEFAULT_SIZE

  return {
    q,
    buildingCode: buildingCode ?? undefined,
    category,
    page,
    size,
    sort,
  }
}

function nonnegativeInteger(value: string | null, fallback: number): number {
  if (value === null || !/^\d+$/.test(value)) return fallback
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : fallback
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function SupplierListSkeleton() {
  return (
    <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" role="status">
      <span className="sr-only">Loading Suppliers…</span>
      {[0, 1, 2, 3].map((value) => (
        <div key={value} className="animate-pulse overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="aspect-[16/9] bg-slate-200" />
          <div className="space-y-3 p-5">
            <div className="h-4 w-20 rounded bg-slate-200" />
            <div className="h-6 w-3/4 rounded bg-slate-200" />
            <div className="h-4 w-full rounded bg-slate-200" />
            <div className="h-4 w-2/3 rounded bg-slate-200" />
          </div>
        </div>
      ))}
    </div>
  )
}
