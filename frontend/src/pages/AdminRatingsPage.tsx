/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-02
 * Scope: Generated the rating lookup page against UI FR19, with no mockup to
 *        work from.
 * Reviewed by Ngooi Jun Sen.
 *
 * Search for a user (the same Admin search as User management), and each match
 * shows the unified average and count from GET /api/v1/rating/{userId}. The
 * Rating Service keeps no per-rating history that an admin can read, so the
 * average and count are all there is to show.
 */

import { useEffect, useState } from 'react';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { formatRating } from '../lib/format';
import { fetchUserRating, type UserRating } from '../lib/rating';
import { useAdminUserSearch } from '../lib/useAdminUserSearch';
import styles from './AdminRatingsPage.module.css';

/** Ratings change only when an order is rated, so a minute is fresh enough. */
const RATING_CACHE_MS = 60_000;
const ratingCache = new Map<string, { at: number; rating: UserRating }>();
const inFlight = new Set<string>();

/** Null: the Rating Service could not be reached for that user. */
type RatingCell = UserRating | null | 'loading';

export function AdminRatingsPage() {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [ratings, setRatings] = useState<Record<string, RatingCell>>({});
  const { users, hasMore, loadError, search } = useAdminUserSearch(
    query,
    page,
    0,
    'Could not reach the Admin Service.',
  );

  // Each user's rating once: cached across searches, so narrowing or
  // retyping never asks again for someone already shown.
  useEffect(() => {
    if (users === null) return;
    for (const user of users) {
      const cached = ratingCache.get(user.userId);
      if (cached !== undefined && Date.now() - cached.at < RATING_CACHE_MS) {
        setRatings((current) =>
          current[user.userId] === cached.rating ? current : { ...current, [user.userId]: cached.rating },
        );
        continue;
      }
      if (inFlight.has(user.userId)) continue;
      inFlight.add(user.userId);
      setRatings((current) => ({ ...current, [user.userId]: 'loading' }));
      fetchUserRating(user.userId)
        .catch(() => null)
        .then((rating) => {
          inFlight.delete(user.userId);
          // A failure is not cached, so the next search tries again.
          if (rating !== null) ratingCache.set(user.userId, { at: Date.now(), rating });
          setRatings((current) => ({ ...current, [user.userId]: rating }));
        });
    }
  }, [users]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Rating lookup</h1>

        <label className={styles.search}>
          <Icon name="search" size={16} />
          <span className="visually-hidden">Search by name, email or user ID</span>
          <input
            type="search"
            placeholder="Search by name, email or user ID"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </label>
      </header>

      {loadError ? <Alert variant="danger">{loadError}</Alert> : null}

      {users !== null && users.length === 0 && loadError === null ? (
        <p className={styles.empty}>
          {search.trim() === '' ? 'No users yet.' : 'No user matches that search.'}
        </p>
      ) : null}

      {users !== null && users.length > 0 ? (
        <ul className={styles.list}>
          {users.map((user) => {
            const rating = ratings[user.userId];
            return (
              <li key={user.userId} className={styles.item}>
                <div className={styles.who}>
                  <span className={styles.name}>{user.name}</span>
                  <span className={styles.email}>{user.email}</span>
                </div>
                <div className={styles.rating}>
                  {rating === 'loading' || rating === undefined ? (
                    <span className={styles.muted}>…</span>
                  ) : rating === null ? (
                    <span className={styles.muted}>Rating Service unreachable</span>
                  ) : rating.average === null ? (
                    <span className={styles.muted}>No ratings yet</span>
                  ) : (
                    <>
                      <span className={styles.average}>
                        <Icon name="star" size={16} filled />
                        {formatRating(rating.average)}
                      </span>
                      <span className={styles.muted}>
                        {rating.count} rating{rating.count === 1 ? '' : 's'}
                      </span>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
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
    </div>
  );
}
