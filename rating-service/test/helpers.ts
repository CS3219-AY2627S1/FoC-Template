/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5)
 * Scope: Generated test helpers for building grant messages.
 * Reviewed by Ngooi Jun Sen.
 */

import { randomUUID } from 'node:crypto';
import { db } from '../src/database/index.js';
import { ratingGrant } from '../src/database/schema.js';

export { db };
export { deletedUser, outbox, rating, ratingGrant, userRating } from '../src/database/schema.js';

type Role = 'COURIER' | 'REQUESTER';

// A rating.permission.granted message as Order Service publishes it.
export function grantMessage(overrides: Record<string, unknown> = {}) {
  return {
    eventId: randomUUID(),
    eventType: 'rating.permission.granted',
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    orderId: randomUUID(),
    raterId: randomUUID(),
    raterRole: 'COURIER',
    rateeId: randomUUID(),
    rateeRole: 'REQUESTER',
    ...overrides,
  };
}

// A UserDeleted message as User Service publishes it (its own envelope, not the flat format).
export function userDeletedMessage(userId: string, overrides: Record<string, unknown> = {}) {
  return {
    eventId: randomUUID(),
    type: 'UserDeleted',
    occurredAt: new Date().toISOString(),
    data: { userId },
    ...overrides,
  };
}

// Insert a grant directly; returns its ids.
export async function seedGrant(
  input: { raterId?: string; rateeId?: string; raterRole?: Role; rateeRole?: Role } = {},
) {
  const row = {
    orderId: randomUUID(),
    raterId: input.raterId ?? randomUUID(),
    raterRole: input.raterRole ?? ('COURIER' as const),
    rateeId: input.rateeId ?? randomUUID(),
    rateeRole: input.rateeRole ?? ('REQUESTER' as const),
    eventId: randomUUID(),
  };
  await db.insert(ratingGrant).values(row);
  return row;
}
