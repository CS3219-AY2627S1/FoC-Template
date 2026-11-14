/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component TopNav.jsx from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Shows a 'Manage suppliers' link when the demo role is Admin. No requirements, architecture, schema, or API decisions were
 *        made by the AI tool.
 * Author review: Congchen
 */

import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Bell, Menu, X } from 'lucide-react'
import Logo from './Logo'
import Button from './Button'
import CreditPill from './CreditPill'
import { firstName } from '../data/users'
import { useDemo } from '../context/DemoContext'

const LINKS = [
  { to: '/suppliers', label: 'Suppliers' },
  { to: '/requests', label: 'Find errands' },
  { to: '/activity', label: 'My activity', gated: 'You need an account to see your activity.' },
]

const ADMIN_LINK = { to: '/admin/suppliers', label: 'Manage suppliers' }

export default function TopNav() {
  const { isLoggedIn, currentUser, credits, requireLogin, setIsLoggedIn, role } = useDemo()
  const links = role === 'admin' ? [...LINKS, ADMIN_LINK] : LINKS
  const [scrolled, setScrolled] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  const navLinkClass = ({ isActive }) =>
    'text-sm font-medium transition-colors duration-150 ' +
    (isActive ? 'text-ink' : 'text-ink-70 hover:text-ink')

  const gate = (e, link) => {
    if (link.gated && !isLoggedIn) {
      e.preventDefault()
      requireLogin(link.gated)
    }
  }

  return (
    <>
      <header
        className={
          'sticky top-0 z-40 h-16 bg-surface transition-shadow duration-150 ' +
          (scrolled ? 'border-b border-line shadow-nav' : '')
        }
      >
        <div className="page-width page-gutter flex h-16 items-center justify-between gap-4">
          <Logo />

          <nav className="hidden items-center gap-8 lg:flex" aria-label="Main">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={navLinkClass}
                onClick={(e) => gate(e, link)}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            {isLoggedIn ? (
              <>
                <Link to="/wallet" aria-label={credits.available + ' credits available'}>
                  <CreditPill value={credits.available} size="md" />
                </Link>
                <button
                  type="button"
                  className="relative flex h-10 w-10 items-center justify-center rounded-btn text-ink-70 hover:bg-surface-alt"
                  aria-label="Notifications"
                >
                  <Bell size={18} aria-hidden="true" />
                  <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-pill bg-orange" />
                </button>
                <span className="text-sm font-medium text-ink">
                  {firstName(currentUser)}
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-pill bg-surface-alt text-xs font-semibold text-ink">
                  {currentUser.initials}
                </span>
              </>
            ) : (
              <Button size="sm" onClick={() => requireLogin('Log in to post and accept errands.')}>
                Log in
              </Button>
            )}
          </div>

          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-btn text-ink md:hidden"
            aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((v) => !v)}
          >
            {drawerOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </header>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="foc-fade absolute right-0 top-0 flex h-full w-[280px] flex-col gap-6 bg-surface p-5 shadow-modal">
            <div className="flex items-center justify-between">
              <Logo />
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-btn text-ink"
                aria-label="Close menu"
                onClick={() => setDrawerOpen(false)}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            {isLoggedIn && (
              <Link to="/wallet" className="flex items-center gap-3 rounded-card border border-line p-3">
                <CreditPill value={credits.available} size="md" />
                <span className="text-sm text-ink-70">available</span>
              </Link>
            )}

            <nav className="flex flex-col" aria-label="Mobile">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  onClick={(e) => gate(e, link)}
                  className="flex min-h-[44px] items-center border-b border-line text-base font-medium text-ink"
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>

            <div className="mt-auto">
              {isLoggedIn ? (
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-pill bg-surface-alt text-sm font-semibold text-ink">
                    {currentUser.initials}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{currentUser.name}</p>
                    <button
                      type="button"
                      className="text-xs text-ink-40 hover:text-ink"
                      onClick={() => setIsLoggedIn(false)}
                    >
                      Log out
                    </button>
                  </div>
                </div>
              ) : (
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => {
                    setDrawerOpen(false)
                    requireLogin('Log in to post and accept errands.')
                  }}
                >
                  Log in
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
