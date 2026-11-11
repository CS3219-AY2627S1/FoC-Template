/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5)
 * Scope: Generated the admin dashboard from the mockup.
 * Reviewed by Ngooi Jun Sen.
 *
 * Covers UI FR15.1.1 (summary cards for pending supplier approvals, pending
 * escalations and suspended users) and FR15.1.2 (links into each section,
 * which the rail provides).
 *
 * Escalation count and supplier activity added with Claude Code (Claude Opus
 * 5.5) on 2026-11-02.
 *
 * Suspended users are the `total` from GET /api/v1/admin/users?status=Suspended.
 * The activity feed covers supplier changes only.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAdminUser, fetchAdminUsers } from '../lib/adminUsers';
import { fetchConflicts, isDueSoon, isOpen } from '../lib/conflicts';
import { formatElapsed, formatWhen } from '../lib/format';
import {
  fetchSupplierActivity,
  fetchSuppliersForAdmin,
  type Supplier,
  type SupplierAction,
} from '../lib/suppliers';
import styles from './AdminDashboardPage.module.css';

type PendingState =
  | { kind: 'loading' }
  | { kind: 'ready'; count: number; oldest: Date | null }
  | { kind: 'failed' };

type EscalationState =
  | { kind: 'loading' }
  | { kind: 'ready'; count: number; soonest: Date | null; dueSoon: number }
  | { kind: 'failed' };

type SuspendedState = { kind: 'loading' } | { kind: 'ready'; count: number } | { kind: 'failed' };

type ActivityState =
  | { kind: 'loading' }
  | { kind: 'ready'; actions: SupplierAction[]; names: Record<string, string> }
  | { kind: 'failed' };

/** How many supplier changes the dashboard lists. */
const ACTIVITY_SHOWN = 8;

const ACTION_VERBS: Record<SupplierAction['action'], string> = {
  created: 'submitted',
  edited: 'edited',
  approved: 'approved',
  rejected: 'rejected',
  pending: 'moved back to pending',
  deleted: 'deleted',
};

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

