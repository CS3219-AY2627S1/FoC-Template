// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-10-19
//  2026-10-19: Week 9 - JWKS verification and the authorization rules over HTTP.
//    Runs against a stub key set, never a live user-service.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { bearer, jwksFetchCount, signToken, startStubJwks, stopStubJwks } from '../helpers/jwks.js';
import { closePool, givenFundedUser, newUserId } from '../helpers/db.js';

beforeAll(async () => {
  await startStubJwks();
});

afterAll(async () => {
  await stopStubJwks();
  await closePool();
});

describe('JWKS verification', () => {
  it('accepts a token signed by the published key', async () => {
    const userId = await givenFundedUser();
    const res = await request(app)
      .get(`/credits/balance/${userId}`)
      .set(bearer(await signToken(userId)));

    expect(res.status).toBe(200);
    expect(res.body.balance.totalBalance).toBe(20);
  });

  it('caches the key set instead of refetching per request', async () => {
    const userId = await givenFundedUser();
    const token = await signToken(userId);
    const before = jwksFetchCount();
    for (let i = 0; i < 3; i++) {
      await request(app).get(`/credits/balance/${userId}`).set(bearer(token));
    }
    // The guide is explicit: "Cache the JWKS response — don't fetch it on every request."
    expect(jwksFetchCount()).toBe(before);
  });

  it('rejects a missing Authorization header with 401', async () => {
    const userId = await givenFundedUser();
    const res = await request(app).get(`/credits/balance/${userId}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a non-Bearer header with 401', async () => {
    const userId = await givenFundedUser();
    const res = await request(app)
      .get(`/credits/balance/${userId}`)
      .set({ Authorization: 'Basic abc123' });
    expect(res.status).toBe(401);
  });

  it('rejects a token signed by an unknown key with 401', async () => {
    const userId = await givenFundedUser();
    // Valid shape, unknown kid: the key set has no match even after a refetch.
    const res = await request(app)
      .get(`/credits/balance/${userId}`)
      .set(bearer(await signToken(userId, 'user', { kid: 'not-a-real-kid' })));
    expect(res.status).toBe(401);
  });

  it('rejects an expired token with 401', async () => {
    const userId = await givenFundedUser();
    const res = await request(app)
      .get(`/credits/balance/${userId}`)
      .set(bearer(await signToken(userId, 'user', { expiresIn: '-1s' })));
    expect(res.status).toBe(401);
  });

  it('rejects a garbage token with 401', async () => {
    const userId = await givenFundedUser();
    const res = await request(app).get(`/credits/balance/${userId}`).set(bearer('not.a.jwt'));
    expect(res.status).toBe(401);
  });
});

describe('F19.5.1 — who may read a balance, over HTTP', () => {
  it('lets a user read their own balance', async () => {
    const userId = await givenFundedUser();
    const res = await request(app)
      .get(`/credits/balance/${userId}`)
      .set(bearer(await signToken(userId, 'user')));
    expect(res.status).toBe(200);
  });

  it('refuses an ordinary user reading someone else', async () => {
    const owner = await givenFundedUser();
    const nosy = newUserId();
    const res = await request(app)
      .get(`/credits/balance/${owner}`)
      .set(bearer(await signToken(nosy, 'user')));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('lets an admin read someone else', async () => {
    const owner = await givenFundedUser();
    const res = await request(app)
      .get(`/credits/balance/${owner}`)
      .set(bearer(await signToken(newUserId(), 'admin')));
    expect(res.status).toBe(200);
  });

  it('does not deny super admin', async () => {
    const owner = await givenFundedUser();
    const res = await request(app)
      .get(`/credits/balance/${owner}`)
      .set(bearer(await signToken(newUserId(), 'super admin')));
    expect(res.status).toBe(200);
  });
});
