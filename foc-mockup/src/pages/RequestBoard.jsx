/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component RequestBoard.jsx from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 */

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import RequestCard from '../components/RequestCard'
import EmptyState from '../components/EmptyState'
import Button from '../components/Button'
import { useDemo } from '../context/DemoContext'
import { minutesUntil } from '../data/requests'
import { getSupplier, matchesQuery } from '../data/suppliers'

const FILTERS = ['All', 'Near me', '3+ credits', 'Expiring soon']
const NEAR_ME = ['COM1 Basement', 'COM2 Level 3 Lounge', 'LT19', 'Central Library']

// Order F2.1 listing, F2.1.1 detail, F3.1 acceptance, F3.2 validation, F3.5.1/F3.5.2 updates.
export default function RequestBoard() {
  const { requests } = useDemo()
  const navigate = useNavigate()
  const [filter, setFilter] = useState('All')
  const [query, setQuery] = useState('')

  // The board shows live errands only: everything past delivery lives in My activity.
  const board = useMemo(
    () => requests.filter((r) => r.status === 'open' || r.status === 'accepted'),
    [requests],
  )

  const shown = useMemo(
    () =>
      board.filter((r) => {
        // "Places" means either end of the errand: the stall it comes from, or where it goes.
        if (query.trim()) {
          const supplier = getSupplier(r.supplierId)
          const hitsSupplier = matchesQuery(supplier, query)
          const hitsDropoff = r.deliveryLocation
            .toLowerCase()
            .includes(query.trim().toLowerCase())
          if (!hitsSupplier && !hitsDropoff) return false
        }
        if (filter === 'Near me') return NEAR_ME.includes(r.deliveryLocation)
        if (filter === '3+ credits') return r.credits >= 3
        if (filter === 'Expiring soon') return minutesUntil(r.expiresAt) <= 45
        return true
      }),
    [board, filter, query],
  )

  const openCount = board.filter((r) => r.status === 'open').length

  return (
    <div className="page-width page-gutter py-8 md:py-10">
      <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">Find errands</h1>
      <p className="mt-1.5 text-base text-ink-70">
        <span className="tnum">{openCount}</span> open near you
      </p>

      <div className="relative mt-5">
        <Search
          size={18}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-40"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search stalls, venues, or drop-off points"
          aria-label="Search errands by place"
          className="h-12 w-full rounded-btn border border-line bg-surface pl-11 pr-4 text-base text-ink"
        />
      </div>

      <div className="hide-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={
              'h-11 md:h-10 shrink-0 rounded-pill border px-4 text-sm font-medium transition-colors duration-150 ' +
              (filter === f
                ? 'border-ink bg-ink text-white'
                : 'border-line bg-surface text-ink-70 hover:border-ink hover:text-ink')
            }
          >
            {f}
          </button>
        ))}
      </div>

      {/* F3.5.2 — the board is meant to update live. This is the affordance, not a socket. */}
      <div className="mt-6">
        <div className="h-px w-full bg-blue" aria-hidden="true" />
        <p className="mt-2 flex items-center gap-2 text-xs text-ink-40">
          <span className="foc-pulse inline-block h-1.5 w-1.5 rounded-pill bg-blue" aria-hidden="true" />
          Updating live
        </p>
      </div>

      <div className="mt-4 space-y-3">
        {shown.map((r) => (
          <RequestCard key={r.id} request={r} />
        ))}
      </div>

      {shown.length === 0 && (
        <div className="mt-4">
          <EmptyState
            title={query.trim() ? 'No errands match that search' : 'No open errands right now'}
            body={
              query.trim()
                ? 'Try a stall, a venue like The Deck, or a drop-off point.'
                : 'Check back in a bit, or post one yourself.'
            }
            action={
              <Button variant="secondary" size="sm" onClick={() => navigate('/requests/new')}>
                Post an errand
              </Button>
            }
          />
        </div>
      )}
    </div>
  )
}
