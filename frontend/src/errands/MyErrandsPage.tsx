/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Member page listing the viewer's own errands as requester or courier (OS-F7), with a
 *        state filter and paging kept in the URL.
 * Author review: Reviewed and approved by @mattis.
 */
import { Link, useSearchParams } from 'react-router'
import { listMyErrands } from '../api/errandApi'
import { Pagination } from '../components/Pagination'
import { TopBar } from '../components/TopBar'
import { ErrandCard } from './ErrandCard'
import { ErrandListSkeleton } from './ErrandListSkeleton'
import { ErrandRequestError } from './ErrandRequestError'
import { pageFromParams, totalPages } from './paging'
import { STATE_LABELS } from './presentation'
import { ERRAND_LIST_DEFAULT_SIZE, ERRAND_STATES, type ErrandRole, type ErrandState } from './types'
import { useRemoteData } from './useRemoteData'

const TABS: readonly { readonly role: ErrandRole; readonly label: string; readonly empty: string }[] = [
  { role: 'requester', label: 'Requested', empty: "You haven't posted any errands yet." },
  { role: 'courier', label: 'Delivering', empty: "You aren't delivering any errands. Accept one from the open list." },
]

export function MyErrandsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const role: ErrandRole = searchParams.get('as') === 'courier' ? 'courier' : 'requester'
  const rawState = searchParams.get('state')
  const state = rawState !== null && (ERRAND_STATES as readonly string[]).includes(rawState) ? (rawState as ErrandState) : undefined
  const page = pageFromParams(searchParams)
  const { data, error, loading, reload } = useRemoteData(`mine:${role}:${state ?? ''}:${page}`, (signal) =>
    listMyErrands({ as: role, state, page, size: ERRAND_LIST_DEFAULT_SIZE }, signal),
  )
  const here = `/errands/mine${searchParams.toString() ? `?${searchParams.toString()}` : ''}`
  const tab = TABS.find((candidate) => candidate.role === role)!

  function update(changes: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams)
    for (const [name, value] of Object.entries(changes)) {
      if (value === undefined || value === '') params.delete(name)
      else params.set(name, value)
    }
    setSearchParams(params)
  }

  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-600">Your errands</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy-900 sm:text-4xl">My errands</h1>
          </div>
          <Link
            to="/errands/new"
            className="inline-flex min-h-11 items-center self-start rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600 sm:self-auto"
          >
            Post an errand
          </Link>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1" role="group" aria-label="Your part in the errand">
            {TABS.map((candidate) => (
              <button
                key={candidate.role}
                type="button"
                aria-pressed={candidate.role === role}
                onClick={() => update({ as: candidate.role === 'requester' ? undefined : candidate.role, page: undefined })}
                className={`min-h-10 flex-1 rounded-lg px-4 text-sm font-semibold sm:flex-none ${
                  candidate.role === role ? 'bg-navy-800 text-white' : 'text-navy-800 hover:bg-navy-50'
                }`}
              >
                {candidate.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="errand-state-filter" className="text-sm font-medium text-navy-900">
              State
            </label>
            <select
              id="errand-state-filter"
              value={state ?? ''}
              onChange={(event) => update({ state: event.target.value, page: undefined })}
              className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm sm:flex-none"
            >
              <option value="">All states</option>
              {ERRAND_STATES.map((value) => (
                <option key={value} value={value}>
                  {STATE_LABELS[value]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={reload}
              disabled={loading}
              className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-navy-800 hover:bg-navy-50 disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
        </div>

        <section className="mt-6 space-y-5" aria-label={`${tab.label} errands`} aria-busy={loading}>
          {error !== null && <ErrandRequestError error={error} onRetry={reload} />}
          {error === null && data === null && <ErrandListSkeleton />}
          {error === null && data !== null && data.items.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <h2 className="text-lg font-bold text-navy-900">Nothing here</h2>
              <p className="mt-2 text-sm text-slate-600">
                {state ? `No ${tab.label.toLowerCase()} errands are ${STATE_LABELS[state].toLowerCase()}.` : tab.empty}
              </p>
              {role === 'courier' && !state && (
                <Link to="/errands" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-navy-700 underline">
                  Browse open errands
                </Link>
              )}
            </div>
          )}
          {error === null && data !== null && data.items.length > 0 && (
            <>
              <ul className="grid gap-4 sm:grid-cols-2">
                {data.items.map((errand) => (
                  <ErrandCard key={errand.id} errand={errand} from={here} />
                ))}
              </ul>
              <Pagination
                page={data.page}
                totalPages={totalPages(data)}
                totalItems={data.totalItems}
                noun="errands"
                label="My errand pages"
                onPageChange={(next) => update({ page: next > 0 ? String(next) : undefined })}
              />
            </>
          )}
        </section>
      </main>
    </>
  )
}