export function AdminDashboardPage() {
  const [pending, setPending] = useState<PendingState>({ kind: 'loading' });
  const [escalations, setEscalations] = useState<EscalationState>({ kind: 'loading' });
  const [suspended, setSuspended] = useState<SuspendedState>({ kind: 'loading' });
  const [activity, setActivity] = useState<ActivityState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    fetchSuppliersForAdmin('pending')
      .then((rows: Supplier[]) => {
        if (cancelled) return;
        // createdAt comes back as a string over the wire.
        const dates = rows
          .map((row) => new Date((row as Supplier & { createdAt?: string }).createdAt ?? ''))
          .filter((date) => !Number.isNaN(date.getTime()));
        setPending({
          kind: 'ready',
          count: rows.length,
          oldest: dates.length > 0 ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null,
        });
      })
      .catch(() => {
        if (!cancelled) setPending({ kind: 'failed' });
      });

    fetchAdminUsers('', 1, 'Suspended')
      .then((result) => {
        if (!cancelled) setSuspended({ kind: 'ready', count: result.total });
      })
      .catch(() => {
        if (!cancelled) setSuspended({ kind: 'failed' });
      });

    fetchConflicts()
      .then((rows) => {
        if (cancelled) return;
        const open = rows.filter((row) => isOpen(row.status));
        const deadlines = open.map((row) => new Date(row.resolutionDeadline).getTime());
        setEscalations({
          kind: 'ready',
          count: open.length,
          soonest: deadlines.length > 0 ? new Date(Math.min(...deadlines)) : null,
          dueSoon: rows.filter(isDueSoon).length,
        });
      })
      .catch(() => {
        if (!cancelled) setEscalations({ kind: 'failed' });
      });

    fetchSupplierActivity()
      .then(async (rows) => {
        const actions = rows.slice(0, ACTIVITY_SHOWN);
        // One lookup per person, for the names in the shown entries only.
        const ids = [...new Set(actions.map((action) => action.actorUserId))];
        const found = await Promise.all(
          ids.map(async (id) => {
            const person = await fetchAdminUser(id).catch(() => null);
            return [id, person?.name ?? 'Deleted account'] as const;
          }),
        );
        if (!cancelled) setActivity({ kind: 'ready', actions, names: Object.fromEntries(found) });
      })
      .catch(() => {
        if (!cancelled) setActivity({ kind: 'failed' });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Dashboard</h1>
        <p className={styles.date}>{today}</p>
      </header>

      <div className={styles.cards}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Pending supplier approvals</h2>
          {pending.kind === 'loading' ? (
            <p className={styles.metricMuted}>&mdash;</p>
          ) : pending.kind === 'failed' ? (
            <>
              <p className={styles.metricMuted}>&mdash;</p>
              <p className={styles.cardNote}>Supplier Service unreachable</p>
            </>
          ) : (
            <>
              <p className={styles.metric}>{pending.count}</p>
              <p className={styles.cardNote}>
                {pending.count === 0
                  ? 'Nothing waiting'
                  : pending.oldest === null
                    ? 'Waiting for review'
                    : `Oldest waiting ${daysSince(pending.oldest)} days`}
              </p>
            </>
          )}
          <Link to="/admin/suppliers" className={styles.primaryAction}>
            Review queue
          </Link>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Open escalations</h2>
          {escalations.kind === 'loading' ? (
            <p className={styles.metricMuted}>&mdash;</p>
          ) : escalations.kind === 'failed' ? (
            <>
              <p className={styles.metricMuted}>&mdash;</p>
              <p className={styles.cardNote}>Admin Service unreachable</p>
            </>
          ) : (
            <>
              <p className={styles.metric}>{escalations.count}</p>
              <p className={styles.cardNote}>
                {escalations.soonest === null
                  ? 'Nothing waiting'
                  : `Next deadline ${formatWhen(escalations.soonest)}`}
              </p>
              {/* F3.7.1: the reminder job has fired for these. */}
              {escalations.dueSoon > 0 ? (
                <p className={styles.cardWarning}>
                  {/* Not "resolves itself": a case with no usable AI verdict stays open. */}
                  {`${escalations.dueSoon} due within a day`}
                </p>
              ) : null}
            </>
          )}
          <Link to="/admin/escalations" className={styles.secondaryAction}>
            Review queue
          </Link>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Suspended users</h2>
          {suspended.kind === 'loading' ? (
            <p className={styles.metricMuted}>&mdash;</p>
          ) : suspended.kind === 'failed' ? (
            <>
              <p className={styles.metricMuted}>&mdash;</p>
              <p className={styles.cardNote}>Admin Service unreachable</p>
            </>
          ) : (
            <>
              <p className={styles.metric}>{suspended.count}</p>
              <p className={styles.cardNote}>
                {suspended.count === 0 ? 'No suspended accounts' : 'Blocked from logging in'}
              </p>
            </>
          )}
          <Link to="/admin/users?status=Suspended" className={styles.secondaryAction}>
            User management
          </Link>
        </section>
      </div>

      <section className={styles.activity}>
        <h2 className={styles.cardTitle}>Supplier activity</h2>
        {activity.kind === 'loading' ? <p className={styles.activityBody}>Loading</p> : null}
        {activity.kind === 'failed' ? (
          <p className={styles.activityBody}>Supplier Service unreachable</p>
        ) : null}
        {activity.kind === 'ready' && activity.actions.length === 0 ? (
          <p className={styles.activityBody}>No supplier changes yet.</p>
        ) : null}
        {activity.kind === 'ready' && activity.actions.length > 0 ? (
          <ul className={styles.feed}>
            {activity.actions.map((action) => (
              <li key={action.id} className={styles.feedItem}>
                <span>
                  {activity.names[action.actorUserId]} {ACTION_VERBS[action.action]}{' '}
                  <span className={styles.feedSubject}>{action.supplierName}</span>
                </span>
                <span className={styles.feedWhen}>{formatElapsed(new Date(action.createdAt))}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {/* Supplier changes only: escalations, credit adjustments and
            suspensions have no shared feed. */}
      </section>
    </div>
  );
}
