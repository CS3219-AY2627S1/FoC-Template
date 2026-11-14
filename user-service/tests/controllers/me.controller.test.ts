/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Generated Vitest HTTP tests (supertest, real test DB) for PUT /users/me/active-view
 *        and the activeView addition to POST /auth/login's response, covering the Stage 11b
 *        Verification bullets in instructions.md.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-23
 * Scope: Added HTTP-level coverage for Stage 12's remaining routes (GET /users/me, PUT
 *        /users/me/username, PUT /users/me/email, POST /users/me/verify-otp, POST
 *        /users/me/resend-otp, PUT /users/me/password, POST /users/me/confirm-password-change),
 *        which had no test coverage at all before this change. Governing decision:
 *        instructions.md Stage 12a-12e's own Verification bullets, cross-checked against
 *        me.controller.ts's actual Zod schemas for exact messages. Deep OTP-internal behavior
 *        (expiry, attempt counting, cooldown/limit math) is exercised once per route to confirm
 *        wiring, not exhaustively re-derived — that logic already has dedicated coverage in
 *        otp.service.test.ts and me.service.test.ts.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Author review:
 *
 * Tool: Claude Code (model: claude-fable-5-1), date: 2026-11-10
 * Scope: Fix F2 - debugged the ECONNRESET / "socket hang up" flake; replaced per-call
 *        `request(app)` supertest servers with the shared loopback server in
 *        tests/helpers/server.ts (`api()`). No test logic or assertions changed.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-10, Codex, model: GPT-6): Resolved merge conflicts.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api } from '../helpers/server.js';
import {
  backdateOtps,
  expireOtps,
  getOtps,
  getRefreshTokens,
  getUserByEmail,
  seedRefreshToken,
  truncateAll,
} from '../helpers/db.js';
import { latestOtpFor, resetEmailMock, wrongOtp } from '../helpers/email.js';
import { accessTokenFor, bearer, createActiveUser, loginUser } from '../helpers/fixtures.js';
import { NEW_PASSWORD } from '../helpers/constants.js';

resetEmailMock();
beforeEach(truncateAll);
afterEach(truncateAll);

const UNAUTHORIZED = { message: 'Unauthorized', code: 'UNAUTHORIZED' };
const VALIDATION = (message: string) => ({ message, code: 'VALIDATION_ERROR' });
const EXTRA_FIELD = VALIDATION('Request contains unexpected fields');

const putActiveView = (token: string | undefined, body: unknown) => {
  const r = api().put('/users/me/active-view');
  return (token ? r.set('Authorization', bearer(token)) : r).send(body as object);
};

const meGet = (token: string | undefined, path = '') => {
  const r = api().get('/users/me' + path);
  return token ? r.set('Authorization', bearer(token)) : r;
};
const mePut = (token: string | undefined, path: string, body: unknown) => {
  const r = api().put('/users/me' + path);
  return (token ? r.set('Authorization', bearer(token)) : r).send(body as object);
};
const mePost = (token: string | undefined, path: string, body: unknown) => {
  const r = api().post('/users/me' + path);
  return (token ? r.set('Authorization', bearer(token)) : r).send(body as object);
};

