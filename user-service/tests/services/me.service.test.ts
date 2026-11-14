/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Generated Vitest integration tests (real test DB) for me.service.ts, covering the
 *        Stage 11b Verification bullets in instructions.md that apply at the service layer.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-23
 * Scope: Added coverage for Stage 12's remaining me.service.ts functions (getOwnProfile,
 *        changeUsername, initiateEmailChange, verifyEmailChangeOtp, resendChangeEmailOtp,
 *        resendChangePasswordOtp, initiatePasswordChange, confirmPasswordChange), which had no
 *        test coverage at all before this change. Governing decision: instructions.md Stage
 *        12a-12e's own Verification bullets. Deliberately does not re-test requestOtp's generic
 *        cooldown/limit/rolling-window logic or checkOtp's generic
 *        expired/attempts-exceeded/wrong-guess-persistence logic beyond one call-site check each
 *        — those are already covered purpose-agnostically in otp.service.test.ts, and Stage 7's
 *        own rule is not to duplicate a case elsewhere just because a new call site exists.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: Added coverage for initiateEmailChange/initiatePasswordChange's login-lockout check
 *        (precedence over the password check, shared counter with login, reset on success),
 *        per instructions.md Stage 18b.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-10
 * Scope: Stage 31e - added coverage that wrong current passwords on both functions that cause
 *        a lock send exactly one unlock email, per instructions.md Stage 31b's "Trigger" row
 *        ("A lock set from ... PUT /users/me/email or PUT /users/me/password ... sends the
 *        email").
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-10, Codex, model: GPT-6): Resolved merge conflicts.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as meService from '../../src/services/me.service.js';
import { updateEmail } from '../../src/db/queries/users.queries.js';
import {
  backdateOtps,
  expireOtps,
  getOtps,
  getRefreshTokens,
  getUserByEmail,
  getUserById,
  seedRefreshToken,
  setLoginLockState,
  truncateAll,
} from '../helpers/db.js';
import {
  awaitLastUnlockEmail,
  emailCallsFor,
  failNextEmail,
  latestOtpFor,
  resetEmailMock,
  sendOtpEmailMock,
  unlockEmailCallsFor,
  wrongOtp,
} from '../helpers/email.js';
import { createActiveUser } from '../helpers/fixtures.js';
import { NEW_PASSWORD } from '../helpers/constants.js';

resetEmailMock();
beforeEach(truncateAll);
afterEach(truncateAll);

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe('changeActiveView', () => {
  it('toggles an active user to courier, updating the DB column and stripping password_hash', async () => {
    const user = await createActiveUser(1);
    const result = await meService.changeActiveView(user.id, 'courier');
    expect(result.activeView).toBe('courier');
    expect(result).not.toHaveProperty('password_hash');
    expect((await getUserByEmail(user.email))!.active_view).toBe('courier');
  });

  it('toggles back to requester', async () => {
    const user = await createActiveUser(1);
    await meService.changeActiveView(user.id, 'courier');
    const result = await meService.changeActiveView(user.id, 'requester');
    expect(result.activeView).toBe('requester');
    expect((await getUserByEmail(user.email))!.active_view).toBe('requester');
  });

  it('setting the same value it already has still returns 200 with no special no-op branch', async () => {
    const user = await createActiveUser(1);
    // Default is already 'requester'; there is no existing-value check (unlike status/role).
    const result = await meService.changeActiveView(user.id, 'requester');
    expect(result.activeView).toBe('requester');
  });

  it('returns the full user row shape minus password_hash', async () => {
    const user = await createActiveUser(1);
    const result = await meService.changeActiveView(user.id, 'courier');
    expect(Object.keys(result).sort()).toEqual(
      [
        'activeView',
        'createdAt',
        'email',
        'id',
        'isLocked',
        'lockLevel',
        'lockedUntil',
        'preferredLang',
        'role',
        'status',
        'updatedAt',
        'username',
      ].sort(),
    );
  });

  it('throws 404 USER_NOT_FOUND for a nonexistent user id', async () => {
    await expect(meService.changeActiveView(UNKNOWN_ID, 'courier')).rejects.toMatchObject({
      status: 404,
      code: 'USER_NOT_FOUND',
    });
  });
});

