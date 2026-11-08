/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Tests that replaying every event (a new consumer group) leaves badge state unchanged.
 * Author review: Ngooi Jun Sen to validate before merge.
 */

import { asc } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { config } from '../src/config.js';
import { handlerFor } from '../src/messaging/handlers.js';
import { countedOrder, db, disputedOrder, orderMessage, ratingMessage, resolvedMessage, userBadge, userMetrics } from './helpers.js';

const ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CAROL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

// Everything that matters for badges, without timestamps, which a replay may move.
async function state() {
  const metrics = await db.select().from(userMetrics).orderBy(asc(userMetrics.userId));
  const badges = await db.select().from(userBadge).orderBy(asc(userBadge.userId), asc(userBadge.badgeId));
  return {
    metrics: metrics.map(({ userId, completedDeliveries, completedOrders, averageRating, ratingCount }) => ({
      userId,
      completedDeliveries,
      completedOrders,
      averageRating,
      ratingCount,
    })),
    badges: badges.map(({ userId, badgeId, state: badgeState }) => ({ userId, badgeId, state: badgeState })),
    counted: (await db.select().from(countedOrder)).length,
    disputed: (await db.select().from(disputedOrder)).length,
  };
}

describe('replaying every event', () => {
  it('leaves metrics and badges exactly as they were', async () => {
    const delivered = orderMessage({ courierId: ALICE, requesterId: BOB });
    const disputed = orderMessage({ courierId: ALICE, requesterId: CAROL });
    const events: [string, Record<string, unknown>][] = [
      [config.kafka.orderTopic, delivered],
      [config.kafka.orderTopic, { ...delivered, eventId: 'ack', fromStatus: 'DELIVERED', toStatus: 'ACKNOWLEDGED' }],
      [config.kafka.orderTopic, disputed],
      [config.kafka.orderTopic, { ...disputed, eventId: 'esc', fromStatus: 'DELIVERED', toStatus: 'ESCALATED' }],
      [config.kafka.adminTopic, resolvedMessage({ orderId: disputed.orderId, faultParty: 'requester' })],
      [config.kafka.orderTopic, { ...disputed, eventId: 'done', fromStatus: 'UNDER_REVIEW', toStatus: 'COMPLETED' }],
      [config.kafka.ratingTopic, ratingMessage({ userId: ALICE, newAverage: 4.5, totalRatings: 9 })],
      [config.kafka.ratingTopic, ratingMessage({ userId: ALICE, newAverage: 4.6, totalRatings: 10 })],
    ];
    const consume = async () => {
      for (const [topic, message] of events) {
        await handlerFor(topic)!(JSON.stringify(message));
      }
    };

    await consume();
    const first = await state();
    expect(first.metrics.find((m) => m.userId === ALICE)).toMatchObject({ completedDeliveries: 2, ratingCount: 10 });

    await consume();
    expect(await state()).toEqual(first);
  });
});
