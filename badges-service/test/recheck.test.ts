/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-02
 * Scope: Tests for the re-check of every known user after a catalog change.
 * Reviewed by Ngooi Jun Sen
 */

import { describe, expect, it } from 'vitest';
import catalogSeed from '../src/catalog/badges.json' with { type: 'json' };
import { seedCatalog } from '../src/services/catalog.service.js';
import { recheckAll } from '../src/services/recheck.service.js';
import type { BadgeDefinition } from '../src/types.js';
import { badgeState, db, userMetrics } from './helpers.js';

const seed = catalogSeed as BadgeDefinition[];
const tenDeliveries = seed.find((badge) => badge.badgeId === 'ten_deliveries')!;

const ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CAROL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('recheckAll', () => {
  it('applies a changed threshold to every known user, in batches', async () => {
    await db.insert(userMetrics).values([
      { userId: ALICE, completedDeliveries: 5 },
      { userId: BOB, completedDeliveries: 5 },
      { userId: CAROL, completedDeliveries: 0 },
    ]);
    await seedCatalog([
      { ...tenDeliveries, conditions: [{ metric: 'completedDeliveries', op: 'gte', value: 5 }] },
    ]);

    // Batches of 2 (vitest.config.ts): two pages for three users.
    const summary = await recheckAll();

    expect(summary.users).toBe(3);
    expect(await badgeState(ALICE, 'ten_deliveries')).toBe('earned');
    expect(await badgeState(BOB, 'ten_deliveries')).toBe('earned');
    expect(await badgeState(CAROL, 'ten_deliveries')).toBeNull();
  });

  it('revokes a badge whose threshold was raised', async () => {
    await db.insert(userMetrics).values({ userId: ALICE, completedDeliveries: 1 });
    await recheckAll();
    expect(await badgeState(ALICE, 'first_delivery')).toBe('earned');

    const firstDelivery = seed.find((badge) => badge.badgeId === 'first_delivery')!;
    await seedCatalog([{ ...firstDelivery, conditions: [{ metric: 'completedDeliveries', op: 'gte', value: 2 }] }]);

    expect(await recheckAll()).toMatchObject({ users: 1, revoked: 1 });
    expect(await badgeState(ALICE, 'first_delivery')).toBe('revoked');
  });

  it('does nothing when Badges knows no users', async () => {
    expect(await recheckAll()).toEqual({ users: 0, awarded: 0, revoked: 0 });
  });
});
