/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-03
 * Scope: Generated the add-friend control on the order pages, for the courier
 *        or requester on the order.
 * Reviewed by Ngooi Jun Sen.
 *
 * Orders are the only place a user meets someone else (there is no user
 * search), so this is where requests start. User Service has no "what am I to
 * this person" call, so the state comes from the user's own three lists.
 */

import { useCallback, useEffect, useState } from 'react';
import { ApiError, errorMessage } from '../../lib/api';
import {
  answerFriendRequest,
  fetchFriendRequests,
  fetchFriends,
  sendFriendRequest,
  type FriendRequest,
} from '../../lib/friends';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import styles from './FriendControl.module.css';

type Standing =
  | { kind: 'none' }
  | { kind: 'friends'; name: string }
  | { kind: 'sent' }
  | { kind: 'received'; request: FriendRequest };

interface FriendControlProps {
  userId: string;
  role: 'courier' | 'requester';
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

async function standingWith(userId: string): Promise<Standing> {
  const [friends, incoming, outgoing] = await Promise.all([
    fetchFriends(),
    fetchFriendRequests('incoming'),
    fetchFriendRequests('outgoing'),
  ]);
  const friend = friends.find((f) => same(f.id, userId));
  if (friend) return { kind: 'friends', name: friend.name };
  const received = incoming.find((r) => same(r.sender.id, userId));
  if (received) return { kind: 'received', request: received };
  if (outgoing.some((r) => same(r.recipient.id, userId))) return { kind: 'sent' };
  return { kind: 'none' };
}

export function FriendControl({ userId, role }: FriendControlProps) {
  // Null while loading, and if the lists cannot be read: friendship is
  // optional here, so the order page simply goes without it.
  const [standing, setStanding] = useState<Standing | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setStanding(await standingWith(userId));
    } catch {
      setStanding(null);
    }
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setFailure(null);
    try {
      await action();
    } catch (error) {
      setFailure(
        error instanceof ApiError && (error.code === 'USER_NOT_FOUND' || error.code === 'USER_NOT_AVAILABLE')
          ? `This ${role}'s account is not available, so they cannot be added.`
          : errorMessage(error, 'Could not reach the server. Try again in a moment.'),
      );
    } finally {
      setBusy(false);
    }
  }

  function add() {
    void run(async () => {
      const sent = await sendFriendRequest(userId);
      // Not sent: a request or friendship already existed, so show which.
      if (sent) setStanding({ kind: 'sent' });
      else await reload();
    });
  }

  function accept(request: FriendRequest) {
    void run(async () => {
      await answerFriendRequest(request.requestId, 'accept');
      setStanding({ kind: 'friends', name: request.sender.name });
    });
  }

  if (standing === null) return null;

  return (
    <div className={styles.control}>
      {standing.kind === 'friends' ? (
        <p className={styles.friends}>
          <Icon name="check" size={16} />
          Friends with {standing.name}
        </p>
      ) : standing.kind === 'sent' ? (
        <p className={`${styles.status} ${styles.sent}`} role="status">
          <Icon name="mail" size={16} />
          Friend request sent
        </p>
      ) : standing.kind === 'received' ? (
        <div className={styles.received}>
          <p className={styles.status}>{standing.request.sender.name} sent you a friend request.</p>
          <Button variant="secondary" loading={busy} onClick={() => accept(standing.request)}>
            Accept
          </Button>
        </div>
      ) : (
        <Button variant="secondary" loading={busy} onClick={add}>
          Add {role} as a friend
        </Button>
      )}
      {failure ? (
        <p className={styles.failure} role="alert">
          {failure}
        </p>
      ) : null}
    </div>
  );
}
