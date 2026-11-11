/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5)
 * Scope: Generated the signed-in page shell: top nav with mode tabs, credit
 *        balance, notifications and profile; hamburger menu below 768px.
 * Reviewed by Ngooi Jun Sen.
 */

import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { Icon } from '../ui/Icon';
import { RatingPrompt } from '../rating/RatingPrompt';
import { avatarColours } from '../../lib/avatar';
import { useCreditBalance } from '../../lib/credit';
import { refreshIncomingCount, useIncomingFriendRequestCount } from '../../lib/friends';
import { initials } from '../../lib/format';
import { orderReference } from '../../lib/orders';
import { StatusBadge, type OrderStatus } from '../ui/StatusBadge';
import { AlertsBell } from './AlertsBell';
import { OrderTrailContext } from './orderTrail';
import styles from './AppShell.module.css';

// UI FR5.2: the three mode tabs.
interface NavTab {
  to: string;
  label: string;
  short?: string;
}

const MODE_TABS: NavTab[] = [
  // `short` replaces the label only where the bar runs out of room (AppShell.module.css).
  { to: '/browse', label: 'Browse requests', short: 'Browse' },
  { to: '/my-requests', label: 'My requests' },
  { to: '/my-deliveries', label: 'My deliveries' },
];

/*
 * Admins also get a way into the admin area (UI FR15). Shown only to them:
 * Admin F2.2.1 keeps the admin pages unknown to everyone else, and the routes
 * are registered for admins only (App.tsx), so the link would 404 anyway.
 */
const ADMIN_TAB: NavTab = { to: '/admin', label: 'Admin' };

const MENU_LINKS = [
  ...MODE_TABS,
  { to: '/requests/new', label: 'New request' },
  { to: '/suppliers', label: 'Suppliers' },
  { to: '/friends', label: 'Friends' },
  { to: '/profile', label: 'Profile' },
];

/**
 * Routes whose mockups replace the app nav with a back-and-title bar on
 * mobile. Same idea as AuthLayout's per-route lists: the mockups are not
 * uniform, so the exceptions are named in one place.
 */
const OWN_MOBILE_HEADER_ROUTES = ['/requests/new'];

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  // The open order's status, reported by its page for the trail.
  const [trailStatus, setTrailStatus] = useState<OrderStatus | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const isAdmin = user?.isAdmin === true;
  const tabs = isAdmin ? [...MODE_TABS, ADMIN_TAB] : MODE_TABS;
  const menuLinks = isAdmin ? [...MENU_LINKS, ADMIN_TAB] : MENU_LINKS;

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  // Close the mobile menu whenever the route changes.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  const creditBalance = useCreditBalance();
  const friendRequests = useIncomingFriendRequestCount();
  // Re-read on navigation, so a request answered or received shows up soon.
  useEffect(() => {
    void refreshIncomingCount();
  }, [location.pathname]);
  const orderMatch = location.pathname.match(/^\/orders\/(.+)$/)?.[1];
  const requestReference = orderMatch === undefined ? undefined : orderReference(orderMatch);
  const taskMatch = location.pathname.match(/^\/deliveries\/(.+)$/)?.[1];
  const taskReference = taskMatch === undefined ? undefined : orderReference(taskMatch);
  const hidesNavOnMobile =
    OWN_MOBILE_HEADER_ROUTES.includes(location.pathname) ||
    requestReference !== undefined ||
    taskReference !== undefined;

  return (
    <div className={styles.shell}>
      <header className={hidesNavOnMobile ? `${styles.nav} ${styles.navDesktopOnly}` : styles.nav}>
        <button
          type="button"
          className={styles.hamburger}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Icon name={menuOpen ? 'close' : 'menu'} />
        </button>

        <Link to="/browse" className={styles.logo}>
          FoC
        </Link>

        {/*
          On an order page the mockup replaces the mode tabs with a trail.
          /orders is always the requester's side and /deliveries the courier's
          (each page redirects the other party), so the URL decides the trail.
        */}
        {requestReference !== undefined ? (
          <nav className={styles.trail} aria-label="Breadcrumb">
            <Link to="/my-requests">My requests</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Request #{requestReference}</span>
            {trailStatus !== null ? <StatusBadge status={trailStatus} /> : null}
          </nav>
        ) : taskReference !== undefined ? (
          <nav className={styles.trail} aria-label="Breadcrumb">
            <Link to="/my-deliveries">My deliveries</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Task #{taskReference}</span>
            {trailStatus !== null ? <StatusBadge status={trailStatus} /> : null}
          </nav>
        ) : (
          <nav className={isAdmin ? `${styles.tabs} ${styles.tabsWithAdmin}` : styles.tabs} aria-label="Mode">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) => (isActive ? `${styles.tab} ${styles.tabActive}` : styles.tab)}
              >
                {tab.short ? (
                  <>
                    <span className={styles.tabLong}>{tab.label}</span>
                    <span className={styles.tabShort}>{tab.short}</span>
                  </>
                ) : (
                  tab.label
                )}
              </NavLink>
            ))}
          </nav>
        )}

        <div className={styles.actions}>
          <span className={styles.credits} title="Available credits">
            {creditBalance === null ? (
              '--'
            ) : (
              <>
                {creditBalance}
                <span className={styles.creditsLong}>
                  &nbsp;available
                  {/* TODO(credit): "· N reserved" - the balance endpoint
                      returns the available figure only. */}
                </span>
                <span className={styles.creditsShort}>&nbsp;cr</span>
              </>
            )}
          </span>
          <Link
            to="/friends"
            className={styles.iconButton}
            aria-label={
              friendRequests > 0
                ? `Friends, ${friendRequests} ${friendRequests === 1 ? 'request' : 'requests'} waiting`
                : 'Friends'
            }
          >
            <Icon name="users" />
            {friendRequests > 0 ? <span className={styles.unreadDot} /> : null}
          </Link>
          {user !== null ? <AlertsBell userId={user.userId} /> : null}
          <Link to="/profile" className={styles.profile} aria-label="Profile">
            <span
              className={styles.avatar}
              style={user !== null ? avatarColours(user.userId) : undefined}
              aria-hidden="true"
            >
              {initials(user?.name)}
            </span>
          </Link>
          {/* Below 768px this moves into the hamburger menu, to keep the bar short. */}
          <button type="button" className={styles.signOut} onClick={() => void handleSignOut()}>
            <span className={styles.signOutPill}>Log out</span>
          </button>
        </div>
      </header>

      {menuOpen ? (
        <nav id="mobile-menu" className={styles.mobileMenu} aria-label="Main">
          {menuLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                isActive ? `${styles.menuLink} ${styles.menuLinkActive}` : styles.menuLink
              }
            >
              {link.label}
            </NavLink>
          ))}
          <button
            type="button"
            className={styles.menuLink}
            onClick={() => void handleSignOut()}
          >
            Log out
          </button>
        </nav>
      ) : null}

      <main className={styles.main}>
        <OrderTrailContext.Provider value={setTrailStatus}>
          <Outlet />
        </OrderTrailContext.Provider>
      </main>

      {/* UI FR14.1.1: opens by itself when a rating is owed, on any page. */}
      <RatingPrompt />

    </div>
  );
}
