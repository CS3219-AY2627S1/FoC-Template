// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-11-04
//  2026-11-04: Admin filters - the optional ?userId= and ?requestId= parameters on
//    GET /credits/transactions/all: scope, combination, the unchanged no-filter case,
//    the auth gate with a filter applied, empty results, validation and paging.
//    Requires a running credit-db; see credit-service/README.md.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { bearer, signToken, startStubJwks, stopStubJwks } from '../helpers/jwks.js';
import { closePool, givenFundedUser, newRequestId, newUserId } from '../helpers/db.js';
import {
  allocateInitialCredits,
  releaseCredits,
  reserveCredits,
  transferCredits,
} from '../../src/services/credits.service.js';

const PAGE_SIZE = 20;
const ALL = '/credits/transactions/all';

/** An administrator token. Every test here goes through the same gate. */
const admin = async () => bearer(await signToken(newUserId(), 'admin'));

const get = async (query = '') => request(app).get(ALL + query).set(await admin());

beforeAll(async () => {
  await startStubJwks();
});

afterAll(async () => {
  await stopStubJwks();
  await closePool();
});

/**
 * One self-contained errand: a funded requester, a funded courier, a reservation and a
 * transfer. Returns the ids so a test can filter on them.
 *
 * Every id is fresh per call, so these fixtures never collide with each other or with
 * the rows other test files leave behind — which matters, because the administrator
 * view returns every row in the database.
 */
async function givenCompletedErrand(amount = 3) {
  const requesterId = await givenFundedUser();
  const courierId = await givenFundedUser();
  const requestId = newRequestId();
  await reserveCredits(requesterId, requestId, amount);
  await transferCredits(requestId, courierId);
  return { requesterId, courierId, requestId };
}

describe('GET /credits/transactions/all?userId=', () => {
  it('returns only rows where that user is the originating or destination party', async () => {
    const { requesterId, courierId, requestId } = await givenCompletedErrand(4);
    // A second errand between two other people, which must not appear.
    const other = await givenCompletedErrand(2);

    const res = await get(`?userId=${requesterId}`);

    expect(res.status).toBe(200);
    expect(res.body.transactions.length).toBeGreaterThan(0);
    for (const t of res.body.transactions) {
      expect([t.originating_user_id, t.destination_user_id]).toContain(requesterId);
    }
    // The requester appears as destination on their allocation and as originating on
    // the reservation and the transfer, so all three of their rows are here.
    const types = res.body.transactions.map((t: { transaction_type: string }) => t.transaction_type);
    expect(types).toEqual(expect.arrayContaining(['allocation', 'reservation', 'transfer']));
    // And nothing belonging only to the other errand.
    const ids = res.body.transactions.map((t: { request_id: string | null }) => t.request_id);
    expect(ids).not.toContain(other.requestId);
    expect(ids).toContain(requestId);
    // The courier's own allocation names only them, so it must be absent.
    for (const t of res.body.transactions) {
      if (t.transaction_type === 'allocation') expect(t.destination_user_id).toBe(requesterId);
    }
    expect(courierId).not.toBe(requesterId);
  });

  it('finds a user who is only ever the destination', async () => {
    // A courier's rows are their allocation plus the transfer into their wallet.
    const { courierId, requestId } = await givenCompletedErrand(5);

    const res = await get(`?userId=${courierId}`);

    expect(res.status).toBe(200);
    const transfer = res.body.transactions.find(
      (t: { transaction_type: string; request_id: string }) =>
        t.transaction_type === 'transfer' && t.request_id === requestId,
    );
    expect(transfer).toBeDefined();
    expect(transfer.destination_user_id).toBe(courierId);
  });
});

