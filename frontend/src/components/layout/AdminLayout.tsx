/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5)
 * Scope: Generated the admin shell from the dashboard mockup.
 * Reviewed by Ngooi Jun Sen.
 *
 * The admin area has its own chrome: a left rail instead of the top nav,
 * which is FR15.1.2's "navigation links to all specialized admin management
 * sections". NFR11.1.1 keeps it readable below 768px rather than collapsing,
 * so the rail stacks above the content there instead of disappearing.
 */

import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { Icon } from '../ui/Icon';
import { useAdminCountsVersion } from '../../lib/adminCounts';
import { fetchConflicts, isOpen } from '../../lib/conflicts';
import { fetchSuppliersForAdmin } from '../../lib/suppliers';
import styles from './AdminLayout.module.css';

const SECTIONS = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/suppliers', label: 'Supplier approvals' },
  { to: '/admin/escalations', label: 'Escalations' },
  { to: '/admin/users', label: 'User management' },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [pendingSuppliers, setPendingSuppliers] = useState<number | null>(null);
  const [openEscalations, setOpenEscalations] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close the mobile menu whenever the route changes.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  const countsVersion = useAdminCountsVersion();

  // A count is left off when its service fails, rather than shown as zero,
  // which would read as "nothing waiting". Read again after an action that
  // changes one, and on every move between admin pages, which also catches a
  // case that resolved itself at its deadline.
  useEffect(() => {
    let cancelled = false;
    fetchSuppliersForAdmin('pending')
      .then((rows) => {
        if (!cancelled) setPendingSuppliers(rows.length);
      })
      .catch(() => {
        if (!cancelled) setPendingSuppliers(null);
      });
    fetchConflicts()
      .then((rows) => {
        if (!cancelled) setOpenEscalations(rows.filter((row) => isOpen(row.status)).length);
      })
      .catch(() => {
        if (!cancelled) setOpenEscalations(null);
      });
    return () => {
      cancelled = true;
    };
  }, [countsVersion, location.pathname]);

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className={styles.shell}>
      <nav className={styles.rail} aria-label="Admin sections">
        <div className={styles.brand}>
          <button
            type="button"
            className={styles.hamburger}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="admin-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Icon name={menuOpen ? 'close' : 'menu'} />
          </button>
          {/* Back to the app, as the logo does in AppShell. */}
          <Link to="/browse" className={styles.logo} aria-label="Back to FoC">
            FoC
          </Link>
          <span className={styles.adminTag}>Admin</span>
        </div>

        {/* Always shown on desktop; on a phone, only while the menu is open. */}
        <div id="admin-menu" className={menuOpen ? `${styles.menu} ${styles.menuOpen}` : styles.menu}>
          <ul className={styles.sections}>
            {SECTIONS.map((section) => (
              <li key={section.to}>
                <NavLink
                  to={section.to}
                  end={section.end}
                  className={({ isActive }) =>
                    isActive ? `${styles.section} ${styles.sectionActive}` : styles.section
                  }
                >
                  {section.label}
                  {section.to === '/admin/suppliers' && pendingSuppliers !== null ? (
                    <span className={styles.count}>{pendingSuppliers}</span>
                  ) : null}
                  {section.to === '/admin/escalations' && openEscalations !== null ? (
                    <span className={styles.count}>{openEscalations}</span>
                  ) : null}
                </NavLink>
              </li>
            ))}
          </ul>

          <div className={styles.signedIn}>
            <p className={styles.signedInLabel}>Signed in as</p>
            <p className={styles.signedInEmail}>{user?.email ?? 'unknown'}</p>
          </div>

          <button type="button" className={styles.signOut} onClick={() => void handleSignOut()}>
            Log out
          </button>
        </div>
      </nav>

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
