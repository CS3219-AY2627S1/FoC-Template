import { useState } from 'react'
import { Link, Outlet } from '@tanstack/react-router'
import { Button } from '@base-ui/react/button'
import styles from './AdminLayout.module.scss'

// The sidebar sections, add in other pages later on
const sections = [
  { label: 'Overview', to: '/admin', exact: true },
  { label: 'Suppliers', to: '/admin/suppliers', exact: false },
  { label: 'Users', to: '/admin/users', exact: false },
  { label: 'Orders', to: '/admin/orders', exact: false },
  { label: 'Audit log', to: '/admin/audit-log', exact: false },
] as const

export const AdminLayout = () => {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar} data-open={menuOpen || undefined}>
        <div className={styles.brandRow}>
          <span className={styles.brand}>FoC</span>
          <Button
            className={styles.menuButton}
            aria-label="Toggle navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            ☰
          </Button>
        </div>
        <nav className={styles.nav}>
          {sections.map(({ label, to, exact }) => (
            <Link
              key={label}
              to={to}
              className={styles.link}
              activeOptions={{ exact }}
              activeProps={{ 'data-active': true }}
              onClick={closeMenu}
            >
              {label}
            </Link>
          ))}
          <Link to="/" className={`${styles.link} ${styles.back}`}>
            ← Back to home
          </Link>
        </nav>
      </aside>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
