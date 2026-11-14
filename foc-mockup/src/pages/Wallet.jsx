/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component Wallet.jsx from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 */

import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Ban, RotateCcw, Star } from 'lucide-react'
import CreditPill from '../components/CreditPill'
import { transactions, TX_FILTERS } from '../data/transactions'
import { useDemo } from '../context/DemoContext'

const ICONS = {
  earned: ArrowDown,
  spent: ArrowUp,
  reserved: Ban,
  returned: RotateCcw,
  bonus: Star,
}

// Credit F1.5.1 balance with reserved/unreserved, F1.5.2 history, F2.1.1 logged detail.
export default function Wallet() {
  const { credits, isLoggedIn, requireLogin } = useDemo()

  // Gated when logged out (§9): the page stays visible behind the scrim.
  useEffect(() => {
    if (!isLoggedIn) requireLogin('You need an account to view your credits.')
  }, [isLoggedIn, requireLogin])
  const [filter, setFilter] = useState('All')
  const [expanded, setExpanded] = useState(null)

  const shown = transactions.filter((t) =>
    filter === 'All' ? true : t.type === filter.toLowerCase(),
  )
  const availablePct = Math.round((credits.available / credits.total) * 100)

  return (
    <div className="page-width page-gutter py-8 md:py-10">
      <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">Your credits</h1>

      <section className="mt-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
          <CreditPill value={credits.available} size="lg" />
          <div className="flex flex-wrap items-baseline gap-x-2 text-base">
            <span className="font-medium text-ink">available</span>
            <span className="text-ink-40">
              <span className="tnum">{credits.reserved}</span> reserved ·{' '}
              <span className="tnum">{credits.total}</span> total
            </span>
          </div>
        </div>

        {/* The one place orange gets real surface area. */}
        <div className="mt-6 flex h-3 w-full overflow-hidden rounded-pill bg-surface-alt">
          <div
            className="h-full bg-ink"
            style={{ width: availablePct + '%' }}
            role="img"
            aria-label={credits.available + ' of ' + credits.total + ' credits available'}
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
          Credits stay inside FoC. They aren&rsquo;t money and can&rsquo;t be bought, cashed out, or
          transferred outside a completed errand.
        </p>
      </section>

      <section className="mt-10 border-t border-line pt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-ink">Activity</h2>
          <label className="flex items-center gap-2 text-sm text-ink-70">
            <span className="sr-only">Filter transactions</span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-11 cursor-pointer rounded-btn border border-line bg-surface px-2 text-sm text-ink md:h-10"
            >
              {TX_FILTERS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
        </div>

        <ul className="mt-4">
          {shown.map((t) => {
            const Icon = ICONS[t.type]
            const open = expanded === t.id
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
                    <span className="block truncate text-sm font-medium text-ink">{t.title}</span>
                    <span className="mt-0.5 flex flex-wrap gap-x-2 text-sm text-ink-40">
                      <span className="truncate">{t.counterparty}</span>
                      <span className="sm:hidden">· {t.date}</span>
                    </span>
                  </span>
                  <span className="tnum hidden shrink-0 text-sm text-ink-40 sm:block">{t.date}</span>
                  <span
                    className={
                      'tnum w-12 shrink-0 text-right text-base font-semibold ' +
                      (t.delta > 0 ? 'text-ink' : 'text-ink-40')
                    }
                  >
                    {t.delta > 0 ? '+' : '−'}
                    {Math.abs(t.delta)}
                  </span>
                </button>

                {open && (
                  <dl className="foc-fade grid gap-2 pb-4 pl-10 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-ink-40">Type</dt>
                      <dd className="capitalize text-ink-70">{t.type}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-40">User</dt>
                      <dd className="text-ink-70">{t.userLabel}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-40">Timestamp</dt>
                      <dd className="tnum text-ink-70">{t.timestamp}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-40">Errand</dt>
                      <dd className="text-ink-70">{t.requestId || 'Not linked to an errand'}</dd>
                    </div>
                  </dl>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