describe('getOwnProfile', () => {
  it('returns exactly { username, email, activeView }', async () => {
    const user = await createActiveUser(1);
    const result = await meService.getOwnProfile(user.id);
    expect(result).toEqual({ username: 'user1', email: user.email, activeView: 'requester', preferredLang: 'en' });
  });

  it('throws 404 USER_NOT_FOUND for a nonexistent user id', async () => {
    await expect(meService.getOwnProfile(UNKNOWN_ID)).rejects.toMatchObject({
      status: 404,
      code: 'USER_NOT_FOUND',
    });
  });
});

describe('changeUsername', () => {
  it('updates the username and returns { username, email }', async () => {
    const user = await createActiveUser(1);
    const result = await meService.changeUsername(user.id, 'newname');
    expect(result).toEqual({ username: 'newname', email: user.email });
    expect((await getUserByEmail(user.email))!.username).toBe('newname');
  });

  it('rejects an invalid format with 400 VALIDATION_ERROR', async () => {
    const user = await createActiveUser(1);
    await expect(meService.changeUsername(user.id, 'a')).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message:
        'Username must contain between 3 and 255 chars and have no spaces or special characters.',
    });
  });

  it('rejects the same username as current with 409 USERNAME_UNCHANGED', async () => {
    const user = await createActiveUser(1);
    await expect(meService.changeUsername(user.id, 'user1')).rejects.toMatchObject({
      status: 409,
      code: 'USERNAME_UNCHANGED',
    });
  });

  it('rejects a username already taken by another account with 409 USERNAME_TAKEN', async () => {
    const user = await createActiveUser(1);
    await createActiveUser(2);
    await expect(meService.changeUsername(user.id, 'user2')).rejects.toMatchObject({
      status: 409,
      code: 'USERNAME_TAKEN',
    });
  });

  it('throws 404 USER_NOT_FOUND for a nonexistent user id', async () => {
    await expect(meService.changeUsername(UNKNOWN_ID, 'newname')).rejects.toMatchObject({
      status: 404,
      code: 'USER_NOT_FOUND',
    });
  });
});

