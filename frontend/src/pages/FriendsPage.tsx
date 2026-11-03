/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-03
 * Scope: Generated the friends page from the 2026-11-03 draft: friends with
 *        remove, requests for you with accept and decline, and requests you
 *        sent that are still waiting, each paged like the supplier catalogue.
 * Reviewed by Ngooi Jun Sen.
 *
 * User Service's friendships (user-service/README.md). There is no user
 * search, so people are added from an order page (components/friends/
 * FriendControl.tsx); this page only says so. A sent request cannot be
 * withdrawn, so the waiting list has no action.
 *
 * Searching friends by name added with Claude Code (Claude Opus 5.5) on
 * 2026-11-03 (D1 nice-to-have 3, "users can search their friends list").
 */

import { useEffect, useState } from 'react';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/Dialog';
import { errorMessage } from '../lib/api';
import { avatarColours } from '../lib/avatar';
import { formatElapsed, initials } from '../lib/format';
import { Icon } from '../components/ui/Icon';
import { byMatch, matchRank } from '../lib/search';
import {
  answerFriendRequest,
  fetchAllFriends,
  fetchFriendRequestsPage,
  fetchFriendsPage,
  removeFriend,
  type FriendRequest,
  type FriendSummary,
} from '../lib/friends';
import styles from './FriendsPage.module.css';

const UNREACHABLE = 'Could not reach the server. Try again in a moment.';

/*
 * User pages every list (newest first) and returns a total. Requests take
 * fewer per page, so the side column stays about a screen tall however many
 * are waiting.
 */
const FRIENDS_PER_PAGE = 20;
const REQUESTS_PER_PAGE = 5;

interface Paged<T> {
  items: T[];
  total: number;
}

const loadFriends = (page: number) => fetchFriendsPage(page, FRIENDS_PER_PAGE);
const loadIncoming = (page: number) => fetchFriendRequestsPage('incoming', page, REQUESTS_PER_PAGE);
const loadOutgoing = (page: number) => fetchFriendRequestsPage('outgoing', page, REQUESTS_PER_PAGE);

/**
 * One paged list: re-read when its page changes or `version` is bumped after
 * an action. If the page it is on empties (its last item answered or
 * removed), it steps back one.
 */
