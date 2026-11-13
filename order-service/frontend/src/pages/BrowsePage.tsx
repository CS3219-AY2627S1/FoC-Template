import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { SearchX } from 'lucide-react'
import { fetchOpenPool, type PoolQuery, type PoolSort } from '../api/orderApi'
import { ErrandCard } from '../components/ErrandCard'
import { ErrandTabs } from '../components/ErrandTabs'
import { ErrandListSkeleton } from '../components/Skeleton'
import { StatePanel } from '../components/StatePanel'
import { formatDeadline } from '../utils/orderFormatting'

const FILTER_KEY = 'foc.errands.browse'

const SORTS: { value: PoolSort; label: string }[] = [
  { value: 'deadline', label: 'Nearest pickup deadline' },
  { value: 'reward', label: 'Highest credits' },
  { value: 'pickupLocationName', label: 'Pickup location (A–Z)' },
]

/** F4.4: the filter and sort survive leaving the list and coming back (same browser tab). */
function loadQuery(): PoolQuery {
  try {
    const saved = JSON.parse(
      sessionStorage.getItem(FILTER_KEY) ?? 'null',
    ) as Partial<PoolQuery> | null
    if (saved && SORTS.some((sort) => sort.value === saved.sort)) {
      return {
        minReward: saved.minReward || undefined,
        maxReward: saved.maxReward || undefined,
        sort: saved.sort as PoolSort,
        page: 0,
      }
    }
  } catch {
    // Ignore a corrupted saved filter.
  }
  return { sort: 'deadline', page: 0 }
}

function saveQuery(query: PoolQuery) {
  sessionStorage.setItem(FILTER_KEY, JSON.stringify({ ...query, page: 0 }))
}

export function BrowsePage() {
  const [query, setQuery] = useState<PoolQuery>(loadQuery)
  const [draft, setDraft] = useState({
    minReward: query.minReward ? String(query.minReward) : '',
    maxReward: query.maxReward ? String(query.maxReward) : '',
    sort: query.sort,
  })
  const [formError, setFormError] = useState('')
  const pool = useQuery({
    queryKey: ['orders', 'pool', query],
    queryFn: () => fetchOpenPool(query),
    placeholderData: keepPreviousData,
  })

  const applyFilters = (event: FormEvent) => {
    event.preventDefault()
    const min = draft.minReward ? Number(draft.minReward) : undefined
    const max = draft.maxReward ? Number(draft.maxReward) : undefined
    if (
      (min !== undefined && !(Number.isInteger(min) && min > 0)) ||
      (max !== undefined && !(Number.isInteger(max) && max > 0))
    ) {
      setFormError('Rewards must be whole numbers of credits, 1 or more.')
      return
    }
    if (min !== undefined && max !== undefined && min > max) {
      setFormError('The minimum reward cannot be more than the maximum.')
      return
    }
    setFormError('')
    const next: PoolQuery = {
      minReward: min,
      maxReward: max,
      sort: draft.sort,
      page: 0,
    }
    saveQuery(next)
    setQuery(next)
  }

  const filtered = query.minReward !== undefined || query.maxReward !== undefined
  const clearFilters = () => {
    const next: PoolQuery = { sort: query.sort, page: 0 }
    setFormError('')
    setDraft({ minReward: '', maxReward: '', sort: query.sort })
    saveQuery(next)
    setQuery(next)
  }

  const page = pool.data
  return (
    <>
      <div className="courier-page-heading">
        <div className="page-intro">
          <p className="eyebrow">Courier activity</p>
          <h1>Campus errands</h1>
        </div>
        <ErrandTabs />
      </div>
      <div className="tab-content-heading">
        <div>
          <h2>Open campus requests</h2>
          <p>Choose an errand that fits your route.</p>
        </div>
      </div>
      <div className="two-column">
        <section aria-labelledby="results-heading">
          <h3 className="visually-hidden" id="results-heading">
            Open errands
          </h3>
          {pool.isPending && <ErrandListSkeleton label="Loading errands…" />}
          {pool.isError && (
            <div className="notice notice-error" role="alert">
              We couldn't load errands. {pool.error.message}
            </div>
          )}
          {page && page.items.length === 0 && (
            <StatePanel
              action={
                filtered && (
                  <button className="button-secondary" onClick={clearFilters} type="button">
                    Clear filters
                  </button>
                )
              }
              icon={SearchX}
              title="No matching errands"
            >
              {filtered
                ? 'No open errands match these filters. Try a wider reward range.'
                : 'No open errands right now. New requests appear here as students post them.'}
            </StatePanel>
          )}
          {page && page.items.length > 0 && (
            <>
              <p className="subtle" aria-live="polite">
                {page.totalItems} open{' '}
                {page.totalItems === 1 ? 'errand' : 'errands'}
              </p>
              <ul className="errand-list">
                {page.items.map((order) => (
                  <ErrandCard
                    key={order.id}
                    order={order}
                    timingLabel={`Pick up by ${formatDeadline(order.pickupDeadline)}`}
                  />
                ))}
              </ul>
              {page.totalPages > 1 && (
                <nav aria-label="Pages" className="actions">
                  <button
                    className="button-secondary"
                    disabled={query.page === 0}
                    onClick={() => setQuery({ ...query, page: query.page - 1 })}
                    type="button"
                  >
                    Previous
                  </button>
                  <span className="subtle">
                    Page {page.page + 1} of {page.totalPages}
                  </span>
                  <button
                    className="button-secondary"
                    disabled={query.page + 1 >= page.totalPages}
                    onClick={() => setQuery({ ...query, page: query.page + 1 })}
                    type="button"
                  >
                    Next
                  </button>
                </nav>
              )}
            </>
          )}
        </section>
        <aside aria-labelledby="filters-heading" className="card">
          <h2 id="filters-heading">Find a suitable trip</h2>
          <form className="filter-form" noValidate onSubmit={applyFilters}>
            <label htmlFor="min-reward">Minimum reward</label>
            <input
              id="min-reward"
              inputMode="numeric"
              min={1}
              onChange={(event) =>
                setDraft({ ...draft, minReward: event.target.value })
              }
              placeholder="Any credits"
              type="number"
              value={draft.minReward}
            />
            <label htmlFor="max-reward">Maximum reward</label>
            <input
              id="max-reward"
              inputMode="numeric"
              min={1}
              onChange={(event) =>
                setDraft({ ...draft, maxReward: event.target.value })
              }
              placeholder="Any credits"
              type="number"
              value={draft.maxReward}
            />
            <label htmlFor="sort">Sort by</label>
            <select
              id="sort"
              onChange={(event) =>
                setDraft({ ...draft, sort: event.target.value as PoolSort })
              }
              value={draft.sort}
            >
              {SORTS.map((sort) => (
                <option key={sort.value} value={sort.value}>
                  {sort.label}
                </option>
              ))}
            </select>
            {formError && (
              <p className="notice notice-error" role="alert">
                {formError}
              </p>
            )}
            <button type="submit">Apply filters</button>
          </form>
        </aside>
      </div>
    </>
  )
}
