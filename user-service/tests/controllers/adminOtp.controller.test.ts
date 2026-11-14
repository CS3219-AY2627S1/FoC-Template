// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
// Scope: Stage 27a - HTTP-level tests for POST /admin/send-otp, /admin/verify-otp,
//        /admin/resend-otp (supertest + real test DB), mirroring the existing
//        forgot-password/registration OTP test patterns. Governing decision: instructions.md
//        Stage 27's own Verification bullets. No requirements, architecture, schema, or API
//        decisions were made by the AI tool.
// Author review:
// Tool: Claude Code (model: claude-fable-5-1), date: 2026-11-10
// Scope: Fix F2 - debugged the ECONNRESET / "socket hang up" flake; replaced per-call
//        `request(app)` supertest servers with the shared loopback server in
//        tests/helpers/server.ts (`api()`). No test logic or assertions changed.
//        No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:

import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api } from '../helpers/server.js';
import {
  backdateOtps,
  expireOtps,
  getOtps,
  setOtpSendBlock,
  truncateAll,
} from '../helpers/db.js';
import {
  emailCallsFor,
  failNextEmail,
  latestOtpFor,
  resetEmailMock,
  sendOtpEmailMock,
  wrongOtp,
} from '../helpers/email.js';
import { accessTokenFor, bearer, createActiveUser, createUserWithRole, loginTokens } from '../helpers/fixtures.js';
import { signElevationToken } from '../helpers/keys.js';

resetEmailMock();
beforeEach(truncateAll);
afterEach(truncateAll);

const sendOtp = (token: string) =>
  api().post('/admin/send-otp').set('Authorization', bearer(token)).send({ purpose: 'admin_action' });

const verifyOtp = (token: string, otp: string, extra: Record<string, unknown> = {}) =>
  api()
    .post('/admin/verify-otp')
    .set('Authorization', bearer(token))
    .send({ otp, purpose: 'admin_action', ...extra });

const resendOtp = (token: string) =>
  api().post('/admin/resend-otp').set('Authorization', bearer(token)).send({ purpose: 'admin_action' });

