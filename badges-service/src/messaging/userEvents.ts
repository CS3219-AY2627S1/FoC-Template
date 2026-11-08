/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Generated the UserDeleted handler that removes a deleted account's badge data.
 * Reviewed by Ngooi Jun Sen
 */

import { Value } from '@sinclair/typebox/value';
import { eq } from 'drizzle-orm';
import { db } from '../database/index.js';
import { countedOrder, deletedUser, userBadge, userMetrics } from '../database/schema.js';
import { USER_DELETED, UserDeleted } from './messages.js';

export type UserOutcome = 'deleted' | 'duplicate' | 'ignored' | 'invalid';

/**
 * Handles one message from foc.user.status; only UserDeleted matters here (User
 * F5: the account is gone after its six-month deletion period). Removes the
 * user's metrics, badges and counted orders, and records them in deleted_user
 * so later events for them are ignored. Their ID stays on disputed_order rows,
 * where it only marks them as a party: the other party's verdict still applies.
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

    await tx.delete(userBadge).where(eq(userBadge.userId, userId));
    await tx.delete(countedOrder).where(eq(countedOrder.userId, userId));
    await tx.delete(userMetrics).where(eq(userMetrics.userId, userId));

    return recorded.length > 0 ? 'deleted' : 'duplicate';
  });
}
