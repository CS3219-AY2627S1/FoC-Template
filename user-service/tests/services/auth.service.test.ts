// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-26
// 26/09/2026: Stage 7 - service-level tests for each exported auth.service function
// Author review:
// 27/09/2026: Stage 11 - updated fixtures for the new activeView field
// Author review:
// 2026-10-23: Stage 14d - added coverage for the credit_allocation_outbox row
//   verifyRegistrationOtp inserts on a successful activation (and the absence of one on a
//   failing verify), which had no test coverage at all before this change (Stage 14 deferred
//   its tests to the end-of-project test stage). No requirements, architecture, schema, or API
//   decisions were made by the AI tool.
// Author review:
// 2026-11-04: Stage 18b/18c - added coverage for login()'s lockout (threshold, escalation,
//   reset, pending/suspended exclusion, Retry-After) and forgotPassword's OTP_RESEND_LIMIT
//   escalation wording. Governing decision: instructions.md Stage 18.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-05: Stage 23b - updated login()'s response-shape assertion and refresh()'s
//   "returns only" test for the new sessionTimeLeftSeconds field; added coverage for its value
//   on login, after a real refresh, and for a token backdated to 5 minutes left. Governing
//   decision: instructions.md Stage 23b. No requirements, architecture, schema, or API
//   decisions were made by the AI tool.
// Author review:
// 2026-11-10: Stage 31e - added unlock-email trigger coverage to the login lockout describe
//   block (each of the three login locks sends exactly one email to the registered address
//   with a link whose token's lck matches the row, a pending/suspended account's lock sends
//   none, and login() itself never awaits the send so a failing send does not fail login) and
//   a new describe('unlockByToken (Stage 31c)') covering every service-level Verification
//   bullet: a valid token unlocks (lock, escalation, OTP send blocks/escalations for all three
//   purposes cleared, login then works), reuse/supersession/admin-unlock/successful-login/
//   time-expiry/suspended/pending/unknown-user all give ALREADY_UNLOCKED with no write, bad
//   token shapes give INVALID_UNLOCK_TOKEN, and a locked super admin can unlock. Governing
//   decision: instructions.md Stage 31b/31c's own Verification bullets.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-10: Bug fix - verifyRegistrationOtp/resendRegistrationOtp now require a pendingToken
//   param (the new cross-check against the account named by `email`); updated every existing
//   call in the verifyRegistrationOtp and resendRegistrationOtp describe blocks to pass the
//   calling test's own registerPending/createActiveUser pendingToken, so these service-level
//   tests keep exercising the OTP logic itself rather than tripping the new EMAIL_MISMATCH
//   pre-check (already covered at the HTTP level in auth.controller.test.ts). No test behaviour
//   or assertions otherwise changed. Tool: Claude Code (model: claude-sonnet-5). Governing
//   decision: bug report + team decisions recorded in this task's conversation (pending-token
//   cookie mechanism, EMAIL_MISMATCH 403 with no OTP-counter interaction, TTL =
//   config.otp.ttlMinutes). No requirements, architecture, schema, or API decisions were made by
//   the AI tool.
// Author review:
import { readFileSync } from 'node:fs';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as authService from '../../src/services/auth.service.js';
import { AppError } from '../../src/utils/AppError.js';
import { sha256 } from '../../src/utils/hash.js';
import { NEW_PASSWORD, PASSWORD } from '../helpers/constants.js';
import {
  backdateOtps,
  countUsers,
  expireOtps,
  getAuditLogRowsForTarget,
  getCreditAllocationOutboxRows,
  getOtps,
  getRefreshTokenByPlain,
  getRefreshTokens,
  getUserByEmail,
  getUserById,
  seedOtp,
  seedRefreshToken,
  setLoginLockState,
  setOtpSendBlock,
  setRefreshTokenExpiresInMinutes,
  setUserRole,
  setUserStatus,
  truncateAll,
} from '../helpers/db.js';
import {
  awaitLastUnlockEmail,
  emailCallsFor,
  failNextEmail,
  latestOtpFor,
  latestUnlockUrlFor,
  resetEmailMock,
  sendOtpEmailMock,
  sendUnlockEmailMock,
  unlockEmailCallsFor,
  wrongOtp,
} from '../helpers/email.js';
import { createActiveUser, createUserWithRole, registerPending, userInput } from '../helpers/fixtures.js';
import { verifyUnlockToken } from '../../src/utils/jwt.js';
import {
  signToken as signTestAccessToken,
  signUnlockToken as signTestUnlockToken,
  tamperSignature,
} from '../helpers/keys.js';

resetEmailMock();
beforeEach(truncateAll);
afterEach(truncateAll);

