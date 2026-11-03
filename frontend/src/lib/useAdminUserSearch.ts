/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-02
 * Scope: Generated the shared user search for User management and Rating
 *        lookup: debounced service search, ranked results, instant narrowing.
 * Reviewed by Ngooi Jun Sen.
 *
 * The service does the real search (it covers every user, not just a page),
 * but a round trip after a typing pause feels slow. So while the service
 * answer for the latest text is on its way, the rows already on screen are
 * narrowed and re-ranked against what is typed, on every keystroke. The
 * service's answer replaces them when it arrives.
 */

import { useEffect, useMemo, useState } from 'react';
import { errorMessage } from './api';
import { fetchAdminUsers, type AdminAccountStatus, type AdminUser } from './adminUsers';
import { byMatch, matchRank } from './search';

const SEARCH_DELAY_MS = 300;

function rankUser(user: AdminUser, needle: string): number {
  // The same fields the service matches: name, email and the user ID.
  return matchRank(needle, user.name, [user.email, user.userId]);
}

interface AdminUserSearch {
  /** Null until the first answer. */
  users: AdminUser[] | null;
  hasMore: boolean;
  total: number | null;
  loadError: string | null;
  /** The text last sent to the service, for "no match" wording. */
  search: string;
}

export function useAdminUserSearch(
  query: string,
  page: number,
  /** Bump to read the service again, e.g. after an action. */
  reloadKey: number,
  failMessage: string,
  status: '' | AdminAccountStatus = '',
): AdminUserSearch {
  const [search, setSearch] = useState(query);
  const [fetched, setFetched] = useState<{ search: string; users: AdminUser[] } | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    fetchAdminUsers(search, page, status || undefined)
      .then((result) => {
        if (cancelled) return;
        setFetched({ search, users: result.items });
        setHasMore(result.hasMore);
        setTotal(result.total);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setFetched({ search, users: [] });
        setHasMore(false);
        setTotal(null);
        setLoadError(errorMessage(error, failMessage));
      });
    return () => {
      cancelled = true;
    };
  }, [search, page, reloadKey, failMessage, status]);

  const users = useMemo(() => {
    if (fetched === null) return null;
    const typed = query.trim().toLowerCase();
    const loadedFor = fetched.search.trim().toLowerCase();
    // More letters on the end of what the rows were fetched for: every match
    // is already among them, so narrowing is exact for this page.
    const narrowed = typed.startsWith(loadedFor)
      ? fetched.users.filter((user) => rankUser(user, typed) !== Infinity)
      : fetched.users;
    return byMatch(narrowed, typed.startsWith(loadedFor) ? typed : loadedFor, rankUser);
  }, [fetched, query]);

  return { users, hasMore, total, loadError, search };
}
