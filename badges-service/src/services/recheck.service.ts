/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-02
 * Scope: Generated the one-off re-check of every known user after a catalog change.
 * Reviewed by Ngooi Jun Sen
 */

import { asc, gt } from 'drizzle-orm';
import { config } from '../config.js';
import { db } from '../database/index.js';
import { userMetrics } from '../database/schema.js';
import type { BadgeChanges } from '../types.js';
import { evaluateUser } from './badges.service.js';
import { getCatalog } from './catalog.service.js';

export interface RecheckSummary extends BadgeChanges {
  users: number;
}

/**
 * Re-checks every user Badges has metrics for against the current catalog, in
 * user ID order, a batch at a time (NFR1.1.1: at most 1,000 per batch). Events
 * keep each user's badges current, so this is only needed when the catalog
 * itself changed (decision 2026-11-02: events only, no polling).
 */
export async function recheckAll(): Promise<RecheckSummary> {
  const catalog = await getCatalog();
  const summary: RecheckSummary = { users: 0, awarded: 0, revoked: 0 };

  for (let after: string | null = null; ; ) {
    const rows: { userId: string }[] = await db
      .select({ userId: userMetrics.userId })
      .from(userMetrics)
      .where(after === null ? undefined : gt(userMetrics.userId, after))
      .orderBy(asc(userMetrics.userId))
      .limit(config.batchSize);
    if (rows.length === 0) break;

    for (const { userId } of rows) {
      const changes = await evaluateUser(userId, db, catalog);
      summary.awarded += changes.awarded;
      summary.revoked += changes.revoked;
      summary.users += 1;
    }
    after = rows[rows.length - 1]!.userId;
  }
  return summary;
}
