/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-30
 * Scope: Ported catalog seeding and loading from the scaffold's db.ts to Drizzle.
 *        2026-11-02: seeding reports whether the catalog changed.
 *        2026-11-09: the catalog is cached in memory between seeds.
 * Reviewed by Ngooi Jun Sen
 */

import { asc, sql } from 'drizzle-orm';
import { db, type Executor } from '../database/index.js';
import { badgeCatalog } from '../database/schema.js';
import type { BadgeDefinition } from '../types.js';

/**
 * Upserts the catalog from src/catalog/badges.json, so a new badge or a changed
 * threshold needs no code change beyond the catalog data (F1.1). Returns whether
 * any badge was added or changed, i.e. whether users need re-checking.
 */
export async function seedCatalog(definitions: BadgeDefinition[], executor: Executor = db): Promise<boolean> {
  cached = null;
  if (definitions.length === 0) return false;
  const written = await executor
    .insert(badgeCatalog)
    .values(
      definitions.map((badge) => ({
        badgeId: badge.badgeId,
        title: badge.title,
        description: badge.description,
        targetRole: badge.targetRole,
        displayOrder: badge.displayOrder,
        iconEarnedUrl: badge.iconEarnedUrl,
        iconUnearnedUrl: badge.iconUnearnedUrl,
        conditions: badge.conditions,
        progressMetric: badge.progressMetric ?? null,
      })),
    )
    .onConflictDoUpdate({
      target: badgeCatalog.badgeId,
      set: {
        title: sql`excluded.title`,
        description: sql`excluded.description`,
        targetRole: sql`excluded.target_role`,
        displayOrder: sql`excluded.display_order`,
        iconEarnedUrl: sql`excluded.icon_earned_url`,
        iconUnearnedUrl: sql`excluded.icon_unearned_url`,
        conditions: sql`excluded.conditions`,
        progressMetric: sql`excluded.progress_metric`,
        updatedAt: sql`now()`,
      },
      // Unchanged rows are left alone, so they don't count as a change.
      setWhere: sql`(${badgeCatalog.title}, ${badgeCatalog.description}, ${badgeCatalog.targetRole},
        ${badgeCatalog.displayOrder}, ${badgeCatalog.iconEarnedUrl}, ${badgeCatalog.iconUnearnedUrl},
        ${badgeCatalog.conditions}, ${badgeCatalog.progressMetric})
        is distinct from (excluded.title, excluded.description, excluded.target_role,
        excluded.display_order, excluded.icon_earned_url, excluded.icon_unearned_url,
        excluded.conditions, excluded.progress_metric)`,
    })
    .returning({ badgeId: badgeCatalog.badgeId });
  return written.length > 0;
}

// The catalog only changes when seedCatalog runs (at startup, from badges.json),
// so events and profile reads share one copy instead of querying it each time.
let cached: Promise<BadgeDefinition[]> | null = null;

/** The catalog, read from the database once and reused until the next seed. */
export function getCatalog(): Promise<BadgeDefinition[]> {
  if (cached === null) {
    const loading = loadCatalog();
    cached = loading;
    // A failed read is not kept, so the next call tries again.
    loading.catch(() => {
      if (cached === loading) cached = null;
    });
  }
  return cached;
}

export async function loadCatalog(executor: Executor = db): Promise<BadgeDefinition[]> {
  const rows = await executor.select().from(badgeCatalog).orderBy(asc(badgeCatalog.displayOrder));
  return rows.map((row) => ({
    badgeId: row.badgeId,
    title: row.title,
    description: row.description,
    targetRole: row.targetRole,
    displayOrder: row.displayOrder,
    iconEarnedUrl: row.iconEarnedUrl,
    iconUnearnedUrl: row.iconUnearnedUrl,
    conditions: row.conditions,
    ...(row.progressMetric !== null && { progressMetric: row.progressMetric }),
  }));
}