describe('GET /credits/transactions/all?requestId=', () => {
  it('returns only that order’s rows', async () => {
    const { requestId } = await givenCompletedErrand(6);
    const other = await givenCompletedErrand(1);

    const res = await get(`?requestId=${requestId}`);

    expect(res.status).toBe(200);
    // A completed errand has exactly two rows keyed to it: the reservation and the
    // transfer. Allocations carry no request_id at all.
    expect(res.body.transactions).toHaveLength(2);
    for (const t of res.body.transactions) expect(t.request_id).toBe(requestId);
    expect(res.body.transactions.map((t: { transaction_type: string }) => t.transaction_type).sort())
      .toEqual(['reservation', 'transfer']);
    expect(res.body.transactions.map((t: { request_id: string }) => t.request_id))
      .not.toContain(other.requestId);
  });

  it('includes a release and excludes a different order’s release', async () => {
    const requesterId = await givenFundedUser();
    const mine = newRequestId();
    const theirs = newRequestId();
    await reserveCredits(requesterId, mine, 2);
    await releaseCredits(mine);
    await reserveCredits(requesterId, theirs, 2);
    await releaseCredits(theirs);

    const res = await get(`?requestId=${mine}`);

    expect(res.body.transactions).toHaveLength(2);
    for (const t of res.body.transactions) expect(t.request_id).toBe(mine);
  });
});

describe('both filters together are ANDed', () => {
  it('returns only rows matching the user and the order', async () => {
    const { requesterId, courierId, requestId } = await givenCompletedErrand(7);

    const both = await get(`?userId=${requesterId}&requestId=${requestId}`);

    expect(both.status).toBe(200);
    for (const t of both.body.transactions) {
      expect(t.request_id).toBe(requestId);
      expect([t.originating_user_id, t.destination_user_id]).toContain(requesterId);
    }
    // Narrower than either filter alone: userId alone also returns the allocation,
    // which has no request_id.
    const byUser = await get(`?userId=${requesterId}`);
    expect(both.body.transactions.length).toBeLessThan(byUser.body.transactions.length);

    // A user and an order that are both real but unrelated returns nothing.
    const unrelated = await givenCompletedErrand(1);
    const crossed = await get(`?userId=${unrelated.requesterId}&requestId=${requestId}`);
    expect(crossed.status).toBe(200);
    expect(crossed.body.transactions).toEqual([]);
    expect(courierId).toBeDefined();
  });
});

describe('no filter is the unchanged behaviour', () => {
  it('still returns rows belonging to users other than the caller', async () => {
    const { requesterId } = await givenCompletedErrand(2);

    const res = await get();

    expect(res.status).toBe(200);
    expect(res.body.transactions.length).toBe(PAGE_SIZE);
    // The caller is a fresh admin with no rows of their own, so everything returned
    // belongs to somebody else — the F20.2 property, unaffected by the new parameters.
    const everyone = new Set(
      res.body.transactions.flatMap((t: { originating_user_id: string; destination_user_id: string }) =>
        [t.originating_user_id, t.destination_user_id].filter(Boolean),
      ),
    );
    expect(everyone.size).toBeGreaterThan(1);
    expect(requesterId).toBeDefined();
  });

  it('returns a superset of any single filter', async () => {
    const { requestId } = await givenCompletedErrand(3);
    const filtered = await get(`?requestId=${requestId}`);
    const unfiltered = await get();
    expect(filtered.body.transactions.length).toBeLessThanOrEqual(
      unfiltered.body.transactions.length,
    );
  });
});

describe('the auth gate still applies with a filter', () => {
  it('refuses an ordinary user with 403 even when filtering', async () => {
    const { requestId } = await givenCompletedErrand(1);
    const res = await request(app)
      .get(`${ALL}?requestId=${requestId}`)
      .set(bearer(await signToken(newUserId(), 'user')));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.transactions).toBeUndefined();
  });

  it('refuses a missing token with 401 even when filtering', async () => {
    const res = await request(app).get(`${ALL}?userId=${newUserId()}`);
    expect(res.status).toBe(401);
  });

  it('allows super admin, because administrator means rank >= admin', async () => {
    const { requestId } = await givenCompletedErrand(1);
    const res = await request(app)
      .get(`${ALL}?requestId=${requestId}`)
      .set(bearer(await signToken(newUserId(), 'super admin')));

    expect(res.status).toBe(200);
    expect(res.body.transactions).toHaveLength(2);
  });
});

