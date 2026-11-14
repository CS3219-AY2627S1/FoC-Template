/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Created shared loading / error / logged-out notices and a pager for the screens that read the
 *        Supplier Service. Visual implementation only. No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
 * Scope: Reads session state from the new AuthContext instead of DemoContext, and the "Log
 *        in" button calls requireAuth instead of the deleted LoginModal's requireLogin, per
 *        instructions.md Stage 16b.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { ChevronLeft, ChevronRight } from 'lucide-react'
import Button from './Button'
import EmptyState from './EmptyState'
import { useAuth } from '../context/AuthContext'

// Shown in place of a list or page while it cannot be displayed. Returns null when there is nothing to
// say, so a screen can render it first and continue when it is null.
export function useApiNotice({ loading, error }, what = 'suppliers') {
  const { isLoggedIn, sessionReady, requireAuth } = useAuth()

  if (!sessionReady || (isLoggedIn && loading)) {
    return <p className="mt-6 text-sm text-ink-40">Loading {what}…</p>
  }
  if (!isLoggedIn) {
    return (
      <div className="mt-6">
        <EmptyState
          title={'Log in to see ' + what}
          body="The supplier list comes from the Supplier Service, which needs an account."
          action={
            <Button size="sm" onClick={() => requireAuth('Log in to see ' + what + '.')}>
              Log in
            </Button>
          }
        />
      </div>
    )
  }
  if (error) {
    return (
      <div className="mt-6">
        <EmptyState
          title={error.status === 403 ? 'You do not have access to this' : 'Could not load ' + what}
          body={error.message}
        />
      </div>
    )
  }
  return null
}

// Previous / next over the service's fixed 50-per-page metadata.
export function Pager({ metadata, onPage }) {
  if (!metadata || metadata.totalPages <= 1) return null
  const { currPage, totalPages } = metadata
  return (
    <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pages">
      <Button variant="secondary" size="sm" disabled={currPage <= 1} onClick={() => onPage(currPage - 1)}>
        <ChevronLeft size={15} aria-hidden="true" />
        Previous
      </Button>
      <span className="text-sm text-ink-70">
        Page <span className="tnum">{currPage}</span> of <span className="tnum">{totalPages}</span>
      </span>
      <Button variant="secondary" size="sm" disabled={currPage >= totalPages} onClick={() => onPage(currPage + 1)}>
        Next
        <ChevronRight size={15} aria-hidden="true" />
      </Button>
    </nav>
  )
}
