/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5)
 * Scope: Generated the UserDeleted handler: removes what a deleted account received and
 *        anonymises the ratings it gave.
 * Reviewed by Ngooi Jun Sen.
 */

import { Value } from '@sinclair/typebox/value';
import { eq, inArray, or } from 'drizzle-orm';
import { db, type Executor } from '../database/index.js';
import { deletedUser, rating, ratingGrant, userRating } from '../database/schema.js';
import { USER_DELETED, UserDeleted } from './messages.js';

export type UserOutcome = 'deleted' | 'duplicate' | 'ignored' | 'invalid';

/** Which of these users have deleted their account. */
export async function deletedAmong(executor: Executor, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await executor
    .select({ userId: deletedUser.userId })
    .from(deletedUser)
    .where(inArray(deletedUser.userId, userIds));
  return new Set(rows.map((row) => row.userId));
}

/**
 * Handles one message from foc.user.status; only UserDeleted matters here (User
 * F5: the account is gone after its six-month deletion period). In one
 * transaction: removes the user's grants (as rater or ratee), the ratings they
 * received and their running total, and sets rater_id to null on the ratings
 * they gave, so other users' averages don't change (decision 2026-11-09). The
 * user is recorded in deleted_user so a late or replayed grant is ignored.
 * Nothing is published: Badges removes the user on the same event.
 */
export async function handleUserEvent(raw: string): Promise<UserOutcome> {
  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return 'invalid';
  }

  const type = (message as { type?: unknown } | null)?.type;
  if (type !== USER_DELETED) return 'ignored';
  if (!Value.Check(UserDeleted, message)) return 'invalid';

  const { userId } = message.data;

  return db.transaction(async (tx) => {
    const recorded = await tx
      .insert(deletedUser)
      .values({ userId })
      .onConflictDoNothing()
      .returning({ userId: deletedUser.userId });

    await tx.delete(ratingGrant).where(or(eq(ratingGrant.raterId, userId), eq(ratingGrant.rateeId, userId)));
    await tx.delete(rating).where(eq(rating.rateeId, userId));
    await tx.update(rating).set({ raterId: null }).where(eq(rating.raterId, userId));
    await tx.delete(userRating).where(eq(userRating.userId, userId));

    return recorded.length > 0 ? 'deleted' : 'duplicate';
  });
}