describe('unmatched filters are empty, not 404', () => {
  it('returns 200 and an empty array for a user with no rows', async () => {
    const res = await get(`?userId=${newUserId()}`);
    expect(res.status).toBe(200);
    expect(res.body.transactions).toEqual([]);
    expect(res.body.nextCursor).toBeNull();
  });

  it('returns 200 and an empty array for an order with no rows', async () => {
    // Credit Service has no view of which orders exist, and an order with no credit
    // activity yet is an ordinary state rather than a missing resource.
    const res = await get(`?requestId=${newRequestId()}`);
    expect(res.status).toBe(200);
    expect(res.body.transactions).toEqual([]);
    expect(res.body.nextCursor).toBeNull();
  });

  it('returns 200 and an empty array for a user who exists but has no credit activity', async () => {
    const userId = newUserId();
    await allocateInitialCredits(userId);
    const res = await get(`?userId=${userId}&requestId=${newRequestId()}`);
    expect(res.status).toBe(200);
    expect(res.body.transactions).toEqual([]);
  });
});

describe('malformed filters are rejected', () => {
  it.each([
    ['userId', '?userId=not-a-uuid'],
    ['requestId', '?requestId=12345'],
    ['userId in a combination', `?userId=nope&requestId=${newRequestId()}`],
  ])('400s on a malformed %s', async (_label, query) => {
    const res = await get(query);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST_BODY');
  });

  it('rejects before running a query, so a bad filter never reaches Postgres', async () => {
    // A non-UUID would be a 22P02 cast error from Postgres surfacing as a 500 if it got
    // that far; 400 proves zod caught it first.
    const res = await get('?userId=%27%3B%20DROP%20TABLE%20transaction_log%3B--');
    expect(res.status).toBe(400);
  });
});

describe('keyset pagination with a filter applied', () => {
  it('pages through a filtered set without repeating or dropping a row', async () => {
    // One user with more than a page of rows: 1 allocation + 12 reserve/release pairs
    // = 25, so two pages. Reserving and releasing the same single credit keeps the
    // balance sufficient throughout.
    const userId = await givenFundedUser();
    for (let i = 0; i < 12; i += 1) {
      const requestId = newRequestId();
      await reserveCredits(userId, requestId, 1);
      await releaseCredits(requestId);
    }

    const first = await get(`?userId=${userId}`);
    expect(first.status).toBe(200);
    expect(first.body.transactions).toHaveLength(PAGE_SIZE);
    expect(typeof first.body.nextCursor).toBe('string');

    // The filter is re-sent alongside the cursor: the cursor is a pure position token
    // and carries no filter of its own.
    const second = await get(
      `?userId=${userId}&cursor=${encodeURIComponent(first.body.nextCursor)}`,
    );
    expect(second.status).toBe(200);
    expect(second.body.transactions).toHaveLength(5);
    expect(second.body.nextCursor).toBeNull();

    const all = [...first.body.transactions, ...second.body.transactions];
    // Every row still belongs to this user — the filter survived the second page.
    for (const t of all) {
      expect([t.originating_user_id, t.destination_user_id]).toContain(userId);
    }
    // No duplicates across the page boundary, and 25 rows in total.
    const ids = all.map((t: { transaction_id: string }) => t.transaction_id);
    expect(new Set(ids).size).toBe(25);

    // Still newest first across both pages.
    const times = all.map((t: { created_at: string }) => Date.parse(t.created_at));
    expect(times.every((t, i) => i === 0 || times[i - 1] >= t)).toBe(true);
  });

  it('dropping the filter on the second page changes the result, which is why it is re-sent', async () => {
    const userId = await givenFundedUser();
    for (let i = 0; i < 12; i += 1) {
      const requestId = newRequestId();
      await reserveCredits(userId, requestId, 1);
      await releaseCredits(requestId);
    }

    const first = await get(`?userId=${userId}`);
    const withoutFilter = await get(`?cursor=${encodeURIComponent(first.body.nextCursor)}`);

    expect(withoutFilter.status).toBe(200);
    // Without the filter the same cursor walks the whole log, so rows from other users
    // appear. This is the documented contract, not a bug: the caller owns the filter.
    const foreign = withoutFilter.body.transactions.filter(
      (t: { originating_user_id: string; destination_user_id: string }) =>
        t.originating_user_id !== userId && t.destination_user_id !== userId,
    );
    expect(foreign.length).toBeGreaterThan(0);
  });
});