describe('initiateEmailChange', () => {
  const newEmail = 'new@example.com';

  it('sends an OTP to the new email and stores it as the pending new_email', async () => {
    const user = await createActiveUser(1);
    sendOtpEmailMock.mockClear(); // drop the registration OTP email sent to user.email above
    await meService.initiateEmailChange(user.id, { currentPassword: user.password, newEmail });

    const rows = await getOtps(user.id, 'Change Email');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.new_email).toBe(newEmail);
    expect(emailCallsFor(newEmail)).toHaveLength(1);
    expect(emailCallsFor(user.email)).toHaveLength(0);
    // The old email stays authoritative until the OTP is verified (F4.2.6).
    expect((await getUserByEmail(user.email))!.email).toBe(user.email);
  });

  it('rejects an invalid new email format with 400 VALIDATION_ERROR', async () => {
    const user = await createActiveUser(1);
    await expect(
      meService.initiateEmailChange(user.id, { currentPassword: user.password, newEmail: 'bad' }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  it('rejects a wrong current password with 401 INVALID_PASSWORD and sends no OTP', async () => {
    const user = await createActiveUser(1);
    await expect(
      meService.initiateEmailChange(user.id, { currentPassword: 'WrongPassw0rd!', newEmail }),
    ).rejects.toMatchObject({ status: 401, code: 'INVALID_PASSWORD' });
    expect(await getOtps(user.id, 'Change Email')).toHaveLength(0);
  });

  it('rejects a new email identical to the current one with 409 EMAIL_UNCHANGED', async () => {
    const user = await createActiveUser(1);
    await expect(
      meService.initiateEmailChange(user.id, { currentPassword: user.password, newEmail: user.email }),
    ).rejects.toMatchObject({ status: 409, code: 'EMAIL_UNCHANGED' });
  });

  it('rejects a new email already registered to another account with 409 EMAIL_TAKEN', async () => {
    const user = await createActiveUser(1);
    const other = await createActiveUser(2);
    await expect(
      meService.initiateEmailChange(user.id, { currentPassword: user.password, newEmail: other.email }),
    ).rejects.toMatchObject({ status: 409, code: 'EMAIL_TAKEN' });
  });

  it('propagates a resend cooldown as 429 OTP_RESEND_COOLDOWN', async () => {
    const user = await createActiveUser(1);
    await meService.initiateEmailChange(user.id, { currentPassword: user.password, newEmail });
    await expect(
      meService.initiateEmailChange(user.id, { currentPassword: user.password, newEmail }),
    ).rejects.toMatchObject({ status: 429, code: 'OTP_RESEND_COOLDOWN' });
  });

  it('propagates EMAIL_SEND_FAILED as 503 and rolls back (no OTP row left)', async () => {
    const user = await createActiveUser(1);
    failNextEmail();
    await expect(
      meService.initiateEmailChange(user.id, { currentPassword: user.password, newEmail }),
    ).rejects.toMatchObject({ status: 503, code: 'EMAIL_SEND_FAILED' });
    expect(await getOtps(user.id, 'Change Email')).toHaveLength(0);
  });

  it('throws 404 USER_NOT_FOUND for a nonexistent user id', async () => {
    await expect(
      meService.initiateEmailChange(UNKNOWN_ID, { currentPassword: 'whatever', newEmail }),
    ).rejects.toMatchObject({ status: 404, code: 'USER_NOT_FOUND' });
  });
});

describe('initiateEmailChange / initiatePasswordChange login lockout (Stage 18b)', () => {
  const newEmail = 'new@example.com';

  it.each([
    ['initiateEmailChange', (id: string, pw: string) => meService.initiateEmailChange(id, { currentPassword: pw, newEmail })],
    ['initiatePasswordChange', (id: string, pw: string) => meService.initiatePasswordChange(id, { currentPassword: pw, newPassword: NEW_PASSWORD })],
  ])('%s: locked rejects with ACCOUNT_LOCKED even with the correct password', async (_n, fn) => {
    const user = await createActiveUser(1);
    await setLoginLockState(user.id, { lockLevel: 1, lockedUntilMinutesFromNow: 60 });
    await expect(fn(user.id, user.password)).rejects.toMatchObject({
      status: 429,
      code: 'ACCOUNT_LOCKED',
    });
  });

  it.each([
    ['initiateEmailChange', (id: string, pw: string) => meService.initiateEmailChange(id, { currentPassword: pw, newEmail })],
    ['initiatePasswordChange', (id: string, pw: string) => meService.initiatePasswordChange(id, { currentPassword: pw, newPassword: NEW_PASSWORD })],
  ])('%s: a wrong current password counts toward the shared login-lockout counter', async (_n, fn) => {
    const user = await createActiveUser(1);
    for (let i = 0; i < 4; i++) {
      await expect(fn(user.id, 'Wrong!Pass1')).rejects.toMatchObject({ status: 401, code: 'INVALID_PASSWORD' });
    }
    await expect(fn(user.id, 'Wrong!Pass1')).rejects.toMatchObject({
      status: 429,
      code: 'ACCOUNT_LOCKED',
    });
    expect((await getUserById(user.id))!.login_lock_level).toBe(1);
  });

  it.each([
    ['initiateEmailChange', (id: string, pw: string) => meService.initiateEmailChange(id, { currentPassword: pw, newEmail })],
    ['initiatePasswordChange', (id: string, pw: string) => meService.initiatePasswordChange(id, { currentPassword: pw, newPassword: NEW_PASSWORD })],
  ])('%s: a wrong current password that causes a lock sends exactly one unlock email', async (_n, fn) => {
    const user = await createActiveUser(1);
    for (let i = 0; i < 4; i++) {
      await expect(fn(user.id, 'Wrong!Pass1')).rejects.toMatchObject({ status: 401, code: 'INVALID_PASSWORD' });
    }
    await expect(fn(user.id, 'Wrong!Pass1')).rejects.toMatchObject({ status: 429, code: 'ACCOUNT_LOCKED' });
    await awaitLastUnlockEmail();
    expect(unlockEmailCallsFor(user.email)).toHaveLength(1);
  });

  it('a correct current password on initiateEmailChange resets the login-lockout counter', async () => {
    const user = await createActiveUser(1);
    for (let i = 0; i < 4; i++) {
      await expect(
        meService.initiateEmailChange(user.id, { currentPassword: 'Wrong!Pass1', newEmail }),
      ).rejects.toMatchObject({ status: 401, code: 'INVALID_PASSWORD' });
    }
    await meService.initiateEmailChange(user.id, { currentPassword: user.password, newEmail });
    const row = (await getUserById(user.id))!;
    expect(row.login_failed_attempts).toBe(0);
    expect(row.login_lock_level).toBe(0);
  });
});

describe('verifyEmailChangeOtp', () => {
  const newEmail = 'new@example.com';

  async function startChange(user: { id: string; email: string; password: string }) {
    await meService.initiateEmailChange(user.id, { currentPassword: user.password, newEmail });
    return latestOtpFor(newEmail);
  }

  it('updates users.email and consumes the OTP on a correct code', async () => {
    const user = await createActiveUser(1);
    const otp = await startChange(user);

    await meService.verifyEmailChangeOtp(user.id, otp);
    expect((await getUserByEmail(newEmail))!.id).toBe(user.id);
    expect((await getOtps(user.id, 'Change Email'))[0]!.consumed_at).not.toBeNull();
  });

  it('throws 400 INVALID_OTP on a wrong code and still persists the attempt (commits first)', async () => {
    const user = await createActiveUser(1);
    const otp = await startChange(user);

    await expect(meService.verifyEmailChangeOtp(user.id, wrongOtp(otp))).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_OTP',
    });
    expect((await getOtps(user.id, 'Change Email'))[0]!.attempts_count).toBe(1);
    expect((await getUserByEmail(user.email))!.email).toBe(user.email);
  });

  it('propagates OTP_EXPIRED from checkOtp for an expired OTP', async () => {
    const user = await createActiveUser(1);
    const otp = await startChange(user);
    await expireOtps(user.id, 'Change Email');

    await expect(meService.verifyEmailChangeOtp(user.id, otp)).rejects.toMatchObject({
      status: 400,
      code: 'OTP_EXPIRED',
    });
  });

  it('throws 400 INVALID_OTP when there is no pending email change at all', async () => {
    const user = await createActiveUser(1);
    await expect(meService.verifyEmailChangeOtp(user.id, '123456')).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_OTP',
    });
  });

  it('a race on the new email (someone else takes it first) returns 409 EMAIL_TAKEN and leaves the OTP usable', async () => {
    const user = await createActiveUser(1);
    const otp = await startChange(user);
    // Someone else registers the pending new_email in the meantime.
    await createActiveUser('taker', NEW_PASSWORD);
    const taker = (await getUserByEmail('usertaker@example.com'))!;
    await updateEmail(taker.id, newEmail);

    await expect(meService.verifyEmailChangeOtp(user.id, otp)).rejects.toMatchObject({
      status: 409,
      code: 'EMAIL_TAKEN',
    });
    // The whole transaction rolled back, including the OTP consumption, so it is still usable.
    expect((await getOtps(user.id, 'Change Email'))[0]!.consumed_at).toBeNull();
  });

  it('throws 404 USER_NOT_FOUND for a nonexistent user id', async () => {
    await expect(meService.verifyEmailChangeOtp(UNKNOWN_ID, '123456')).rejects.toMatchObject({
      status: 404,
      code: 'USER_NOT_FOUND',
    });
  });
});

