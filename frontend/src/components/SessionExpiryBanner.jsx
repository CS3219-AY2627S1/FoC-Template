/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Created per instructions.md Stage 23c: the non-dismissible banner shown at the top of
 *        every page once AuthContext's sessionExpiringSoon flips true. Visually reuses
 *        FormBanner's 'info' tone (border-line / bg-surface-alt / text-ink-70) rather than
 *        rendering FormBanner itself, since FormBanner only takes a message string and this
 *        banner needs a "Log in again" button and spans the full page width above TopNav
 *        instead of sitting inside a form. The button calls AuthContext.logout(), the same as
 *        TopNav's existing Log out control.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import Button from './Button'
import { useAuth } from '../context/AuthContext'

export default function SessionExpiryBanner() {
  const { isLoggedIn, sessionExpiringSoon, logout } = useAuth()
  if (!isLoggedIn || !sessionExpiringSoon) return null

  return (
    <div role="status" className="border-b border-line bg-surface-alt text-ink-70">
      <div className="page-width page-gutter flex flex-wrap items-center justify-between gap-3 py-2">
        <span className="text-sm">Your session will end soon. Log in again to keep working.</span>
        <Button size="sm" variant="secondary" onClick={logout}>
          Log in again
        </Button>
      </div>
    </div>
  )
}