function usePaged<T>(load: (page: number) => Promise<Paged<T>>, version: number) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Paged<T> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    load(page)
      .then((next) => {
        if (cancelled) return;
        if (next.items.length === 0 && page > 1) {
          setPage(page - 1);
          return;
        }
        setResult(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [load, page, version]);

  return { page, setPage, result, failed };
}

export function FriendsPage() {
  // Bumped after an action, so the affected list is read again.
  const [friendsVersion, setFriendsVersion] = useState(0);
  const [incomingVersion, setIncomingVersion] = useState(0);
  const friends = usePaged(loadFriends, friendsVersion);
  const incoming = usePaged(loadIncoming, incomingVersion);
  const outgoing = usePaged(loadOutgoing, 0);

  // The request or friend an action is running on, so only its buttons wait.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<FriendSummary | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function answer(request: FriendRequest, action: 'accept' | 'reject') {
    setBusyId(request.requestId);
    setFailure(null);
    try {
      await answerFriendRequest(request.requestId, action);
      setIncomingVersion((version) => version + 1);
      if (action === 'accept') setFriendsVersion((version) => version + 1);
    } catch (error) {
      setFailure(errorMessage(error, UNREACHABLE));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmRemove() {
    if (removing === null) return;
    const friend = removing;
    setBusyId(friend.id);
    setFailure(null);
    try {
      await removeFriend(friend.id);
      setRemoving(null);
      setFriendsVersion((version) => version + 1);
    } catch (error) {
      setRemoving(null);
      setFailure(errorMessage(error, UNREACHABLE));
    } finally {
      setBusyId(null);
    }
  }

  /*
   * Name search. The friends endpoint has no name filter, so while a search is
   * typed the whole list is read (lib/friends.ts fetchAllFriends) and filtered
   * here, closest matches first, and the pager steps aside. Read once per
   * search, and again after an accept or remove changes the list.
   */
  const [query, setQuery] = useState('');
  const searching = query.trim() !== '';
  const [allFriends, setAllFriends] = useState<FriendSummary[] | null>(null);
  const [searchFailed, setSearchFailed] = useState(false);

  useEffect(() => {
    if (!searching) return undefined;
    let cancelled = false;
    setSearchFailed(false);
    fetchAllFriends()
      .then((result) => {
        if (!cancelled) setAllFriends(result);
      })
      .catch(() => {
        if (!cancelled) setSearchFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [searching, friendsVersion]);

  const matches =
    searching && allFriends !== null
      ? byMatch(allFriends, query, (friend, needle) => matchRank(needle, friend.name)).filter(
          (friend) => matchRank(query, friend.name) !== Infinity,
        )
      : null;

  const loadFailed = friends.failed || incoming.failed || outgoing.failed;

  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <h1 className={styles.title}>Friends</h1>
        <p className={styles.subtitle}>
          People you have done errands with. Add someone from an order you shared.
        </p>
      </div>

      {failure ? <Alert variant="danger">{failure}</Alert> : null}

      {loadFailed ? (
        <Alert variant="danger">Your friends could not be loaded. Try again later.</Alert>
      ) : friends.result === null || incoming.result === null || outgoing.result === null ? (
        <p className={styles.note}>Loading…</p>
      ) : (
        <div className={styles.columns}>
          <section className={styles.group} aria-labelledby="friends-title">
            <div className={styles.friendsHead}>
              <h2 id="friends-title" className={styles.groupTitle}>
                Your friends
              </h2>
              {friends.result.total > 0 ? (
                <label className={styles.search}>
                  <Icon name="search" size={16} />
                  <span className="visually-hidden">Search your friends</span>
                  <input
                    id="friend-search"
                    type="search"
                    placeholder="Search by name"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
              ) : null}
            </div>
            <div className={styles.card}>
              {searching && searchFailed ? (
                <p className={styles.note}>Your friends could not be searched. Try again in a moment.</p>
              ) : searching && matches === null ? (
                <p className={styles.note}>Searching…</p>
              ) : searching && matches !== null && matches.length === 0 ? (
                <p className={styles.note}>No friends match "{query.trim()}".</p>
              ) : !searching && friends.result.items.length === 0 ? (
                <p className={styles.note}>
                  No friends yet. After an errand, open the order and add the courier or requester
                  you worked with.
                </p>
              ) : (
                <ul className={styles.list}>
                  {(searching && matches !== null ? matches : friends.result.items).map((friend) => (
                    <li key={friend.id} className={styles.row}>
                      <Avatar person={friend} />
                      <span className={styles.name}>{friend.name}</span>
                      <Button
                        variant="danger"
                        disabled={busyId === friend.id}
                        onClick={() => setRemoving(friend)}
                        aria-label={`Remove ${friend.name}`}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {searching ? null : (
              <Pager
                label="Friends pages"
                page={friends.page}
                total={friends.result.total}
                pageSize={FRIENDS_PER_PAGE}
                onPage={friends.setPage}
              />
            )}
          </section>

          <div className={styles.side}>
            <section className={`${styles.group} ${styles.incomingGroup}`} aria-labelledby="incoming-title">
              <div className={styles.groupHead}>
                <h2 id="incoming-title" className={styles.groupTitle}>
                  Requests for you
                </h2>
                {incoming.result.total > 0 ? (
                  <span className={styles.newTag}>{incoming.result.total} new</span>
                ) : null}
              </div>
              <div className={styles.card}>
                {incoming.result.items.length === 0 ? (
                  <p className={styles.note}>No requests waiting.</p>
                ) : (
                  <ul className={styles.requests}>
                    {incoming.result.items.map((request) => (
                      <li key={request.requestId} className={styles.request}>
                        <div className={styles.requestWho}>
                          <Avatar person={request.sender} />
                          <div className={styles.requestText}>
                            <p className={styles.name}>{request.sender.name}</p>
                            <p className={styles.when}>Sent {formatElapsed(request.createdAt)}</p>
                          </div>
                        </div>
                        <div className={styles.requestActions}>
                          <Button
                            variant="secondary"
                            disabled={busyId === request.requestId}
                            onClick={() => void answer(request, 'reject')}
                            aria-label={`Decline ${request.sender.name}`}
                          >
                            Decline
                          </Button>
                          <Button
                            loading={busyId === request.requestId}
                            onClick={() => void answer(request, 'accept')}
                            aria-label={`Accept ${request.sender.name}`}
                          >
                            Accept
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <Pager
                label="Requests for you pages"
                page={incoming.page}
                total={incoming.result.total}
                pageSize={REQUESTS_PER_PAGE}
                onPage={incoming.setPage}
              />
            </section>

            {outgoing.result.total > 0 ? (
              <section className={styles.group} aria-labelledby="outgoing-title">
                <h2 id="outgoing-title" className={styles.groupTitle}>
                  Waiting on them
                </h2>
                <div className={styles.card}>
                  <ul className={styles.list}>
                    {outgoing.result.items.map((request) => (
                      <li key={request.requestId} className={styles.row}>
                        <Avatar person={request.recipient} muted />
                        <div className={styles.requestText}>
                          <p className={styles.name}>{request.recipient.name}</p>
                          <p className={styles.when}>Sent {formatElapsed(request.createdAt)}</p>
                        </div>
                        <span className={styles.pending}>Pending</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Pager
                  label="Waiting on them pages"
                  page={outgoing.page}
                  total={outgoing.result.total}
                  pageSize={REQUESTS_PER_PAGE}
                  onPage={outgoing.setPage}
                />
              </section>
            ) : null}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={removing !== null}
        title={removing === null ? 'Remove friend?' : `Remove ${removing.name}?`}
        consequence="They are not told. Either of you can send a new request later."
        confirmLabel="Remove"
        destructive
        busy={removing !== null && busyId === removing.id}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

/** The supplier catalogue's pager. User returns a total, so it can say "of N"; hidden on one page. */
function Pager({
  label,
  page,
  total,
  pageSize,
  onPage,
}: {
  label: string;
  page: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;
  return (
    <nav className={styles.pager} aria-label={label}>
      <button
        type="button"
        className={styles.pageButton}
        disabled={page === 1}
        onClick={() => onPage(Math.max(1, page - 1))}
      >
        Previous
      </button>
      <span className={styles.pageLabel}>
        Page {page} of {pageCount}
      </span>
      <button
        type="button"
        className={styles.pageButton}
        disabled={page >= pageCount}
        onClick={() => onPage(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}

/** A colour per person (lib/avatar.ts), the same one they have everywhere; grey while a request waits. */
function Avatar({ person, muted = false }: { person: FriendSummary; muted?: boolean }) {
  return (
    <span
      className={muted ? `${styles.avatar} ${styles.toneMuted}` : styles.avatar}
      style={muted ? undefined : avatarColours(person.id)}
      aria-hidden="true"
    >
      {initials(person.name)}
    </span>
  );
}
