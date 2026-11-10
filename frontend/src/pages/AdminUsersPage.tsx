/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5)
 * Scope: Generated the user management page from the mockup.
 * Reviewed by Ngooi Jun Sen, removed unnecessary column for user roles.
 *
 * Covers UI FR17.1.1 (search, with role and status shown), FR17.1.2 (suspend
 * and promote) and NFR11.1.2 (the table scrolls in its own box on a narrow
 * screen).
 *
 * Reads and acts through the Admin Service (GET /api/v1/admin/users and the
 * promote, demote, suspend and reinstate endpoints).
 *
 * The open reports and appeals queues sit above the table
 * (components/admin/ModerationQueues).
 */

import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { ModerationQueues } from '../components/admin/ModerationQueues';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/Dialog';
import { Icon } from '../components/ui/Icon';
import { errorMessage } from '../lib/api';
import { useAdminUserSearch } from '../lib/useAdminUserSearch';
import {
  demoteUser,
  promoteUser,
  reinstateUser,
  suspendUser,
  type AdminAccountStatus,
  type AdminUser,
} from '../lib/adminUsers';
import styles from './AdminUsersPage.module.css';

const STATUS_FILTERS: { value: '' | AdminAccountStatus; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'Created', label: 'Created' },
  { value: 'Verified', label: 'Verified' },
  { value: 'Suspended', label: 'Suspended' },
];

type Pending =
  | { kind: 'suspend'; user: AdminUser }
  | { kind: 'reinstate'; user: AdminUser }
  | { kind: 'promote'; user: AdminUser }
  | { kind: 'demote'; user: AdminUser }
  | null;

