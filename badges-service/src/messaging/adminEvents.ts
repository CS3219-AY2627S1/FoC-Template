/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-02
 * Scope: Generated the admin.case.resolved handler that counts a disputed order again
 *        for whoever was not at fault.
 * Reviewed by Ngooi Jun Sen
 */

import { Value } from '@sinclair/typebox/value';
import { isNull, sql } from 'drizzle-orm';
import { db } from '../database/index.js';
import { disputedOrder } from '../database/schema.js';
import { applyDispute } from './counting.js';
import { ADMIN_CASE_RESOLVED, AdminCaseResolved } from './messages.js';

export type AdminOutcome = 'restored' | 'resolved' | 'duplicate' | 'ignored' | 'invalid';

/**
 * Handles one message from foc.admin.events; only admin.case.resolved matters
 * here. The first verdict for an order is kept, so a redelivery is 'duplicate'.
 * A verdict that arrives before the escalation event is stored and applied when
 * that event comes (orderEvents.ts).
 */
export async function handleAdminEvent(raw: string): Promise<AdminOutcome> {
  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return 'invalid';
  }

  const eventType = (message as { eventType?: unknown } | null)?.eventType;
  if (eventType !== ADMIN_CASE_RESOLVED) return 'ignored';
  if (!Value.Check(AdminCaseResolved, message)) return 'invalid';

  const { orderId, faultParty } = message;

  return db.transaction(async (tx) => {
    const [dispute] = await tx
      .insert(disputedOrder)
      .values({ orderId, faultParty, resolvedAt: sql`now()` })
      .onConflictDoUpdate({
        target: disputedOrder.orderId,
        set: { faultParty, resolvedAt: sql`now()` },
        setWhere: isNull(disputedOrder.faultParty),
      })
      .returning();
    if (!dispute) return 'duplicate';

    const changes = await applyDispute(tx, dispute);
    return changes.added > 0 ? 'restored' : 'resolved';
  });
}