describe('PUT /users/me/active-view', () => {
  it('toggles the caller to courier: 200, response and DB both updated', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);

    const res = await putActiveView(token, { activeView: 'courier' });
    expect(res.status).toBe(200);
    expect(res.body.activeView).toBe('courier');
    expect((await getUserByEmail(user.email))!.active_view).toBe('courier');
  });

  it('toggles back to requester: 200, response and DB both updated', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    await putActiveView(token, { activeView: 'courier' });

    const res = await putActiveView(token, { activeView: 'requester' });
    expect(res.status).toBe(200);
    expect(res.body.activeView).toBe('requester');
    expect((await getUserByEmail(user.email))!.active_view).toBe('requester');
  });

  it('setting a value the user already has still returns 200 unchanged (no no-op branch needed)', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);

    const res = await putActiveView(token, { activeView: 'requester' });
    expect(res.status).toBe(200);
    expect(res.body.activeView).toBe('requester');
  });

  it('rejects a request with no Authorization header: 401 UNAUTHORIZED', async () => {
    const res = await putActiveView(undefined, { activeView: 'courier' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual(UNAUTHORIZED);
  });

  it('rejects an invalid enum value: 400 VALIDATION_ERROR', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    const res = await putActiveView(token, { activeView: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      message: "Active view must be 'requester' or 'courier'",
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects a missing activeView field: 400 VALIDATION_ERROR', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    const res = await putActiveView(token, {});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Active view is required', code: 'VALIDATION_ERROR' });
  });

  it('rejects a wrong-type activeView field: 400 VALIDATION_ERROR', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    const res = await putActiveView(token, { activeView: 123 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      message: 'Active view must be a string',
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects an unrecognized extra field: 400 VALIDATION_ERROR', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    const res = await putActiveView(token, { activeView: 'courier', extra: true });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      message: 'Request contains unexpected fields',
      code: 'VALIDATION_ERROR',
    });
  });
});

describe('active_view defaults and login response', () => {
  it('a newly registered-and-activated user defaults to requester without calling this endpoint', async () => {
    const user = await createActiveUser(1);
    expect((await getUserByEmail(user.email))!.active_view).toBe('requester');
  });

  it("POST /auth/login's response includes activeView reflecting the current value", async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    await putActiveView(token, { activeView: 'courier' });

    const res = await loginUser(user);
    expect(res.status).toBe(200);
    expect(res.body.user.activeView).toBe('courier');
  });
});

describe('GET /users/me', () => {
  it('returns exactly { username, email, activeView } while authenticated', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    const res = await meGet(token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      username: 'user1',
      email: user.email,
      activeView: 'requester',
      preferredLang: 'en',
    });
  });

  it('rejects a request with no Authorization header: 401 UNAUTHORIZED', async () => {
    const res = await meGet(undefined);
    expect(res.status).toBe(401);
    expect(res.body).toEqual(UNAUTHORIZED);
  });
});