// Resolves to the thrown AppError (fails the test if nothing is thrown or it is another type).
async function appError(p: Promise<unknown>): Promise<AppError> {
  const err = await p.then(
    () => {
      throw new Error('expected an AppError but the call resolved');
    },
    (e) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  return err as AppError;
}

describe('PASSWORD_REGEX', () => {
  it.each(['Abcdef1!', 'Str0ng!Passw0rd', 'aA1!aaaa', 'Zz9#zzzzzzzzzzzz'])('accepts %j', (pw) => {
    expect(authService.PASSWORD_REGEX.test(pw)).toBe(true);
  });
  it.each(['Ab1!xyz', 'abcdefg1!', 'ABCDEFG1!', 'Abcdefgh!', 'Abcdefg12', '', 'Abc'])(
    'rejects %j',
    (pw) => {
      expect(authService.PASSWORD_REGEX.test(pw)).toBe(false);
    },
  );
});

describe('register', () => {
  it('throws AppError(400, VALIDATION_ERROR) with the documented message for each bad field', async () => {
    const good = userInput(1);
    expect(await appError(authService.register({ ...good, username: 'ab' }))).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message:
        'Username must contain between 3 and 255 chars and have no spaces or special characters.',
    });
    expect(await appError(authService.register({ ...good, email: 'nope' }))).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Please enter a valid email',
    });
    expect(await appError(authService.register({ ...good, password: 'weak' }))).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(await countUsers()).toBe(0);
  });

  it('checks the username format before the email and the password', async () => {
    const err = await appError(
      authService.register({ username: 'a', email: 'bad', password: 'bad' }),
    );
    expect(err.message).toMatch(/^Username/);
  });

  it('creates a pending user and one Registration OTP in the same transaction', async () => {
    await authService.register(userInput(1));
    const user = (await getUserByEmail('user1@example.com'))!;
    expect(user.status).toBe('pending');
    expect(await getOtps(user.id, 'Registration')).toHaveLength(1);
  });

  it('resolves to only a pendingToken (nothing else sensitive is returned)', async () => {
    const result = await authService.register(userInput(1));
    expect(Object.keys(result)).toEqual(['pendingToken']);
    expect(typeof result.pendingToken).toBe('string');
  });

  it('rolls back the pending user when the OTP email fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    failNextEmail();
    const err = await appError(authService.register(userInput(1)));
    expect(err).toMatchObject({ status: 503, code: 'EMAIL_SEND_FAILED' });
    expect(await countUsers()).toBe(0);
  });

  it('throws 409 USERNAME_TAKEN / EMAIL_TAKEN for a live reservation', async () => {
    await authService.register(userInput(1));
    expect(
      await appError(authService.register({ ...userInput(2), username: 'user1' })),
    ).toMatchObject({
      status: 409,
      code: 'USERNAME_TAKEN',
      message: 'Username already in use',
    });
    expect(
      await appError(authService.register({ ...userInput(2), email: 'user1@example.com' })),
    ).toMatchObject({
      status: 409,
      code: 'EMAIL_TAKEN',
      message: 'Email already in use',
    });
  });

  it('releases an expired pending reservation before checking for duplicates', async () => {
    await authService.register(userInput(1));
    const old = (await getUserByEmail('user1@example.com'))!;
    await expireOtps(old.id);
    await authService.register(userInput(1));
    expect((await getUserByEmail('user1@example.com'))!.id).not.toBe(old.id);
    expect(await countUsers()).toBe(1);
  });
});

