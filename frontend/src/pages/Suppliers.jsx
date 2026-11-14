/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component Suppliers.jsx from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: <pending — team member to sign>
 *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Rewrote the screen to read GET /api/v1/suppliers: search, one location, one category,
 *        isOpen, A-Z/Z-A and the fixed 50-per-page paging are sent to the service instead of being
 *        filtered in the browser. The service takes one location_id and one category_id, so those
 *        filters are single-choice. No requirements, architecture, schema, or API decisions were made
 *        by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-05
 * Scope: Added a Bookmarked filter that sends the user's bookmark ids and clears deleted bookmarks,
 *        per the 2026-11-05 supplier-bookmarking spec. No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-08, Codex, model: GPT-6): Replaced native dropdowns with the requested searchable control.
 * Author review: Congchen
 */

import SearchableSelect from '../components/SearchableSelect'
import { useEffect, useMemo, useState } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import SupplierCard from '../components/SupplierCard'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import { Pager, useApiNotice } from '../components/ApiNotice'
import { useApi, useReferenceData } from '../api/useApi'
import { EMPTY_PAGE, listSuppliers } from '../api/suppliers'
import { groupByLocation, locationOpenSummary } from '../data/suppliers'
import { useBookmarks } from '../context/BookmarksContext'

// §7.2: sorting is fixed to alphabetical supplier-name order, A-Z or Z-A.
const SORTS = ['A-Z', 'Z-A']

