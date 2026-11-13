import { useRef } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import bagIcon from '../assets/foc-bag.svg'
import { navigateTo } from '../navigation'
import styles from './AppShell.module.css'
import { NotificationBell } from './NotificationBell'
import { NotificationPush } from './NotificationPush'

export function AppShell() {
  const accountMenuRef = useRef<HTMLDetailsElement>(null)
  const {
    session,
    signOut,
    workspaceBusy,
    workspaceError,
    selectWorkspaceRole,
  } = useAuth()
  const location = useLocation()
  const returnTo = `${location.pathname}${location.search}`
  const locationsPath =
    session?.role === 'ADMIN' ? '/admin/suppliers' : '/suppliers'
  const errandsPath =
    session?.role === 'REQUESTER' || session?.role === 'USER'
      ? '/errands/mine'
      : '/errands/browse'

  const openAdminWorkspace = async () => {
    if (!(await selectWorkspaceRole('ADMIN'))) return
    if (accountMenuRef.current) accountMenuRef.current.open = false
    navigateTo('/admin')
  }

  const returnToRequesterWorkspace = async () => {
    if (!(await selectWorkspaceRole('REQUESTER'))) return
    if (accountMenuRef.current) accountMenuRef.current.open = false
    navigateTo('/suppliers')
  }

  const accountInitial = session?.username.trim().charAt(0).toUpperCase()

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <a
            className={styles.brand}
            href={session?.role === 'ADMIN' ? '/admin' : '/'}
          >
            <img alt="" height="24" src={bagIcon} width="24" />
            <span>Friend on Campus</span>
          </a>
          <nav aria-label="Main navigation" className={styles.serviceNav}>
            {session?.role === 'ADMIN' ? (
              <>
                <a href="/admin">Admin</a>
                <Link aria-current="page" to={locationsPath}>
                  Suppliers
                </Link>
              </>
            ) : (
              <>
                <a href="/">Home</a>
                <a href={errandsPath}>Errands</a>
                <Link aria-current="page" to={locationsPath}>
                  Suppliers
                </Link>
                <a href="/credits">Credits</a>
              </>
            )}
          </nav>
          <nav aria-label="Account and workspace" className={styles.actions}>
            {session && session.role !== 'ADMIN' && (
              <div
                aria-label="Choose your current role"
                className={styles.workspaceSelector}
                role="group"
              >
                <span className={styles.workspaceSelectorOptions}>
                  <button
                    aria-pressed={session.role === 'REQUESTER'}
                    disabled={workspaceBusy}
                    onClick={() => {
                      void selectWorkspaceRole('REQUESTER')
                    }}
                    type="button"
                  >
                    Requester
                  </button>
                  <button
                    aria-pressed={session.role === 'COURIER'}
                    disabled={workspaceBusy}
                    onClick={() => {
                      void selectWorkspaceRole('COURIER')
                    }}
                    type="button"
                  >
                    Courier
                  </button>
                </span>
              </div>
            )}
            {session?.role !== 'ADMIN' && (
              <NotificationBell
                badgeClassName={styles.notificationBadge}
                className={styles.notificationBell}
              />
            )}
            {session ? (
              <>
                <details className={styles.userMenu} ref={accountMenuRef}>
                  <summary
                    aria-label={`Open account menu for ${session.username}`}
                    title="Account menu"
                  >
                    <span aria-hidden="true" className={styles.accountAvatar}>
                      {accountInitial}
                    </span>
                    <span className={styles.accountName}>
                      {session.username}
                    </span>
                    <span aria-hidden="true" className={styles.menuChevron} />
                  </summary>
                  <div className={styles.userMenuItems}>
                    <a href="/?view=profile">Profile</a>
                    {session.role === 'ADMIN' && (
                      <a href="/?view=users">Manage users</a>
                    )}
                    {session.availableRoles?.includes('ADMIN') &&
                      session.role !== 'ADMIN' && (
                        <button
                          disabled={workspaceBusy}
                          onClick={() => {
                            void openAdminWorkspace()
                          }}
                          type="button"
                        >
                          Switch to Admin
                        </button>
                      )}
                    {session.role === 'ADMIN' && (
                      <button
                        disabled={workspaceBusy}
                        onClick={() => {
                          void returnToRequesterWorkspace()
                        }}
                        type="button"
                      >
                        Switch to User
                      </button>
                    )}
                    <span aria-hidden="true" className={styles.menuDivider} />
                    <button
                      className={styles.menuSignOut}
                      onClick={() => {
                        signOut()
                        navigateTo('/')
                      }}
                      type="button"
                    >
                      Sign out
                    </button>
                  </div>
                </details>
              </>
            ) : (
              <a href={`/?returnTo=${encodeURIComponent(returnTo)}`}>
                <LogIn aria-hidden="true" />
                Sign in
              </a>
            )}
          </nav>
        </div>
      </header>
      <NotificationPush role={session?.role} />
      {workspaceError && (
        <p className={styles.workspaceError} role="alert">
          {workspaceError}
        </p>
      )}
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