describe('resendChangeEmailOtp', () => {
  const newEmail = 'new@example.com';

  it('resends to the same pending new_email and invalidates the previous OTP', async () => {
    const user = await createActiveUser(1);
    await meService.initiateEmailChange(user.id, { currentPassword: user.password, newEmail });
    await backdateOtps(user.id, 2, 'Change Email');

    await meService.resendChangeEmailOtp(user.id);

    const rows = await getOtps(user.id, 'Change Email');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.consumed_at).not.toBeNull();
    expect(rows[1]!.new_email).toBe(newEmail);
    expect(emailCallsFor(newEmail)).toHaveLength(2);
  });

  it('throws 400 NO_PENDING_EMAIL_CHANGE when there is no pending change', async () => {
    const user = await createActiveUser(1);
    await expect(meService.resendChangeEmailOtp(user.id)).rejects.toMatchObject({
      status: 400,
      code: 'NO_PENDING_EMAIL_CHANGE',
    });
  });

  it('throws 400 NO_PENDING_EMAIL_CHANGE once the pending change has already been verified', async () => {
    const user = await createActiveUser(1);
    await meService.initiateEmailChange(user.id, { currentPassword: user.password, newEmail });
    await meService.verifyEmailChangeOtp(user.id, latestOtpFor(newEmail));

    await expect(meService.resendChangeEmailOtp(user.id)).rejects.toMatchObject({
      status: 400,
      code: 'NO_PENDING_EMAIL_CHANGE',
    });
  });

  it('throws 404 USER_NOT_FOUND for a nonexistent user id', async () => {
    await expect(meService.resendChangeEmailOtp(UNKNOWN_ID)).rejects.toMatchObject({
      status: 404,
      code: 'USER_NOT_FOUND',
    });
  });
});

