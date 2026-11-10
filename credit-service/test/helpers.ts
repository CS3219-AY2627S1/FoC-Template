/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-08
 * Scope: Credit Service tests, drafted and edited with Claude Code.
 * Reviewed by Don Lee
 */

import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../src/database/index.js';
import { creditOrder, creditUser } from '../src/database/schema.js';

export { db };
export { creditLog, creditOrder, creditUser } from '../src/database/schema.js';

// Insert a user with a known balance; returns the generated id.
export async function seedUser(balance = 20): Promise<string> {
  const userId = randomUUID();
  await db.insert(creditUser).values({ userId, balance });
  return userId;
}

// Insert an active reservation for an existing user; returns the order id.
export async function seedOrder(requesterId: string, reservedCredits = 5): Promise<string> {
  const orderId = randomUUID();
  await db.insert(creditOrder).values({ orderId, requesterId, reservedCredits });
  return orderId;
}

// Insert a user whose account was revoked (UserDeleted); returns the id.
export async function seedRevokedUser(): Promise<string> {
  const userId = randomUUID();
  await db.insert(creditUser).values({ userId, balance: 0, deletedAt: sql`now()` });
  return userId;
}
