import { type ReactNode, useEffect, useRef, useState } from 'react'
import {
  clearSession,
  readSession,
  replaceSessionRole,
  sessionExpiredEvent,
  sessionChangedEvent,
  type WorkspaceRole,
} from '../auth/session'
import { NotificationBell } from './NotificationBell'
import { NotificationPush } from './NotificationPush'
import { navigateTo } from '../navigation'

import bagIcon from '../assets/foc-bag.svg'

export function AdminShell({
  children,
  administratorAccess,
}: {
  children: ReactNode
  administratorAccess: boolean
}) {
  const accountMenuRef = useRef<HTMLDetailsElement>(null)
  const [session, setSession] = useState(readSession)
  const [workspaceBusy, setWorkspaceBusy] = useState(false)
  const [workspaceError, setWorkspaceError] = useState('')
  const initial = session?.username.trim().charAt(0).toUpperCase() || 'F'
  const suppliersPath =
    session?.role === 'ADMIN' ? '/admin/suppliers' : '/suppliers'
  const errandsPath =
    session?.role === 'REQUESTER' || session?.role === 'USER'
      ? '/errands/mine'
      : '/errands/browse'

  useEffect(() => {
    const refreshSession = () => setSession(readSession())
    window.addEventListener(sessionExpiredEvent, refreshSession)
    window.addEventListener(sessionChangedEvent, refreshSession)
    window.addEventListener('focus', refreshSession)
    const timer = window.setInterval(refreshSession, 15_000)
    return () => {
      window.removeEventListener(sessionExpiredEvent, refreshSession)
      window.removeEventListener(sessionChangedEvent, refreshSession)
      window.removeEventListener('focus', refreshSession)
      clearInterval(timer)
    }
  }, [])

  const selectWorkspaceRole = async (role: WorkspaceRole) => {
    if (!session) return false
    if (role === session.role) return true
    setWorkspaceBusy(true)
    setWorkspaceError('')
    try {
      setSession(await replaceSessionRole(role))
      return true
    } catch (error) {
      setWorkspaceError(
        error instanceof Error
          ? error.message
          : "We couldn't switch your role. Please try again.",
      )
      return false
    } finally {
      setWorkspaceBusy(false)
    }
  }

  const selectWorkspaceRoleFromMenu = async (role: WorkspaceRole) => {
    if (!(await selectWorkspaceRole(role))) return
    if (accountMenuRef.current) accountMenuRef.current.open = false
    navigateTo(role === 'ADMIN' ? '/admin' : '/')
  }

  return (
    <div className="app-shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href={session?.role === 'ADMIN' ? '/admin' : '/'}>
            <img alt="" height="24" src={bagIcon} width="24" />
            <span>Friend on Campus</span>
          </a>
          <nav aria-label="Main navigation" className="main-nav">
            {session?.role === 'ADMIN' ? (
              <>
                <a
                  aria-current={
                    window.location.pathname.startsWith('/admin/reports')
                      ? undefined
                      : 'page'
                  }
                  href="/admin"
                >
                  Admin
                </a>
                <a href={suppliersPath}>Suppliers</a>
              </>
            ) : (
              <>
                <a href="/">Home</a>
                <a href={errandsPath}>Errands</a>
                <a href={suppliersPath}>Suppliers</a>
                <a href="/credits">Credits</a>
              </>
            )}
          </nav>
          <nav aria-label="Account and workspace" className="header-actions">
            {session && session.role !== 'ADMIN' && (
              <div
                aria-label="Choose your current role"
                className="workspace-selector"
                role="group"
              >
                <span className="workspace-selector-options">
                  <button
                    aria-pressed={session.role === 'REQUESTER'}
                    disabled={workspaceBusy}
                    onClick={() => void selectWorkspaceRole('REQUESTER')}
                    type="button"
                  >
                    Requester
                  </button>
                  <button
                    aria-pressed={session.role === 'COURIER'}
                    disabled={workspaceBusy}
                    onClick={() => void selectWorkspaceRole('COURIER')}
                    type="button"
                  >
                    Courier
                  </button>
                </span>
              </div>
            )}
            {session?.role !== 'ADMIN' && <NotificationBell />}
            {session ? (
              <details className="account-menu" ref={accountMenuRef}>
                <summary
                  aria-label={`Open account menu for ${session.username}`}
                  title="Account menu"
                >
                  <span className="avatar" aria-hidden="true">
                    {initial}
                  </span>
                  <span className="account-name">{session.username}</span>
                  <span aria-hidden="true" className="chevron" />
                </summary>
                <div className="account-menu-items">
                  <a href="/?view=profile">Profile</a>
                  {administratorAccess && (
                    <a href="/?view=users">Manage users</a>
                  )}
                  {session.availableRoles?.includes('ADMIN') &&
                    session.role !== 'ADMIN' && (
                      <button
                        disabled={workspaceBusy}
                        onClick={() =>
                          void selectWorkspaceRoleFromMenu('ADMIN')
                        }
                        type="button"
                      >
                        Switch to Admin
                      </button>
                    )}
                  {session.role === 'ADMIN' && (
                    <button
                      disabled={workspaceBusy}
                      onClick={() =>
                        void selectWorkspaceRoleFromMenu('REQUESTER')
                      }
                      type="button"
                    >
                      Switch to User
                    </button>
                  )}
                  <span aria-hidden="true" className="account-menu-divider" />
                  <button
                    className="account-menu-sign-out"
                    type="button"
                    onClick={() => {
                      clearSession()
                      window.location.assign('/')
                    }}
                  >
                    Sign out
                  </button>
                </div>
              </details>
            ) : (
              <a
                className="sign-in-link"
                href={
                  '/?returnTo=' +
                  encodeURIComponent(
                    window.location.pathname.startsWith('/admin/reports/')
                      ? window.location.pathname + window.location.search
                      : '/admin',
                  )
                }
              >
                Sign in
              </a>
            )}
          </nav>
        </div>
      </header>
      <NotificationPush role={session?.role} />
      {workspaceError && (
        <p className="workspace-error" role="alert">
          {workspaceError}
        </p>
      )}
      <main id="main" tabIndex={-1} className="page-shell">
        {children}
      </main>
    </div>
  )
}
