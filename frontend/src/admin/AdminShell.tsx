/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: Shared frame for the User Service admin pages: top bar, the author's three tabs
 *        (Accounts, Login activity, Audit log) and the administrator-only notice.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import { useAuth } from '../auth/authContext'
import { TopBar } from '../components/TopBar'

const TABS = [
  { to: '/admin/accounts', label: 'Accounts' },
  { to: '/admin/login-activity', label: 'Login activity' },
  { to: '/admin/audit', label: 'Audit log' },
] as const

/** Pages put their data-loading parts in `children`, so members never trigger admin requests */
export function AdminShell({ title, intro, children }: { title?: string; intro?: string; children: ReactNode }) {
  const { user } = useAuth()
  return <>
    <TopBar />
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      {user?.role !== 'ADMINISTRATOR' ? (
        // Only for UX: the User Service checks the role on every admin call
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6" role="alert">
          <h1 className="text-xl font-bold text-navy-900">Administrator access required</h1>
          <p className="mt-2 text-sm text-slate-700">These pages are for administrators only.</p>
        </div>
      ) : <>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-600">Administration</p>
        <nav aria-label="Administration" className="mt-3 flex gap-1 overflow-x-auto border-b border-slate-200">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-semibold ${
                  isActive ? 'border-accent-500 text-navy-900' : 'border-transparent text-slate-600 hover:text-navy-900'
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
        {title && <h1 className="mt-6 text-3xl font-bold tracking-tight text-navy-900 sm:text-4xl">{title}</h1>}
        {intro && <p className="mt-3 text-sm leading-6 text-slate-600">{intro}</p>}
        {children}
      </>}
    </main>
  </>
}
