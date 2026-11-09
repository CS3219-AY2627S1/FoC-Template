/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
 * Scope: Top navigation bar showing display name, @username, the admin-only marker
 *        and a logout button (author decisions).
 * Author review: Reviewed and approved by @t-leongchuan
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-27. Scope: added the
 * administrator Supplier management navigation entry for issue #30.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-27. Scope: kept the
 * shared navigation visible while Supplier pages scroll.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), 2026-11-09. Scope: added
 * the Suppliers / Open errands / My errands / Post errand navigation row.
 * Author review: Reviewed and approved by @mattis.
 */
import { Link, NavLink } from 'react-router'
import { useAuth } from '../auth/authContext'
import { APP_NAME } from '../config'

// "Alice Tan" -> "AT", "bob_member" -> "BO"
function initials(name: string): string {
  const words = name.trim().split(/\s+/)
  const letters = words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)
  return letters.toUpperCase()
}

export function TopBar() {
  const { user, logout } = useAuth()
  if (!user) return null

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex shrink-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-800 text-sm font-bold text-white" aria-hidden="true">
            CE
          </span>
          {/* The name is hidden on narrow (phone) screens to leave room for the user's name */}
          <span className="hidden font-semibold text-navy-900 sm:inline">{APP_NAME}</span>
        </div>

        <div className="flex min-w-0 items-center gap-3">
          {user.role === 'ADMINISTRATOR' && (
            <Link
              to="/suppliers/admin"
              className="inline-flex shrink-0 rounded-lg border border-navy-100 px-2 py-1.5 text-sm font-semibold text-navy-800 hover:bg-navy-50 sm:px-3"
            >
              <span className="sm:hidden">Manage</span>
              <span className="hidden sm:inline">Manage Suppliers</span>
            </Link>
          )}
          <div className="min-w-0 text-right">
            <p className="truncate text-sm font-semibold text-navy-900">
              {user.displayName}
              {/* Only admins ever see this; members get no hint that roles exist */}
              {user.role === 'ADMINISTRATOR' && (
                <span className="ml-2 rounded bg-accent-500 px-1.5 py-0.5 align-middle text-[10px] font-bold tracking-wide text-white">
                  ADMIN
                </span>
              )}
            </p>
            <p className="truncate text-xs text-slate-500">@{user.username}</p>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-800 text-xs font-semibold text-white" aria-hidden="true">
            {initials(user.displayName)}
          </span>
          <button
            type="button"
            onClick={logout}
            className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-navy-800 hover:bg-navy-50"
          >
            Log out
          </button>
        </div>
      </div>
      <nav aria-label="Main" className="border-t border-slate-100">
        {/* Scrolls sideways on its own on narrow screens rather than widening the page */}
        <div className="mx-auto flex max-w-5xl items-center gap-0.5 overflow-x-auto px-2 py-1.5 whitespace-nowrap sm:gap-1 sm:px-4">
          <MainLink to="/suppliers" end={false}>Suppliers</MainLink>
          <MainLink to="/errands" end>Open errands</MainLink>
          <MainLink to="/errands/mine" end>My errands</MainLink>
          <Link
            to="/errands/new"
            className="ml-auto shrink-0 rounded-lg bg-accent-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-600"
          >
            Post<span className="hidden sm:inline"> errand</span>
          </Link>
        </div>
      </nav>
    </header>
  )
}

function MainLink({ to, end, children }: { to: string; end: boolean; children: string }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `shrink-0 rounded-lg px-2 py-1.5 text-sm font-semibold sm:px-3 ${
          isActive ? 'bg-navy-100 text-navy-900' : 'text-slate-600 hover:bg-navy-50 hover:text-navy-900'
        }`
      }
    >
      {children}
    </NavLink>
  )
}
