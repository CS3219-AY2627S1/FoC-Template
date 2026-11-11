/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-03
 * Scope: Generated the nav bar's bell: a menu of recent status changes on the
 *        user's requests, with the unread dot (UI FR5.1.3).
 * Reviewed by Ngooi Jun Sen.
 *
 * Order's alerts (src/lib/alerts.ts) cover the user's own requests only, so a
 * courier's menu stays empty and says so. "Unread" means newer than the last
 * time the menu was opened in this browser.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  clearAlert,
  clearAllAlerts,
  isCleared,
  markAlertsSeen,
  readAlertsSeen,
  readClearedAlerts,
  useOrderAlerts,
} from '../../lib/alerts';
import { formatElapsed } from '../../lib/format';
import { orderReference } from '../../lib/orders';
import { Icon } from '../ui/Icon';
import { StatusBadge } from '../ui/StatusBadge';
import styles from './AlertsBell.module.css';

export function AlertsBell({ userId }: { userId: string }) {
  const allAlerts = useOrderAlerts();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(() => readAlertsSeen(userId));
  const [cleared, setCleared] = useState(() => readClearedAlerts(userId));
  const wrapper = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // Cleared rows are gone from the menu and never light the dot.
  const alerts = allAlerts.filter((alert) => !isCleared(alert, cleared));
  const newest = alerts.reduce((latest, alert) => Math.max(latest, alert.createdAt.getTime()), 0);
  const hasUnread = newest > seen;

  // Re-read when the account changes, so one user's "seen" is never another's.
  useEffect(() => {
    setSeen(readAlertsSeen(userId));
    setCleared(readClearedAlerts(userId));
  }, [userId]);

  function clearAll() {
    // Up to the newest one shown, so an update arriving later still appears.
    const latest = allAlerts.reduce((max, alert) => Math.max(max, alert.createdAt.getTime()), 0);
    setCleared(clearAllAlerts(userId, latest));
  }

  // Close on navigation, a click outside, or Escape.
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    function onPointer(event: PointerEvent) {
      if (wrapper.current !== null && !wrapper.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle() {
    setOpen((current) => !current);
    // Opening counts as looking: the rows stay marked until it closes.
    if (!open && hasUnread) markAlertsSeen(userId, newest);
  }

  // The dot clears once the menu has been closed again after being looked at.
  useEffect(() => {
    if (!open) setSeen(readAlertsSeen(userId));
  }, [open, userId]);

  return (
    <div className={styles.wrapper} ref={wrapper}>
      <button
        type="button"
        className={styles.bell}
        aria-label={hasUnread ? 'Notifications, new updates' : 'Notifications'}
        aria-expanded={open}
        aria-controls="alerts-menu"
        onClick={toggle}
      >
        <Icon name="bell" />
        {hasUnread ? <span className={styles.unreadDot} /> : null}
      </button>

      {open ? (
        <div id="alerts-menu" className={styles.menu}>
          <div className={styles.head}>
            <h2 className={styles.title}>Updates on your requests</h2>
            {alerts.length > 0 ? (
              <button type="button" className={styles.clearAll} onClick={clearAll}>
                Clear all
              </button>
            ) : null}
          </div>
          {alerts.length === 0 ? (
            <p className={styles.empty}>
              {allAlerts.length > 0
                ? 'All cleared. New updates on your requests show up here.'
                : 'Nothing yet. When a courier accepts, collects or delivers one of your requests, it shows up here.'}
            </p>
          ) : (
            <ul className={styles.list}>
              {alerts.map((alert) => (
                <li key={alert.id} className={styles.row}>
                  <Link to={`/orders/${alert.orderId}`} className={styles.item}>
                    {alert.createdAt.getTime() > seen ? (
                      <span className={styles.itemDot} aria-label="New" />
                    ) : (
                      <span className={styles.itemDotSpace} aria-hidden="true" />
                    )}
                    <span className={styles.itemText}>
                      <span className={styles.itemTitle}>Request #{orderReference(alert.orderId)}</span>
                      <span className={styles.itemWhen}>{formatElapsed(alert.createdAt)}</span>
                    </span>
                    {alert.status !== null ? <StatusBadge status={alert.status} /> : null}
                  </Link>
                  <button
                    type="button"
                    className={styles.clearOne}
                    aria-label={`Clear update for request #${orderReference(alert.orderId)}`}
                    onClick={() => setCleared(clearAlert(userId, alert.id))}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
