/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component DemoControls.jsx from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Added an Admin option to the demo Role toggle, for previewing the admin supplier screens. No requirements, architecture, schema, or API decisions were
 *        made by the AI tool.
 * Author review: Congchen
 */

import { useState } from 'react'
import { ChevronDown, Sliders } from 'lucide-react'
import { useDemo, isCleanMode } from '../context/DemoContext'
import { STATUSES, STATUS_LABELS } from '../data/requests'
import { getSupplier, qualifiedName } from '../data/suppliers'

// Must not appear in screenshots: ?clean=1 removes it entirely.
export default function DemoControls() {
  const { isLoggedIn, setIsLoggedIn, role, setRole, requests, setRequestStatus } = useDemo()
  const [open, setOpen] = useState(false)
  const [targetId, setTargetId] = useState('r6')

  if (isCleanMode()) return null

  const target = requests.find((r) => r.id === targetId)

  const seg = (active) =>
    'flex-1 rounded-btn px-2 py-1.5 text-xs font-medium transition-colors duration-150 ' +
    (active ? 'bg-ink text-white' : 'bg-surface-alt text-ink-70 hover:text-ink')

  return (
    <div className="fixed bottom-4 left-4 z-40 print:hidden">
      {open ? (
        <div className="w-[268px] rounded-card border border-line bg-surface p-3 shadow-modal">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink">Demo</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-btn text-ink-40 hover:bg-surface-alt"
              aria-label="Collapse demo controls"
            >
              <ChevronDown size={16} aria-hidden="true" />
            </button>
          </div>

          <p className="mt-2 text-[11px] text-ink-40">Auth</p>
          <div className="mt-1 flex gap-1.5">
            <button type="button" className={seg(isLoggedIn)} onClick={() => setIsLoggedIn(true)}>
              Logged in
            </button>
            <button type="button" className={seg(!isLoggedIn)} onClick={() => setIsLoggedIn(false)}>
              Logged out
            </button>
          </div>

          <p className="mt-3 text-[11px] text-ink-40">Role</p>
          <div className="mt-1 flex gap-1.5">
            <button
              type="button"
              className={seg(role === 'requester')}
              onClick={() => setRole('requester')}
            >
              Requester
            </button>
            <button
              type="button"
              className={seg(role === 'courier')}
              onClick={() => setRole('courier')}
            >
              Courier
            </button>
            <button
              type="button"
              className={seg(role === 'admin')}
              onClick={() => setRole('admin')}
            >
              Admin
            </button>
          </div>

          <p className="mt-3 text-[11px] text-ink-40">Jump a request to a status</p>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="mt-1 h-9 w-full rounded-btn border border-line bg-surface px-2 text-xs text-ink"
            aria-label="Request to change"
          >
            {requests.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id} · {qualifiedName(getSupplier(r.supplierId))} · {STATUS_LABELS[r.status]}
              </option>
            ))}
          </select>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                className={seg(target?.status === s)}
                onClick={() => setRequestStatus(targetId, s)}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>

          <p className="mt-3 text-[11px] leading-snug text-ink-40">
            Add <span className="text-ink-70">?clean=1</span> to the URL to hide this panel before
            screenshotting.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-9 items-center gap-1.5 rounded-pill border border-line bg-surface px-3 text-xs font-medium text-ink shadow-nav"
        >
          <Sliders size={14} aria-hidden="true" />
          Demo
        </button>
      )}
    </div>
  )
}
