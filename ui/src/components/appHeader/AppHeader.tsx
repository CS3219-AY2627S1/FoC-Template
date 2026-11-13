/*
AI Assistance Disclosure:
Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-09-19
Scope: Implemented the initial account drawer, profile link, and requester/courier toggle
Author review: I reviewed correctness and edited the changes to fit the project

Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-09-21
Scope: Added the admin-manager-only portal link below Profile
Author review: I reviewed correctness and edited the changes to fit the project

Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-10-27
Scope: Added the credit audit-log menu link below Profile
Author review: I reviewed correctness and edited the changes to fit the project
*/

import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useCampusErrandsAPI } from '../../api/useCampusErrandsAPI'
import { routes } from '../../routes'
import { useUser } from '../user/UserContext'
import styles from './AppHeader.module.css'

const AppHeader = () => {
  const api = useCampusErrandsAPI()
  const location = useLocation()
  const navigate = useNavigate()
  const { profile, session } = useUser()
  const [isOpen, setIsOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || !isOpen) return

    const previousOverflow = document.body.style.overflow
    dialog.showModal()
    document.body.style.overflow = 'hidden'

    return () => {
      if (dialog.open) dialog.close()
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  const handleSignOut = async () => {
    if (isSigningOut) return
    setIsSigningOut(true)
    setSignOutError('')
    try {
      await api.user.authentication.signOut()
      navigate(routes.signIn, { replace: true })
    } catch {
      setSignOutError('We couldn’t reach account services to sign you out. You’re still signed in. Please try again shortly.')
      setIsSigningOut(false)
    }
  }

  const initials = profile.username.trim().slice(0, 2).toUpperCase() || 'U'

  return (
    <header className={styles.header}>
      <Link className={styles.wordmark} to={routes.home}>campus<em>errands.</em></Link>
      <nav className={styles.navigation} aria-label="Main navigation">
        <Link to={routes.home} aria-current={location.pathname === routes.home ? 'page' : undefined}>Home</Link>
        <Link to={routes.suppliers} aria-current={location.pathname === routes.suppliers ? 'page' : undefined}>Suppliers</Link>
        <Link to="/orders" aria-current={location.pathname === '/orders' ? 'page' : undefined}>Orders</Link>
        {(session.role === 'admin' || session.role === 'admin_manager') && <Link className={styles.adminLink} to={routes.orderOperations} aria-current={location.pathname === routes.orderOperations ? 'page' : undefined}>Order operations</Link>}
        <button
          className={styles.accountButton}
          type="button"
          aria-label="Open account settings"
          aria-expanded={isOpen}
          aria-controls="account-drawer"
          onClick={() => setIsOpen(true)}
        >
          {initials}
        </button>
      </nav>

      <dialog
        id="account-drawer"
        ref={dialogRef}
        className={styles.drawer}
        aria-labelledby="account-drawer-title"
        onCancel={(event) => {
          event.preventDefault()
          setIsOpen(false)
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setIsOpen(false)
        }}
      >
        <div className={styles.drawerContent}>
          <div className={styles.drawerHeading}>
            <div>
              <p className={styles.eyebrow}>Account</p>
              <h2 id="account-drawer-title">Your account</h2>
            </div>
            <button className={styles.closeButton} type="button" onClick={() => setIsOpen(false)} aria-label="Close account settings">Close</button>
          </div>

          <div className={styles.identity}>
            <span>{initials}</span>
            <div>
              <strong>{profile.username}</strong>
              <p>{profile.email}</p>
            </div>
          </div>

          <p className={styles.capabilities}>Request a pickup or help with a delivery. You can do both at any time.</p>

          <nav className={styles.accountLinks} aria-label="Account navigation">
            <Link to={routes.profile} onClick={() => setIsOpen(false)}>
              <span>Profile</span>
              <span aria-hidden="true">→</span>
            </Link>
            <Link to={routes.creditAuditLogs} onClick={() => setIsOpen(false)} aria-current={location.pathname === routes.creditAuditLogs ? 'page' : undefined}>
              <span>Credit Audit Logs</span>
              <span aria-hidden="true">→</span>
            </Link>
            {(session.role === 'admin' || session.role === 'admin_manager') && <Link className={styles.adminLink} to={routes.orderOperations} onClick={() => setIsOpen(false)}><span>Order operations</span><span aria-hidden="true">→</span></Link>}
            {session.role === 'admin_manager' && (
              <Link className={styles.adminLink} to={routes.adminManagerPortal} onClick={() => setIsOpen(false)}>
                <span>Admin manager portal</span>
                <span aria-hidden="true">→</span>
              </Link>
            )}
          </nav>

          <div className={styles.signOutArea}>
          {signOutError && <p className={styles.signOutError} role="alert">{signOutError}</p>}
          <button className={styles.signOutButton} type="button" onClick={() => void handleSignOut()} disabled={isSigningOut}>
            {isSigningOut ? 'Signing out…' : 'Sign out'}
          </button>
          </div>
        </div>
      </dialog>
    </header>
  )
}

export default AppHeader