describe('login', () => {
  it('returns { accessToken, refreshToken, user, sessionTimeLeftSeconds } where user has exactly id, username, email, role', async () => {
    const u = await createActiveUser(1);
    const result = await authService.login(
      { identifier: u.email, password: PASSWORD },
      'ua',
      '127.0.0.1',
    );

    expect(Object.keys(result).sort()).toEqual([
      'accessToken',
      'refreshToken',
      'sessionTimeLeftSeconds',
      'user',
    ]);
    expect(result.user).toEqual({
      id: u.id,
      username: 'user1',
      email: 'user1@example.com',
      role: 'user',
      activeView: 'requester',
    });
    expect(result.refreshToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns sessionTimeLeftSeconds close to the 30-day session lifetime', async () => {
    const u = await createActiveUser(1);
    const result = await authService.login({ identifier: u.email, password: PASSWORD }, null, null);
    expect(result.sessionTimeLeftSeconds).toBeGreaterThanOrEqual(30 * 24 * 60 * 60 - 5);
    expect(result.sessionTimeLeftSeconds).toBeLessThanOrEqual(30 * 24 * 60 * 60);
  });

  it('stores the hash, user agent and IP of the request', async () => {
    const u = await createActiveUser(1);
    const { refreshToken } = await authService.login(
      { identifier: u.username, password: PASSWORD },
      'my-agent',
      '10.1.2.3',
    );
    const row = (await getRefreshTokenByPlain(refreshToken))!;
    expect(row.token_hash).toBe(sha256(refreshToken));
    expect(row.user_agent).toBe('my-agent');
    expect(row.ip_address).toBe('10.1.2.3');
  });

  it('accepts null user agent and IP', async () => {
    const u = await createActiveUser(1);
    const { refreshToken } = await authService.login(
      { identifier: u.username, password: PASSWORD },
      null,
      null,
    );
    const row = (await getRefreshTokenByPlain(refreshToken))!;
    expect(row.user_agent).toBeNull();
    expect(row.ip_address).toBeNull();
  });

  it('checks credentials (401) before pending (403) before suspended (403)', async () => {
    const pending = await registerPending(1);
    expect(
      await appError(
        authService.login({ identifier: pending.email, password: 'Wrong!Pass1' }, null, null),
      ),
    ).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    expect(
      await appError(
        authService.login({ identifier: pending.email, password: PASSWORD }, null, null),
      ),
    ).toMatchObject({ status: 403, code: 'ACCOUNT_NOT_VERIFIED' });

    const active = await createActiveUser(2);
    await setUserStatus(active.id, 'suspended');
    expect(
      await appError(
        authService.login({ identifier: active.email, password: 'Wrong!Pass1' }, null, null),
      ),
    ).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    expect(
      await appError(
        authService.login({ identifier: active.email, password: PASSWORD }, null, null),
      ),
    ).toMatchObject({ status: 403, code: 'ACCOUNT_SUSPENDED' });
  });

  it('finds the user by username first, then by email', async () => {
    const u = await createActiveUser(1);
    for (const identifier of [u.username, u.email]) {
      const r = await authService.login({ identifier, password: PASSWORD }, null, null);
      expect(r.user.id).toBe(u.id);
    }
  });

  it('takes the role from the locked row', async () => {
    const u = await createActiveUser(1);
    await setUserRole(u.id, 'super admin');
    const r = await authService.login({ identifier: u.email, password: PASSWORD }, null, null);
    expect(r.user.role).toBe('super admin');
  });
});

describe('login lockout (Stage 18b)', () => {
  it('4 wrong passwords then the correct one: login succeeds and the counter resets', async () => {
    const u = await createActiveUser(1);
    for (let i = 0; i < 4; i++) {
      await appError(authService.login({ identifier: u.email, password: 'Wrong!Pass1' }, null, null));
    }
    const r = await authService.login({ identifier: u.email, password: PASSWORD }, null, null);
    expect(r.user.id).toBe(u.id);
    const row = (await getUserById(u.id))!;
    expect(row.login_failed_attempts).toBe(0);
    expect(row.login_failure_window_start).toBeNull();
    expect(row.login_locked_until).toBeNull();
    expect(row.login_lock_level).toBe(0);
  });

  it('the 5th wrong password within the window locks for 1h with Retry-After, and the correct password is still rejected', async () => {
    const u = await createActiveUser(1);
    for (let i = 0; i < 4; i++) {
      await appError(authService.login({ identifier: u.email, password: 'Wrong!Pass1' }, null, null));
    }
    const err = await appError(
      authService.login({ identifier: u.email, password: 'Wrong!Pass1' }, null, null),
    );
    expect(err).toMatchObject({
      status: 429,
      code: 'ACCOUNT_LOCKED',
      message: 'Too many failed login attempts. Please try again in about an hour.',
    });
    expect(err.retryAfterSeconds).toBeGreaterThan(3500);
    expect(err.retryAfterSeconds).toBeLessThanOrEqual(3600);

    const stillLocked = await appError(
      authService.login({ identifier: u.email, password: PASSWORD }, null, null),
    );
    expect(stillLocked).toMatchObject({ status: 429, code: 'ACCOUNT_LOCKED' });

    const row = (await getUserById(u.id))!;
    expect(row.login_lock_level).toBe(1);
  });

  it('5 wrong passwords spread over more than the window: no lock', async () => {
    const u = await createActiveUser(1);
    for (let i = 0; i < 4; i++) {
      await appError(authService.login({ identifier: u.email, password: 'Wrong!Pass1' }, null, null));
    }
    // The window (15 min) has expired, so this starts a fresh window instead of locking.
    await setLoginLockState(u.id, { failedAttempts: 4, windowStartMinutesAgo: 20 });
    await appError(authService.login({ identifier: u.email, password: 'Wrong!Pass1' }, null, null));
    const row = (await getUserById(u.id))!;
    expect(row.login_locked_until).toBeNull();
    expect(row.login_failed_attempts).toBe(1);
  });

  it('a wrong password on a pending or suspended account does not count, and an unknown identifier does not count', async () => {
    const pending = await registerPending(1);
    for (let i = 0; i < 10; i++) {
      await appError(authService.login({ identifier: pending.email, password: 'Wrong!Pass1' }, null, null));
    }
    expect((await getUserByEmail(pending.email))!.login_failed_attempts).toBe(0);

    const suspended = await createActiveUser(2);
    await setUserStatus(suspended.id, 'suspended');
    for (let i = 0; i < 10; i++) {
      await appError(authService.login({ identifier: suspended.email, password: 'Wrong!Pass1' }, null, null));
    }
    expect((await getUserById(suspended.id))!.login_failed_attempts).toBe(0);

    for (let i = 0; i < 10; i++) {
      await appError(authService.login({ identifier: 'nobody@example.com', password: 'x' }, null, null));
    }
    expect(await countUsers()).toBe(2);
  });

  it('escalates 1h -> 4h -> 24h, and a lock does not revoke refresh tokens (/auth/refresh keeps working)', async () => {
    const u = await createActiveUser(1);
    const { refreshToken } = await authService.login({ identifier: u.email, password: PASSWORD }, null, null);

    await setLoginLockState(u.id, { lockLevel: 1, lockedUntilMinutesFromNow: 60 });
    let err = await appError(authService.login({ identifier: u.email, password: 'Wrong!Pass1' }, null, null));
    expect(err).toMatchObject({ status: 429, code: 'ACCOUNT_LOCKED' });
    expect(err.message).toContain('about an hour');

    // Lock has passed and the next failure escalates to level 2 (4h).
    await setLoginLockState(u.id, { lockLevel: 1, lockedUntilMinutesFromNow: -1 });
    for (let i = 0; i < 4; i++) {
      await appError(authService.login({ identifier: u.email, password: 'Wrong!Pass1' }, null, null));
    }
    err = await appError(authService.login({ identifier: u.email, password: 'Wrong!Pass1' }, null, null));
    expect(err.message).toContain('about 4 hours');
    expect((await getUserById(u.id))!.login_lock_level).toBe(2);

    // Third lock escalates to 24h, worded "about a day".
    await setLoginLockState(u.id, { lockLevel: 2, lockedUntilMinutesFromNow: -1 });
    for (let i = 0; i < 4; i++) {
      await appError(authService.login({ identifier: u.email, password: 'Wrong!Pass1' }, null, null));
    }
    err = await appError(authService.login({ identifier: u.email, password: 'Wrong!Pass1' }, null, null));
    expect(err.message).toContain('about a day');
    expect((await getUserById(u.id))!.login_lock_level).toBe(3);

    // The lock never revoked the refresh token issued before it.
    const refreshResult = await authService.refresh(refreshToken);
    expect(refreshResult.accessToken).toBeTruthy();
  });

  it('the escalation level resets to 1h after 24h with no new lock, but not before', async () => {
    const u = await createActiveUser(1);

    // 23h since the last hit (derived from lockedUntil - 4h, the level-2 duration): still level 2.
    await setLoginLockState(u.id, {
      lockLevel: 2,
      lockedUntilMinutesFromNow: -(23 * 60 - 4 * 60),
    });
    for (let i = 0; i < 4; i++) {
      await appError(authService.login({ identifier: u.email, password: 'Wrong!Pass1' }, null, null));
    }
    let err = await appError(authService.login({ identifier: u.email, password: 'Wrong!Pass1' }, null, null));
    expect(err.message).toContain('about a day');

    // 25h since the last hit: the quiet window has passed, so this escalates from 0, not 3.
    await setLoginLockState(u.id, {
      lockLevel: 2,
      lockedUntilMinutesFromNow: -(25 * 60 - 4 * 60),
    });
    for (let i = 0; i < 4; i++) {
      await appError(authService.login({ identifier: u.email, password: 'Wrong!Pass1' }, null, null));
    }
    err = await appError(authService.login({ identifier: u.email, password: 'Wrong!Pass1' }, null, null));
    expect(err.message).toContain('about an hour');
    expect((await getUserById(u.id))!.login_lock_level).toBe(1);
  });

  it('the 1h, 4h and 24h login locks each send exactly one unlock email with a matching link', async () => {
    const u = await createActiveUser(1);
    for (let i = 0; i < 5; i++) {
      await appError(authService.login({ identifier: u.email, password: 'Wrong!Pass1' }, null, null));
    }
    await awaitLastUnlockEmail();
    expect(unlockEmailCallsFor(u.email)).toHaveLength(1);
    const url1 = latestUnlockUrlFor(u.email);
    expect(url1).toMatch(/^http:\/\/localhost:5173\/unlock-account\?token=/);
    const token1 = new URL(url1).searchParams.get('token')!;
    let row = (await getUserById(u.id))!;
    expect(verifyUnlockToken(token1)).toEqual({
      user_id: u.id,
      lck: Math.floor(row.login_locked_until!.getTime() / 1000),
    });

    await setLoginLockState(u.id, { lockLevel: 1, lockedUntilMinutesFromNow: -1 });
    for (let i = 0; i < 5; i++) {
      await appError(authService.login({ identifier: u.email, password: 'Wrong!Pass1' }, null, null));
    }
    await awaitLastUnlockEmail();
    expect(unlockEmailCallsFor(u.email)).toHaveLength(2);

    await setLoginLockState(u.id, { lockLevel: 2, lockedUntilMinutesFromNow: -1 });
    for (let i = 0; i < 5; i++) {
      await appError(authService.login({ identifier: u.email, password: 'Wrong!Pass1' }, null, null));
    }
    await awaitLastUnlockEmail();
    expect(unlockEmailCallsFor(u.email)).toHaveLength(3);
    row = (await getUserById(u.id))!;
    expect(row.login_lock_level).toBe(3);
  });

  it('a pending or suspended account gets no unlock email: wrong logins never lock (or email) it', async () => {
    const pending = await registerPending(1);
    for (let i = 0; i < 10; i++) {
      await appError(authService.login({ identifier: pending.email, password: 'Wrong!Pass1' }, null, null));
    }
    expect(sendUnlockEmailMock).not.toHaveBeenCalled();

    const suspended = await createActiveUser(2);
    await setUserStatus(suspended.id, 'suspended');
    for (let i = 0; i < 10; i++) {
      await appError(authService.login({ identifier: suspended.email, password: 'Wrong!Pass1' }, null, null));
    }
    expect(sendUnlockEmailMock).not.toHaveBeenCalled();
  });

  it('attempts during an existing lock send no additional email', async () => {
    const u = await createActiveUser(1);
    for (let i = 0; i < 5; i++) {
      await appError(authService.login({ identifier: u.email, password: 'Wrong!Pass1' }, null, null));
    }
    await awaitLastUnlockEmail();
    sendUnlockEmailMock.mockClear();

    await appError(authService.login({ identifier: u.email, password: PASSWORD }, null, null));
    expect(sendUnlockEmailMock).not.toHaveBeenCalled();
  });

  it("login() rejects with ACCOUNT_LOCKED even if the unlock email send fails (the lock stands, the send is never awaited)", async () => {
    const u = await createActiveUser(1);
    sendUnlockEmailMock.mockRejectedValueOnce(new Error('SMTP down'));
    for (let i = 0; i < 4; i++) {
      await appError(authService.login({ identifier: u.email, password: 'Wrong!Pass1' }, null, null));
    }
    const err = await appError(
      authService.login({ identifier: u.email, password: 'Wrong!Pass1' }, null, null),
    );
    expect(err).toMatchObject({ status: 429, code: 'ACCOUNT_LOCKED' });
    await expect(awaitLastUnlockEmail()).rejects.toThrow('SMTP down');
    expect((await getUserById(u.id))!.login_locked_until).not.toBeNull();
  });

  it('a super admin can be locked; suspending a locked account works and does not clear the lock', async () => {
    const u = await createActiveUser(1);
    await setUserRole(u.id, 'super admin');
    for (let i = 0; i < 5; i++) {
      await appError(authService.login({ identifier: u.email, password: 'Wrong!Pass1' }, null, null));
    }
    expect((await getUserById(u.id))!.login_locked_until).not.toBeNull();

    await setUserStatus(u.id, 'suspended');
    const row = (await getUserById(u.id))!;
    expect(row.status).toBe('suspended');
    expect(row.login_locked_until).not.toBeNull();
  });
});

describe('unlockByToken (Stage 31c)', () => {
  it('a valid token for a currently locked active account: unlocks, clears escalation and all three OTP send blocks, login then works', async () => {
    const u = await createActiveUser(1);
    await setLoginLockState(u.id, { lockLevel: 2, lockedUntilMinutesFromNow: 60, failedAttempts: 5 });
    for (const purpose of ['Forgot Password', 'Change Email', 'Change Password'] as const) {
      await setOtpSendBlock(u.id, purpose, { level: 2, blockedUntilMinutesFromNow: 60 });
    }
    const row = (await getUserById(u.id))!;
    const token = signTestUnlockToken({
      sub: u.id,
      lck: Math.floor(row.login_locked_until!.getTime() / 1000),
    });

    const result = await authService.unlockByToken(token);
    expect(result).toBe('UNLOCKED');

    const after = (await getUserById(u.id))!;
    expect(after.login_failed_attempts).toBe(0);
    expect(after.login_failure_window_start).toBeNull();
    expect(after.login_locked_until).toBeNull();
    expect(after.login_lock_level).toBe(0);
    for (const purpose of ['Forgot Password', 'Change Email', 'Change Password'] as const) {
      for (const otpRow of await getOtps(u.id, purpose)) {
        expect(otpRow.send_escalation_level).toBe(0);
        expect(otpRow.send_blocked_until).toBeNull();
      }
    }

    const login = await authService.login({ identifier: u.email, password: PASSWORD }, null, null);
    expect(login.user.id).toBe(u.id);
  });

  it('the same token used again: ALREADY_UNLOCKED, nothing changes', async () => {
    const u = await createActiveUser(1);
    await setLoginLockState(u.id, { lockLevel: 1, lockedUntilMinutesFromNow: 60 });
    const row = (await getUserById(u.id))!;
    const token = signTestUnlockToken({
      sub: u.id,
      lck: Math.floor(row.login_locked_until!.getTime() / 1000),
    });
    expect(await authService.unlockByToken(token)).toBe('UNLOCKED');
    expect(await authService.unlockByToken(token)).toBe('ALREADY_UNLOCKED');
  });

  it('a token for an earlier lock after a newer lock was set: ALREADY_UNLOCKED, the newer lock stands', async () => {
    const u = await createActiveUser(1);
    await setLoginLockState(u.id, { lockLevel: 1, lockedUntilMinutesFromNow: 60 });
    const earlierRow = (await getUserById(u.id))!;
    const earlierToken = signTestUnlockToken({
      sub: u.id,
      lck: Math.floor(earlierRow.login_locked_until!.getTime() / 1000),
    });

    await setLoginLockState(u.id, { lockLevel: 2, lockedUntilMinutesFromNow: 240 });

    expect(await authService.unlockByToken(earlierToken)).toBe('ALREADY_UNLOCKED');
    const after = (await getUserById(u.id))!;
    expect(after.login_locked_until).not.toBeNull();
    expect(after.login_lock_level).toBe(2);
  });

  it('a token after an admin unlock, or after a successful-login-style lock clear: ALREADY_UNLOCKED', async () => {
    const u = await createActiveUser(1);
    await setLoginLockState(u.id, { lockLevel: 1, lockedUntilMinutesFromNow: 60 });
    const row = (await getUserById(u.id))!;
    const token = signTestUnlockToken({
      sub: u.id,
      lck: Math.floor(row.login_locked_until!.getTime() / 1000),
    });
    // A successful login (correct password) clears the lock the same way admin unlock /
    // resetLoginLock does, via the same column writes unlockByToken itself checks.
    await setLoginLockState(u.id, {});
    expect(await authService.unlockByToken(token)).toBe('ALREADY_UNLOCKED');
  });

  it('a token whose lock has expired by time: ALREADY_UNLOCKED', async () => {
    const u = await createActiveUser(1);
    await setLoginLockState(u.id, { lockLevel: 1, lockedUntilMinutesFromNow: -1 });
    const row = (await getUserById(u.id))!;
    const token = signTestUnlockToken({
      sub: u.id,
      lck: Math.floor(row.login_locked_until!.getTime() / 1000),
    });
    expect(await authService.unlockByToken(token)).toBe('ALREADY_UNLOCKED');
  });

  it('a token for an account that is now suspended or pending, or that no longer exists: ALREADY_UNLOCKED, nothing changes', async () => {
    const suspended = await createActiveUser(1);
    await setLoginLockState(suspended.id, { lockLevel: 1, lockedUntilMinutesFromNow: 60 });
    const suspendedRow = (await getUserById(suspended.id))!;
    const suspendedToken = signTestUnlockToken({
      sub: suspended.id,
      lck: Math.floor(suspendedRow.login_locked_until!.getTime() / 1000),
    });
    await setUserStatus(suspended.id, 'suspended');
    expect(await authService.unlockByToken(suspendedToken)).toBe('ALREADY_UNLOCKED');
    expect((await getUserById(suspended.id))!.login_locked_until).not.toBeNull();

    const unknownToken = signTestUnlockToken({ sub: '00000000-0000-4000-8000-000000000000', lck: 1 });
    expect(await authService.unlockByToken(unknownToken)).toBe('ALREADY_UNLOCKED');
  });

  it('malformed token, bad signature, wrong typ, or past exp: throws 401 INVALID_UNLOCK_TOKEN', async () => {
    await expect(authService.unlockByToken('not-a-jwt')).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_UNLOCK_TOKEN',
      message: 'This link is invalid or has expired',
    });
    await expect(authService.unlockByToken(tamperSignature(signTestUnlockToken()))).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_UNLOCK_TOKEN',
    });
    // Wrong typ (at+JWT) for the unlock verifier.
    await expect(authService.unlockByToken(signTestAccessToken())).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_UNLOCK_TOKEN',
    });
    // Past exp.
    const expired = jwt.sign(
      { lck: 123, exp: Math.floor(Date.now() / 1000) - 60 },
      readFileSync(process.env.JWT_PRIVATE_KEY_PATH!, 'utf8'),
      {
        algorithm: 'RS256',
        subject: 'user-id-1',
        keyid: process.env.JWT_KEY_ID,
        header: { alg: 'RS256', typ: 'ul+JWT' },
      },
    );
    await expect(authService.unlockByToken(expired)).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_UNLOCK_TOKEN',
    });
  });

  it('a locked super admin can unlock via the link', async () => {
    const sa = await createUserWithRole(1, 'super admin');
    await setLoginLockState(sa.id, { lockLevel: 1, lockedUntilMinutesFromNow: 60 });
    const row = (await getUserById(sa.id))!;
    const token = signTestUnlockToken({ sub: sa.id, lck: Math.floor(row.login_locked_until!.getTime() / 1000) });
    expect(await authService.unlockByToken(token)).toBe('UNLOCKED');
  });

  it('writes no audit row for any outcome', async () => {
    const u = await createActiveUser(1);
    await setLoginLockState(u.id, { lockLevel: 1, lockedUntilMinutesFromNow: 60 });
    const row = (await getUserById(u.id))!;
    const token = signTestUnlockToken({ sub: u.id, lck: Math.floor(row.login_locked_until!.getTime() / 1000) });
    await authService.unlockByToken(token);
    await authService.unlockByToken(token); // ALREADY_UNLOCKED
    expect(await getAuditLogRowsForTarget(u.id)).toHaveLength(0);
  });
});

