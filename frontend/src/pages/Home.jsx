/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Created to replace Landing.jsx at "/", per instructions.md Stage 22 ("Landing page:
 *        Removed" / "/ (home): Redirects: logged in -> the current view's main page; logged
 *        out -> /login"). Waits for session restore to finish before redirecting (status !==
 *        'loading'), per the stage's "Watch for" note, so a logged-in courier is never briefly
 *        sent to /suppliers.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { mainPageFor } from '../routing/views'

export default function Home() {
  const { status, isLoggedIn, user } = useAuth()

  if (status === 'loading') return null
  if (!isLoggedIn) return <Navigate to="/login" replace />
  return <Navigate to={mainPageFor(user.activeView)} replace />
}
