/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-30
 * Scope: Generated the order.status.changed handler that keeps delivery and request counts
 *        up to date. 2026-11-02: disputes go through counting.ts. 2026-11-09: deleted users skipped.
 * Reviewed by Ngooi Jun Sen
 */

import { Value } from '@sinclair/typebox/value';
import { eq } from 'drizzle-orm';
import { db } from '../database/index.js';
import { countedOrder, disputedOrder } from '../database/schema.js';
import { evaluateUser } from '../services/badges.service.js';
import { adjustCount, applyDispute, deletedAmong, type Role } from './counting.js';
import { ORDER_STATUS_CHANGED, OrderStatusChanged } from './messages.js';

export type OrderOutcome = 'counted' | 'uncounted' | 'duplicate' | 'disputed' | 'deleted' | 'ignored' | 'invalid';

// An order counts once, the first time it reaches any of these (team decision
// 2026-10-30). The same list as Order Service's COMPLETED_DELIVERIES.
export const COUNTED_STATUSES = new Set(['DELIVERED', 'ACKNOWLEDGED', 'UNACKNOWLEDGED', 'COMPLETED']);

/**
 * Handles one message from foc.order.status. Throws only on failures worth
 * retrying (e.g. the database is down); a malformed message is 'invalid' and skipped.
 */
export async function handleOrderEvent(raw: string): Promise<OrderOutcome> {
  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return 'invalid';
  }

  const eventType = (message as { eventType?: unknown } | null)?.eventType;
  if (eventType !== ORDER_STATUS_CHANGED) return 'ignored';
  if (!Value.Check(OrderStatusChanged, message)) return 'invalid';

  const { orderId, requesterId, courierId, toStatus } = message;

  return db.transaction(async (tx) => {
    // A disputed order is uncounted until Admin's verdict (admin.case.resolved),
    // which may already be here: the two arrive on different topics.
    if (toStatus === 'ESCALATED') {
      const [dispute] = await tx
        .insert(disputedOrder)
        .values({ orderId, requesterId, courierId })
        .onConflictDoUpdate({ target: disputedOrder.orderId, set: { requesterId, courierId } })
        .returning();
      const changes = await applyDispute(tx, dispute!);
      if (changes.removed > 0) return 'uncounted';
      return changes.added > 0 ? 'counted' : 'disputed';
    }

    if (!COUNTED_STATUSES.has(toStatus)) return 'ignored';

    const [dispute] = await tx.select().from(disputedOrder).where(eq(disputedOrder.orderId, orderId));
    if (dispute) return 'disputed';

    const deleted = await deletedAmong(tx, [requesterId, courierId]);
    const rows: { orderId: string; role: Role; userId: string }[] = [];
    if (!deleted.has(requesterId)) rows.push({ orderId, role: 'REQUESTER', userId: requesterId });
    if (courierId !== null && !deleted.has(courierId)) rows.push({ orderId, role: 'COURIER', userId: courierId });
    if (rows.length === 0) return 'deleted';

    // The primary key makes a later status of the same order, or a redelivery, a no-op (NFR2.1).
    const added = await tx
      .insert(countedOrder)
      .values(rows)
      .onConflictDoNothing()
      .returning({ userId: countedOrder.userId, role: countedOrder.role });
    for (const row of added) {
      await adjustCount(tx, row.userId, row.role, 1);
    }
    for (const userId of new Set(added.map((row) => row.userId))) {
      await evaluateUser(userId, tx);
    }
    return added.length > 0 ? 'counted' : 'duplicate';
  });
}
