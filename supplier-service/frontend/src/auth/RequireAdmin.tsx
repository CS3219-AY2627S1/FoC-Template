import { useEffect } from 'react'
import { LogIn, ShieldAlert, Store } from 'lucide-react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { navigateTo } from '../navigation'
import styles from './RequireAdmin.module.css'
import { useAuth } from './useAuth'

export function RequireAdmin() {
  const { accessDenied, session } = useAuth()
  const location = useLocation()
  const returnTo = `${location.pathname}${location.search}${location.hash}`

  useEffect(() => {
    if (!session) navigateTo(`/?returnTo=${encodeURIComponent(returnTo)}`)
  }, [returnTo, session])

  if (!session) {
    return (
      <section aria-live="polite" className={styles.panel}>
        <span className={styles.icon} aria-hidden="true">
          <LogIn />
        </span>
        <p className={styles.eyebrow}>Authentication required</p>
        <h1>Taking you to sign in…</h1>
        <p>You need an admin account to manage locations.</p>
      </section>
    )
  }

  if (session.role !== 'ADMIN' || accessDenied) {
    return (
      <section className={styles.panel} role="alert">
        <span className={styles.icon} aria-hidden="true">
          <ShieldAlert />
        </span>
        <p className={styles.eyebrow}>Admin access required</p>
        <h1>You cannot manage suppliers</h1>
        <p>
          Choose Admin mode from your account menu to manage suppliers, or
          browse campus locations instead.
        </p>
        <div className={styles.actions}>
          <Link to="/suppliers">
            <Store aria-hidden="true" />
            Browse suppliers
          </Link>
          <a href="/">Back to service home</a>
        </div>
      </section>
    )
  }

  return <Outlet />
}