describe('logout', () => {
  it('revokes the token and resolves', async () => {
    const u = await createActiveUser(1);
    await seedRefreshToken(u.id, 'tok');
    await expect(authService.logout('tok')).resolves.toBeUndefined();
    expect((await getRefreshTokenByPlain('tok'))!.is_revoked).toBe(true);
  });

  it('throws 401 INVALID_REFRESH_TOKEN for an unknown, empty or already-revoked token', async () => {
    const u = await createActiveUser(1);
    await seedRefreshToken(u.id, 'tok');
    await authService.logout('tok');
    for (const t of ['tok', 'never-issued', '']) {
      expect(await appError(authService.logout(t))).toMatchObject({
        status: 401,
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid refresh token',
      });
    }
  });
});

describe('refresh', () => {
  it('returns only { accessToken, sessionTimeLeftSeconds }', async () => {
    const u = await createActiveUser(1);
    await seedRefreshToken(u.id, 'tok');
    const result = await authService.refresh('tok');
    expect(Object.keys(result).sort()).toEqual(['accessToken', 'sessionTimeLeftSeconds']);
  });

  it('right after login, returns sessionTimeLeftSeconds close to the login value', async () => {
    const u = await createActiveUser(1);
    const loginResult = await authService.login(
      { identifier: u.email, password: PASSWORD },
      null,
      null,
    );
    const result = await authService.refresh(loginResult.refreshToken);
    expect(result.sessionTimeLeftSeconds).toBeLessThanOrEqual(loginResult.sessionTimeLeftSeconds);
    expect(result.sessionTimeLeftSeconds).toBeGreaterThanOrEqual(
      loginResult.sessionTimeLeftSeconds - 5,
    );
  });

  it('does not change expires_at, and returns sessionTimeLeftSeconds ~ 300 for a token backdated to 5 minutes left', async () => {
    const u = await createActiveUser(1);
    await seedRefreshToken(u.id, 'tok');
    await setRefreshTokenExpiresInMinutes('tok', 5);
    const before = (await getRefreshTokenByPlain('tok'))!.expires_at.getTime();

    const result = await authService.refresh('tok');

    expect(result.sessionTimeLeftSeconds).toBeGreaterThanOrEqual(300 - 5);
    expect(result.sessionTimeLeftSeconds).toBeLessThanOrEqual(300);
    expect((await getRefreshTokenByPlain('tok'))!.expires_at.getTime()).toBe(before);
  });

  it('throws 401 for unknown, revoked and expired tokens, and 403 for a suspended user', async () => {
    const u = await createActiveUser(1);
    await seedRefreshToken(u.id, 'live');
    await seedRefreshToken(u.id, 'revoked');
    await authService.logout('revoked');
    await seedRefreshToken(u.id, 'expired');
    const { default: pool } = await import('../../src/db/pool.js');
    await pool.query(
      `UPDATE refresh_tokens SET expires_at = NOW() - INTERVAL '1 second' WHERE token_hash = $1`,
      [sha256('expired')],
    );

    for (const t of ['unknown', 'revoked', 'expired']) {
      expect(await appError(authService.refresh(t))).toMatchObject({
        status: 401,
        code: 'INVALID_REFRESH_TOKEN',
      });
    }

    await setUserStatus(u.id, 'suspended');
    expect(await appError(authService.refresh('live'))).toMatchObject({
      status: 403,
      code: 'ACCOUNT_SUSPENDED',
    });
  });
});

