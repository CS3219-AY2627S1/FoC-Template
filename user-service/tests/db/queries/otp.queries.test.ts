// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-26
// 26/09/2026: Stage 7 - integration tests for otp.queries.ts against the real test DB
// Author review:
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import pool from '../../../src/db/pool.js';
import * as otp from '../../../src/db/queries/otp.queries.js';
import * as users from '../../../src/db/queries/users.queries.js';
import { backdateOtps, getOtps, truncateAll } from '../../helpers/db.js';

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

const HASH = 'a'.repeat(64);

function create(
  uid: string,
  purpose: otp.OtpPurpose = 'Registration',
  newEmail: string | null = null,
) {
  return otp.createOtp({ userId: uid, otpHash: HASH, purpose, newEmail, ttlMinutes: 10 }, pool);
}

describe('createOtp', () => {
  it('inserts a row with the hash, purpose, defaults, and a DB-computed expiry', async () => {
    const row = await create(userId);
    expect(row).toMatchObject({
      user_id: userId,
      otp_hash: HASH,
      purpose: 'Registration',
      new_email: null,
      attempts_count: 0,
      max_attempts: 5,
      consumed_at: null,
    });
    // Both timestamps come from NOW() in the same statement, so the gap is exactly the TTL.
    expect(row.expires_at.getTime() - row.created_at.getTime()).toBe(10 * 60 * 1000);
  });

  it('stores new_email when given', async () => {
    const row = await create(userId, 'Change Email', 'new@example.com');
    expect(row.new_email).toBe('new@example.com');
  });

  it('uses the ttlMinutes it is given', async () => {
    const row = await otp.createOtp(
      { userId, otpHash: HASH, purpose: 'Registration', newEmail: null, ttlMinutes: 3 },
      pool,
    );
    expect(row.expires_at.getTime() - row.created_at.getTime()).toBe(3 * 60 * 1000);
  });
});

describe('invalidateActiveOtps', () => {
  it('consumes only the active OTPs of that user and purpose', async () => {
    await create(userId, 'Registration');
    await create(userId, 'Forgot Password');
    await create(otherUserId, 'Registration');

    await otp.invalidateActiveOtps(userId, 'Registration', pool);

    expect((await getOtps(userId, 'Registration'))[0]!.consumed_at).not.toBeNull();
    expect((await getOtps(userId, 'Forgot Password'))[0]!.consumed_at).toBeNull();
    expect((await getOtps(otherUserId, 'Registration'))[0]!.consumed_at).toBeNull();
  });

  it('does not overwrite consumed_at on an already-consumed OTP', async () => {
    const row = await create(userId);
    await otp.consumeOtp(row.id, pool);
    const first = (await getOtps(userId))[0]!.consumed_at;
    await new Promise((r) => setTimeout(r, 20));
    await otp.invalidateActiveOtps(userId, 'Registration', pool);
    expect((await getOtps(userId))[0]!.consumed_at).toEqual(first);
  });
});

describe('findLatestOtp', () => {
  it('returns null when there is none', async () => {
    expect(await otp.findLatestOtp(userId, 'Registration', pool)).toBeNull();
  });

  it('returns the most recent row in any state, with db_now', async () => {
    const first = await create(userId);
    await backdateOtps(userId, 5);
    const second = await create(userId);
    await otp.consumeOtp(second.id, pool);

    const latest = (await otp.findLatestOtp(userId, 'Registration', pool))!;
    expect(latest.id).toBe(second.id);
    expect(latest.id).not.toBe(first.id);
    expect(latest.consumed_at).not.toBeNull();
    expect(latest.db_now).toBeInstanceOf(Date);
  });

  it('is scoped to the purpose', async () => {
    await create(userId, 'Registration');
    expect(await otp.findLatestOtp(userId, 'Forgot Password', pool)).toBeNull();
  });

  it('db_now uses clock_timestamp(), so it moves on inside one transaction', async () => {
    await create(userId);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const a = (await otp.findLatestOtp(userId, 'Registration', client))!.db_now.getTime();
      await new Promise((r) => setTimeout(r, 30));
      const b = (await otp.findLatestOtp(userId, 'Registration', client))!.db_now.getTime();
      await client.query('ROLLBACK');
      expect(b).toBeGreaterThan(a);
    } finally {
      client.release();
    }
  });
});

describe('countOtps', () => {
  it('without sinceMinutes counts every row for that user and purpose, however old', async () => {
    await create(userId);
    await create(userId);
    await create(userId, 'Forgot Password');
    await create(otherUserId);
    await backdateOtps(userId, 60 * 24);

    expect(await otp.countOtps(userId, 'Registration', pool)).toBe(2);
    expect(await otp.countOtps(userId, 'Forgot Password', pool)).toBe(1);
    expect(await otp.countOtps(otherUserId, 'Forgot Password', pool)).toBe(0);
  });

  it('with sinceMinutes counts only rows created inside the window', async () => {
    await create(userId, 'Forgot Password');
    await backdateOtps(userId, 61, 'Forgot Password');
    await create(userId, 'Forgot Password');
    await backdateOtps(userId, 5, 'Forgot Password'); // now 66 and 5 minutes old

    expect(await otp.countOtps(userId, 'Forgot Password', pool, 60)).toBe(1);
    expect(await otp.countOtps(userId, 'Forgot Password', pool, 120)).toBe(2);
    expect(await otp.countOtps(userId, 'Forgot Password', pool)).toBe(2);
  });

  it('a row exactly at the window edge falls outside it', async () => {
    await create(userId, 'Forgot Password');
    await backdateOtps(userId, 60, 'Forgot Password');
    expect(await otp.countOtps(userId, 'Forgot Password', pool, 60)).toBe(0);
  });
});

describe('incrementAttempts', () => {
  it('adds one and returns the new count', async () => {
    const row = await create(userId);
    expect(await otp.incrementAttempts(row.id, pool)).toBe(1);
    expect(await otp.incrementAttempts(row.id, pool)).toBe(2);
    expect((await getOtps(userId))[0]!.attempts_count).toBe(2);
  });

  it('caps at max_attempts instead of overflowing past it (Stage 25c)', async () => {
    const row = await create(userId);
    for (let i = 0; i < row.max_attempts + 3; i++) {
      await otp.incrementAttempts(row.id, pool);
    }
    expect((await getOtps(userId))[0]!.attempts_count).toBe(row.max_attempts);
  });
});

describe('consumeOtp', () => {
  it('sets consumed_at and reports true, then false on the second call', async () => {
    const row = await create(userId);
    expect(await otp.consumeOtp(row.id, pool)).toBe(true);
    expect((await getOtps(userId))[0]!.consumed_at).not.toBeNull();
    expect(await otp.consumeOtp(row.id, pool)).toBe(false);
  });

  it('reports false for an unknown id', async () => {
    expect(await otp.consumeOtp('00000000-0000-0000-0000-000000000000', pool)).toBe(false);
  });
});
