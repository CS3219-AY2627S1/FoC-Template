/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
 * Scope: Route guards: only show protected pages to logged-in users, and keep
 *        logged-in users away from the login/register pages.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../auth/authContext'

function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-slate-500" role="status">
      Loading…
    </div>
  )
}

// Wrap a page in <RequireAuth> to make it members-only. This is only for UX:
// the real protection is the backend rejecting requests without a valid token.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  if (status === 'checking') return <FullPageSpinner />
  if (status === 'loggedOut') return <Navigate to="/login" replace />
  return children
}
