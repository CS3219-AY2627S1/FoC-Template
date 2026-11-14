// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-10-19
//  2026-10-19: Week 9 - F19.5.2 and F20.2 over HTTP: row scope, identical field sets,
//    20-per-page keyset pagination, newest first, and the administrator gate.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { bearer, signToken, startStubJwks, stopStubJwks } from '../helpers/jwks.js';
import {
  closePool,
  givenFundedUser,
  newRequestId,
  newUserId,
  givenReservation,
} from '../helpers/db.js';
import {
  releaseCredits,
  reserveCredits,
  transferCredits,
} from '../../src/services/credits.service.js';

const PAGE_SIZE = 20;

beforeAll(async () => {
  await startStubJwks();
});

afterAll(async () => {
  await stopStubJwks();
  await closePool();
});

describe('F19.5.2 — a user sees their own records', () => {
  it('returns rows where the user is the originating party', async () => {
    const userId = await givenFundedUser();
    await reserveCredits(userId, newRequestId(), 3);

    const res = await request(app)
      .get('/credits/transactions')
      .set(bearer(await signToken(userId)));

    expect(res.status).toBe(200);
    // The allocation (destination) and the reservation (originating).
    expect(res.body.transactions).toHaveLength(2);
    expect(res.body.transactions.map((t: { transaction_type: string }) => t.transaction_type)).toEqual(
      ['reservation', 'allocation'],
    );
  });

  it('returns rows where the user is the destination party', async () => {
    const { requestId } = await givenReservation(5);
    const courierId = await givenFundedUser();
    await transferCredits(requestId, courierId);

    const res = await request(app)
      .get('/credits/transactions')
      .set(bearer(await signToken(courierId)));

    // The courier is the destination of both their allocation and the transfer.
    const types = res.body.transactions.map((t: { transaction_type: string }) => t.transaction_type);
    expect(types).toContain('transfer');
    expect(types).toContain('allocation');
  });

  it('does not leak another user’s rows', async () => {
    const mine = await givenFundedUser();
    const theirs = await givenFundedUser();
    await reserveCredits(theirs, newRequestId(), 4);

    const res = await request(app)
      .get('/credits/transactions')
      .set(bearer(await signToken(mine)));

    for (const t of res.body.transactions) {
      expect([t.originating_user_id, t.destination_user_id]).toContain(mine);
    }
  });

  it('returns the full field set F20.1.1 lists', async () => {
    const userId = await givenFundedUser();
    const res = await request(app)
      .get('/credits/transactions')
      .set(bearer(await signToken(userId)));

    expect(Object.keys(res.body.transactions[0]).sort()).toEqual([
      'amount',
      'created_at',
      'destination_user_id',
      'originating_user_id',
      'request_id',
      'transaction_id',
      'transaction_type',
    ]);
  });

  it('keeps credit-service’s own transaction type vocabulary', async () => {
    const userId = await givenFundedUser();
    const res = await request(app)
      .get('/credits/transactions')
      .set(bearer(await signToken(userId)));
    // Not the mock's earned/spent/reserved/returned vocabulary.
    expect(res.body.transactions[0].transaction_type).toBe('allocation');
  });

  it('401s without a token', async () => {
    expect((await request(app).get('/credits/transactions')).status).toBe(401);
  });
});

describe('pagination — 20 per page, newest first', () => {
  it('caps a page at 20 and pages through the rest with the cursor', async () => {
    const userId = await givenFundedUser();
    // 1 allocation + 12 reserve/release pairs = 25 rows, so two pages. Releasing keeps
    // the credits available, so the balance never limits how many rows we can make.
    for (let i = 0; i < 12; i++) {
      const requestId = newRequestId();
      await reserveCredits(userId, requestId, 1);
      await releaseCredits(requestId);
    }

    const token = await signToken(userId);
    const first = await request(app).get('/credits/transactions').set(bearer(token));

    expect(first.body.transactions).toHaveLength(PAGE_SIZE);
    expect(first.body.nextCursor).toEqual(expect.any(String));

    const second = await request(app)
      .get('/credits/transactions')
      .query({ cursor: first.body.nextCursor })
      .set(bearer(token));

    expect(second.body.transactions).toHaveLength(5);
    expect(second.body.nextCursor).toBeNull();

    // No row appears on both pages.
    const ids = [...first.body.transactions, ...second.body.transactions].map(
      (t: { transaction_id: string }) => t.transaction_id,
    );
    expect(new Set(ids).size).toBe(25);
  });

  it('orders newest first', async () => {
    const userId = await givenFundedUser();
    for (let i = 0; i < 3; i++) await reserveCredits(userId, newRequestId(), 1);

    const res = await request(app)
      .get('/credits/transactions')
      .set(bearer(await signToken(userId)));

    const times = res.body.transactions.map((t: { created_at: string }) => Date.parse(t.created_at));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('rejects a malformed cursor', async () => {
    const userId = await givenFundedUser();
    const res = await request(app)
      .get('/credits/transactions')
      .query({ cursor: 'not-a-cursor' })
      .set(bearer(await signToken(userId)));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CURSOR');
  });
});

describe('F20.2 / F20.2.1 — administrators see every record', () => {
  it('refuses an ordinary user with 403', async () => {
    const res = await request(app)
      .get('/credits/transactions/all')
      .set(bearer(await signToken(newUserId(), 'user')));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('allows an admin', async () => {
    const res = await request(app)
      .get('/credits/transactions/all')
      .set(bearer(await signToken(newUserId(), 'admin')));
    expect(res.status).toBe(200);
  });

  it('allows super admin, because administrator means rank >= admin', async () => {
    const res = await request(app)
      .get('/credits/transactions/all')
      .set(bearer(await signToken(newUserId(), 'super admin')));
    expect(res.status).toBe(200);
  });

  it('returns rows belonging to users other than the caller', async () => {
    const someone = await givenFundedUser();
    const admin = newUserId();

    const res = await request(app)
      .get('/credits/transactions/all')
      .set(bearer(await signToken(admin, 'admin')));

    const parties = res.body.transactions.flatMap((t: Record<string, string | null>) => [
      t.originating_user_id,
      t.destination_user_id,
    ]);
    expect(parties).toContain(someone);
    expect(parties).not.toContain(admin);
  });

  it('uses the same field set as the user view', async () => {
    const userId = await givenFundedUser();
    const [mine, all] = await Promise.all([
      request(app).get('/credits/transactions').set(bearer(await signToken(userId))),
      request(app)
        .get('/credits/transactions/all')
        .set(bearer(await signToken(newUserId(), 'admin'))),
    ]);
    // Team decision 2026-10-19: identical field sets, only the row scope differs.
    expect(Object.keys(all.body.transactions[0]).sort()).toEqual(
      Object.keys(mine.body.transactions[0]).sort(),
    );
  });

  it('also caps at 20 per page', async () => {
    const res = await request(app)
      .get('/credits/transactions/all')
      .set(bearer(await signToken(newUserId(), 'admin')));
    expect(res.body.transactions.length).toBeLessThanOrEqual(PAGE_SIZE);
  });

  it('401s without a token', async () => {
    expect((await request(app).get('/credits/transactions/all')).status).toBe(401);
  });
});
