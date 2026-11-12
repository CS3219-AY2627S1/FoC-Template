/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Scope: Implementation, refactoring, and test assistance for the recorded frontend work.
 */
import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './useAuth'
import { UnauthorizedPage } from '../../pages/UnauthorizedPage'

function SessionLoadingScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f7f4] px-4 text-[#17211d]">
      <p className="text-sm font-medium text-[#68736c]" role="status">
        Restoring your session…
      </p>
    </main>
  )
}

export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <SessionLoadingScreen />
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}

export function PublicOnlyRoute() {
  const { status } = useAuth()

  if (status === 'loading') return <SessionLoadingScreen />
  if (status === 'authenticated') return <Navigate to="/" replace />

  return <Outlet />
}

export function RequireAdmin() {
  const { currentUserType } = useAuth()
  return currentUserType === 'Administrator' ? <Outlet /> : <UnauthorizedPage />
}
