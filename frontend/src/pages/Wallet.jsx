/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component Wallet.jsx from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 *
 * Tool: Claude Code (model: claude-opus-5), date: 2026-10-19
 * Scope: Wired the balance and the transaction list onto Credit Service, replacing the hardcoded
 *        figures from src/data. Filter options now follow Credit Service's four transaction types.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 *
 * Tool: Claude Code (model: claude-opus-5), date: 2026-10-19
 * Scope: Every row with a request_id now shows its errand reference, transfers included, so a
 *        reservation and its transfer read as one errand. Counterparty names resolve for all
 *        users via GET /users/public, keeping the shortened-id fallback.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
 * Scope: /wallet is now wrapped in RequireAuth (App.jsx), which replaces the gating effect
 *        that opened the deleted LoginModal via requireLogin. The signed-in user's id now
 *        comes from the new AuthContext instead of DemoContext, per instructions.md Stage 16b.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-08, Codex, model: GPT-6): Replaced native dropdowns with the requested searchable control.
 * Author review: Congchen
 * Scope (2026-11-10, Claude Code, model: claude-opus-5): Reservation and release rows now show the
 *        amount beside "held" / "returned", which previously rendered the word alone while an
 *        allocation showed "+20". The amount was already passed to Delta; neither type is given a
 *        signed delta, because neither changes total_balance.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import SearchableSelect from '../components/SearchableSelect'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Ban, RotateCcw } from 'lucide-react'
import CreditPill from '../components/CreditPill'
import { useApiNotice } from '../components/ApiNotice'
import { useApi } from '../api/useApi'
import { getBalance, listTransactions, resolveUserNames } from '../api/credits'
import { useAuth } from '../context/AuthContext'

// Credit Service's four transaction types (credit-service/API.md). The mock's earned/spent/
// reserved/returned vocabulary is gone: the frontend follows the API, not the reverse.
const TYPE_FILTERS = [
  { value: 'All', label: 'All' },
  { value: 'allocation', label: 'Allocation' },
  { value: 'reservation', label: 'Reservation' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'release', label: 'Release' },
]

const ICONS = { in: ArrowDown, out: ArrowUp, hold: Ban, return: RotateCcw }

// A reservation holds credits rather than spending them, and a release gives them back, so
// neither changes total_balance and neither gets a signed delta. The amount is still shown, so
// the row says how much moved, but without a + or − that would not add up against the total.
function Delta({ direction, delta, amount }) {
  if (direction === 'hold' || direction === 'return') {
    return (
      <span className="w-20 shrink-0 text-right text-sm text-ink-40">
        <span className="tnum font-medium text-ink-70">{amount}</span>{' '}
        {direction === 'hold' ? 'held' : 'returned'}
      </span>
    )
  }
  return (
    <span
      className={
        'tnum w-20 shrink-0 text-right text-base font-semibold ' +
        (delta > 0 ? 'text-ink' : 'text-ink-40')
      }
    >
      {delta > 0 ? '+' : '−'}
      {Math.abs(delta) || amount}
    </span>
  )
}

const shortId = (id) => (id ? id.slice(0, 8) : null)

// Who the credits moved to or from, and which errand they belong to. Both when both apply.
function secondaryLine(t, who) {
  const parts = []
  if (who) parts.push((t.direction === 'out' ? 'To ' : 'From ') + who)
  if (t.requestId) parts.push('Errand ' + shortId(t.requestId))
  return parts.length > 0 ? parts.join(' · ') : 'Your account'
}