describe('PUT /users/me/username', () => {
  it('a valid new username: 200, response and DB both updated', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    const res = await mePut(token, '/username', { newUsername: 'newname' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username: 'newname', email: user.email });
    expect((await getUserByEmail(user.email))!.username).toBe('newname');
  });

  it('same as current username: 409 USERNAME_UNCHANGED', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    const res = await mePut(token, '/username', { newUsername: 'user1' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('USERNAME_UNCHANGED');
  });

  it('a username belonging to another account: 409 USERNAME_TAKEN', async () => {
    const user = await createActiveUser(1);
    await createActiveUser(2);
    const token = await accessTokenFor(user);
    const res = await mePut(token, '/username', { newUsername: 'user2' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('USERNAME_TAKEN');
  });

  it('invalid format (too short): 400 VALIDATION_ERROR', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    const res = await mePut(token, '/username', { newUsername: 'ab' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('missing/wrong-type/extra field: standard 400 VALIDATION_ERROR pattern', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    expect((await mePut(token, '/username', {})).body).toEqual(
      VALIDATION('New username is required'),
    );
    expect((await mePut(token, '/username', { newUsername: 123 })).body).toEqual(
      VALIDATION('New username must be a string'),
    );
    expect((await mePut(token, '/username', { newUsername: 'newname', extra: 1 })).body).toEqual(
      EXTRA_FIELD,
    );
  });

  it('rejects a request with no Authorization header: 401 UNAUTHORIZED', async () => {
    const res = await mePut(undefined, '/username', { newUsername: 'newname' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual(UNAUTHORIZED);
  });
});

describe('PUT /users/me/email', () => {
  const newEmail = 'new@example.com';

  it('correct password + valid new unused email: 200 OTP_SENT, OTP row created for Change Email', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    const res = await mePut(token, '/email', { currentPassword: user.password, newEmail });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Verification code sent to your new email', code: 'OTP_SENT' });
    const rows = await getOtps(user.id, 'Change Email');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.new_email).toBe(newEmail);
  });

  it('wrong current password: 401 INVALID_PASSWORD, no OTP row created', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    const res = await mePut(token, '/email', { currentPassword: 'WrongPassw0rd!', newEmail });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_PASSWORD');
    expect(await getOtps(user.id, 'Change Email')).toHaveLength(0);
  });

  it('newEmail same as current: 409 EMAIL_UNCHANGED', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    const res = await mePut(token, '/email', { currentPassword: user.password, newEmail: user.email });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_UNCHANGED');
  });

  it('newEmail already registered to another account: 409 EMAIL_TAKEN, no OTP row created', async () => {
    const user = await createActiveUser(1);
    const other = await createActiveUser(2);
    const token = await accessTokenFor(user);
    const res = await mePut(token, '/email', { currentPassword: user.password, newEmail: other.email });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
    expect(await getOtps(user.id, 'Change Email')).toHaveLength(0);
  });

  it('immediately repeating the request: 429 OTP_RESEND_COOLDOWN with Retry-After', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    await mePut(token, '/email', { currentPassword: user.password, newEmail });
    const res = await mePut(token, '/email', { currentPassword: user.password, newEmail });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('OTP_RESEND_COOLDOWN');
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('missing/wrong-type/extra field: standard 400 VALIDATION_ERROR pattern', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    expect((await mePut(token, '/email', { newEmail })).body).toEqual(
      VALIDATION('Current password is required'),
    );
    expect((await mePut(token, '/email', { currentPassword: 1, newEmail })).body).toEqual(
      VALIDATION('Current password must be a string'),
    );
    expect(
      (await mePut(token, '/email', { currentPassword: user.password, newEmail, extra: 1 })).body,
    ).toEqual(EXTRA_FIELD);
  });

  it('rejects a request with no Authorization header: 401 UNAUTHORIZED', async () => {
    const res = await mePut(undefined, '/email', { currentPassword: 'x', newEmail });
    expect(res.status).toBe(401);
    expect(res.body).toEqual(UNAUTHORIZED);
  });
});

describe('POST /users/me/verify-otp', () => {
  const newEmail = 'new@example.com';

  async function startChange(token: string, user: { email: string; password: string }) {
    await mePut(token, '/email', { currentPassword: user.password, newEmail });
    return latestOtpFor(newEmail);
  }

  it('correct OTP for a pending email change: 200 EMAIL_CHANGE_SUCCESS, users.email updated', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    const otp = await startChange(token, user);

    const res = await mePost(token, '/verify-otp', { otp, purpose: 'change_email' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Email updated successfully', code: 'EMAIL_CHANGE_SUCCESS' });
    expect((await getUserByEmail(newEmail))!.id).toBeDefined();
  });

  it('wrong OTP: 400 INVALID_OTP, attempts_count incremented and persisted', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    const otp = await startChange(token, user);

    const res = await mePost(token, '/verify-otp', { otp: wrongOtp(otp), purpose: 'change_email' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_OTP');
    expect((await getOtps(user.id, 'Change Email'))[0]!.attempts_count).toBe(1);
  });

  it('expired OTP with the correct code: 400 OTP_EXPIRED', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    const otp = await startChange(token, user);
    await expireOtps(user.id, 'Change Email');

    const res = await mePost(token, '/verify-otp', { otp, purpose: 'change_email' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OTP_EXPIRED');
  });

  it('4 wrong OTPs: 400 each; the 5th: 429 OTP_ATTEMPTS_EXCEEDED; the correct one afterwards still 429, email unchanged', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    const otp = await startChange(token, user);
    for (let i = 0; i < 4; i++) {
      const r = await mePost(token, '/verify-otp', { otp: wrongOtp(otp), purpose: 'change_email' });
      expect(r.status).toBe(400);
    }
    const fifth = await mePost(token, '/verify-otp', { otp: wrongOtp(otp), purpose: 'change_email' });
    expect(fifth.status).toBe(429);
    expect(fifth.body.code).toBe('OTP_ATTEMPTS_EXCEEDED');
    expect(fifth.headers['retry-after']).toBeDefined();

    const res = await mePost(token, '/verify-otp', { otp, purpose: 'change_email' });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('OTP_ATTEMPTS_EXCEEDED');
    expect((await getUserByEmail(user.email))!.email).toBe(user.email);
  });

  it("purpose: 'change_password' sent here: 400 VALIDATION_ERROR, \"Invalid purpose\"", async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    const res = await mePost(token, '/verify-otp', { otp: '123456', purpose: 'change_password' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual(VALIDATION('Invalid purpose'));
  });

  it('missing/wrong-type/extra field: standard 400 VALIDATION_ERROR pattern', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    expect((await mePost(token, '/verify-otp', { purpose: 'change_email' })).body).toEqual(
      VALIDATION('OTP is required'),
    );
    expect((await mePost(token, '/verify-otp', { otp: 1, purpose: 'change_email' })).body).toEqual(
      VALIDATION('OTP must be a string'),
    );
    expect((await mePost(token, '/verify-otp', { otp: '123456' })).body).toEqual(
      VALIDATION('Purpose is required'),
    );
    expect(
      (await mePost(token, '/verify-otp', { otp: '123456', purpose: 'change_email', extra: 1 })).body,
    ).toEqual(EXTRA_FIELD);
  });

  it('rejects a request with no Authorization header: 401 UNAUTHORIZED', async () => {
    const res = await mePost(undefined, '/verify-otp', { otp: '123456', purpose: 'change_email' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual(UNAUTHORIZED);
  });
});

describe('POST /users/me/resend-otp', () => {
  const newEmail = 'new@example.com';

  it('resend for change_email: 200 OTP_SENT, same new_email reused, previous OTP consumed_at set', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    await mePut(token, '/email', { currentPassword: user.password, newEmail });
    await backdateOtps(user.id, 2, 'Change Email'); // past the cooldown window

    const res = await mePost(token, '/resend-otp', { purpose: 'change_email' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: 'A new verification code has been sent to your email',
      code: 'OTP_SENT',
    });
    const rows = await getOtps(user.id, 'Change Email');
    expect(rows).toHaveLength(2);
    expect(rows[1]!.new_email).toBe(newEmail);
  });

  it('resend for change_email with no pending change: 400 NO_PENDING_EMAIL_CHANGE', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    const res = await mePost(token, '/resend-otp', { purpose: 'change_email' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_PENDING_EMAIL_CHANGE');
  });

  it('resend for change_password with no pending change: 400 NO_PENDING_PASSWORD_CHANGE', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    const res = await mePost(token, '/resend-otp', { purpose: 'change_password' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_PENDING_PASSWORD_CHANGE');
  });

  it('invalid purpose value: 400 VALIDATION_ERROR, "Invalid purpose"', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    const res = await mePost(token, '/resend-otp', { purpose: 'registration' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual(VALIDATION('Invalid purpose'));
  });

  it('missing/wrong-type/extra field: standard 400 VALIDATION_ERROR pattern', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    expect((await mePost(token, '/resend-otp', {})).body).toEqual(VALIDATION('Purpose is required'));
    expect((await mePost(token, '/resend-otp', { purpose: 1 })).body).toEqual(
      VALIDATION('Purpose must be a string'),
    );
    expect((await mePost(token, '/resend-otp', { purpose: 'change_email', extra: 1 })).body).toEqual(
      EXTRA_FIELD,
    );
  });

  it('rejects a request with no Authorization header: 401 UNAUTHORIZED', async () => {
    const res = await mePost(undefined, '/resend-otp', { purpose: 'change_email' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual(UNAUTHORIZED);
  });
});

describe('PUT /users/me/password', () => {
  it('correct current password + valid new password: 200 OTP_SENT', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    const res = await mePut(token, '/password', {
      currentPassword: user.password,
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Verification code sent to your email', code: 'OTP_SENT' });
  });

  it('wrong current password at initiate: 401 INVALID_PASSWORD, no OTP sent', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    const res = await mePut(token, '/password', {
      currentPassword: 'WrongPassw0rd!',
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_PASSWORD');
    expect(await getOtps(user.id, 'Change Password')).toHaveLength(0);
  });

  it('newPassword same as current at initiate: 400 PASSWORD_UNCHANGED', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    const res = await mePut(token, '/password', {
      currentPassword: user.password,
      newPassword: user.password,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PASSWORD_UNCHANGED');
  });

  it('weak newPassword at initiate: 400 VALIDATION_ERROR', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    const res = await mePut(token, '/password', { currentPassword: user.password, newPassword: 'weak' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('missing/wrong-type/extra field: standard 400 VALIDATION_ERROR pattern', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    expect((await mePut(token, '/password', { newPassword: NEW_PASSWORD })).body).toEqual(
      VALIDATION('Current password is required'),
    );
    expect(
      (await mePut(token, '/password', { currentPassword: user.password })).body,
    ).toEqual(VALIDATION('New password is required'));
    expect(
      (await mePut(token, '/password', {
        currentPassword: user.password,
        newPassword: NEW_PASSWORD,
        extra: 1,
      })).body,
    ).toEqual(EXTRA_FIELD);
  });

  it('rejects a request with no Authorization header: 401 UNAUTHORIZED', async () => {
    const res = await mePut(undefined, '/password', { currentPassword: 'x', newPassword: NEW_PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body).toEqual(UNAUTHORIZED);
  });
});

describe('POST /users/me/confirm-password-change', () => {
  async function startChange(token: string, user: { email: string; password: string }) {
    await mePut(token, '/password', { currentPassword: user.password, newPassword: NEW_PASSWORD });
    return latestOtpFor(user.email);
  }

  it('correct OTP: 200 PASSWORD_CHANGE_SUCCESS, hash updated, all refresh tokens revoked', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    await seedRefreshToken(user.id, 'confirm-http-token');
    const otp = await startChange(token, user);

    const res = await mePost(token, '/confirm-password-change', { otp, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: 'Password changed successfully. Please log in again on other devices.',
      code: 'PASSWORD_CHANGE_SUCCESS',
    });
    expect((await getRefreshTokens(user.id)).every((t) => t.is_revoked)).toBe(true);

    expect((await loginUser(user, NEW_PASSWORD)).status).toBe(200);
    expect((await loginUser(user, user.password)).status).toBe(401);
  });

  it('a previously-issued access token stays valid until it naturally expires', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    const otp = await startChange(token, user);
    await mePost(token, '/confirm-password-change', { otp, newPassword: NEW_PASSWORD });

    // Only refresh tokens are revoked; this still-live access token keeps working.
    const res = await meGet(token);
    expect(res.status).toBe(200);
  });

  it('wrong OTP at confirm: 400 INVALID_OTP, attempt persisted', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    const otp = await startChange(token, user);

    const res = await mePost(token, '/confirm-password-change', {
      otp: wrongOtp(otp),
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_OTP');
    expect((await getOtps(user.id, 'Change Password'))[0]!.attempts_count).toBe(1);
  });

  it('4 wrong OTPs: 400 each; the 5th: 429 OTP_ATTEMPTS_EXCEEDED; the correct one afterwards still 429, password unchanged', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    const otp = await startChange(token, user);
    const before = (await getUserByEmail(user.email))!.password_hash;
    for (let i = 0; i < 4; i++) {
      const r = await mePost(token, '/confirm-password-change', {
        otp: wrongOtp(otp),
        newPassword: NEW_PASSWORD,
      });
      expect(r.status).toBe(400);
    }
    const fifth = await mePost(token, '/confirm-password-change', {
      otp: wrongOtp(otp),
      newPassword: NEW_PASSWORD,
    });
    expect(fifth.status).toBe(429);
    expect(fifth.body.code).toBe('OTP_ATTEMPTS_EXCEEDED');
    expect(fifth.headers['retry-after']).toBeDefined();

    const res = await mePost(token, '/confirm-password-change', { otp, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('OTP_ATTEMPTS_EXCEEDED');
    expect((await getUserByEmail(user.email))!.password_hash).toBe(before);
  });

  it('expired OTP: 400 OTP_EXPIRED', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    const otp = await startChange(token, user);
    await expireOtps(user.id, 'Change Password');

    const res = await mePost(token, '/confirm-password-change', { otp, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OTP_EXPIRED');
  });

  it('re-submitting an already-consumed OTP: 400 INVALID_OTP', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    const otp = await startChange(token, user);
    await mePost(token, '/confirm-password-change', { otp, newPassword: NEW_PASSWORD });

    // A different newPassword than the one just applied, so this doesn't trip
    // confirmPasswordChange's own PASSWORD_UNCHANGED re-check before ever reaching checkOtp.
    const res = await mePost(token, '/confirm-password-change', {
      otp,
      newPassword: 'Another!Passw0rd2',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_OTP');
  });

  it('a different newPassword than what was validated at initiate still succeeds with whatever is sent here (intended, not a bug)', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    // Initiate validates NEW_PASSWORD, but confirm is sent a different (still-valid) password.
    const otp = await startChange(token, user);
    const actuallyUsed = 'Different!Passw0rd9';

    const res = await mePost(token, '/confirm-password-change', { otp, newPassword: actuallyUsed });
    expect(res.status).toBe(200);
    expect((await loginUser(user, actuallyUsed)).status).toBe(200);
    expect((await loginUser(user, NEW_PASSWORD)).status).toBe(401);
  });

  it('missing/wrong-type/extra field: standard 400 VALIDATION_ERROR pattern', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    expect((await mePost(token, '/confirm-password-change', { newPassword: NEW_PASSWORD })).body).toEqual(
      VALIDATION('OTP is required'),
    );
    expect(
      (await mePost(token, '/confirm-password-change', { otp: '123456' })).body,
    ).toEqual(VALIDATION('New password is required'));
    expect(
      (await mePost(token, '/confirm-password-change', {
        otp: '123456',
        newPassword: NEW_PASSWORD,
        extra: 1,
      })).body,
    ).toEqual(EXTRA_FIELD);
  });

  it('no Authorization header on either route: 401 UNAUTHORIZED', async () => {
    expect((await mePut(undefined, '/password', { currentPassword: 'x', newPassword: NEW_PASSWORD })).status).toBe(401);
    const res = await mePost(undefined, '/confirm-password-change', { otp: '123456', newPassword: NEW_PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body).toEqual(UNAUTHORIZED);
  });
});

// AI-generated (edited by <name>).
describe('PUT /users/me/preferred-lang', () => {
  it('defaults to en, then updates the caller: 200, response and DB both updated', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    expect((await getUserByEmail(user.email))!.preferred_lang).toBe('en');

    const res = await mePut(token, '/preferred-lang', { preferredLang: 'ta' });
    expect(res.status).toBe(200);
    expect(res.body.preferredLang).toBe('ta');
    expect(res.body).not.toHaveProperty('password_hash');
    expect((await meGet(token)).body.preferredLang).toBe('ta');
    expect((await getUserByEmail(user.email))!.preferred_lang).toBe('ta');
  });

  it.each(['fr', 'EN', '', 5])('rejects unsupported language %j: 400', async (value) => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    const res = await mePut(token, '/preferred-lang', { preferredLang: value });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect((await getUserByEmail(user.email))!.preferred_lang).toBe('en');
  });

  it('rejects a missing field and extra fields: 400', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    expect((await mePut(token, '/preferred-lang', {})).status).toBe(400);
    const extra = await mePut(token, '/preferred-lang', { preferredLang: 'es', x: 1 });
    expect(extra.status).toBe(400);
    expect(extra.body).toEqual(EXTRA_FIELD);
  });

  it('requires authentication: 401', async () => {
    const res = await mePut(undefined, '/preferred-lang', { preferredLang: 'es' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual(UNAUTHORIZED);
  });
});
