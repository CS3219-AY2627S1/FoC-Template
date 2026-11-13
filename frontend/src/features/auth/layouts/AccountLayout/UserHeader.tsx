import { useEffect, useId, useState } from 'react'
import { Button } from '@base-ui/react/button'
import { Link } from '@tanstack/react-router'
import { Menu as MenuIcon, X } from 'lucide-react'
import { AccountMenu } from './AccountMenu'
import { MainNavigation } from './MainNavigation'
import styles from './UserHeader.module.scss'

export const UserHeader = ({ floating = false }: { floating?: boolean }) => {
  const [navOpen, setNavOpen] = useState(false)
  const navPanelId = useId()

  useEffect(() => {
    if (!navOpen) return

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false)
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [navOpen])

  return (
    <header
      className={`${styles.header} ${floating ? styles.floating : ''}`.trim()}
    >
      <div
        className={`${styles.navGroup} ${floating ? styles.island : ''}`.trim()}
      >
        <button
          type="button"
          className={styles.menuButton}
          aria-expanded={navOpen}
          aria-controls={navPanelId}
          aria-label={navOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setNavOpen((open) => !open)}
        >
          {navOpen ? (
            <X size={22} strokeWidth={1.8} aria-hidden="true" />
          ) : (
            <MenuIcon size={22} strokeWidth={1.8} aria-hidden="true" />
          )}
        </button>
        <div className={styles.brand}>
          <Link to="/home">FoC</Link>
        </div>
        <nav aria-label="Main navigation" className={styles.desktopNavigation}>
          <MainNavigation />
        </nav>
      </div>
      <div
        className={`${styles.actions} ${floating ? styles.island : ''}`.trim()}
      >
        <Button
          className={styles.notifications}
          disabled
          aria-label="Notifications"
          title="Notifications unavailable"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
          </svg>
        </Button>
        <AccountMenu />
      </div>
      {navOpen ? (
        <nav
          id={navPanelId}
          aria-label="Mobile navigation"
          className={styles.mobileNavigation}
        >
          <MainNavigation icons onNavigate={() => setNavOpen(false)} />
        </nav>
      ) : null}
    </header>
  )
}