describe('verifyRegistrationOtp', () => {
  it('activates the user and consumes the OTP', async () => {
    const u = await registerPending(1);
    await authService.verifyRegistrationOtp({
      email: u.email,
      otp: latestOtpFor(u.email),
      pendingToken: u.pendingToken,
    });
    expect((await getUserByEmail(u.email))!.status).toBe('active');
  });

  it('validates the OTP format before touching the database', async () => {
    const u = await registerPending(1);
    expect(
      await appError(
        authService.verifyRegistrationOtp({
          email: u.email,
          otp: '12345',
          pendingToken: u.pendingToken,
        }),
      ),
    ).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'OTP must be a 6-digit code',
    });
    expect((await getOtps(u.id))[0]!.attempts_count).toBe(0);
  });

  it('gives the same INVALID_OTP for unknown, non-pending and wrong-code cases', async () => {
    const pending = await registerPending(1);
    const active = await createActiveUser(2);
    const wrong = wrongOtp(latestOtpFor(pending.email));

    for (const args of [
      { email: 'ghost@example.com', otp: '123456', pendingToken: pending.pendingToken },
      { email: active.email, otp: '123456', pendingToken: pending.pendingToken },
      { email: pending.email, otp: wrong, pendingToken: pending.pendingToken },
    ]) {
      expect(await appError(authService.verifyRegistrationOtp(args))).toMatchObject({
        status: 400,
        code: 'INVALID_OTP',
        message: 'Invalid or expired OTP',
      });
    }
  });

  it('persists the attempt increment even though it throws afterwards', async () => {
    const u = await registerPending(1);
    await appError(
      authService.verifyRegistrationOtp({
        email: u.email,
        otp: wrongOtp(latestOtpFor(u.email)),
        pendingToken: u.pendingToken,
      }),
    );
    expect((await getOtps(u.id))[0]!.attempts_count).toBe(1);
  });

  // Stage 14d: activation inserts a credit_allocation_outbox row in the same transaction.
  it('inserts exactly one pending credit_allocation_outbox row for the user on activation', async () => {
    const u = await registerPending(1);
    await authService.verifyRegistrationOtp({
      email: u.email,
      otp: latestOtpFor(u.email),
      pendingToken: u.pendingToken,
    });
    const rows = await getCreditAllocationOutboxRows(u.id);
    expect(rows).toEqual([{ status: 'pending' }]);
  });

  it('a failing verify (wrong OTP) creates no outbox row', async () => {
    const u = await registerPending(1);
    await appError(
      authService.verifyRegistrationOtp({
        email: u.email,
        otp: wrongOtp(latestOtpFor(u.email)),
        pendingToken: u.pendingToken,
      }),
    );
    expect(await getCreditAllocationOutboxRows(u.id)).toEqual([]);
  });

  it('a failing verify (expired OTP) creates no outbox row', async () => {
    const u = await registerPending(1);
    const otp = latestOtpFor(u.email);
    await expireOtps(u.id);
    await appError(
      authService.verifyRegistrationOtp({ email: u.email, otp, pendingToken: u.pendingToken }),
    );
    expect(await getCreditAllocationOutboxRows(u.id)).toEqual([]);
  });
});

