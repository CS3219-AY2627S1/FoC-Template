/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5)
 * Scope: Generated the rating.permission.granted handler that stores grants.
 * Reviewed by Ngooi Jun Sen.
 */

import { Value } from '@sinclair/typebox/value';
import { db } from '../database/index.js';
import { ratingGrant } from '../database/schema.js';
import { deletedAmong } from './userEvents.js';
import { RATING_PERMISSION_GRANTED, RatingPermissionGranted } from './messages.js';

export type CommandOutcome = 'granted' | 'duplicate' | 'deleted' | 'ignored' | 'invalid';

// Handles one message from foc.rating.commands. Throws only on failures worth
// retrying (e.g. the database is down); a malformed message is 'invalid' and skipped.
export async function handleRatingCommand(raw: string): Promise<CommandOutcome> {
  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return 'invalid';
  }

  const eventType = (message as { eventType?: unknown } | null)?.eventType;
  if (eventType !== RATING_PERMISSION_GRANTED) return 'ignored';
  if (!Value.Check(RatingPermissionGranted, message)) return 'invalid';

  // No grant involving a deleted account, so a late or replayed one can't recreate it.
  if ((await deletedAmong(db, [message.raterId, message.rateeId])).size > 0) return 'deleted';

  // The (order_id, rater_id) key and unique event_id make redelivery a no-op (NFR2.1).
  const inserted = await db
    .insert(ratingGrant)
    .values({
      orderId: message.orderId,
      raterId: message.raterId,
      raterRole: message.raterRole,
      rateeId: message.rateeId,
      rateeRole: message.rateeRole,
      eventId: message.eventId,
    })
    .onConflictDoNothing()
    .returning({ orderId: ratingGrant.orderId });

  return inserted.length > 0 ? 'granted' : 'duplicate';
}