// Supplier F1.1 listing, F1.1.1 search and filter, F1.2.1 open/closed indicator.
export default function Suppliers() {
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [openNow, setOpenNow] = useState(false)
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false)
  const [sort, setSort] = useState(SORTS[0])
  const [page, setPage] = useState(1)
  const [sheetOpen, setSheetOpen] = useState(false)
  const { locations, categories } = useReferenceData()
  const { ids, ready, pruneDeleted } = useBookmarks()
  // Only the Bookmarked view depends on the ids, so bookmarking from the full list does not refetch it.
  const idsParam = bookmarkedOnly ? ids.join(',') : undefined

  // Wait for the typing to pause before asking the service.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300)
    return () => clearTimeout(timer)
  }, [query])

  // Any filter change goes back to page 1.
  useEffect(() => {
    setPage(1)
  }, [search, categoryId, locationId, openNow, bookmarkedOnly, sort])

  const params = useMemo(
    () => ({
      page,
      search,
      location_id: locationId,
      category_id: categoryId,
      isOpen: openNow ? 'true' : undefined,
      sortOrder: sort,
      ids: idsParam,
    }),
    [page, search, locationId, categoryId, openNow, sort, idsParam],
  )
  // No bookmarks: show the empty page here. The request helper drops empty query values, so an empty
  // ids would never reach the service and the call would list every supplier.
  const { data, loading, error } = useApi(
    () => (idsParam === '' ? Promise.resolve(EMPTY_PAGE) : listSuppliers(params)),
    [params],
  )
  const notice = useApiNotice({ loading: loading && !data, error })

  // Ids the service reports as deleted are cleared from the user's bookmarks.
  useEffect(() => {
    if (bookmarkedOnly && data?.unavailable?.length) pruneDeleted(data.unavailable)
  }, [bookmarkedOnly, data, pruneDeleted])

  const results = data?.data ?? []
  const total = data?.metadata.totalRecords ?? 0
  const grouped = groupByLocation(results)
  const noBookmarks = bookmarkedOnly && ready && ids.length === 0

  const clearFilters = () => {
    setQuery('')
    setCategoryId('')
    setLocationId('')
    setOpenNow(false)
    setBookmarkedOnly(false)
  }

  const radio = (name, label, checked, onChange) => (
    <label key={label} className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm text-ink-70">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 shrink-0 border-line text-ink focus:ring-blue"
      />
      <span>{label}</span>
    </label>
  )

  const filterPanel = (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-ink">Category</h3>
        <div className="mt-1">
          {radio('category', 'All', categoryId === '', () => setCategoryId(''))}
          {categories.map((c) =>
            radio('category', c.category, categoryId === String(c.category_id), () =>
              setCategoryId(String(c.category_id)),
            ),
          )}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-ink">Availability</h3>
        <label className="mt-1 flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm text-ink-70">
          <input
            type="checkbox"
            checked={openNow}
            onChange={() => setOpenNow((v) => !v)}
            className="h-4 w-4 shrink-0 rounded-[4px] border-line text-ink focus:ring-blue"
          />
          <span>Open now</span>
        </label>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-ink">Bookmarks</h3>
        <label className="mt-1 flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm text-ink-70">
          <input
            type="checkbox"
            checked={bookmarkedOnly}
            onChange={() => setBookmarkedOnly((v) => !v)}
            className="h-4 w-4 shrink-0 rounded-[4px] border-line text-ink focus:ring-blue"
          />
          <span>Bookmarked</span>
        </label>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-ink">Location</h3>
        <div className="mt-1">
          {radio('location', 'All', locationId === '', () => setLocationId(''))}
          {locations.map((l) =>
            radio('location', l.location, locationId === String(l.location_id), () =>
              setLocationId(String(l.location_id)),
            ),
          )}
        </div>
      </div>
    </div>
  )

  const sortSelect = (
    <label className="flex items-center gap-2 text-sm text-ink-70">
      <span className="shrink-0">Sort</span>
      <SearchableSelect
        value={sort}
        onChange={(e) => setSort(e.target.value)}
        className="h-11 cursor-pointer rounded-btn border border-line bg-surface px-2 text-sm text-ink md:h-10"
      >
        {SORTS.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </SearchableSelect>
    </label>
  )

  return (
    <div className="page-width page-gutter py-8 md:py-10">
      <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">Suppliers</h1>

      <div className="mt-6 flex gap-8">
        <aside className="hidden w-[220px] shrink-0 lg:block">
          <h2 className="text-base font-semibold text-ink">Filters</h2>
          <div className="mt-4">{filterPanel}</div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="relative">
            <Search
              size={18}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-40"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search suppliers, locations, or categories"
              aria-label="Search suppliers"
              className="h-12 w-full rounded-btn border border-line bg-surface pl-11 pr-4 text-base text-ink"
            />
          </div>

          {/* Sticky filter/sort bar under the nav on small screens. */}
          <div className="sticky top-16 z-30 -mx-4 mt-4 flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 lg:static lg:mx-0 lg:border-0 lg:px-0">
            <p className="text-sm text-ink-70">
              <span className="tnum font-medium text-ink">{total}</span>{' '}
              {total === 1 ? 'supplier' : 'suppliers'} on campus
            </p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setSheetOpen(true)}>
                <SlidersHorizontal size={15} aria-hidden="true" />
                Filters
              </Button>
              {sortSelect}
            </div>
          </div>

          {notice}

          {/* A view over the flat list, grouped by location. */}
          {!notice &&
            grouped.map((group) => (
              <section key={group.location} className="mt-6">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h2 className="text-base font-semibold text-ink">{group.location}</h2>
                  <p className="text-sm text-ink-40">
                    <span className="tnum">{group.items.length}</span>{' '}
                    {group.items.length === 1 ? 'supplier' : 'suppliers'} · {locationOpenSummary(group.items)}
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {group.items.map((s) => (
                    <SupplierCard key={s.id} supplier={s} />
                  ))}
                </div>
              </section>
            ))}

          {!notice && results.length === 0 && (
            <div className="mt-5">
              <EmptyState
                title={noBookmarks ? 'No bookmarked suppliers.' : 'No suppliers match those filters'}
                body={noBookmarks ? undefined : 'Try clearing a filter, or search for a location like The Deck.'}
                action={
                  <Button variant="secondary" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            </div>
          )}

          {!notice && <Pager metadata={data?.metadata} onPage={setPage} />}
        </div>
      </div>

      {sheetOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close filters"
            className="absolute inset-0 bg-black/40"
            onClick={() => setSheetOpen(false)}
          />
          <div className="foc-fade absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-card bg-surface p-5 shadow-modal">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">Filters</h2>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-btn text-ink"
                aria-label="Close filters"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <div className="mt-4">{filterPanel}</div>
            <Button size="lg" className="mt-6 w-full" onClick={() => setSheetOpen(false)}>
              Show {total} places
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