// Credit F1.5.1 balance with reserved/unreserved, F1.5.2 history, F2.1.1 logged detail.
export default function Wallet() {
  const { user, isLoggedIn, sessionReady } = useAuth()
  const userId = user?.id ?? null

  const [filter, setFilter] = useState('All')
  const [expanded, setExpanded] = useState(null)

  // --- balance (F19.5.1) ---------------------------------------------------------------
  const balanceState = useApi(() => getBalance(userId), [userId])
  const balance = balanceState.data
  const notice = useApiNotice(balanceState, 'your credits')

  // --- history (F19.5.2), paged 20 at a time, lazily on scroll --------------------------
  const [rows, setRows] = useState([])
  const [cursor, setCursor] = useState(null)
  const [done, setDone] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [names, setNames] = useState(new Map())
  const sentinel = useRef(null)
  // Ids already sent to the lookup, resolved or not.
  const attempted = useRef(new Set())

  // Guards against two observer callbacks firing before the first sets loadingMore.
  const inFlight = useRef(false)

  const loadPage = useCallback(
    async (nextCursor) => {
      if (inFlight.current || !userId) return
      inFlight.current = true
      setLoadingMore(true)
      try {
        const page = await listTransactions(userId, nextCursor ?? undefined)
        setRows((current) => [...current, ...page.transactions])
        setCursor(page.nextCursor)
        if (!page.nextCursor) setDone(true)
      } finally {
        inFlight.current = false
        setLoadingMore(false)
      }
    },
    [userId],
  )

  // First page, and a reset whenever the signed-in user changes.
  useEffect(() => {
    setRows([])
    setCursor(null)
    setDone(false)
    setNames(new Map())
    attempted.current = new Set()
    if (sessionReady && isLoggedIn && userId) void loadPage(null)
  }, [sessionReady, isLoggedIn, userId, loadPage])

  // Counterparty names: one request per page of rows, never one per row. Any signed-in user
  // may call GET /users/public, so this is no longer admin-only.
  //
  // `attempted` stops an id being asked for twice. Without it an id the endpoint cannot
  // resolve - a deleted user - would stay missing from `names` and refetch forever.
  useEffect(() => {
    const wanted = [...new Set(rows.map((r) => r.counterpartyId).filter(Boolean))].filter(
      (id) => !names.has(id) && !attempted.current.has(id),
    )
    if (wanted.length === 0) return undefined
    wanted.forEach((id) => attempted.current.add(id))

    let cancelled = false
    resolveUserNames(wanted).then(
      (map) => {
        if (!cancelled && map.size > 0) setNames((prev) => new Map([...prev, ...map]))
      },
      // Lookup failed or timed out: leave the shortened-id fallback in place rather than
      // breaking the page. user-service being down must not take the wallet with it.
      () => {},
    )
    return () => {
      cancelled = true
    }
  }, [rows, names])

  // Infinite scroll: fetch the next page when the sentinel below the list comes into view.
  useEffect(() => {
    const node = sentinel.current
    if (!node || done || !cursor) return undefined
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void loadPage(cursor)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [cursor, done, loadPage])

  const shown = rows.filter((t) => filter === 'All' || t.type === filter)
  const availablePct = balance
    ? Math.round((balance.unreservedBalance / Math.max(balance.totalBalance, 1)) * 100)
    : 0

  return (
    <div className="page-width page-gutter py-8 md:py-10">
      <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">Your credits</h1>

      {notice}

      {balance && (
        <>
          <section className="mt-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
              <CreditPill value={balance.unreservedBalance} size="lg" />
              <div className="flex flex-wrap items-baseline gap-x-2 text-base">
                <span className="font-medium text-ink">available</span>
                <span className="text-ink-40">
                  <span className="tnum">{balance.reservedBalance}</span> reserved ·{' '}
                  <span className="tnum">{balance.totalBalance}</span> total
                </span>
              </div>
            </div>

            {/* The one place orange gets real surface area. */}
            <div className="mt-6 flex h-3 w-full overflow-hidden rounded-pill bg-surface-alt">
              <div
                className="h-full bg-ink"
                style={{ width: availablePct + '%' }}
                role="img"
                aria-label={
                  balance.unreservedBalance + ' of ' + balance.totalBalance + ' credits available'
                }
              />
              <div className="h-full flex-1 bg-orange" aria-hidden="true" />
            </div>
            <div className="mt-2 flex justify-between text-sm">
              <span className="flex items-center gap-1.5 text-ink-70">
                <span className="inline-block h-2 w-2 rounded-pill bg-ink" aria-hidden="true" />
                Available
              </span>
              <span className="flex items-center gap-1.5 text-ink-70">
                <span className="inline-block h-2 w-2 rounded-pill bg-orange" aria-hidden="true" />
                Reserved
              </span>
            </div>

            <p className="mt-6 max-w-prose text-base text-ink-70">
              Credits stay inside FoC. They aren&rsquo;t money and can&rsquo;t be bought, cashed
              out, or transferred outside a completed errand.
            </p>
          </section>

          <section className="mt-10 border-t border-line pt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-ink">Activity</h2>
              <label className="flex items-center gap-2 text-sm text-ink-70">
                <span className="sr-only">Filter transactions</span>
                <SearchableSelect
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="h-11 cursor-pointer rounded-btn border border-line bg-surface px-2 text-sm text-ink md:h-10"
                >
                  {TYPE_FILTERS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </SearchableSelect>
              </label>
            </div>

            <ul className="mt-4">
              {shown.map((t) => {
                const Icon = ICONS[t.direction] ?? ArrowDown
                const open = expanded === t.id
                const who = t.counterpartyId
                  ? (names.get(t.counterpartyId) ?? shortId(t.counterpartyId))
                  : null
                return (
                  <li key={t.id} className="border-b border-line">
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : t.id)}
                      aria-expanded={open}
                      className="flex w-full items-center gap-3 py-4 text-left"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-pill bg-surface-alt">
                        <Icon size={14} className="text-ink-70" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium capitalize text-ink">
                          {t.type}
                        </span>
                        <span className="mt-0.5 flex flex-wrap gap-x-2 text-sm text-ink-40">
                          {/* The errand reference stays on every row that has one, including
                              transfers. A reservation and the transfer that settles it move the
                              same credits; without a shared reference they read as two separate
                              movements. Allocations carry no request_id. */}
                          <span className="truncate">{secondaryLine(t, who)}</span>
                          <span className="sm:hidden">· {t.date}</span>
                        </span>
                      </span>
                      <span className="tnum hidden shrink-0 text-sm text-ink-40 sm:block">
                        {t.date}
                      </span>
                      <Delta direction={t.direction} delta={t.delta} amount={t.amount} />
                    </button>

                    {open && (
                      <dl className="foc-fade grid gap-2 pb-4 pl-10 text-sm sm:grid-cols-4">
                        <div>
                          <dt className="text-ink-40">Type</dt>
                          <dd className="capitalize text-ink-70">{t.type}</dd>
                        </div>
                        <div>
                          <dt className="text-ink-40">Amount</dt>
                          <dd className="tnum text-ink-70">{t.amount}</dd>
                        </div>
                        <div>
                          <dt className="text-ink-40">Timestamp</dt>
                          <dd className="tnum text-ink-70">{t.timestamp}</dd>
                        </div>
                        <div>
                          <dt className="text-ink-40">Errand</dt>
                          <dd className="text-ink-70">
                            {t.requestId ?? 'Not linked to an errand'}
                          </dd>
                        </div>
                      </dl>
                    )}
                  </li>
                )
              })}
            </ul>

            {shown.length === 0 && !loadingMore && (
              <p className="mt-6 text-sm text-ink-40">
                {rows.length === 0 ? 'No credit activity yet.' : 'Nothing of that type.'}
              </p>
            )}

            {/* Comes into view at the foot of the list and pulls the next 20 rows. */}
            <div ref={sentinel} aria-hidden="true" />
            {loadingMore && <p className="mt-4 text-sm text-ink-40">Loading more…</p>}
            {done && rows.length > 0 && (
              <p className="mt-4 text-sm text-ink-40">That&rsquo;s everything.</p>
            )}
          </section>
        </>
      )}
    </div>
  )
}
