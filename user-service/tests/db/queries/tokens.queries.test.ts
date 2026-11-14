// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-26
// 26/09/2026: Stage 7 - integration tests for tokens.queries.ts against the real test DB
// Author review:
// 2026-11-05: Stage 23b - test cases for the seconds_left column on createRefreshToken and
//   lockRefreshToken. Governing decision: instructions.md Stage 23b.
// Author review:
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import pool from '../../../src/db/pool.js';
import { withTransaction } from '../../../src/db/transaction.js';
import * as tokens from '../../../src/db/queries/tokens.queries.js';
import * as users from '../../../src/db/queries/users.queries.js';
import { getRefreshTokens, truncateAll } from '../../helpers/db.js';
import { sha256 } from '../../../src/utils/hash.js';

let userId: string;
let otherUserId: string;

beforeEach(async () => {
  await truncateAll();
  userId = (
    await users.createUser({
      username: 'alice',
      email: 'alice@example.com',
      passwordHash: 'h',
      status: 'active',
    })
  ).id;
  otherUserId = (
    await users.createUser({
      username: 'bob',
      email: 'bob@example.com',
      passwordHash: 'h',
      status: 'active',
    })
  ).id;
});
afterEach(truncateAll);

function create(
  uid: string,
  plain: string,
  extra: Partial<Parameters<typeof tokens.createRefreshToken>[0]> = {},
) {
  return tokens.createRefreshToken({
    userId: uid,
    tokenHash: sha256(plain),
    ttlDays: 7,
    userAgent: null,
    ipAddress: null,
    ...extra,
  });
}

describe('createRefreshToken', () => {
  it('stores the hash with a DB-computed expiry ttlDays out, not revoked', async () => {
    const row = await create(userId, 'tok', { userAgent: 'vitest', ipAddress: '10.0.0.1' });
    expect(row).toMatchObject({
      user_id: userId,
      token_hash: sha256('tok'),
      is_revoked: false,
      revoked_at: null,
      user_agent: 'vitest',
      ip_address: '10.0.0.1',
    });
    expect(row.expires_at.getTime() - row.created_at.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('returns seconds_left computed in SQL, close to ttlDays out', async () => {
    const row = await create(userId, 'tok', { ttlDays: 1 });
    expect(row.seconds_left).toBeGreaterThanOrEqual(1 * 24 * 60 * 60 - 5);
    expect(row.seconds_left).toBeLessThanOrEqual(1 * 24 * 60 * 60);
  });

  it('rejects a duplicate token hash', async () => {
    await create(userId, 'tok');
    await expect(create(otherUserId, 'tok')).rejects.toMatchObject({ code: '23505' });
  });

  it('runs inside a transaction and is undone by a rollback', async () => {
    await expect(
      withTransaction(async (client) => {
        await tokens.createRefreshToken(
          { userId, tokenHash: sha256('x'), ttlDays: 7, userAgent: null, ipAddress: null },
          client,
        );
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await getRefreshTokens(userId)).toHaveLength(0);
  });
});

describe('findRefreshToken', () => {
  it('returns the row with db_now, or null', async () => {
    await create(userId, 'tok');
    const row = (await tokens.findRefreshToken(sha256('tok')))!;
    expect(row.user_id).toBe(userId);
    expect(row.db_now).toBeInstanceOf(Date);
    expect(await tokens.findRefreshToken(sha256('missing'))).toBeNull();
  });

  it('reports an expired token as expired relative to db_now', async () => {
    await create(userId, 'tok');
    await pool.query(`UPDATE refresh_tokens SET expires_at = NOW() - INTERVAL '1 second'`);
    const row = (await tokens.findRefreshToken(sha256('tok')))!;
    expect(row.expires_at.getTime()).toBeLessThan(row.db_now.getTime());
  });
});

describe('lockRefreshToken', () => {
  it('returns the row with db_now, or null', async () => {
    await create(userId, 'tok');
    const row = await withTransaction((c) => tokens.lockRefreshToken(sha256('tok'), c));
    expect(row?.db_now).toBeInstanceOf(Date);
    expect(await withTransaction((c) => tokens.lockRefreshToken(sha256('nope'), c))).toBeNull();
  });

  it('returns seconds_left computed from expires_at and the database clock', async () => {
    await create(userId, 'tok', { ttlDays: 1 });
    const row = await withTransaction((c) => tokens.lockRefreshToken(sha256('tok'), c));
    expect(row!.seconds_left).toBeGreaterThanOrEqual(1 * 24 * 60 * 60 - 5);
    expect(row!.seconds_left).toBeLessThanOrEqual(1 * 24 * 60 * 60);
  });

  it('floors seconds_left at 0 for an already-expired token, never negative', async () => {
    await create(userId, 'tok');
    await pool.query(`UPDATE refresh_tokens SET expires_at = NOW() - INTERVAL '1 second'`);
    const row = await withTransaction((c) => tokens.lockRefreshToken(sha256('tok'), c));
    expect(row!.seconds_left).toBe(0);
  });

  it('blocks a second locker until the first transaction ends', async () => {
    await create(userId, 'tok');
    const order: string[] = [];
    let second!: Promise<void>;

    await withTransaction(async (client) => {
      await tokens.lockRefreshToken(sha256('tok'), client);
      second = withTransaction(async (c2) => {
        await tokens.lockRefreshToken(sha256('tok'), c2);
        order.push('second acquired');
      });
      await new Promise((r) => setTimeout(r, 200));
      expect(order).toEqual([]);
    });
    await second;
    expect(order).toEqual(['second acquired']);
  });
});

describe('revokeRefreshToken', () => {
  it('marks only that token revoked and sets revoked_at', async () => {
    await create(userId, 'a');
    await create(userId, 'b');
    await tokens.revokeRefreshToken(sha256('a'));
    const rows = await getRefreshTokens(userId);
    const a = rows.find((r) => r.token_hash === sha256('a'))!;
    const b = rows.find((r) => r.token_hash === sha256('b'))!;
    expect(a.is_revoked).toBe(true);
    expect(a.revoked_at).not.toBeNull();
    expect(b.is_revoked).toBe(false);
  });
});

describe('revokeAllRefreshTokensForUser', () => {
  it('revokes every token of that user and no other user’s', async () => {
    await create(userId, 'a');
    await create(userId, 'b');
    await create(otherUserId, 'c');
    await tokens.revokeAllRefreshTokensForUser(userId);

    expect((await getRefreshTokens(userId)).every((r) => r.is_revoked && r.revoked_at)).toBe(true);
    expect((await getRefreshTokens(otherUserId)).every((r) => !r.is_revoked)).toBe(true);
  });

  it('keeps the original revoked_at of already-revoked tokens', async () => {
    await create(userId, 'a');
    await tokens.revokeRefreshToken(sha256('a'));
    const before = (await getRefreshTokens(userId))[0]!.revoked_at;
    await new Promise((r) => setTimeout(r, 20));
    await tokens.revokeAllRefreshTokensForUser(userId);
    expect((await getRefreshTokens(userId))[0]!.revoked_at).toEqual(before);
  });

  it('runs inside a transaction and is undone by a rollback', async () => {
    await create(userId, 'a');
    await expect(
      withTransaction(async (client) => {
        await tokens.revokeAllRefreshTokensForUser(userId, client);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect((await getRefreshTokens(userId))[0]!.is_revoked).toBe(false);
  });
});
