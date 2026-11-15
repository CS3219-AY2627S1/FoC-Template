/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
 * Scope: Route guard that sends already-logged-in users from login/register to the landing page.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../auth/authContext'

export function RedirectIfLoggedIn({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  if (status === 'loggedIn') return <Navigate to="/" replace />
  return children
}
