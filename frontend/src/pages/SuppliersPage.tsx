/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-09-26
 * Scope (AI-01): Implemented the requested supplier card fields and grid.
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-10-03
 * Scope (AI-02): Adjusted existing UI styling to match the supplied Figma mockup.
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-10-17
 * Scope (AI-18): Built and tested the requested errand creation preview and entry points.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { SearchInput } from '../components/ui/SearchInput'
import { Select } from '../components/ui/Select'
import { SupplierCard } from '../components/ui/SupplierCard'
import {
  listSupplierBuildings,
  listSupplierCategories,
  listSuppliers,
} from '../features/suppliers/supplier.api'
import type {
  SupplierListResponse,
  SupplierReference,
} from '../features/suppliers/supplier.types'

const SEARCH_DEBOUNCE_MS = 300
const SUPPLIERS_PER_PAGE = 20

export function SuppliersPage() {
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [buildingId, setBuildingId] = useState('')
  const [categories, setCategories] = useState<SupplierReference[]>([])
  const [buildings, setBuildings] = useState<SupplierReference[]>([])
  const [areFiltersLoading, setAreFiltersLoading] = useState(true)
  const [filterErrorMessage, setFilterErrorMessage] = useState<string | null>(null)
  const [filterRetryCount, setFilterRetryCount] = useState(0)
  const [pageNumber, setPageNumber] = useState(0)
  const [supplierResponse, setSupplierResponse] = useState<SupplierListResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    Promise.all([
      listSupplierCategories(controller.signal),
      listSupplierBuildings(controller.signal),
    ])
      .then(([categoryResponse, buildingResponse]) => {
        setCategories(categoryResponse.items)
        setBuildings(buildingResponse.items)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return

        setFilterErrorMessage(
          error instanceof Error ? error.message : 'Unable to load supplier filters.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setAreFiltersLoading(false)
      })

    return () => controller.abort()
  }, [filterRetryCount])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const nextSearchTerm = searchTerm.trim()

      if (nextSearchTerm === debouncedSearchTerm) return

      setIsLoading(true)
      setErrorMessage(null)
      setDebouncedSearchTerm(nextSearchTerm)
      setPageNumber(0)
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timeoutId)
  }, [debouncedSearchTerm, searchTerm])

  useEffect(() => {
    const controller = new AbortController()

    listSuppliers(
      {
        query: debouncedSearchTerm || undefined,
        categoryId: categoryId || undefined,
        buildingId: buildingId || undefined,
        page: pageNumber,
        size: SUPPLIERS_PER_PAGE,
      },
      controller.signal,
    )
      .then(setSupplierResponse)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return

        setErrorMessage(error instanceof Error ? error.message : 'Unable to load suppliers.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [buildingId, categoryId, debouncedSearchTerm, pageNumber, retryCount])

  const suppliers = supplierResponse?.items ?? []
  const page = supplierResponse?.page

  function requestPage(nextPageNumber: number) {
    setIsLoading(true)
    setErrorMessage(null)
    setPageNumber(nextPageNumber)
  }

  function retryRequest() {
    setIsLoading(true)
    setErrorMessage(null)
    setRetryCount((count) => count + 1)
  }

  function updateFilter(update: () => void) {
    setIsLoading(true)
    setErrorMessage(null)
    setPageNumber(0)
    update()
  }

  function retryFilters() {
    setAreFiltersLoading(true)
    setFilterErrorMessage(null)
    setFilterRetryCount((count) => count + 1)
  }

  return (
    <section>
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-xs font-medium tracking-[0.04em] text-[#175c45]">
            SUPPLIERS
          </p>
          <h1 className="mt-2 text-[2rem] font-medium leading-tight tracking-[-0.035em] text-[#17211d] sm:text-[2.375rem]">
            Choose a supplier
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#68736c] sm:text-base">
            Browse campus suppliers or choose one to start an errand.
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:mt-6 xl:grid-cols-[minmax(16rem,1fr)_15rem_15rem]">
        <div className="col-span-2 xl:col-span-1">
          <SearchInput
            label="Search suppliers by name"
            placeholder="Search suppliers or campus locations"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            autoComplete="off"
          />
        </div>
        <Select
          label="Filter by category"
          value={categoryId}
          disabled={areFiltersLoading}
          onChange={(event) => updateFilter(() => setCategoryId(event.target.value))}
          options={[
            { label: 'All categories', value: '' },
            ...categories.map((category) => ({ label: category.name, value: category.id })),
          ]}
        />
        <Select
          label="Filter by building"
          value={buildingId}
          disabled={areFiltersLoading}
          onChange={(event) => updateFilter(() => setBuildingId(event.target.value))}
          options={[
            { label: 'All buildings', value: '' },
            ...buildings.map((building) => ({ label: building.name, value: building.id })),
          ]}
        />
      </div>

      {filterErrorMessage ? (
        <p className="mt-3 rounded-xl bg-[#fff3d8] px-4 py-3 text-sm text-amber-900" role="alert">
          The category and building filters could not be loaded.{' '}
          <button
            type="button"
            onClick={retryFilters}
            className="cursor-pointer font-semibold underline underline-offset-2"
          >
            Try again
          </button>
        </p>
      ) : null}

      <div className="mt-5 flex items-center justify-between" aria-live="polite">
        <p className="text-lg font-medium tracking-[-0.015em] text-[#17211d] sm:text-[1.375rem]">
          {isLoading
            ? 'Loading suppliers…'
            : `${page?.totalElements ?? 0} ${page?.totalElements === 1 ? 'supplier' : 'suppliers'} found`}
        </p>
      </div>

      {errorMessage ? (
        <div
          className="mt-4 rounded-[18px] border border-red-200 bg-red-50 px-6 py-8 text-center"
          role="alert"
        >
          <h2 className="text-lg font-semibold text-red-900">Could not load suppliers</h2>
          <p className="mt-2 text-sm text-red-700">{errorMessage}</p>
          <button
            type="button"
            onClick={retryRequest}
            className="mt-5 cursor-pointer rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-800"
          >
            Try again
          </button>
        </div>
      ) : isLoading && !supplierResponse ? (
        <div className="mt-4 rounded-[18px] border border-[#dde3de] bg-white px-6 py-12 text-center text-[#68736c]">
          Loading suppliers…
        </div>
      ) : suppliers.length > 0 ? (
        <>
          <div className={`mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3 ${isLoading ? 'opacity-60' : ''}`}>
            {suppliers.map((supplier) => (
              <SupplierCard
                key={supplier.id}
                supplier={supplier}
                onSelect={(selectedSupplier) =>
                  navigate(`/errands/new?supplierId=${encodeURIComponent(selectedSupplier.id)}`, {
                    state: {
                      supplier: {
                        id: selectedSupplier.id,
                        name: selectedSupplier.name,
                        category: selectedSupplier.category.name,
                      },
                    },
                  })
                }
              />
            ))}
          </div>

          {page && page.totalPages > 1 ? (
            <nav className="mt-9 flex items-center justify-center gap-4" aria-label="Supplier pages">
              <button
                type="button"
                disabled={!page.hasPrevious || isLoading}
                onClick={() => requestPage(Math.max(0, page.number - 1))}
                className="cursor-pointer rounded-lg border border-[#dde3de] bg-white px-4 py-2 text-sm font-semibold text-[#175c45] transition hover:bg-[#f0f6f2] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-[#68736c]">
                Page {page.number + 1} of {page.totalPages}
              </span>
              <button
                type="button"
                disabled={!page.hasNext || isLoading}
                onClick={() => requestPage(page.number + 1)}
                className="cursor-pointer rounded-lg border border-[#dde3de] bg-white px-4 py-2 text-sm font-semibold text-[#175c45] transition hover:bg-[#f0f6f2] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </nav>
          ) : null}
        </>
      ) : (
        <div className="mt-4 rounded-[18px] border border-dashed border-[#bdc8c0] bg-white px-6 py-12 text-center">
          <h2 className="text-lg font-semibold text-[#17211d]">No suppliers found</h2>
          <p className="mt-2 text-sm text-[#68736c]">
            Try checking the spelling or using a different supplier name.
          </p>
        </div>
      )}
    </section>
  )
}
