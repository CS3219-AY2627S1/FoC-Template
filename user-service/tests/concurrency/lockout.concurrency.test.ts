/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: Created the Stage 18 concurrency suite: N concurrent wrong logins at the threshold
 *        produce exactly one lock at the correct level, and N concurrent forgot-password sends
 *        at the cap produce exactly one send-escalation, covering the Stage 18 Verification
 *        bullets in instructions.md ("Concurrency: N concurrent wrong logins at the threshold
 *        produce exactly one lock and the correct level. Concurrent sends at the cap produce
 *        exactly one escalation.").
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-fable-5-1), date: 2026-11-10
 * Scope: Fix F2 - debugged the ECONNRESET / "socket hang up" flake; replaced per-call
 *        `request(app)` supertest servers with the shared loopback server in
 *        tests/helpers/server.ts (`api()`). No test logic or assertions changed.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-10
 * Scope: Stage 31e - added the unlock-email assertion to the existing N-concurrent-wrong-logins
 *        test (one lock -> exactly one email, per instructions.md Stage 31b's "Exactly once
 *        per lock" row) and a new describe block for N concurrent clicks of the same unlock
 *        link: exactly one UNLOCKED, the rest ALREADY_UNLOCKED, per Stage 31c's own
 *        concurrency bullet. Governing decision: instructions.md Stage 31b/31c.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api } from '../helpers/server.js';
import { CONCURRENT_REQUESTS as N } from '../helpers/constants.js';
import { backdateOtps, getOtps, getUserById, setLoginLockState, truncateAll } from '../helpers/db.js';
import { awaitLastUnlockEmail, resetEmailMock, unlockEmailCallsFor } from '../helpers/email.js';
import { createActiveUser } from '../helpers/fixtures.js';
import { signUnlockToken as signTestUnlockToken } from '../helpers/keys.js';

resetEmailMock();
beforeEach(truncateAll);
afterEach(truncateAll);

const post = (path: string) => api().post(path);

describe('concurrent login failures at the lock threshold', () => {
  it('N concurrent wrong passwords, one already at 4 failures: exactly one lock at level 1', async () => {
    const u = await createActiveUser(1);
    await setLoginLockState(u.id, { failedAttempts: 4, windowStartMinutesAgo: 1 });

    const rs = await Promise.all(
      Array.from({ length: N }, () =>
        post('/auth/login').send({ identifier: u.email, password: 'Wrong!Pass1' }),
      ),
    );

    expect(rs.filter((r) => r.status === 500)).toHaveLength(0);
    // Exactly one of the N concurrent requests is the one that pushes the count to 5 and is
    // itself rejected as the lock; every other one (whichever side of that commit it fell on)
    // is either the pre-lock increment (401) or finds the account already locked (429).
    const locked = rs.filter((r) => r.status === 429 && r.body.code === 'ACCOUNT_LOCKED');
    expect(locked.length).toBeGreaterThanOrEqual(1);
    for (const r of locked) {
      expect(r.body.message).toBe('Too many failed login attempts. Please try again in about an hour.');
    }
    for (const r of rs.filter((x) => x.status !== 429)) {
      expect(r.status).toBe(401);
      expect(r.body.code).toBe('INVALID_CREDENTIALS');
    }

    const row = (await getUserById(u.id))!;
    expect(row.login_lock_level).toBe(1);
    expect(row.login_locked_until).not.toBeNull();

    await awaitLastUnlockEmail();
    expect(unlockEmailCallsFor(u.email)).toHaveLength(1);
  });
});

describe('concurrent clicks on the same unlock link (Stage 31c)', () => {
  it('N concurrent clicks with the same token: exactly one UNLOCKED, the rest ALREADY_UNLOCKED', async () => {
    const u = await createActiveUser(1);
    await setLoginLockState(u.id, { lockLevel: 1, lockedUntilMinutesFromNow: 60, failedAttempts: 5 });
    const row = (await getUserById(u.id))!;
    const token = signTestUnlockToken({
      sub: u.id,
      lck: Math.floor(row.login_locked_until!.getTime() / 1000),
    });

    const rs = await Promise.all(Array.from({ length: N }, () => post('/auth/unlock').send({ token })));

    expect(rs.filter((r) => r.status === 500)).toHaveLength(0);
    const unlocked = rs.filter((r) => r.body.code === 'UNLOCKED');
    const alreadyUnlocked = rs.filter((r) => r.body.code === 'ALREADY_UNLOCKED');
    expect(unlocked).toHaveLength(1);
    expect(alreadyUnlocked).toHaveLength(N - 1);
    expect(rs.every((r) => r.status === 200)).toBe(true);

    const after = (await getUserById(u.id))!;
    expect(after.login_locked_until).toBeNull();
    expect(after.login_lock_level).toBe(0);
  });
});

describe('concurrent forgot-password sends at the cap', () => {
  it('N concurrent sends, already 5 in the window: exactly one escalation to level 1', async () => {
    const u = await createActiveUser(1);
    for (let i = 0; i < 5; i++) {
      await post('/auth/forgot-password').send({ email: u.email });
      await backdateOtps(u.id, 2, 'Forgot Password');
    }

    const rs = await Promise.all(
      Array.from({ length: N }, () => post('/auth/forgot-password').send({ email: u.email })),
    );

    expect(rs.filter((r) => r.status === 500)).toHaveLength(0);
    const limited = rs.filter((r) => r.status === 429 && r.body.code === 'OTP_RESEND_LIMIT');
    expect(limited.length).toBeGreaterThanOrEqual(1);
    for (const r of limited) {
      expect(r.body.message).toBe('Maximum OTP resends reached. Please try again in about an hour.');
    }

    const rows = await getOtps(u.id, 'Forgot Password');
    // Whichever single request hit the cap escalated to exactly level 1, never higher, even
    // though N requests raced to be the one that tipped it over.
    const maxLevel = Math.max(...rows.map((r) => r.send_escalation_level));
    expect(maxLevel).toBe(1);
  });
});