describe('resendRegistrationOtp', () => {
  it('sends a new OTP after the cooldown', async () => {
    const u = await registerPending(1);
    await backdateOtps(u.id, 2);
    await authService.resendRegistrationOtp({ email: u.email, pendingToken: u.pendingToken });
    expect(await getOtps(u.id)).toHaveLength(2);
    expect(emailCallsFor(u.email)).toHaveLength(2);
  });

  it('throws OTP_RESEND_COOLDOWN with retryAfterSeconds inside the cooldown', async () => {
    const u = await registerPending(1);
    const err = await appError(
      authService.resendRegistrationOtp({ email: u.email, pendingToken: u.pendingToken }),
    );
    expect(err).toMatchObject({ status: 429, code: 'OTP_RESEND_COOLDOWN' });
    expect(err.retryAfterSeconds).toBeGreaterThan(0);
    expect(err.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('throws OTP_RESEND_LIMIT (no retryAfterSeconds) once 5 resends are used', async () => {
    const u = await registerPending(1);
    for (let i = 0; i < 5; i++) {
      await backdateOtps(u.id, 2);
      await authService.resendRegistrationOtp({ email: u.email, pendingToken: u.pendingToken });
    }
    const err = await appError(
      authService.resendRegistrationOtp({ email: u.email, pendingToken: u.pendingToken }),
    );
    expect(err).toMatchObject({
      status: 429,
      code: 'OTP_RESEND_LIMIT',
      message: 'Maximum OTP resends reached. Please try registering again in about 10 minutes.',
    });
    expect(err.retryAfterSeconds).toBeUndefined();
  });

  it('throws NO_PENDING_REGISTRATION for unknown and non-pending users', async () => {
    const active = await createActiveUser(1);
    for (const email of ['ghost@example.com', active.email]) {
      expect(
        await appError(
          authService.resendRegistrationOtp({ email, pendingToken: active.pendingToken }),
        ),
      ).toMatchObject({
        status: 400,
        code: 'NO_PENDING_REGISTRATION',
      });
    }
  });
});

describe('forgotPassword and resendForgotPasswordOtp', () => {
  it.each([
    ['forgotPassword', authService.forgotPassword],
    ['resendForgotPasswordOtp', authService.resendForgotPasswordOtp],
  ])('%s: sends an OTP through the throttled path', async (_n, fn) => {
    const u = await createActiveUser(1);
    await fn({ email: u.email });
    expect(await getOtps(u.id, 'Forgot Password')).toHaveLength(1);

    const err = await appError(fn({ email: u.email }));
    expect(err).toMatchObject({ status: 429, code: 'OTP_RESEND_COOLDOWN' });
    expect(err.retryAfterSeconds).toBeGreaterThan(0);
    expect(await getOtps(u.id, 'Forgot Password')).toHaveLength(1);
  });

  it.each([
    ['forgotPassword', authService.forgotPassword],
    ['resendForgotPasswordOtp', authService.resendForgotPasswordOtp],
  ])('%s: 404 EMAIL_NOT_FOUND and 403 ACCOUNT_NOT_VERIFIED', async (_n, fn) => {
    expect(await appError(fn({ email: 'ghost@example.com' }))).toMatchObject({
      status: 404,
      code: 'EMAIL_NOT_FOUND',
    });
    const pending = await registerPending(1);
    expect(await appError(fn({ email: pending.email }))).toMatchObject({
      status: 403,
      code: 'ACCOUNT_NOT_VERIFIED',
      message: 'Account not verified. Please finish registration first.',
    });
    expect(
      sendOtpEmailMock.mock.calls.filter(([a]) => a.purpose === 'Forgot Password'),
    ).toHaveLength(0);
  });

  it('throws OTP_RESEND_LIMIT with the "about an hour" message and a 3600s Retry-After on the first cap hit', async () => {
    const u = await createActiveUser(1);
    for (let i = 0; i < 6; i++) {
      await authService.forgotPassword({ email: u.email });
      await backdateOtps(u.id, 2, 'Forgot Password');
    }
    const err = await appError(authService.forgotPassword({ email: u.email }));
    expect(err).toMatchObject({
      status: 429,
      code: 'OTP_RESEND_LIMIT',
      message: 'Maximum OTP resends reached. Please try again in about an hour.',
    });
    expect(err.retryAfterSeconds).toBe(3600);
  });

  it('a second cap hit (no verify in between) escalates to "about 4 hours"', async () => {
    const u = await createActiveUser(1);
    await authService.forgotPassword({ email: u.email });
    await setOtpSendBlock(u.id, 'Forgot Password', { level: 1, blockedUntilMinutesFromNow: -1 });
    await backdateOtps(u.id, 2, 'Forgot Password');
    // One row already exists above, so 5 more (not 6) reach the cap exactly on the explicit
    // call below, rather than inside this loop.
    for (let i = 0; i < 5; i++) {
      await authService.forgotPassword({ email: u.email });
      await backdateOtps(u.id, 2, 'Forgot Password');
    }
    const err = await appError(authService.forgotPassword({ email: u.email }));
    expect(err.message).toBe('Maximum OTP resends reached. Please try again in about 4 hours.');
    expect(err.retryAfterSeconds).toBe(4 * 3600);
  });

  it('a successful reset-password resets the escalation level back to 1h on the next cap hit', async () => {
    const u = await createActiveUser(1);
    await authService.forgotPassword({ email: u.email });
    await setOtpSendBlock(u.id, 'Forgot Password', { level: 2, blockedUntilMinutesFromNow: -1 });
    const otp = latestOtpFor(u.email);
    await authService.resetPassword({ email: u.email, otp, newPassword: NEW_PASSWORD });
    await backdateOtps(u.id, 2, 'Forgot Password');

    // One (now consumed) row already exists above, so 5 more (not 6) reach the cap exactly on
    // the explicit call below, rather than inside this loop.
    for (let i = 0; i < 5; i++) {
      await authService.forgotPassword({ email: u.email });
      await backdateOtps(u.id, 2, 'Forgot Password');
    }
    const err = await appError(authService.forgotPassword({ email: u.email }));
    expect(err.message).toBe('Maximum OTP resends reached. Please try again in about an hour.');
  });

  it('a send while blocked is rejected without creating a new OTP row', async () => {
    const u = await createActiveUser(1);
    await authService.forgotPassword({ email: u.email });
    await setOtpSendBlock(u.id, 'Forgot Password', { level: 1, blockedUntilMinutesFromNow: 60 });
    const before = await getOtps(u.id, 'Forgot Password');
    const err = await appError(authService.forgotPassword({ email: u.email }));
    expect(err).toMatchObject({ status: 429, code: 'OTP_RESEND_LIMIT' });
    expect(err.retryAfterSeconds).toBeGreaterThan(3500);
    expect(await getOtps(u.id, 'Forgot Password')).toHaveLength(before.length);
  });
});

describe('verifyForgotPasswordOtp', () => {
  it('validates the code without consuming it', async () => {
    const u = await createActiveUser(1);
    await seedOtp(u.id, 'Forgot Password', '123456');
    await authService.verifyForgotPasswordOtp({ email: u.email, otp: '123456' });
    await authService.verifyForgotPasswordOtp({ email: u.email, otp: '123456' });
    expect((await getOtps(u.id, 'Forgot Password'))[0]!.consumed_at).toBeNull();
  });

  it('throws INVALID_OTP for a wrong code and persists the attempt', async () => {
    const u = await createActiveUser(1);
    await seedOtp(u.id, 'Forgot Password', '123456');
    expect(
      await appError(authService.verifyForgotPasswordOtp({ email: u.email, otp: '654321' })),
    ).toMatchObject({
      status: 400,
      code: 'INVALID_OTP',
    });
    expect((await getOtps(u.id, 'Forgot Password'))[0]!.attempts_count).toBe(1);
  });

  it('throws 404 / 403 / 400 for unknown email, pending user and bad format', async () => {
    expect(
      await appError(
        authService.verifyForgotPasswordOtp({ email: 'ghost@example.com', otp: '123456' }),
      ),
    ).toMatchObject({ status: 404, code: 'EMAIL_NOT_FOUND' });
    const pending = await registerPending(1);
    expect(
      await appError(authService.verifyForgotPasswordOtp({ email: pending.email, otp: '123456' })),
    ).toMatchObject({ status: 403, code: 'ACCOUNT_NOT_VERIFIED' });
    expect(
      await appError(authService.verifyForgotPasswordOtp({ email: pending.email, otp: 'abc' })),
    ).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });
});

describe('resetPassword', () => {
  it('changes the hash, consumes the OTP and revokes all refresh tokens together', async () => {
    const u = await createActiveUser(1);
    await seedOtp(u.id, 'Forgot Password', '123456');
    await seedRefreshToken(u.id, 'a');
    await seedRefreshToken(u.id, 'b');

    await authService.resetPassword({ email: u.email, otp: '123456', newPassword: NEW_PASSWORD });

    const user = (await getUserByEmail(u.email))!;
    expect(await bcrypt.compare(NEW_PASSWORD, user.password_hash)).toBe(true);
    expect((await getOtps(u.id, 'Forgot Password'))[0]!.consumed_at).not.toBeNull();
    expect((await getRefreshTokens(u.id)).every((t) => t.is_revoked)).toBe(true);
  });

  it('validates the new password and OTP format before touching the database', async () => {
    const u = await createActiveUser(1);
    await seedOtp(u.id, 'Forgot Password', '123456');
    expect(
      await appError(
        authService.resetPassword({ email: u.email, otp: '123456', newPassword: 'weak' }),
      ),
    ).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect(
      await appError(
        authService.resetPassword({ email: u.email, otp: '12', newPassword: NEW_PASSWORD }),
      ),
    ).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'OTP must be a 6-digit code',
    });
    expect((await getOtps(u.id, 'Forgot Password'))[0]!.attempts_count).toBe(0);
  });

  it('wrong code: throws INVALID_OTP, keeps the password and tokens, persists the attempt', async () => {
    const u = await createActiveUser(1);
    await seedOtp(u.id, 'Forgot Password', '123456');
    await seedRefreshToken(u.id, 'a');
    const before = (await getUserByEmail(u.email))!.password_hash;

    await appError(
      authService.resetPassword({ email: u.email, otp: '654321', newPassword: NEW_PASSWORD }),
    );

    expect((await getUserByEmail(u.email))!.password_hash).toBe(before);
    expect((await getRefreshTokenByPlain('a'))!.is_revoked).toBe(false);
    expect((await getOtps(u.id, 'Forgot Password'))[0]!.attempts_count).toBe(1);
  });

  it('throws 404 for an unknown email and 403 for a pending user', async () => {
    expect(
      await appError(
        authService.resetPassword({
          email: 'ghost@example.com',
          otp: '123456',
          newPassword: NEW_PASSWORD,
        }),
      ),
    ).toMatchObject({ status: 404, code: 'EMAIL_NOT_FOUND' });
    const pending = await registerPending(1);
    expect(
      await appError(
        authService.resetPassword({
          email: pending.email,
          otp: '123456',
          newPassword: NEW_PASSWORD,
        }),
      ),
    ).toMatchObject({ status: 403, code: 'ACCOUNT_NOT_VERIFIED' });
  });
});