export function AdminUsersPage() {
  const { user: me } = useAuth();

  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [params, setParams] = useSearchParams();
  const requested = params.get('status');
  const status: '' | AdminAccountStatus =
    requested === 'Created' || requested === 'Verified' || requested === 'Suspended' ? requested : '';
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [pending, setPending] = useState<Pending>(null);
  const [working, setWorking] = useState(false);

  // Admin F1: search runs on the service, so it covers every user, not just
  // the page on screen. Rows on screen narrow as you type meanwhile.
  const { users, hasMore, total, loadError, search } = useAdminUserSearch(
    query,
    page,
    reloadKey,
    'Could not reach the Admin Service. Start it and reload.',
    status,
  );

  function chooseStatus(next: '' | AdminAccountStatus) {
    setPage(1);
    setParams(next === '' ? {} : { status: next }, { replace: true });
  }

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  async function confirmPending() {
    if (pending === null) return;
    const { kind, user } = pending;

    setWorking(true);
    setActionError(null);
    try {
      if (kind === 'promote') await promoteUser(user.userId);
      if (kind === 'demote') await demoteUser(user.userId);
      if (kind === 'suspend') await suspendUser(user.userId);
      if (kind === 'reinstate') await reinstateUser(user.userId);
      setPending(null);
      // Re-read rather than patching locally, so the table shows what the
      // service actually stored.
      reload();
    } catch (error) {
      setPending(null);
      setActionError(
        errorMessage(error, `Could not reach the Admin Service, so ${user.name} is unchanged.`),
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Users</h1>
      </header>

      {/* Shares reloadKey with the table: an action in either changes both. */}
      <ModerationQueues myUserId={me?.userId ?? null} reloadKey={reloadKey} onChanged={reload} />

      {/* The search filters this table only, so it sits with it, below the queues. */}
      <div className={`${styles.header} ${styles.sectionHeader}`}>
        <h2 className={styles.sectionTitle}>All users</h2>

        <div className={styles.filters} role="group" aria-label="Filter by status">
          {STATUS_FILTERS.map((option) => (
            <button
              key={option.label}
              type="button"
              className={status === option.value ? styles.filterActive : styles.filter}
              aria-pressed={status === option.value}
              onClick={() => chooseStatus(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <label className={styles.search}>
          <Icon name="search" size={16} />
          <span className="visually-hidden">Search by name or email</span>
          <input
            type="search"
            placeholder="Search by name or email"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </label>

        <p className={styles.totals}>
          {users === null || total === null ? 'Loading' : `${total} matching`}
        </p>
      </div>

      {loadError ? <Alert variant="danger">{loadError}</Alert> : null}
      {actionError ? <Alert variant="danger">{actionError}</Alert> : null}

      {users !== null && users.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">User</th>
                <th scope="col">Status</th>
                <th scope="col" className={styles.actionsHead}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const suspended = user.status === 'Suspended';
                // D2 Part 1 point 6: an admin cannot suspend themselves from
                // here, which also stops the last admin locking everyone out.
                // The service must refuse it as well; this only hides it.
                const isMe = me !== null && user.userId === me.userId;

                return (
                  <tr key={user.userId}>
                    <td>
                      <span className={styles.name}>
                        {user.name}
                        {user.isAdmin ? <span className={styles.tag}>Admin</span> : null}
                        {isMe ? <span className={styles.tag}>You</span> : null}
                      </span>
                      <span className={styles.email}>{user.email}</span>
                    </td>
                    <td data-label="Status">
                      <span className={styles[user.status.toLowerCase()]}>{user.status}</span>
                    </td>
                    <td>
                      <div className={styles.actions}>
                        {/* A suspended account cannot be promoted, and an
                            admin has nothing to be promoted to. The signed-in
                            admin never sees Demote on their own row. */}
                        {user.isAdmin && !isMe ? (
                          <Button
                            variant="secondary"
                            onClick={() => setPending({ kind: 'demote', user })}
                          >
                            Demote
                          </Button>
                        ) : null}
                        {suspended || user.isAdmin ? null : (
                          <Button
                            variant="secondary"
                            onClick={() => setPending({ kind: 'promote', user })}
                          >
                            Make admin
                          </Button>
                        )}
                        {isMe ? null : suspended ? (
                          <Button
                            variant="secondary"
                            onClick={() => setPending({ kind: 'reinstate', user })}
                          >
                            Reinstate
                          </Button>
                        ) : (
                          <Button
                            variant="danger"
                            onClick={() => setPending({ kind: 'suspend', user })}
                          >
                            Suspend
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {users !== null && users.length === 0 && loadError === null ? (
        <p className={styles.empty}>
          {search.trim() === '' && status === '' ? 'No users yet.' : 'No user matches that filter.'}
        </p>
      ) : null}

      {page > 1 || hasMore ? (
        <div className={styles.pager}>
          <Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span>Page {page}</span>
          <Button variant="secondary" disabled={!hasMore} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      ) : null}

      {/* NFR9.1.1: suspension, promotion and demotion all ask first. */}
      <ConfirmDialog
        open={pending !== null}
        title={
          pending?.kind === 'suspend'
            ? 'Suspend this account?'
            : pending?.kind === 'reinstate'
              ? 'Reinstate this account?'
              : pending?.kind === 'demote'
                ? 'Demote this admin?'
                : 'Make this person an admin?'
        }
        consequence={
          pending === null ? null : pending.kind === 'suspend' ? (
            <>
              {pending.user.name} is blocked from logging in and from every action, within a
              minute. Orders already in progress are not cancelled. Every open
              report about them is closed.
            </>
          ) : pending.kind === 'reinstate' ? (
            <>
              {pending.user.name} can log in and act again, within a minute. Their open appeal,
              if any, is closed.
            </>
          ) : pending.kind === 'demote' ? (
            <>
              {pending.user.name} becomes a regular user and loses the admin area. User Service
              updates their role and signs them out. Their account status stays the same.
            </>
          ) : (
            <>
              {pending.user.name} gains the whole admin area, including suspending other people
              and resolving disputes. Another admin can demote them later.
            </>
          )
        }
        confirmLabel={
          pending?.kind === 'suspend'
            ? 'Suspend'
            : pending?.kind === 'reinstate'
              ? 'Reinstate'
              : pending?.kind === 'demote'
                ? 'Demote'
                : 'Make admin'
        }
        destructive={pending?.kind === 'suspend' || pending?.kind === 'demote'}
        busy={working}
        onConfirm={confirmPending}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
