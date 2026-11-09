/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5)
 * Scope: Tests for the UserDeleted handler and for ignoring grants for deleted users.
 * Reviewed by Ngooi Jun Sen.
 */

import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { handleRatingCommand } from '../src/messaging/grants.js';
import { handleUserEvent } from '../src/messaging/userEvents.js';
import { getUserRating, listPendingRatings, submitRating } from '../src/services/rating.service.js';
import {
  db,
  deletedUser,
  grantMessage,
  rating,
  ratingGrant,
  seedGrant,
  userDeletedMessage,
  userRating,
} from './helpers.js';

const ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CAROL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const deleteUser = (userId: string) => handleUserEvent(JSON.stringify(userDeletedMessage(userId)));

// rater gives ratee a score on a fresh order.
async function rate(raterId: string, rateeId: string, score: number) {
  const grant = await seedGrant({ raterId, rateeId });
  await submitRating(raterId, grant.orderId, { score });
  return grant;
}

describe('handleUserEvent', () => {
  it("anonymises the ratings a deleted user gave, so the ratee's average doesn't change", async () => {
    await rate(ALICE, BOB, 5);
    await rate(CAROL, BOB, 3);

    expect(await deleteUser(ALICE)).toBe('deleted');

    expect(await getUserRating(BOB)).toEqual({ userId: BOB, average: 4, count: 2 });
    const given = await db.select().from(rating).where(eq(rating.rateeId, BOB));
    expect(given.map((r) => r.raterId).sort()).toEqual([CAROL, null].sort());
  });

  it("removes the ratings a deleted user received and their total", async () => {
    await rate(BOB, ALICE, 4);

    await deleteUser(ALICE);

    expect(await db.select().from(rating).where(eq(rating.rateeId, ALICE))).toHaveLength(0);
    expect(await db.select().from(userRating).where(eq(userRating.userId, ALICE))).toHaveLength(0);
    expect(await getUserRating(ALICE)).toEqual({ userId: ALICE, average: null, count: 0 });
  });

  it("removes grants where the deleted user is the rater or the ratee, and leaves others'", async () => {
    await seedGrant({ raterId: ALICE, rateeId: BOB });
    await seedGrant({ raterId: BOB, rateeId: ALICE });
    await seedGrant({ raterId: BOB, rateeId: CAROL });

    await deleteUser(ALICE);

    const left = await db.select().from(ratingGrant);
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ raterId: BOB, rateeId: CAROL });
    expect((await listPendingRatings(BOB)).pending).toHaveLength(1);
  });

  it('records the user, and treats a repeated deletion as a duplicate', async () => {
    const message = JSON.stringify(userDeletedMessage(ALICE));
    expect(await handleUserEvent(message)).toBe('deleted');
    expect(await handleUserEvent(message)).toBe('duplicate');
    expect(await db.select().from(deletedUser)).toEqual([expect.objectContaining({ userId: ALICE })]);
  });

  it('keeps two anonymised ratings on one order: null rater IDs do not collide', async () => {
    const grant = await seedGrant({ raterId: ALICE, rateeId: CAROL, raterRole: 'COURIER', rateeRole: 'REQUESTER' });
    await submitRating(ALICE, grant.orderId, { score: 5 });
    await db.insert(ratingGrant).values({
      orderId: grant.orderId,
      raterId: BOB,
      raterRole: 'REQUESTER',
      rateeId: CAROL,
      rateeRole: 'COURIER',
      eventId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    });
    await submitRating(BOB, grant.orderId, { score: 4 });

    await deleteUser(ALICE);
    await deleteUser(BOB);

    const rows = await db.select().from(rating).where(eq(rating.orderId, grant.orderId));
    expect(rows.map((r) => r.raterId)).toEqual([null, null]);
    expect(await getUserRating(CAROL)).toEqual({ userId: CAROL, average: 4.5, count: 2 });
  });

  it('ignores other user events and JSON that is not an object', async () => {
    expect(
      await handleUserEvent(JSON.stringify({ eventId: 'e', type: 'UserVerified', occurredAt: 'now', data: {} })),
    ).toBe('ignored');
    expect(await handleUserEvent('null')).toBe('ignored');
  });

  it.each([
    ['non-JSON', 'not json'],
    ['a non-UUID userId', JSON.stringify(userDeletedMessage('alice'))],
    ['no data', JSON.stringify(userDeletedMessage(ALICE, { data: undefined }))],
  ])('rejects %s as invalid', async (_label, raw) => {
    expect(await handleUserEvent(raw)).toBe('invalid');
    expect(await db.select().from(deletedUser)).toHaveLength(0);
  });
});

describe('grants after a deletion', () => {
  it.each([
    ['rater', { raterId: ALICE }],
    ['ratee', { rateeId: ALICE }],
  ])('ignores a grant whose %s was deleted', async (_label, overrides) => {
    await deleteUser(ALICE);
    expect(await handleRatingCommand(JSON.stringify(grantMessage(overrides)))).toBe('deleted');
    expect(await db.select().from(ratingGrant)).toHaveLength(0);
  });

  it('still accepts grants between users who still have accounts', async () => {
    await deleteUser(ALICE);
    expect(await handleRatingCommand(JSON.stringify(grantMessage({ raterId: BOB, rateeId: CAROL })))).toBe('granted');
  });
});