describe('resendChangePasswordOtp', () => {
  it('resends to the current email and invalidates the previous OTP', async () => {
    const user = await createActiveUser(1);
    await meService.initiatePasswordChange(user.id, {
      currentPassword: user.password,
      newPassword: NEW_PASSWORD,
    });
    await backdateOtps(user.id, 2, 'Change Password');

    await meService.resendChangePasswordOtp(user.id);

    const rows = await getOtps(user.id, 'Change Password');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.consumed_at).not.toBeNull();
    expect(emailCallsFor(user.email).length).toBeGreaterThanOrEqual(2);
  });

  it('throws 400 NO_PENDING_PASSWORD_CHANGE when there is no pending change', async () => {
    const user = await createActiveUser(1);
    await expect(meService.resendChangePasswordOtp(user.id)).rejects.toMatchObject({
      status: 400,
      code: 'NO_PENDING_PASSWORD_CHANGE',
    });
  });

  it('throws 404 USER_NOT_FOUND for a nonexistent user id', async () => {
    await expect(meService.resendChangePasswordOtp(UNKNOWN_ID)).rejects.toMatchObject({
      status: 404,
      code: 'USER_NOT_FOUND',
    });
  });
});

describe('initiatePasswordChange', () => {
  it('sends an OTP to the current email and never writes the new password', async () => {
    const user = await createActiveUser(1);
    sendOtpEmailMock.mockClear(); // drop the registration OTP email sent to user.email above
    const before = (await getUserByEmail(user.email))!.password_hash;

    await meService.initiatePasswordChange(user.id, {
      currentPassword: user.password,
      newPassword: NEW_PASSWORD,
    });

    expect(emailCallsFor(user.email)).toHaveLength(1);
    expect((await getOtps(user.id, 'Change Password'))[0]!.new_email).toBeNull();
    expect((await getUserByEmail(user.email))!.password_hash).toBe(before);
  });

  it('rejects a wrong current password with 401 INVALID_PASSWORD and sends no OTP', async () => {
    const user = await createActiveUser(1);
    await expect(
      meService.initiatePasswordChange(user.id, {
        currentPassword: 'WrongPassw0rd!',
        newPassword: NEW_PASSWORD,
      }),
    ).rejects.toMatchObject({ status: 401, code: 'INVALID_PASSWORD' });
    expect(await getOtps(user.id, 'Change Password')).toHaveLength(0);
  });

  it('rejects a new password identical to the current one with 400 PASSWORD_UNCHANGED', async () => {
    const user = await createActiveUser(1);
    await expect(
      meService.initiatePasswordChange(user.id, {
        currentPassword: user.password,
        newPassword: user.password,
      }),
    ).rejects.toMatchObject({ status: 400, code: 'PASSWORD_UNCHANGED' });
  });

  it('rejects a weak new password with 400 VALIDATION_ERROR', async () => {
    const user = await createActiveUser(1);
    await expect(
      meService.initiatePasswordChange(user.id, { currentPassword: user.password, newPassword: 'weak' }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  it('throws 404 USER_NOT_FOUND for a nonexistent user id', async () => {
    await expect(
      meService.initiatePasswordChange(UNKNOWN_ID, {
        currentPassword: 'whatever',
        newPassword: NEW_PASSWORD,
      }),
    ).rejects.toMatchObject({ status: 404, code: 'USER_NOT_FOUND' });
  });
});

describe('confirmPasswordChange', () => {
  async function startChange(user: { id: string; email: string; password: string }) {
    await meService.initiatePasswordChange(user.id, {
      currentPassword: user.password,
      newPassword: NEW_PASSWORD,
    });
    return latestOtpFor(user.email);
  }

  it('updates the password hash and revokes all refresh tokens on a correct OTP', async () => {
    const user = await createActiveUser(1);
    await seedRefreshToken(user.id, 'confirm-pw-change-token');
    const otp = await startChange(user);
    const before = (await getUserByEmail(user.email))!.password_hash;

    await meService.confirmPasswordChange(user.id, { otp, newPassword: NEW_PASSWORD });

    expect((await getUserByEmail(user.email))!.password_hash).not.toBe(before);
    const tokens = await getRefreshTokens(user.id);
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens.every((t) => t.is_revoked)).toBe(true);
  });

  it('throws 400 INVALID_OTP on a wrong code and persists the attempt (commits first)', async () => {
    const user = await createActiveUser(1);
    const otp = await startChange(user);

    await expect(
      meService.confirmPasswordChange(user.id, { otp: wrongOtp(otp), newPassword: NEW_PASSWORD }),
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_OTP' });
    expect((await getOtps(user.id, 'Change Password'))[0]!.attempts_count).toBe(1);
  });

  it('propagates OTP_EXPIRED from checkOtp for an expired OTP', async () => {
    const user = await createActiveUser(1);
    const otp = await startChange(user);
    await expireOtps(user.id, 'Change Password');

    await expect(
      meService.confirmPasswordChange(user.id, { otp, newPassword: NEW_PASSWORD }),
    ).rejects.toMatchObject({ status: 400, code: 'OTP_EXPIRED' });
  });

  it('re-checks PASSWORD_UNCHANGED at confirm time even if it passed at initiate', async () => {
    const user = await createActiveUser(1);
    const otp = await startChange(user);

    await expect(
      meService.confirmPasswordChange(user.id, { otp, newPassword: user.password }),
    ).rejects.toMatchObject({ status: 400, code: 'PASSWORD_UNCHANGED' });
  });

  it('rejects a malformed OTP (not 6 digits) with 400 VALIDATION_ERROR', async () => {
    const user = await createActiveUser(1);
    await expect(
      meService.confirmPasswordChange(user.id, { otp: '12', newPassword: NEW_PASSWORD }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  it('throws 404 USER_NOT_FOUND for a nonexistent user id', async () => {
    await expect(
      meService.confirmPasswordChange(UNKNOWN_ID, { otp: '123456', newPassword: NEW_PASSWORD }),
    ).rejects.toMatchObject({ status: 404, code: 'USER_NOT_FOUND' });
  });
});
