/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-30
 * Scope: Tests for catalog seeding and loading, change detection (2026-11-02) and caching (2026-11-09).
 * Reviewed by Ngooi Jun Sen
 */

import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import catalogSeed from '../src/catalog/badges.json' with { type: 'json' };
import { badgeCatalog } from '../src/database/schema.js';
import { getCatalog, loadCatalog, seedCatalog } from '../src/services/catalog.service.js';
import { db } from './helpers.js';
import type { BadgeDefinition } from '../src/types.js';

const seed = catalogSeed as BadgeDefinition[];

describe('catalog', () => {
  it('loads the seeded catalog in display order', async () => {
    const catalog = await loadCatalog();
    expect(catalog.map((b) => b.badgeId)).toEqual(seed.map((b) => b.badgeId));
  });

  it('updates an existing badge when the seed changes, without a code change', async () => {
    const [first] = seed;
    await seedCatalog([{ ...first!, title: 'Renamed', conditions: [{ metric: 'completedDeliveries', op: 'gte', value: 2 }] }]);
    const updated = (await loadCatalog()).find((b) => b.badgeId === first!.badgeId);
    expect(updated).toMatchObject({ title: 'Renamed', conditions: [{ metric: 'completedDeliveries', op: 'gte', value: 2 }] });
  });

  it('reports a change only when a badge was added or changed', async () => {
    expect(await seedCatalog(seed)).toBe(false);
    expect(await seedCatalog([{ ...seed[0]!, description: 'New wording' }])).toBe(true);
    expect(await seedCatalog([{ ...seed[0]!, badgeId: 'brand_new', displayOrder: 99 }])).toBe(true);
    expect(await seedCatalog([])).toBe(false);
  });

  it('leaves out progressMetric when a badge has none, and accepts an empty seed', async () => {
    const { progressMetric: _unused, ...plain } = seed[0]!;
    await seedCatalog([{ ...plain, badgeId: 'plain', displayOrder: 99 }]);
    await seedCatalog([]);
    const loaded = (await loadCatalog()).find((b) => b.badgeId === 'plain');
    expect(loaded).toBeDefined();
    expect(loaded).not.toHaveProperty('progressMetric');
  });

  it('caches the catalog until the next seed', async () => {
    const [first] = seed;
    expect((await getCatalog()).find((b) => b.badgeId === first!.badgeId)?.title).toBe(first!.title);

    // A change behind the service's back is not seen: the cached copy is reused.
    await db.update(badgeCatalog).set({ title: 'Edited directly' }).where(eq(badgeCatalog.badgeId, first!.badgeId));
    expect((await getCatalog()).find((b) => b.badgeId === first!.badgeId)?.title).toBe(first!.title);
    expect(await getCatalog()).toBe(await getCatalog());

    // Seeding drops the cache, so the next read sees the database again.
    await seedCatalog([{ ...first!, title: 'Seeded' }]);
    expect((await getCatalog()).find((b) => b.badgeId === first!.badgeId)?.title).toBe('Seeded');
  });
});