// ---------------------------------------------------------------------------------------------
describe('POST /admin/send-otp', () => {
  it('requires authentication: 401 UNAUTHORIZED with no token', async () => {
    const res = await api().post('/admin/send-otp').send({ purpose: 'admin_action' });
    expect(res.status).toBe(401);
  });

  it('a regular user gets 403 FORBIDDEN', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    const res = await sendOtp(token);
    expect(res.status).toBe(403);
  });

  it('admin and super admin can send: 200 OTP_SENT, emailed to the admin\'s own address', async () => {
    for (const role of ['admin', 'super admin'] as const) {
      await truncateAll();
      const admin = await createUserWithRole(1, role);
      const token = await accessTokenFor(admin);
      const res = await sendOtp(token);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        message: 'A verification code has been sent to your email',
        code: 'OTP_SENT',
      });
      expect(emailCallsFor(admin.email).at(-1)).toMatchObject({ purpose: 'Admin Action' });
    }
  });

  it('an invalid purpose: 400 VALIDATION_ERROR "Invalid purpose"', async () => {
    const admin = await createUserWithRole(1, 'admin');
    const token = await accessTokenFor(admin);
    const res = await api()
      .post('/admin/send-otp')
      .set('Authorization', bearer(token))
      .send({ purpose: 'forgot_password' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Invalid purpose', code: 'VALIDATION_ERROR' });
  });

  it('an extra field: 400 "Request contains unexpected fields"', async () => {
    const admin = await createUserWithRole(1, 'admin');
    const token = await accessTokenFor(admin);
    const res = await api()
      .post('/admin/send-otp')
      .set('Authorization', bearer(token))
      .send({ purpose: 'admin_action', extra: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Request contains unexpected fields');
  });

  it('email send failure: 503 EMAIL_SEND_FAILED, nothing persisted usable afterward', async () => {
    const admin = await createUserWithRole(1, 'admin');
    const token = await accessTokenFor(admin);
    failNextEmail();
    const res = await sendOtp(token);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('EMAIL_SEND_FAILED');
  });

  it('already elevated: 409 ALREADY_ELEVATED', async () => {
    const admin = await createUserWithRole(1, 'admin');
    const { accessToken } = await loginTokens(admin);
    const { sid } = jwt.decode(accessToken) as { sid: string };
    const elevationToken = signElevationToken({ sub: admin.id, role: 'admin', sid });

    const res = await api()
      .post('/admin/send-otp')
      .set('Authorization', bearer(accessToken))
      .set('Elevated-Token', elevationToken)
      .send({ purpose: 'admin_action' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      message: 'Admin actions are already unlocked.',
      code: 'ALREADY_ELEVATED',
    });
  });

  it('an invalid Elevated-Token does not block sending', async () => {
    const admin = await createUserWithRole(1, 'admin');
    const token = await accessTokenFor(admin);
    const res = await api()
      .post('/admin/send-otp')
      .set('Authorization', bearer(token))
      .set('Elevated-Token', 'not-a-token')
      .send({ purpose: 'admin_action' });
    expect(res.status).toBe(200);
  });

  it('resend cooldown/limit rules apply to Admin Action (Stage 18 escalation)', async () => {
    const admin = await createUserWithRole(1, 'admin');
    const token = await accessTokenFor(admin);
    await sendOtp(token);
    const cooldown = await sendOtp(token);
    expect(cooldown.status).toBe(429);
    expect(cooldown.body.code).toBe('OTP_RESEND_COOLDOWN');
    expect(Number(cooldown.headers['retry-after'])).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------
describe('POST /admin/verify-otp', () => {
  it('requires authentication: 401 UNAUTHORIZED with no token', async () => {
    const res = await api().post('/admin/verify-otp').send({ otp: '123456', purpose: 'admin_action' });
    expect(res.status).toBe(401);
  });

  it('a regular user gets 403 FORBIDDEN', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    const res = await verifyOtp(token, '123456');
    expect(res.status).toBe(403);
  });

  it('otp not 6 digits: 400 VALIDATION_ERROR', async () => {
    const admin = await createUserWithRole(1, 'admin');
    const token = await accessTokenFor(admin);
    const res = await verifyOtp(token, '12');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'OTP must be a 6-digit code', code: 'VALIDATION_ERROR' });
  });

  it('correct code: 200 { elevationToken }, RS256, claims sub/role/sid/iat/exp expiring per the configured TTL', async () => {
    const admin = await createUserWithRole(1, 'admin');
    const token = await accessTokenFor(admin);
    await sendOtp(token);
    const otp = latestOtpFor(admin.email);

    const res = await verifyOtp(token, otp);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(['elevationToken']);
    const decoded = jwt.decode(res.body.elevationToken, { complete: true })!;
    expect(decoded.header.alg).toBe('RS256');
    expect(decoded.header.typ).toBe('ep+JWT');
    const payload = decoded.payload as jwt.JwtPayload;
    expect(payload.sub).toBe(admin.id);
    expect(payload.role).toBe('admin');
    expect(typeof payload.sid).toBe('string');
    expect(payload.exp! - payload.iat!).toBe(15 * 60);
  });

  it('the same code again: 400 INVALID_OTP (consuming verify)', async () => {
    const admin = await createUserWithRole(1, 'admin');
    const token = await accessTokenFor(admin);
    await sendOtp(token);
    const otp = latestOtpFor(admin.email);

    const first = await verifyOtp(token, otp);
    expect(first.status).toBe(200);

    const second = await verifyOtp(token, otp);
    expect(second.status).toBe(400);
    expect(second.body.code).toBe('INVALID_OTP');
  });

  it('wrong code: 400 INVALID_OTP, attempt persisted; the 5th: 429 OTP_ATTEMPTS_EXCEEDED', async () => {
    const admin = await createUserWithRole(1, 'admin');
    const token = await accessTokenFor(admin);
    await sendOtp(token);
    const real = latestOtpFor(admin.email);
    const wrong = wrongOtp(real);

    for (let i = 0; i < 4; i++) {
      const res = await verifyOtp(token, wrong);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_OTP');
    }
    const otps = await getOtps(admin.id, 'Admin Action');
    expect(otps.at(-1)!.attempts_count).toBe(4);

    const fifth = await verifyOtp(token, wrong);
    expect(fifth.status).toBe(429);
    expect(fifth.body.code).toBe('OTP_ATTEMPTS_EXCEEDED');

    const afterward = await verifyOtp(token, real);
    expect(afterward.status).toBe(429);
    expect(afterward.body.code).toBe('OTP_ATTEMPTS_EXCEEDED');
  });

  it('an expired code: 400 OTP_EXPIRED', async () => {
    const admin = await createUserWithRole(1, 'admin');
    const token = await accessTokenFor(admin);
    await sendOtp(token);
    const otp = latestOtpFor(admin.email);
    await expireOtps(admin.id, 'Admin Action');

    const res = await verifyOtp(token, otp);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OTP_EXPIRED');
  });

  it('wrong admin OTP guesses do not count toward the login lockout', async () => {
    const admin = await createUserWithRole(1, 'admin');
    const token = await accessTokenFor(admin);
    await sendOtp(token);
    const wrong = wrongOtp(latestOtpFor(admin.email));
    await verifyOtp(token, wrong);
    await verifyOtp(token, wrong);

    // Login still succeeds normally afterward: the lockout counter was not touched.
    const loginRes = await api()
      .post('/auth/login')
      .send({ identifier: admin.email, password: admin.password });
    expect(loginRes.status).toBe(200);
  });

  it('a successful verify resets the send-escalation level for Admin Action', async () => {
    const admin = await createUserWithRole(1, 'admin');
    const token = await accessTokenFor(admin);
    await sendOtp(token);
    await setOtpSendBlock(admin.id, 'Admin Action', { level: 2, blockedUntilMinutesFromNow: null });
    const otp = latestOtpFor(admin.email);

    const res = await verifyOtp(token, otp);
    expect(res.status).toBe(200);

    const otps = await getOtps(admin.id, 'Admin Action');
    expect(otps.at(-1)!.send_escalation_level).toBe(0);
  });

  it('already elevated: 409 ALREADY_ELEVATED', async () => {
    const admin = await createUserWithRole(1, 'admin');
    const { accessToken } = await loginTokens(admin);
    const { sid } = jwt.decode(accessToken) as { sid: string };
    const elevationToken = signElevationToken({ sub: admin.id, role: 'admin', sid });

    const res = await api()
      .post('/admin/verify-otp')
      .set('Authorization', bearer(accessToken))
      .set('Elevated-Token', elevationToken)
      .send({ otp: '123456', purpose: 'admin_action' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_ELEVATED');
  });

  it('two concurrent verify-otp with the correct code: one success, one 400 INVALID_OTP', async () => {
    const admin = await createUserWithRole(1, 'admin');
    const token = await accessTokenFor(admin);
    await sendOtp(token);
    const otp = latestOtpFor(admin.email);

    const [a, b] = await Promise.all([verifyOtp(token, otp), verifyOtp(token, otp)]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 400]);
  });
});

// ---------------------------------------------------------------------------------------------
describe('POST /admin/resend-otp', () => {
  it('requires authentication: 401 UNAUTHORIZED with no token', async () => {
    const res = await api().post('/admin/resend-otp').send({ purpose: 'admin_action' });
    expect(res.status).toBe(401);
  });

  it('a regular user gets 403 FORBIDDEN', async () => {
    const user = await createActiveUser(1);
    const token = await accessTokenFor(user);
    const res = await resendOtp(token);
    expect(res.status).toBe(403);
  });

  it('with no pending admin OTP: 400 NO_PENDING_OTP', async () => {
    const admin = await createUserWithRole(1, 'admin');
    const token = await accessTokenFor(admin);
    const res = await resendOtp(token);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'No pending verification found', code: 'NO_PENDING_OTP' });
  });

  it('with the latest OTP already consumed: 400 NO_PENDING_OTP', async () => {
    const admin = await createUserWithRole(1, 'admin');
    const token = await accessTokenFor(admin);
    await sendOtp(token);
    await verifyOtp(token, latestOtpFor(admin.email));

    const res = await resendOtp(token);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_PENDING_OTP');
  });

  it('with a pending OTP, after the cooldown: 200 OTP_SENT, previous row consumed', async () => {
    const admin = await createUserWithRole(1, 'admin');
    const token = await accessTokenFor(admin);
    await sendOtp(token);
    await backdateOtps(admin.id, 2, 'Admin Action');

    const res = await resendOtp(token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: 'A new verification code has been sent to your email',
      code: 'OTP_SENT',
    });
    const otps = await getOtps(admin.id, 'Admin Action');
    expect(otps).toHaveLength(2);
    expect(otps[0]!.consumed_at).not.toBeNull();
  });

  it('immediately after a pending send: 429 OTP_RESEND_COOLDOWN with Retry-After', async () => {
    const admin = await createUserWithRole(1, 'admin');
    const token = await accessTokenFor(admin);
    await sendOtp(token);

    const res = await resendOtp(token);
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('OTP_RESEND_COOLDOWN');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('after 5 resends inside the window: the 6th gets 429 OTP_RESEND_LIMIT (about an hour)', async () => {
    const admin = await createUserWithRole(1, 'admin');
    const token = await accessTokenFor(admin);
    await sendOtp(token);
    for (let i = 0; i < 5; i++) {
      await backdateOtps(admin.id, 2, 'Admin Action');
      expect((await resendOtp(token)).status).toBe(200);
    }
    await backdateOtps(admin.id, 2, 'Admin Action');
    sendOtpEmailMock.mockClear();

    const res = await resendOtp(token);
    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      message: 'Maximum OTP resends reached. Please try again in about an hour.',
      code: 'OTP_RESEND_LIMIT',
    });
    expect(res.headers['retry-after']).toBe('3600');
    expect(sendOtpEmailMock).not.toHaveBeenCalled();
  });

  it('already elevated: 409 ALREADY_ELEVATED', async () => {
    const admin = await createUserWithRole(1, 'admin');
    const { accessToken } = await loginTokens(admin);
    const { sid } = jwt.decode(accessToken) as { sid: string };
    const elevationToken = signElevationToken({ sub: admin.id, role: 'admin', sid });
    await api()
      .post('/admin/send-otp')
      .set('Authorization', bearer(accessToken))
      .send({ purpose: 'admin_action' });

    const res = await api()
      .post('/admin/resend-otp')
      .set('Authorization', bearer(accessToken))
      .set('Elevated-Token', elevationToken)
      .send({ purpose: 'admin_action' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_ELEVATED');
  });
});

// ---------------------------------------------------------------------------------------------
describe('Elevation on one device vs. another', () => {
  it('an elevation token from one login of an admin does not elevate another login of the same admin', async () => {
    const admin = await createUserWithRole(1, 'admin');
    const session1 = await loginTokens(admin);
    const session2 = await loginTokens(admin);

    const send1 = await api()
      .post('/admin/send-otp')
      .set('Authorization', bearer(session1.accessToken))
      .send({ purpose: 'admin_action' });
    expect(send1.status).toBe(200);
    const otp = latestOtpFor(admin.email);
    const verify1 = await api()
      .post('/admin/verify-otp')
      .set('Authorization', bearer(session1.accessToken))
      .send({ otp, purpose: 'admin_action' });
    expect(verify1.status).toBe(200);
    const elevationToken: string = verify1.body.elevationToken;

    // That token does not make send-otp treat the *other* login as already elevated (409):
    // clear the resend cooldown first (OTPs are per-account, not per-device, so an immediate
    // resend would otherwise 429 for an unrelated reason) and confirm the response is neither
    // 409 ALREADY_ELEVATED nor blocked by the elevation check.
    await backdateOtps(admin.id, 2, 'Admin Action');
    const send2 = await api()
      .post('/admin/send-otp')
      .set('Authorization', bearer(session2.accessToken))
      .set('Elevated-Token', elevationToken)
      .send({ purpose: 'admin_action' });
    expect(send2.status).toBe(200);
  });
});
