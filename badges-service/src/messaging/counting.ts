/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-02
 * Scope: Generated the count adjustments shared by the order and admin event handlers,
 *        including the fault-aware rule for disputed orders.
 * Reviewed by Ngooi Jun Sen
 */

import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { Executor } from '../database/index.js';
import { countedOrder, deletedUser, type DisputedOrderRow, userMetrics } from '../database/schema.js';
import { evaluateUser } from '../services/badges.service.js';

export type Role = 'COURIER' | 'REQUESTER';
export type FaultParty = NonNullable<DisputedOrderRow['faultParty']>;

// COURIER rows feed completedDeliveries, REQUESTER rows completedOrders.
export async function adjustCount(executor: Executor, userId: string, role: Role, delta: 1 | -1): Promise<void> {
  const initial = delta > 0 ? 1 : 0;
  const counts =
    role === 'COURIER'
      ? {
          insert: { completedDeliveries: initial },
          update: { completedDeliveries: sql`greatest(${userMetrics.completedDeliveries} + ${delta}, 0)` },
        }
      : {
          insert: { completedOrders: initial },
          update: { completedOrders: sql`greatest(${userMetrics.completedOrders} + ${delta}, 0)` },
        };
  await executor
    .insert(userMetrics)
    .values({ userId, ...counts.insert, lastOrderEventAt: new Date() })
    .onConflictDoUpdate({
      target: userMetrics.userId,
      set: { ...counts.update, lastOrderEventAt: sql`now()`, updatedAt: sql`now()` },
    });
}

/** Which of these users have deleted their account; events never count for them. */
export async function deletedAmong(executor: Executor, userIds: (string | null)[]): Promise<Set<string>> {
  const ids = userIds.filter((id): id is string => id !== null);
  if (ids.length === 0) return new Set();
  const rows = await executor
    .select({ userId: deletedUser.userId })
    .from(deletedUser)
    .where(inArray(deletedUser.userId, ids));
  return new Set(rows.map((row) => row.userId));
}

/**
 * The roles a disputed order counts for (decision 2026-11-02): none until it is
 * resolved, then whoever was not at fault. Requester at fault: the courier's
 * delivery counts. Courier at fault: the requester's order counts. No fault: both.
 */
export function rolesCounted(fault: FaultParty | null): Role[] {
  switch (fault) {
    case 'requester':
      return ['COURIER'];
    case 'courier':
      return ['REQUESTER'];
    case 'no-fault':
      return ['COURIER', 'REQUESTER'];
    default:
      return [];
  }
}

export interface DisputeChanges {
  removed: number;
  added: number;
}

/**
 * Makes a disputed order's counted_order rows match its verdict: removes the
 * rows for roles that no longer count, adds the ones that now do, and re-checks
 * the users affected. Running it again changes nothing (NFR2.1). Until the
 * escalation event has supplied the parties, there is no one to count.
 */
export async function applyDispute(tx: Executor, dispute: DisputedOrderRow): Promise<DisputeChanges> {
  const { orderId, requesterId, courierId } = dispute;
  if (requesterId === null) return { removed: 0, added: 0 };

  // A party who has since deleted their account is never counted again.
  const deleted = await deletedAmong(tx, [requesterId, courierId]);
  const live = (id: string | null) => (id !== null && !deleted.has(id) ? id : null);
  const userFor: Record<Role, string | null> = { REQUESTER: live(requesterId), COURIER: live(courierId) };
  const kept = rolesCounted(dispute.faultParty).filter((role) => userFor[role] !== null);

  const removed = await tx
    .delete(countedOrder)
    .where(
      kept.length > 0
        ? and(eq(countedOrder.orderId, orderId), notInArray(countedOrder.role, kept))
        : eq(countedOrder.orderId, orderId),
    )
    .returning({ userId: countedOrder.userId, role: countedOrder.role });
  for (const row of removed) {
    await adjustCount(tx, row.userId, row.role, -1);
  }

  const added =
    kept.length === 0
      ? []
      : await tx
          .insert(countedOrder)
          .values(kept.map((role) => ({ orderId, role, userId: userFor[role]! })))
          .onConflictDoNothing()
          .returning({ userId: countedOrder.userId, role: countedOrder.role });
  for (const row of added) {
    await adjustCount(tx, row.userId, row.role, 1);
  }

  for (const userId of new Set([...removed, ...added].map((row) => row.userId))) {
    await evaluateUser(userId, tx);
  }
  return { removed: removed.length, added: added.length };
}
