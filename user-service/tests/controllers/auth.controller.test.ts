// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-26
// 26/09/2026: Stage 7 - HTTP-level tests for every auth route (supertest + real test DB)
// Author review:
// 27/09/2026: Stage 11 - updated fixtures for the new activeView field
// Author review:
// 2026-10-17: Stage 13b/13c - replaced GET /auth/verify tests with GET
//   /auth/.well-known/jwks.json tests; the two unrelated "token still valid" checks that
//   reused /auth/verify now use GET /users/me instead. Governing decision: instructions.md
//   Stage 13b and 13c.
// Author review:
// 2026-11-04: Stage 18b/18c - the login lockout test suite below, and updated the
//   OTP_RESEND_LIMIT Retry-After/rolling-window tests for the send-escalation block. Governing
//   decision: instructions.md Stage 18.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-05: Stage 23a - reworded the two test descriptions that still said "7 day"/"7 days
//   out" after their asserted values were changed to 30 (by the author, outside this tool) to
//   match the new 30-day session lifetime. No requirements, architecture, schema, or API
//   decisions were made by the AI tool.
// Author review:
// 2026-11-05: Stage 23b - added coverage for sessionTimeLeftSeconds on POST /auth/login and
//   POST /auth/refresh, and updated the refresh response-shape test/title for the new field.
//   Governing decision: instructions.md Stage 23b. No requirements, architecture, schema, or
//   API decisions were made by the AI tool.
// Author review:
// 2026-11-09: Stage 27a - added coverage for the access token's new header `typ: at+JWT` and
//   `sid` claim (the login's refresh_tokens.id), and that `sid` stays the same across a
//   refresh of the same login. Governing decision: instructions.md Stage 27.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// Tool: Claude Code (model: claude-fable-5-1), date: 2026-11-10
// Scope: Fix F2 - debugged the ECONNRESET / "socket hang up" flake; replaced per-call
//        `request(app)` supertest servers with the shared loopback server in
//        tests/helpers/server.ts (`api()`). No test logic or assertions changed.
//        No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-10
// Scope: Stage 31e - added the POST /auth/unlock describe block, covering every HTTP-level
//        Stage 31c Verification bullet not already exercised at the service layer
//        (auth.service.test.ts): the 200 UNLOCKED/ALREADY_UNLOCKED response shapes, the 401
//        INVALID_UNLOCK_TOKEN shape, Zod .strict() validation (missing/empty token, unknown
//        key), that it ignores a present Authorization header, and that the admin
//        POST /users/:id/unlock endpoint is untouched. Governing decision: instructions.md
//        Stage 31c's own Verification bullets.
//        No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-10
// Scope: Bug fix - updated the 'POST /auth/verify-otp' > 'registration' and
//        'POST /auth/resend-otp' > 'registration' describe blocks: every existing test that
//        reaches the OTP logic (i.e. not rejected earlier for an unknown/already-active email)
//        now attaches that test's own pendingToken cookie (via registerPending's returned
//        TestUser and the new pendingCookie fixture helper), since those endpoints now require
//        it. Added new tests for the fix itself: account A's cookie + account B's email/OTP is
//        rejected with 403 EMAIL_MISMATCH without touching B's status/OTP state on both
//        endpoints, a fresh request with no cookie at all is also EMAIL_MISMATCH, and the normal
//        same-account flow still succeeds. The 'forgot_password' describe blocks on both
//        endpoints are untouched. Governing decision: bug report + team decisions recorded in
//        this task's conversation (pending-token cookie mechanism, EMAIL_MISMATCH 403 with no
//        OTP-counter interaction, TTL = config.otp.ttlMinutes). No requirements, architecture,
//        schema, or API decisions were made by the AI tool.
// Author review:
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../helpers/server.js';
import { sha256 } from '../../src/utils/hash.js';
import { NEW_PASSWORD, PASSWORD } from '../helpers/constants.js';
import {
  backdateOtps,
  countUsers,
  expireOtps,
  expireRefreshToken,
  getAuditLogRowsForTarget,
  getOtps,
  getRefreshTokenByPlain,
  getRefreshTokens,
  getUserByEmail,
  getUserById,
  getUserByUsername,
  seedRefreshToken,
  setLoginLockState,
  setOtpSendBlock,
  setRefreshTokenExpiresInMinutes,
  setUserRole,
  setUserStatus,
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
import {
  cookieValue,
  createActiveUser,
  createUserWithRole,
  loginTokens,
  loginUser,
  pendingCookie,
  refreshCookie,
  registerPending,
  userInput,
} from '../helpers/fixtures.js';
import { signExpiredToken, signToken, signUnlockToken as signTestUnlockToken, tamperSignature } from '../helpers/keys.js';

resetEmailMock();
beforeEach(truncateAll);
afterEach(truncateAll);

const post = (path: string) => api().post(path);

function omit<T extends Record<string, unknown>>(obj: T, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key));
}

const PASSWORD_MESSAGE =
  'Password must contain at least 8 characters, with at least one uppercase, one lowercase, one digit and one special character. ';
const USERNAME_MESSAGE =
  'Username must contain between 3 and 255 chars and have no spaces or special characters.';

// ---------------------------------------------------------------------------------------------
describe('POST /auth/register', () => {
  describe('happy path', () => {
    it('returns 201 OTP_SENT and creates a pending user with a hashed password', async () => {
      const res = await post('/auth/register').send(userInput(1));

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        message: 'Verification code sent to your email',
        code: 'OTP_SENT',
      });

      const row = (await getUserByEmail('user1@example.com'))!;
      expect(row).toMatchObject({ username: 'user1', status: 'pending', role: 'user' });
      expect(row.password_hash).not.toBe(PASSWORD);
      expect(row.password_hash).toMatch(/^\$2[aby]\$10\$/);
      expect(await bcrypt.compare(PASSWORD, row.password_hash)).toBe(true);
    });

    it('creates one Registration OTP: 64-hex hash, ~10 minute expiry, null new_email, emailed to the user', async () => {
      await post('/auth/register').send(userInput(1));
      const user = (await getUserByEmail('user1@example.com'))!;

      const otps = await getOtps(user.id);
      expect(otps).toHaveLength(1);
      expect(otps[0]).toMatchObject({
        purpose: 'Registration',
        new_email: null,
        consumed_at: null,
      });
      expect(otps[0]!.otp_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(otps[0]!.expires_at.getTime() - otps[0]!.created_at.getTime()).toBe(10 * 60 * 1000);

      const [mail] = emailCallsFor('user1@example.com');
      expect(mail!.purpose).toBe('Registration');
      expect(sha256(mail!.otp)).toBe(otps[0]!.otp_hash);
    });

    it('never returns the password or its hash', async () => {
      const res = await post('/auth/register').send(userInput(1));
      expect(JSON.stringify(res.body)).not.toMatch(/password|\$2[aby]\$/i);
    });

    it('does not create a login session (no refreshToken cookie, no accessToken), but does set a pendingToken cookie', async () => {
      const res = await post('/auth/register').send(userInput(1));
      expect(cookieValue(res, 'refreshToken')).toBeUndefined();
      expect(res.body.accessToken).toBeUndefined();
      expect(cookieValue(res, 'pendingToken')).toBeDefined();
    });
  });

  describe('normalisation', () => {
    it('stores the username lowercased and the email trimmed and lowercased', async () => {
      const res = await post('/auth/register').send({
        username: 'Alice_1',
        email: '  Alice@Example.COM  ',
        password: PASSWORD,
      });
      expect(res.status).toBe(201);
      const row = (await getUserByUsername('alice_1'))!;
      expect(row.email).toBe('alice@example.com');
    });

    it('treats usernames and emails case-insensitively when checking duplicates', async () => {
      await post('/auth/register').send(userInput(1));
      const u = await post('/auth/register').send({ ...userInput(2), username: 'USER1' });
      expect(u.status).toBe(409);
      expect(u.body.code).toBe('USERNAME_TAKEN');
      const e = await post('/auth/register').send({ ...userInput(3), email: 'USER1@EXAMPLE.COM' });
      expect(e.status).toBe(409);
      expect(e.body.code).toBe('EMAIL_TAKEN');
    });

    it('does not trim the username: a leading or trailing space fails the no-spaces rule', async () => {
      for (const username of [' bob', 'bob ']) {
        const res = await post('/auth/register').send({ ...userInput(1), username });
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ message: USERNAME_MESSAGE, code: 'VALIDATION_ERROR' });
      }
    });
  });

  describe('username rules', () => {
    it.each([
      ['fewer than 3 characters', 'ab'],
      ['containing a space', 'has space'],
      ['containing a special character', 'bad!name'],
      ['containing a dash', 'bad-name'],
      ['longer than 255 characters', 'a'.repeat(256)],
    ])('rejects a username %s with 400 VALIDATION_ERROR', async (_n, username) => {
      const res = await post('/auth/register').send({ ...userInput(1), username });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: USERNAME_MESSAGE, code: 'VALIDATION_ERROR' });
      expect(await countUsers()).toBe(0);
    });

    it.each([
      ['exactly 3 characters', 'abc'],
      ['exactly 255 characters', 'a'.repeat(255)],
      ['containing an underscore', 'my_name_1'],
      ['containing digits', '12345'],
    ])('accepts a username %s', async (_n, username) => {
      const res = await post('/auth/register').send({ ...userInput(1), username });
      expect(res.status).toBe(201);
    });
  });

  describe('email rules', () => {
    it.each(['plainaddress', 'missing@tld', '@nouser.com', 'two words@example.com', 'a@b@c.com'])(
      'rejects %j with 400 "Please enter a valid email"',
      async (email) => {
        const res = await post('/auth/register').send({ ...userInput(1), email });
        expect(res.status).toBe(400);
        expect(res.body).toEqual({
          message: 'Please enter a valid email',
          code: 'VALIDATION_ERROR',
        });
        expect(await countUsers()).toBe(0);
      },
    );
  });

  describe('password rules', () => {
    it.each([
      ['shorter than 8 characters', 'Ab1!xyz'],
      ['no uppercase letter', 'weakpass1!'],
      ['no lowercase letter', 'WEAKPASS1!'],
      ['no digit', 'WeakPass!!'],
      ['no special character', 'WeakPass11'],
    ])('rejects a password with %s', async (_n, password) => {
      const res = await post('/auth/register').send({ ...userInput(1), password });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: PASSWORD_MESSAGE, code: 'VALIDATION_ERROR' });
      expect(await countUsers()).toBe(0);
      expect(sendOtpEmailMock).not.toHaveBeenCalled();
    });

    it('accepts an 8-character password that meets every rule', async () => {
      const res = await post('/auth/register').send({ ...userInput(1), password: 'Abcdef1!' });
      expect(res.status).toBe(201);
    });
  });

  describe('request body validation', () => {
    it('reports a missing password as "Password is required"', async () => {
      const res = await post('/auth/register').send(omit(userInput(1), 'password'));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'Password is required', code: 'VALIDATION_ERROR' });
    });

    it('reports a non-string password as "Password must be a string"', async () => {
      const res = await post('/auth/register').send({ ...userInput(1), password: 12345 });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'Password must be a string', code: 'VALIDATION_ERROR' });
    });

    it.each([
      ['username', 'Username is required', 'Username must be a string'],
      ['email', 'Email is required', 'Email must be a string'],
    ])(
      'reports %s presence and type errors with the custom messages',
      async (field, missing, wrongType) => {
        const body: Record<string, unknown> = { ...userInput(1) };
        delete body[field];
        const a = await post('/auth/register').send(body);
        expect(a.body).toEqual({ message: missing, code: 'VALIDATION_ERROR' });

        const b = await post('/auth/register').send({ ...userInput(1), [field]: 123 });
        expect(b.body).toEqual({ message: wrongType, code: 'VALIDATION_ERROR' });
      },
    );

    it('rejects an extra field (e.g. role: admin) with "Request contains unexpected fields"', async () => {
      const res = await post('/auth/register').send({ ...userInput(1), role: 'admin' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        message: 'Request contains unexpected fields',
        code: 'VALIDATION_ERROR',
      });
      expect(await countUsers()).toBe(0);
    });

    it('rejects a malformed JSON body with "Malformed JSON body"', async () => {
      const res = await post('/auth/register')
        .set('Content-Type', 'application/json')
        .send('{ "username": "x", ');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'Malformed JSON body', code: 'VALIDATION_ERROR' });
    });
  });

  describe('duplicates and reservation', () => {
    it('rejects a username held by a live pending registration with 409 USERNAME_TAKEN', async () => {
      await post('/auth/register').send(userInput(1));
      const res = await post('/auth/register').send({ ...userInput(2), username: 'user1' });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ message: 'Username already in use', code: 'USERNAME_TAKEN' });
    });

    it('rejects an email held by a live pending registration with 409 EMAIL_TAKEN', async () => {
      await post('/auth/register').send(userInput(1));
      const res = await post('/auth/register').send({
        ...userInput(2),
        email: 'user1@example.com',
      });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ message: 'Email already in use', code: 'EMAIL_TAKEN' });
    });

    it('rejects a username or email of an already active user', async () => {
      await createActiveUser(1);
      const u = await post('/auth/register').send({ ...userInput(2), username: 'user1' });
      expect(u.body.code).toBe('USERNAME_TAKEN');
      const e = await post('/auth/register').send({ ...userInput(2), email: 'user1@example.com' });
      expect(e.body.code).toBe('EMAIL_TAKEN');
    });

    it('reports USERNAME_TAKEN when both username and email are taken', async () => {
      await post('/auth/register').send(userInput(1));
      const res = await post('/auth/register').send(userInput(1));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('USERNAME_TAKEN');
    });

    it('releases an expired reservation: same username and email register again, old row gone', async () => {
      await post('/auth/register').send(userInput(1));
      const old = (await getUserByEmail('user1@example.com'))!;
      await expireOtps(old.id);

      const res = await post('/auth/register').send(userInput(1));

      expect(res.status).toBe(201);
      expect(await countUsers()).toBe(1);
      const now = (await getUserByUsername('user1'))!;
      expect(now.id).not.toBe(old.id);
      expect(now.status).toBe('pending');
    });

    it('does not release the reservation of an expired pending user whose OTP was replaced by a live one', async () => {
      const first = await post('/auth/register').send(userInput(1));
      const u = (await getUserByEmail('user1@example.com'))!;
      await expireOtps(u.id);
      await backdateOtps(u.id, 2);
      await post('/auth/resend-otp')
        .set('Cookie', pendingCookie(cookieValue(first, 'pendingToken')!))
        .send({ email: 'user1@example.com', purpose: 'registration' });

      const res = await post('/auth/register').send(userInput(1));
      expect(res.status).toBe(409);
    });
  });

  describe('email failure', () => {
    it('returns 503 EMAIL_SEND_FAILED and leaves no pending user or OTP behind', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      failNextEmail();

      const res = await post('/auth/register').send(userInput(1));

      expect(res.status).toBe(503);
      expect(res.body).toEqual({
        message: 'Unable to send verification email. Please try again.',
        code: 'EMAIL_SEND_FAILED',
      });
      expect(await countUsers()).toBe(0);
      const otpCount = await import('../../src/db/pool.js').then((m) =>
        m.default.query('SELECT COUNT(*) AS c FROM users_otps'),
      );
      expect(Number(otpCount.rows[0].c)).toBe(0);
    });

    it('does not keep the username reserved after a failed send', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      failNextEmail();
      await post('/auth/register').send(userInput(1));
      const res = await post('/auth/register').send(userInput(1));
      expect(res.status).toBe(201);
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe('POST /auth/login', () => {
  describe('success', () => {
    it('logs in with the email as identifier: 200, access token in body, refresh token cookie', async () => {
      const user = await createActiveUser(1);
      const res = await post('/auth/login').send({ identifier: user.email, password: PASSWORD });

      expect(res.status).toBe(200);
      expect(typeof res.body.accessToken).toBe('string');
      expect(res.body.user).toEqual({
        id: user.id,
        username: 'user1',
        email: 'user1@example.com',
        role: 'user',
        activeView: 'requester',
      });
      expect(cookieValue(res, 'refreshToken')).toMatch(/^[0-9a-f]{64}$/);
    });

    it('logs in with the username as identifier', async () => {
      const user = await createActiveUser(1);
      const res = await post('/auth/login').send({ identifier: user.username, password: PASSWORD });
      expect(res.status).toBe(200);
    });

    it('matches the identifier trimmed and case-insensitively', async () => {
      const user = await createActiveUser(1);
      for (const identifier of ['  USER1  ', 'User1@Example.com ']) {
        const res = await post('/auth/login').send({ identifier, password: PASSWORD });
        expect(res.status).toBe(200);
        expect(res.body.user.id).toBe(user.id);
      }
    });

    it('does not put the refresh token or password hash in the body', async () => {
      const user = await createActiveUser(1);
      const res = await loginUser(user);
      const refresh = cookieValue(res, 'refreshToken')!;
      expect(JSON.stringify(res.body)).not.toContain(refresh);
      expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
    });

    it('includes sessionTimeLeftSeconds close to the 30-day session lifetime', async () => {
      const user = await createActiveUser(1);
      const res = await loginUser(user);
      expect(res.body.sessionTimeLeftSeconds).toBeGreaterThanOrEqual(30 * 24 * 60 * 60 - 5);
      expect(res.body.sessionTimeLeftSeconds).toBeLessThanOrEqual(30 * 24 * 60 * 60);
    });

    it('sets the refresh cookie httpOnly, SameSite=Lax, with a 30 day Max-Age', async () => {
      const user = await createActiveUser(1);
      const res = await loginUser(user);
      const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
        c.startsWith('refreshToken='),
      )!;
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(cookie).toContain(`Max-Age=${30 * 24 * 60 * 60}`);
      expect(cookie).not.toMatch(/;\s*Secure/i); // NODE_ENV=test
    });

    it('stores only the SHA-256 hash of the refresh token, expiring 30 days out, with user agent', async () => {
      const user = await createActiveUser(1);
      const res = await post('/auth/login')
        .set('User-Agent', 'vitest-agent')
        .send({ identifier: user.email, password: PASSWORD });
      const plain = cookieValue(res, 'refreshToken')!;

      const rows = await getRefreshTokens(user.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.token_hash).toBe(sha256(plain));
      expect(rows[0]!.token_hash).not.toBe(plain);
      expect(rows[0]!.is_revoked).toBe(false);
      expect(rows[0]!.user_agent).toBe('vitest-agent');
      expect(rows[0]!.expires_at.getTime() - rows[0]!.created_at.getTime()).toBe(
        30 * 24 * 60 * 60 * 1000,
      );
    });

    it('issues an RS256 access token (header typ: at+JWT) with claims { sub, role, sid } expiring in ~15 minutes', async () => {
      const user = await createActiveUser(1);
      const res = await loginUser(user);
      const decoded = jwt.decode(res.body.accessToken, { complete: true })!;
      const payload = decoded.payload as jwt.JwtPayload;

      expect(decoded.header.alg).toBe('RS256');
      expect(decoded.header.typ).toBe('at+JWT');
      expect(payload.sub).toBe(user.id);
      expect(payload.role).toBe('user');
      expect(typeof payload.sid).toBe('string');
      expect(payload.exp! - payload.iat!).toBe(15 * 60);
    });

    it("sid equals the login's refresh_tokens.id", async () => {
      const user = await createActiveUser(1);
      const res = await loginUser(user);
      const { sid } = jwt.decode(res.body.accessToken) as { sid: string };
      const [row] = await getRefreshTokens(user.id);
      expect(sid).toBe(row!.id);
    });

    it('takes the role claim from the user row (admin)', async () => {
      const user = await createActiveUser(1);
      await setUserRole(user.id, 'admin');
      const res = await loginUser(user);
      expect(res.body.user.role).toBe('admin');
      expect(jwt.decode(res.body.accessToken)).toMatchObject({ role: 'admin' });
    });

    it('creates a separate refresh token for each login', async () => {
      const user = await createActiveUser(1);
      await loginUser(user);
      await loginUser(user);
      expect(await getRefreshTokens(user.id)).toHaveLength(2);
    });
  });

  describe('rejections', () => {
    it('wrong password: 401 INVALID_CREDENTIALS, no token stored', async () => {
      const user = await createActiveUser(1);
      const res = await post('/auth/login').send({
        identifier: user.email,
        password: 'Wrong!Pass1',
      });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(await getRefreshTokens(user.id)).toHaveLength(0);
    });

    it('unknown identifier: 401 with the same body as a wrong password', async () => {
      const res = await post('/auth/login').send({ identifier: 'ghost', password: PASSWORD });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    });

    it('suspended account with the right password: 403 ACCOUNT_SUSPENDED', async () => {
      const user = await createActiveUser(1);
      await setUserStatus(user.id, 'suspended');
      const res = await loginUser(user);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ message: 'Account suspended', code: 'ACCOUNT_SUSPENDED' });
      expect(await getRefreshTokens(user.id)).toHaveLength(0);
    });

    it('suspended account with a wrong password: 401, not 403 (state is not revealed)', async () => {
      const user = await createActiveUser(1);
      await setUserStatus(user.id, 'suspended');
      const res = await loginUser(user, 'Wrong!Pass1');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('pending account with the right password: 403 ACCOUNT_NOT_VERIFIED', async () => {
      const user = await registerPending(1);
      const res = await loginUser(user);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ message: 'Account not verified', code: 'ACCOUNT_NOT_VERIFIED' });
    });

    it('pending account with a wrong password: 401 INVALID_CREDENTIALS', async () => {
      const user = await registerPending(1);
      const res = await loginUser(user, 'Wrong!Pass1');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('request body validation', () => {
    it('missing identifier: "Username/Email is required"', async () => {
      const res = await post('/auth/login').send({ password: PASSWORD });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'Username/Email is required', code: 'VALIDATION_ERROR' });
    });

    it('non-string identifier: "Username/Email must be a string"', async () => {
      const res = await post('/auth/login').send({ identifier: 12345, password: PASSWORD });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        message: 'Username/Email must be a string',
        code: 'VALIDATION_ERROR',
      });
    });

    it('missing password: "Password is required"; non-string: "Password must be a string"', async () => {
      const a = await post('/auth/login').send({ identifier: 'user1' });
      expect(a.body).toEqual({ message: 'Password is required', code: 'VALIDATION_ERROR' });
      const b = await post('/auth/login').send({ identifier: 'user1', password: 123 });
      expect(b.body).toEqual({ message: 'Password must be a string', code: 'VALIDATION_ERROR' });
    });

    it('extra field: "Request contains unexpected fields"', async () => {
      const res = await post('/auth/login').send({
        identifier: 'a',
        password: 'b',
        remember: true,
      });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        message: 'Request contains unexpected fields',
        code: 'VALIDATION_ERROR',
      });
    });
  });

  describe('login lockout (Stage 18b)', () => {
    it('the 5th wrong password in the window: 429 ACCOUNT_LOCKED with an exact Retry-After header', async () => {
      const user = await createActiveUser(1);
      await setLoginLockState(user.id, { failedAttempts: 4, windowStartMinutesAgo: 1 });

      const res = await post('/auth/login').send({ identifier: user.email, password: 'Wrong!Pass1' });

      expect(res.status).toBe(429);
      expect(res.body).toEqual({
        message: 'Too many failed login attempts. Please try again in about an hour.',
        code: 'ACCOUNT_LOCKED',
      });
      expect(res.headers['retry-after']).toBe('3600');
      expect((await getUserById(user.id))!.login_lock_level).toBe(1);
    });

    it('while locked, the correct password is still rejected with 429 ACCOUNT_LOCKED', async () => {
      const user = await createActiveUser(1);
      await setLoginLockState(user.id, { lockLevel: 1, lockedUntilMinutesFromNow: 60 });

      const res = await post('/auth/login').send({ identifier: user.email, password: PASSWORD });
      expect(res.status).toBe(429);
      expect(res.body.code).toBe('ACCOUNT_LOCKED');
    });

    it('a successful login resets the lock state, shown on GET /users', async () => {
      const user = await createActiveUser(1);
      await setLoginLockState(user.id, { failedAttempts: 4, windowStartMinutesAgo: 1 });

      const res = await post('/auth/login').send({ identifier: user.email, password: PASSWORD });
      expect(res.status).toBe(200);

      const row = (await getUserById(user.id))!;
      expect(row.login_failed_attempts).toBe(0);
      expect(row.login_locked_until).toBeNull();
      expect(row.login_lock_level).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe('POST /auth/logout', () => {
  it('with a valid refresh cookie and no Authorization header: 200, cookie cleared, token revoked', async () => {
    const user = await createActiveUser(1);
    const { refreshToken } = await loginTokens(user);

    const res = await post('/auth/logout').set('Cookie', refreshCookie(refreshToken));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Logged out successfully', code: 'LOGOUT_SUCCESS' });
    const cleared = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('refreshToken='),
    )!;
    expect(cleared).toMatch(/^refreshToken=;/);
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);

    const row = (await getRefreshTokenByPlain(refreshToken))!;
    expect(row.is_revoked).toBe(true);
    expect(row.revoked_at).not.toBeNull();
  });

  it('works with an expired access token in the Authorization header', async () => {
    const user = await createActiveUser(1);
    const { refreshToken } = await loginTokens(user);
    const res = await post('/auth/logout')
      .set('Authorization', `Bearer ${signExpiredToken({ sub: user.id })}`)
      .set('Cookie', refreshCookie(refreshToken));
    expect(res.status).toBe(200);
  });

  it('works with a valid access token in the Authorization header', async () => {
    const user = await createActiveUser(1);
    const { accessToken, refreshToken } = await loginTokens(user);
    const res = await post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', refreshCookie(refreshToken));
    expect(res.status).toBe(200);
  });

  it('without a refreshToken cookie: 401 INVALID_REFRESH_TOKEN', async () => {
    const res = await post('/auth/logout');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Invalid refresh token', code: 'INVALID_REFRESH_TOKEN' });
  });

  it('with a valid access token but a garbage cookie: 401 INVALID_REFRESH_TOKEN', async () => {
    const user = await createActiveUser(1);
    const { accessToken } = await loginTokens(user);
    const res = await post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', refreshCookie('garbage'));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('with a valid access token but an already-revoked cookie: 401 INVALID_REFRESH_TOKEN', async () => {
    const user = await createActiveUser(1);
    const { accessToken, refreshToken } = await loginTokens(user);
    await post('/auth/logout').set('Cookie', refreshCookie(refreshToken));

    const res = await post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', refreshCookie(refreshToken));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('revokes only that device’s token; another session keeps working', async () => {
    const user = await createActiveUser(1);
    const a = await loginTokens(user);
    const b = await loginTokens(user);

    await post('/auth/logout').set('Cookie', refreshCookie(a.refreshToken));

    expect((await getRefreshTokenByPlain(b.refreshToken))!.is_revoked).toBe(false);
    const res = await post('/auth/refresh').set('Cookie', refreshCookie(b.refreshToken));
    expect(res.status).toBe(200);
  });

  it('leaves the already-issued access token valid until it expires', async () => {
    const user = await createActiveUser(1);
    const { accessToken, refreshToken } = await loginTokens(user);
    await post('/auth/logout').set('Cookie', refreshCookie(refreshToken));
    const res = await api()
      .get('/users/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------------------------
describe('POST /auth/refresh', () => {
  it('with a valid cookie: 200 and a new access token (body is only { accessToken, sessionTimeLeftSeconds })', async () => {
    const user = await createActiveUser(1);
    const { refreshToken } = await loginTokens(user);

    const res = await post('/auth/refresh').set('Cookie', refreshCookie(refreshToken));

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['accessToken', 'sessionTimeLeftSeconds']);
    expect(jwt.decode(res.body.accessToken)).toMatchObject({ sub: user.id, role: 'user' });
  });

  it('sid is the same after a refresh of the same login', async () => {
    const user = await createActiveUser(1);
    const { accessToken, refreshToken } = await loginTokens(user);
    const { sid: sidBefore } = jwt.decode(accessToken) as { sid: string };

    const res = await post('/auth/refresh').set('Cookie', refreshCookie(refreshToken));

    const { sid: sidAfter } = jwt.decode(res.body.accessToken) as { sid: string };
    expect(sidAfter).toBe(sidBefore);
  });

  it('returns sessionTimeLeftSeconds ~ 300 for a token backdated to 5 minutes left, without changing expires_at', async () => {
    const user = await createActiveUser(1);
    const { refreshToken } = await loginTokens(user);
    await setRefreshTokenExpiresInMinutes(refreshToken, 5);
    const before = (await getRefreshTokenByPlain(refreshToken))!.expires_at.getTime();

    const res = await post('/auth/refresh').set('Cookie', refreshCookie(refreshToken));

    expect(res.status).toBe(200);
    expect(res.body.sessionTimeLeftSeconds).toBeGreaterThanOrEqual(300 - 5);
    expect(res.body.sessionTimeLeftSeconds).toBeLessThanOrEqual(300);
    expect((await getRefreshTokenByPlain(refreshToken))!.expires_at.getTime()).toBe(before);
  });

  it('after logout: 401 INVALID_REFRESH_TOKEN', async () => {
    const user = await createActiveUser(1);
    const { refreshToken } = await loginTokens(user);
    await post('/auth/logout').set('Cookie', refreshCookie(refreshToken));

    const res = await post('/auth/refresh').set('Cookie', refreshCookie(refreshToken));
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Invalid refresh token', code: 'INVALID_REFRESH_TOKEN' });
  });

  it('with an expired refresh token: 401 INVALID_REFRESH_TOKEN', async () => {
    const user = await createActiveUser(1);
    const { refreshToken } = await loginTokens(user);
    await expireRefreshToken(refreshToken);

    const res = await post('/auth/refresh').set('Cookie', refreshCookie(refreshToken));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('with a cookie that never existed (random hex): 401 INVALID_REFRESH_TOKEN', async () => {
    const res = await post('/auth/refresh').set('Cookie', refreshCookie('ab'.repeat(32)));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('without a cookie: 401 INVALID_REFRESH_TOKEN', async () => {
    const res = await post('/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('for a suspended user with a still-valid cookie: 403 ACCOUNT_SUSPENDED, no access token', async () => {
    const user = await createActiveUser(1);
    const { refreshToken } = await loginTokens(user);
    await setUserStatus(user.id, 'suspended');

    const res = await post('/auth/refresh').set('Cookie', refreshCookie(refreshToken));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Account suspended', code: 'ACCOUNT_SUSPENDED' });
    expect(res.body.accessToken).toBeUndefined();
  });

  it('reflects a promotion made after login in the new access token’s role claim', async () => {
    const user = await createActiveUser(1);
    const { refreshToken } = await loginTokens(user);
    await setUserRole(user.id, 'admin');

    const res = await post('/auth/refresh').set('Cookie', refreshCookie(refreshToken));
    expect(res.status).toBe(200);
    expect(jwt.decode(res.body.accessToken)).toMatchObject({ sub: user.id, role: 'admin' });
  });

  it('keeps working repeatedly with the same cookie until logout', async () => {
    const user = await createActiveUser(1);
    const { refreshToken } = await loginTokens(user);
    for (let i = 0; i < 3; i++) {
      const res = await post('/auth/refresh').set('Cookie', refreshCookie(refreshToken));
      expect(res.status).toBe(200);
    }
  });

  it('for a seeded token whose user was suspended AND revoked: 401 (revoked wins)', async () => {
    const user = await createActiveUser(1);
    await seedRefreshToken(user.id, 'seeded-token');
    await post('/auth/logout').set('Cookie', refreshCookie('seeded-token'));
    await setUserStatus(user.id, 'suspended');
    const res = await post('/auth/refresh').set('Cookie', refreshCookie('seeded-token'));
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------------------------
describe('GET /auth/.well-known/jwks.json', () => {
  it('requires no Authorization header: 200 { keys: [...] }', async () => {
    const res = await api().get('/auth/.well-known/jwks.json');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.keys)).toBe(true);
    expect(res.body.keys).toHaveLength(1);
  });

  it('publishes the current key in JWK format, matching the kid on a freshly issued token', async () => {
    const res = await api().get('/auth/.well-known/jwks.json');
    const [key] = res.body.keys;
    expect(key).toMatchObject({ kty: 'RSA', use: 'sig', alg: 'RS256' });
    expect(typeof key.n).toBe('string');
    expect(typeof key.e).toBe('string');

    const token = signToken();
    const { header } = jwt.decode(token, { complete: true })!;
    expect(header.kid).toBe(key.kid);
  });
});

// ---------------------------------------------------------------------------------------------
describe('GET /auth/verify', () => {
  it('no longer exists: 404', async () => {
    const res = await api()
      .get('/auth/verify')
      .set('Authorization', `Bearer ${signToken()}`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------------------------
describe('POST /auth/verify-otp', () => {
  describe('registration', () => {
    it('correct OTP: 200 REGISTER_SUCCESS, user active, OTP consumed, no tokens issued', async () => {
      const user = await registerPending(1);
      const res = await post('/auth/verify-otp')
        .set('Cookie', pendingCookie(user.pendingToken))
        .send({
          email: user.email,
          otp: latestOtpFor(user.email),
          purpose: 'registration',
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        message: 'Registration complete. You can now log in.',
        code: 'REGISTER_SUCCESS',
      });
      expect((await getUserByEmail(user.email))!.status).toBe('active');
      expect((await getOtps(user.id))[0]!.consumed_at).not.toBeNull();
    });

    it('clears the pendingToken cookie on success', async () => {
      const user = await registerPending(1);
      const res = await post('/auth/verify-otp')
        .set('Cookie', pendingCookie(user.pendingToken))
        .send({
          email: user.email,
          otp: latestOtpFor(user.email),
          purpose: 'registration',
        });
      expect(res.status).toBe(200);
      const raw = res.headers['set-cookie'] as unknown as string[] | string;
      const list = Array.isArray(raw) ? raw : [raw];
      const cleared = list.find((c) => c.startsWith('pendingToken='));
      expect(cleared).toBeDefined();
      expect(cleared).toMatch(/pendingToken=;/);
    });

    it('login works once the account is active', async () => {
      const user = await createActiveUser(1);
      expect((await loginUser(user)).status).toBe(200);
    });

    it('matches the email trimmed and case-insensitively', async () => {
      const user = await registerPending(1);
      const res = await post('/auth/verify-otp')
        .set('Cookie', pendingCookie(user.pendingToken))
        .send({
          email: '  USER1@Example.com ',
          otp: latestOtpFor(user.email),
          purpose: 'registration',
        });
      expect(res.status).toBe(200);
    });

    it('re-submitting the same (used) OTP: 400 INVALID_OTP', async () => {
      const user = await registerPending(1);
      const body = { email: user.email, otp: latestOtpFor(user.email), purpose: 'registration' };
      await post('/auth/verify-otp').set('Cookie', pendingCookie(user.pendingToken)).send(body);
      const res = await post('/auth/verify-otp')
        .set('Cookie', pendingCookie(user.pendingToken))
        .send(body);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'Invalid or expired OTP', code: 'INVALID_OTP' });
    });

    it('wrong OTP: 400 INVALID_OTP, and attempts_count is incremented and persisted', async () => {
      const user = await registerPending(1);
      const bad = wrongOtp(latestOtpFor(user.email));
      const res = await post('/auth/verify-otp')
        .set('Cookie', pendingCookie(user.pendingToken))
        .send({
          email: user.email,
          otp: bad,
          purpose: 'registration',
        });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'Invalid or expired OTP', code: 'INVALID_OTP' });
      expect((await getOtps(user.id))[0]!.attempts_count).toBe(1);
      expect((await getUserByEmail(user.email))!.status).toBe('pending');
    });

    it('4 wrong OTPs, then the 5th: 429 OTP_ATTEMPTS_EXCEEDED with Retry-After, and the correct one afterwards still 429 (account stays pending)', async () => {
      const user = await registerPending(1);
      const good = latestOtpFor(user.email);
      const bad = wrongOtp(good);
      for (let i = 0; i < 4; i++) {
        const r = await post('/auth/verify-otp')
          .set('Cookie', pendingCookie(user.pendingToken))
          .send({
            email: user.email,
            otp: bad,
            purpose: 'registration',
          });
        expect(r.status).toBe(400);
      }
      const fifth = await post('/auth/verify-otp')
        .set('Cookie', pendingCookie(user.pendingToken))
        .send({
          email: user.email,
          otp: bad,
          purpose: 'registration',
        });
      expect(fifth.status).toBe(429);
      expect(fifth.body.code).toBe('OTP_ATTEMPTS_EXCEEDED');
      expect(fifth.headers['retry-after']).toBeDefined();

      const res = await post('/auth/verify-otp')
        .set('Cookie', pendingCookie(user.pendingToken))
        .send({
          email: user.email,
          otp: good,
          purpose: 'registration',
        });

      expect(res.status).toBe(429);
      expect(res.body.code).toBe('OTP_ATTEMPTS_EXCEEDED');
      expect((await getUserByEmail(user.email))!.status).toBe('pending');
      expect((await getOtps(user.id))[0]!.attempts_count).toBe(5);
    });

    it('expired OTP with the correct code: 400 OTP_EXPIRED', async () => {
      const user = await registerPending(1);
      await expireOtps(user.id);
      const res = await post('/auth/verify-otp')
        .set('Cookie', pendingCookie(user.pendingToken))
        .send({
          email: user.email,
          otp: latestOtpFor(user.email),
          purpose: 'registration',
        });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        message: 'OTP has expired. Please request a new one.',
        code: 'OTP_EXPIRED',
      });
      expect((await getUserByEmail(user.email))!.status).toBe('pending');
    });

    it('after a resend the old OTP is invalid and the new one works', async () => {
      const user = await registerPending(1);
      const oldOtp = latestOtpFor(user.email);
      await backdateOtps(user.id, 2);
      const resend = await post('/auth/resend-otp')
        .set('Cookie', pendingCookie(user.pendingToken))
        .send({
          email: user.email,
          purpose: 'registration',
        });
      expect(resend.status).toBe(200);
      const newOtp = latestOtpFor(user.email);
      expect(newOtp).not.toBe(oldOtp);

      const old = await post('/auth/verify-otp')
        .set('Cookie', pendingCookie(user.pendingToken))
        .send({
          email: user.email,
          otp: oldOtp,
          purpose: 'registration',
        });
      expect(old.status).toBe(400);
      expect(old.body.code).toBe('INVALID_OTP');

      const fresh = await post('/auth/verify-otp')
        .set('Cookie', pendingCookie(user.pendingToken))
        .send({
          email: user.email,
          otp: newOtp,
          purpose: 'registration',
        });
      expect(fresh.status).toBe(200);
    });

    it.each(['12345', 'abcdef', '1234567', '12 456', ''])(
      'OTP %j: 400 VALIDATION_ERROR "OTP must be a 6-digit code"',
      async (otp) => {
        const user = await registerPending(1);
        const res = await post('/auth/verify-otp')
          .set('Cookie', pendingCookie(user.pendingToken))
          .send({
            email: user.email,
            otp,
            purpose: 'registration',
          });
        expect(res.status).toBe(400);
        expect(res.body).toEqual({
          message: 'OTP must be a 6-digit code',
          code: 'VALIDATION_ERROR',
        });
        expect((await getOtps(user.id))[0]!.attempts_count).toBe(0);
      },
    );

    it('unknown email: 400 INVALID_OTP', async () => {
      const res = await post('/auth/verify-otp').send({
        email: 'ghost@example.com',
        otp: '123456',
        purpose: 'registration',
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_OTP');
    });

    it('already-active email: 400 INVALID_OTP', async () => {
      const user = await createActiveUser(1);
      const res = await post('/auth/verify-otp')
        .set('Cookie', pendingCookie(user.pendingToken))
        .send({
          email: user.email,
          otp: '123456',
          purpose: 'registration',
        });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_OTP');
    });

    // Bug fix coverage: the pendingToken cookie must belong to the account named by `email`.
    describe('EMAIL_MISMATCH (bug fix)', () => {
      it("account A's pendingToken + account B's email: 403 EMAIL_MISMATCH, B stays pending", async () => {
        const a = await registerPending(1);
        const b = await registerPending(2);
        const res = await post('/auth/verify-otp')
          .set('Cookie', pendingCookie(a.pendingToken))
          .send({
            email: b.email,
            otp: latestOtpFor(b.email),
            purpose: 'registration',
          });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('EMAIL_MISMATCH');
        expect((await getUserById(b.id))!.status).toBe('pending');
      });

      it("account A's pendingToken + account B's email and B's real OTP: still 403 EMAIL_MISMATCH, B not activated", async () => {
        const a = await registerPending(1);
        const b = await registerPending(2);
        const res = await post('/auth/verify-otp')
          .set('Cookie', pendingCookie(a.pendingToken))
          .send({
            email: b.email,
            otp: latestOtpFor(b.email),
            purpose: 'registration',
          });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('EMAIL_MISMATCH');
        expect((await getUserById(b.id))!.status).toBe('pending');
      });

      it("account A's own pendingToken + A's own email + A's real OTP: succeeds normally", async () => {
        const a = await registerPending(1);
        const res = await post('/auth/verify-otp')
          .set('Cookie', pendingCookie(a.pendingToken))
          .send({
            email: a.email,
            otp: latestOtpFor(a.email),
            purpose: 'registration',
          });
        expect(res.status).toBe(200);
        expect(res.body.code).toBe('REGISTER_SUCCESS');
        expect((await getUserById(a.id))!.status).toBe('active');
      });

      it('no pendingToken cookie at all, for a real pending account: 403 EMAIL_MISMATCH', async () => {
        const a = await registerPending(1);
        const res = await post('/auth/verify-otp').send({
          email: a.email,
          otp: latestOtpFor(a.email),
          purpose: 'registration',
        });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('EMAIL_MISMATCH');
        expect((await getUserById(a.id))!.status).toBe('pending');
      });

      it('a malformed pendingToken cookie: 403 EMAIL_MISMATCH', async () => {
        const a = await registerPending(1);
        const res = await post('/auth/verify-otp')
          .set('Cookie', pendingCookie('garbage'))
          .send({
            email: a.email,
            otp: latestOtpFor(a.email),
            purpose: 'registration',
          });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('EMAIL_MISMATCH');
        expect((await getUserById(a.id))!.status).toBe('pending');
      });
    });
  });

  describe('request body validation', () => {
    const valid = { email: 'a@example.com', otp: '123456', purpose: 'registration' };

    it('missing otp: "OTP is required"', async () => {
      const res = await post('/auth/verify-otp').send(omit(valid, 'otp'));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'OTP is required', code: 'VALIDATION_ERROR' });
    });

    it('numeric otp: "OTP must be a string"', async () => {
      const res = await post('/auth/verify-otp').send({ ...valid, otp: 123456 });
      expect(res.body).toEqual({ message: 'OTP must be a string', code: 'VALIDATION_ERROR' });
    });

    it('missing / non-string email use the shared email messages', async () => {
      expect((await post('/auth/verify-otp').send(omit(valid, 'email'))).body.message).toBe(
        'Email is required',
      );
      expect((await post('/auth/verify-otp').send({ ...valid, email: 5 })).body.message).toBe(
        'Email must be a string',
      );
    });

    it('missing purpose: "Purpose is required"; non-string: "Purpose must be a string"', async () => {
      expect((await post('/auth/verify-otp').send(omit(valid, 'purpose'))).body.message).toBe(
        'Purpose is required',
      );
      expect((await post('/auth/verify-otp').send({ ...valid, purpose: 7 })).body.message).toBe(
        'Purpose must be a string',
      );
    });

    it.each(['forgot password', 'Registration', 'change_email', 'admin_action', ''])(
      'purpose %j: "Invalid purpose"',
      async (purpose) => {
        const res = await post('/auth/verify-otp').send({ ...valid, purpose });
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ message: 'Invalid purpose', code: 'VALIDATION_ERROR' });
      },
    );

    it('extra field: "Request contains unexpected fields"', async () => {
      const res = await post('/auth/verify-otp').send({ ...valid, extra: 1 });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        message: 'Request contains unexpected fields',
        code: 'VALIDATION_ERROR',
      });
    });
  });

  describe('forgot_password', () => {
    async function withForgotOtp() {
      const user = await createActiveUser(1);
      const r = await post('/auth/forgot-password').send({ email: user.email });
      expect(r.status).toBe(200);
      return { user, otp: latestOtpFor(user.email) };
    }
    const verify = (email: string, otp: string) =>
      post('/auth/verify-otp').send({ email, otp, purpose: 'forgot_password' });

    it('correct OTP: 200 OTP_VERIFIED, and the OTP row stays unconsumed', async () => {
      const { user, otp } = await withForgotOtp();
      const res = await verify(user.email, otp);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        message: 'Code verified. You can now set a new password.',
        code: 'OTP_VERIFIED',
      });
      expect((await getOtps(user.id, 'Forgot Password'))[0]!.consumed_at).toBeNull();
    });

    it('re-submitting the same correct OTP is still 200 (verify does not consume it)', async () => {
      const { user, otp } = await withForgotOtp();
      expect((await verify(user.email, otp)).status).toBe(200);
      expect((await verify(user.email, otp)).status).toBe(200);
    });

    it('changes no state: password and sessions are untouched', async () => {
      const { user, otp } = await withForgotOtp();
      const before = (await getUserByEmail(user.email))!.password_hash;
      await verify(user.email, otp);
      expect((await getUserByEmail(user.email))!.password_hash).toBe(before);
    });

    it('wrong OTP: 400 INVALID_OTP, attempts incremented and persisted', async () => {
      const { user, otp } = await withForgotOtp();
      const res = await verify(user.email, wrongOtp(otp));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'Invalid or expired OTP', code: 'INVALID_OTP' });
      expect((await getOtps(user.id, 'Forgot Password'))[0]!.attempts_count).toBe(1);
    });

    it('4 wrong OTPs: 400 each; the 5th: 429 OTP_ATTEMPTS_EXCEEDED; the correct one afterwards still 429', async () => {
      const { user, otp } = await withForgotOtp();
      for (let i = 0; i < 4; i++)
        expect((await verify(user.email, wrongOtp(otp))).status).toBe(400);
      const fifth = await verify(user.email, wrongOtp(otp));
      expect(fifth.status).toBe(429);
      expect(fifth.body.code).toBe('OTP_ATTEMPTS_EXCEEDED');
      expect(fifth.headers['retry-after']).toBeDefined();

      const res = await verify(user.email, otp);
      expect(res.status).toBe(429);
      expect(res.body.code).toBe('OTP_ATTEMPTS_EXCEEDED');
    });

    it('expired OTP with the correct code: 400 OTP_EXPIRED', async () => {
      const { user, otp } = await withForgotOtp();
      await expireOtps(user.id);
      const res = await verify(user.email, otp);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('OTP_EXPIRED');
    });

    it('unknown email: 404 EMAIL_NOT_FOUND', async () => {
      const res = await verify('ghost@example.com', '123456');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'Email not found', code: 'EMAIL_NOT_FOUND' });
    });

    it('pending (unverified) registration: 403 ACCOUNT_NOT_VERIFIED', async () => {
      const user = await registerPending(1);
      const res = await verify(user.email, latestOtpFor(user.email));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ACCOUNT_NOT_VERIFIED');
    });

    it('a suspended account is allowed', async () => {
      const { user, otp } = await withForgotOtp();
      await setUserStatus(user.id, 'suspended');
      expect((await verify(user.email, otp)).status).toBe(200);
    });

    it('a user with no forgot-password OTP: 400 INVALID_OTP', async () => {
      const user = await createActiveUser(1);
      const res = await verify(user.email, '123456');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_OTP');
    });

    it('otp not 6 digits: 400 VALIDATION_ERROR', async () => {
      const { user } = await withForgotOtp();
      const res = await verify(user.email, '12ab');
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('OTP must be a 6-digit code');
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe('POST /auth/resend-otp', () => {
  const resend = (email: string, purpose = 'registration') =>
    post('/auth/resend-otp').send({ email, purpose });
  // Registration resends now require the pendingToken cookie; this mirrors `resend` above but
  // attaches it, for the 'registration' describe block below.
  const resendPending = (email: string, pendingToken: string) =>
    post('/auth/resend-otp').set('Cookie', pendingCookie(pendingToken)).send({
      email,
      purpose: 'registration',
    });
  const RESENDS_OK = {
    message: 'A new verification code has been sent to your email',
    code: 'OTP_SENT',
  };

  describe('registration', () => {
    it('immediately after registering: 429 OTP_RESEND_COOLDOWN with a Retry-After header', async () => {
      const user = await registerPending(1);
      const res = await resendPending(user.email, user.pendingToken);
      expect(res.status).toBe(429);
      expect(res.body).toEqual({
        message: 'Please wait before requesting another OTP',
        code: 'OTP_RESEND_COOLDOWN',
      });
      const retry = Number(res.headers['retry-after']);
      expect(retry).toBeGreaterThan(0);
      expect(retry).toBeLessThanOrEqual(60);
      expect(await getOtps(user.id)).toHaveLength(1);
    });

    it('after the cooldown: 200 OTP_SENT, previous OTP consumed, new email sent', async () => {
      const user = await registerPending(1);
      await backdateOtps(user.id, 2);
      sendOtpEmailMock.mockClear();

      const res = await resendPending(user.email, user.pendingToken);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(RESENDS_OK);
      const otps = await getOtps(user.id);
      expect(otps).toHaveLength(2);
      expect(otps[0]!.consumed_at).not.toBeNull();
      expect(otps[1]!.consumed_at).toBeNull();
      expect(emailCallsFor(user.email)).toHaveLength(1);
    });

    it('allows 5 resends, then the 6th gets 429 OTP_RESEND_LIMIT (no Retry-After)', async () => {
      const user = await registerPending(1);
      for (let i = 0; i < 5; i++) {
        await backdateOtps(user.id, 2);
        expect((await resendPending(user.email, user.pendingToken)).status).toBe(200);
      }
      await backdateOtps(user.id, 2);

      const res = await resendPending(user.email, user.pendingToken);

      expect(res.status).toBe(429);
      expect(res.body).toEqual({
        message: 'Maximum OTP resends reached. Please try registering again in about 10 minutes.',
        code: 'OTP_RESEND_LIMIT',
      });
      expect(res.headers['retry-after']).toBeUndefined();
      expect(await getOtps(user.id)).toHaveLength(6);
    });

    it('at the limit, OTP_RESEND_LIMIT is reported even inside the cooldown', async () => {
      const user = await registerPending(1);
      for (let i = 0; i < 5; i++) {
        await backdateOtps(user.id, 2);
        await resendPending(user.email, user.pendingToken);
      }
      const res = await resendPending(user.email, user.pendingToken); // no backdate: cooldown would also apply
      expect(res.body.code).toBe('OTP_RESEND_LIMIT');
    });

    it('counts all OTP rows however old (registration is not a rolling window)', async () => {
      const user = await registerPending(1);
      for (let i = 0; i < 5; i++) {
        await backdateOtps(user.id, 2);
        await resendPending(user.email, user.pendingToken);
      }
      await backdateOtps(user.id, 60 * 5);
      const res = await resendPending(user.email, user.pendingToken);
      expect(res.status).toBe(429);
      expect(res.body.code).toBe('OTP_RESEND_LIMIT');
    });

    it('unknown email: 400 NO_PENDING_REGISTRATION', async () => {
      const res = await resend('ghost@example.com');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        message: 'No pending registration found',
        code: 'NO_PENDING_REGISTRATION',
      });
    });

    it('already-active account: 400 NO_PENDING_REGISTRATION', async () => {
      const user = await createActiveUser(1);
      const res = await resend(user.email);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('NO_PENDING_REGISTRATION');
    });

    it('when the send fails: 503 EMAIL_SEND_FAILED and the previous OTP is still valid', async () => {
      const user = await registerPending(1);
      const original = latestOtpFor(user.email);
      await backdateOtps(user.id, 2);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      failNextEmail();

      const res = await resendPending(user.email, user.pendingToken);

      expect(res.status).toBe(503);
      expect(res.body.code).toBe('EMAIL_SEND_FAILED');
      const otps = await getOtps(user.id);
      expect(otps).toHaveLength(1);
      expect(otps[0]!.consumed_at).toBeNull();

      const verify = await post('/auth/verify-otp')
        .set('Cookie', pendingCookie(user.pendingToken))
        .send({
          email: user.email,
          otp: original,
          purpose: 'registration',
        });
      expect(verify.status).toBe(200);
    });

    // Bug fix coverage: a resend also requires the pendingToken cookie to match the account
    // named by `email`, and a mismatch must not touch B's resend cooldown/count at all.
    describe('EMAIL_MISMATCH (bug fix)', () => {
      it("account A's pendingToken + account B's email: 403 EMAIL_MISMATCH, no OTP issued for B, B's resend state untouched", async () => {
        const a = await registerPending(1);
        const b = await registerPending(2);
        await backdateOtps(b.id, 2); // clear of B's own cooldown, to isolate the mismatch check
        const otpsBefore = await getOtps(b.id);

        const res = await resendPending(b.email, a.pendingToken);

        expect(res.status).toBe(403);
        expect(res.body.code).toBe('EMAIL_MISMATCH');
        expect(await getOtps(b.id)).toEqual(otpsBefore);
      });
    });
  });

  describe('forgot_password', () => {
    const resendForgot = (email: string) => resend(email, 'forgot_password');

    it('immediately after forgot-password: 429 OTP_RESEND_COOLDOWN with Retry-After', async () => {
      const user = await createActiveUser(1);
      await post('/auth/forgot-password').send({ email: user.email });
      const res = await resendForgot(user.email);
      expect(res.status).toBe(429);
      expect(res.body.code).toBe('OTP_RESEND_COOLDOWN');
      const retry = Number(res.headers['retry-after']);
      expect(retry).toBeGreaterThan(0);
      expect(retry).toBeLessThanOrEqual(60);
    });

    it('after the cooldown: 200 OTP_SENT and the previous OTP is consumed', async () => {
      const user = await createActiveUser(1);
      await post('/auth/forgot-password').send({ email: user.email });
      await backdateOtps(user.id, 2, 'Forgot Password');

      const res = await resendForgot(user.email);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(RESENDS_OK);
      const otps = await getOtps(user.id, 'Forgot Password');
      expect(otps).toHaveLength(2);
      expect(otps[0]!.consumed_at).not.toBeNull();
      expect(otps[1]!.consumed_at).toBeNull();
    });

    it('works as the first request too (no prior forgot-password call)', async () => {
      const user = await createActiveUser(1);
      const res = await resendForgot(user.email);
      expect(res.status).toBe(200);
      expect(emailCallsFor(user.email).at(-1)!.purpose).toBe('Forgot Password');
    });

    it('after 5 successful resends inside the window, the next one gets 429 OTP_RESEND_LIMIT (try again in about an hour)', async () => {
      const user = await createActiveUser(1);
      await post('/auth/forgot-password').send({ email: user.email });
      for (let i = 0; i < 5; i++) {
        await backdateOtps(user.id, 2, 'Forgot Password');
        expect((await resendForgot(user.email)).status).toBe(200);
      }
      await backdateOtps(user.id, 2, 'Forgot Password');
      sendOtpEmailMock.mockClear();

      const res = await resendForgot(user.email);

      expect(res.status).toBe(429);
      expect(res.body).toEqual({
        message: 'Maximum OTP resends reached. Please try again in about an hour.',
        code: 'OTP_RESEND_LIMIT',
      });
      // Stage 18c: the cap hit now also carries an escalating send block, reported here as an
      // exact Retry-After.
      expect(res.headers['retry-after']).toBe('3600');
      expect(await getOtps(user.id, 'Forgot Password')).toHaveLength(6);
      expect(sendOtpEmailMock).not.toHaveBeenCalled();
    });

    it('the limit is not permanent once both the rolling window and the Stage 18c send block have passed', async () => {
      const user = await createActiveUser(1);
      await post('/auth/forgot-password').send({ email: user.email });
      for (let i = 0; i < 5; i++) {
        await backdateOtps(user.id, 2, 'Forgot Password');
        await resendForgot(user.email);
      }
      await backdateOtps(user.id, 2, 'Forgot Password');
      expect((await resendForgot(user.email)).body.code).toBe('OTP_RESEND_LIMIT');

      // The rolling window excludes the old rows, but the escalating send block (1h) is a
      // separate, longer-lived gate; expire it directly so this isolates the window's effect.
      await backdateOtps(user.id, 61, 'Forgot Password');
      await setOtpSendBlock(user.id, 'Forgot Password', { level: 1, blockedUntilMinutesFromNow: -1 });
      expect((await resendForgot(user.email)).status).toBe(200);
    });

    it('unregistered email: 404 EMAIL_NOT_FOUND, no row created', async () => {
      const res = await resendForgot('ghost@example.com');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'Email not found', code: 'EMAIL_NOT_FOUND' });
      expect(sendOtpEmailMock).not.toHaveBeenCalled();
    });

    it('still-pending registration: 403 ACCOUNT_NOT_VERIFIED, no Forgot Password OTP row', async () => {
      const user = await registerPending(1);
      const res = await resendForgot(user.email);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ACCOUNT_NOT_VERIFIED');
      expect(await getOtps(user.id, 'Forgot Password')).toHaveLength(0);
    });

    it('a failed send: 503 EMAIL_SEND_FAILED, previous OTP still valid', async () => {
      const user = await createActiveUser(1);
      await post('/auth/forgot-password').send({ email: user.email });
      await backdateOtps(user.id, 2, 'Forgot Password');
      vi.spyOn(console, 'error').mockImplementation(() => {});
      failNextEmail();
      const res = await resendForgot(user.email);
      expect(res.status).toBe(503);
      const otps = await getOtps(user.id, 'Forgot Password');
      expect(otps).toHaveLength(1);
      expect(otps[0]!.consumed_at).toBeNull();
    });
  });

  describe('request body validation', () => {
    it.each([
      [{ purpose: 'registration' }, 'Email is required'],
      [{ email: 1, purpose: 'registration' }, 'Email must be a string'],
      [{ email: 'a@example.com' }, 'Purpose is required'],
      [{ email: 'a@example.com', purpose: 3 }, 'Purpose must be a string'],
      [{ email: 'a@example.com', purpose: 'forgot password' }, 'Invalid purpose'],
      [
        { email: 'a@example.com', purpose: 'registration', otp: '123456' },
        'Request contains unexpected fields',
      ],
    ])('%j: 400 %s', async (body, message) => {
      const res = await post('/auth/resend-otp').send(body);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message, code: 'VALIDATION_ERROR' });
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe('POST /auth/forgot-password', () => {
  const forgot = (email: string) => post('/auth/forgot-password').send({ email });

  it('registered email: 200 OTP_SENT, one Forgot Password OTP row, code emailed to that address', async () => {
    const user = await createActiveUser(1);
    sendOtpEmailMock.mockClear();

    const res = await forgot(user.email);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: 'A reset code has been sent to your email',
      code: 'OTP_SENT',
    });
    const otps = await getOtps(user.id, 'Forgot Password');
    expect(otps).toHaveLength(1);
    expect(otps[0]!.otp_hash).toBe(sha256(latestOtpFor(user.email)));
    expect(emailCallsFor(user.email)[0]!.purpose).toBe('Forgot Password');
  });

  it('matches the email trimmed and case-insensitively', async () => {
    const user = await createActiveUser(1);
    const res = await forgot('  USER1@Example.COM ');
    expect(res.status).toBe(200);
    expect(await getOtps(user.id, 'Forgot Password')).toHaveLength(1);
  });

  it('a second request straight away: 429 OTP_RESEND_COOLDOWN with Retry-After; first OTP still valid', async () => {
    const user = await createActiveUser(1);
    await forgot(user.email);
    const first = latestOtpFor(user.email);

    const res = await forgot(user.email);

    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      message: 'Please wait before requesting another OTP',
      code: 'OTP_RESEND_COOLDOWN',
    });
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(await getOtps(user.id, 'Forgot Password')).toHaveLength(1);

    const verify = await post('/auth/verify-otp').send({
      email: user.email,
      otp: first,
      purpose: 'forgot_password',
    });
    expect(verify.status).toBe(200);
  });

  it('at the resend limit: 429 OTP_RESEND_LIMIT ("about an hour"), no new row, no email', async () => {
    const user = await createActiveUser(1);
    for (let i = 0; i < 6; i++) {
      expect((await forgot(user.email)).status).toBe(200);
      await backdateOtps(user.id, 2, 'Forgot Password');
    }
    sendOtpEmailMock.mockClear();

    const res = await forgot(user.email);

    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      message: 'Maximum OTP resends reached. Please try again in about an hour.',
      code: 'OTP_RESEND_LIMIT',
    });
    // Stage 18c: the cap hit now also carries an escalating send block, reported here as an
    // exact Retry-After.
    expect(res.headers['retry-after']).toBe('3600');
    expect(await getOtps(user.id, 'Forgot Password')).toHaveLength(6);
    expect(sendOtpEmailMock).not.toHaveBeenCalled();
  });

  it('unregistered email: 404 EMAIL_NOT_FOUND, no OTP row, no email', async () => {
    const res = await forgot('ghost@example.com');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Email not found', code: 'EMAIL_NOT_FOUND' });
    expect(sendOtpEmailMock).not.toHaveBeenCalled();
    const c = await import('../../src/db/pool.js').then((m) =>
      m.default.query('SELECT COUNT(*) AS c FROM users_otps'),
    );
    expect(Number(c.rows[0].c)).toBe(0);
  });

  it('still-pending registration: 403 ACCOUNT_NOT_VERIFIED, no Forgot Password OTP row', async () => {
    const user = await registerPending(1);
    const res = await forgot(user.email);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      message: 'Account not verified. Please finish registration first.',
      code: 'ACCOUNT_NOT_VERIFIED',
    });
    expect(await getOtps(user.id, 'Forgot Password')).toHaveLength(0);
  });

  it('a suspended account can request a reset code', async () => {
    const user = await createActiveUser(1);
    await setUserStatus(user.id, 'suspended');
    expect((await forgot(user.email)).status).toBe(200);
  });

  it('a failed email send: 503 EMAIL_SEND_FAILED and no OTP row is left', async () => {
    const user = await createActiveUser(1);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    failNextEmail();
    const res = await forgot(user.email);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('EMAIL_SEND_FAILED');
    expect(await getOtps(user.id, 'Forgot Password')).toHaveLength(0);
  });

  it('missing email: "Email is required"; non-string: "Email must be a string"', async () => {
    expect((await post('/auth/forgot-password').send({})).body).toEqual({
      message: 'Email is required',
      code: 'VALIDATION_ERROR',
    });
    expect((await post('/auth/forgot-password').send({ email: 42 })).body).toEqual({
      message: 'Email must be a string',
      code: 'VALIDATION_ERROR',
    });
  });

  it('extra field: "Request contains unexpected fields"', async () => {
    const res = await post('/auth/forgot-password').send({ email: 'a@example.com', purpose: 'x' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      message: 'Request contains unexpected fields',
      code: 'VALIDATION_ERROR',
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe('POST /auth/reset-password', () => {
  const reset = (email: string, otp: string, newPassword = NEW_PASSWORD) =>
    post('/auth/reset-password').send({ email, otp, newPassword });

  async function withForgotOtp(n = 1) {
    const user = await createActiveUser(n);
    expect((await post('/auth/forgot-password').send({ email: user.email })).status).toBe(200);
    return { user, otp: latestOtpFor(user.email) };
  }

  describe('happy path', () => {
    it('200 PASSWORD_RESET_SUCCESS: hash changed, OTP consumed', async () => {
      const { user, otp } = await withForgotOtp();
      const before = (await getUserByEmail(user.email))!.password_hash;

      const res = await reset(user.email, otp);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        message: 'Password reset successful. Please log in with your new password.',
        code: 'PASSWORD_RESET_SUCCESS',
      });
      const after = (await getUserByEmail(user.email))!;
      expect(after.password_hash).not.toBe(before);
      expect(await bcrypt.compare(NEW_PASSWORD, after.password_hash)).toBe(true);
      expect((await getOtps(user.id, 'Forgot Password'))[0]!.consumed_at).not.toBeNull();
    });

    it('revokes all of the user’s refresh tokens (logs out everywhere), and only theirs', async () => {
      const { user, otp } = await withForgotOtp(1);
      const other = await createActiveUser(2);
      const a = await loginTokens(user);
      const b = await loginTokens(user);
      const otherSession = await loginTokens(other);

      await reset(user.email, otp);

      const rows = await getRefreshTokens(user.id);
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.is_revoked && r.revoked_at)).toBe(true);
      expect(
        (await post('/auth/refresh').set('Cookie', refreshCookie(a.refreshToken))).status,
      ).toBe(401);
      expect(
        (await post('/auth/refresh').set('Cookie', refreshCookie(b.refreshToken))).status,
      ).toBe(401);
      expect((await getRefreshTokenByPlain(otherSession.refreshToken))!.is_revoked).toBe(false);
    });

    it('login with the new password works; the old password is rejected', async () => {
      const { user, otp } = await withForgotOtp();
      await reset(user.email, otp);

      expect((await loginUser(user, NEW_PASSWORD)).status).toBe(200);
      const old = await loginUser(user, PASSWORD);
      expect(old.status).toBe(401);
      expect(old.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('an access token issued before the reset stays valid until it expires (only refresh tokens are revoked)', async () => {
      const { user, otp } = await withForgotOtp();
      const { accessToken } = await loginTokens(user);
      await reset(user.email, otp);
      const res = await api()
        .get('/users/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
    });

    it('works directly, without calling verify-otp first', async () => {
      const { user, otp } = await withForgotOtp();
      expect((await reset(user.email, otp)).status).toBe(200);
    });

    it('also works after verify-otp has been called', async () => {
      const { user, otp } = await withForgotOtp();
      await post('/auth/verify-otp').send({ email: user.email, otp, purpose: 'forgot_password' });
      expect((await reset(user.email, otp)).status).toBe(200);
    });

    it('a suspended account can reset its password and stays suspended', async () => {
      const { user, otp } = await withForgotOtp();
      await setUserStatus(user.id, 'suspended');
      expect((await reset(user.email, otp)).status).toBe(200);
      expect((await getUserByEmail(user.email))!.status).toBe('suspended');
    });

    it('matches the email trimmed and case-insensitively', async () => {
      const { otp } = await withForgotOtp();
      expect((await reset(' USER1@example.com ', otp)).status).toBe(200);
    });
  });

  describe('OTP rules', () => {
    it('wrong OTP: 400 INVALID_OTP, attempt incremented and persisted, password unchanged', async () => {
      const { user, otp } = await withForgotOtp();
      const before = (await getUserByEmail(user.email))!.password_hash;

      const res = await reset(user.email, wrongOtp(otp));

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'Invalid or expired OTP', code: 'INVALID_OTP' });
      expect((await getOtps(user.id, 'Forgot Password'))[0]!.attempts_count).toBe(1);
      expect((await getUserByEmail(user.email))!.password_hash).toBe(before);
    });

    it('a wrong OTP does not revoke sessions', async () => {
      const { user, otp } = await withForgotOtp();
      const { refreshToken } = await loginTokens(user);
      await reset(user.email, wrongOtp(otp));
      expect((await getRefreshTokenByPlain(refreshToken))!.is_revoked).toBe(false);
    });

    it('4 wrong OTPs, then the 5th: 429 OTP_ATTEMPTS_EXCEEDED; the correct one afterwards still 429, password unchanged', async () => {
      const { user, otp } = await withForgotOtp();
      const before = (await getUserByEmail(user.email))!.password_hash;
      for (let i = 0; i < 4; i++) expect((await reset(user.email, wrongOtp(otp))).status).toBe(400);

      const fifth = await reset(user.email, wrongOtp(otp));
      expect(fifth.status).toBe(429);
      expect(fifth.body.code).toBe('OTP_ATTEMPTS_EXCEEDED');
      expect(fifth.headers['retry-after']).toBeDefined();

      const res = await reset(user.email, otp);

      expect(res.status).toBe(429);
      expect(res.body.code).toBe('OTP_ATTEMPTS_EXCEEDED');
      expect((await getUserByEmail(user.email))!.password_hash).toBe(before);
    });

    it('expired OTP with the correct code: 400 OTP_EXPIRED', async () => {
      const { user, otp } = await withForgotOtp();
      await expireOtps(user.id);
      const res = await reset(user.email, otp);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('OTP_EXPIRED');
    });

    it('re-using a consumed OTP: 400 INVALID_OTP', async () => {
      const { user, otp } = await withForgotOtp();
      expect((await reset(user.email, otp)).status).toBe(200);
      const res = await reset(user.email, otp, 'An0ther!Passw0rd');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_OTP');
      expect(
        await bcrypt.compare(NEW_PASSWORD, (await getUserByEmail(user.email))!.password_hash),
      ).toBe(true);
    });

    it('after a resend, the old code no longer resets the password', async () => {
      const { user, otp: oldOtp } = await withForgotOtp();
      await backdateOtps(user.id, 2, 'Forgot Password');
      await post('/auth/resend-otp').send({ email: user.email, purpose: 'forgot_password' });
      const res = await reset(user.email, oldOtp);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_OTP');
    });

    it('unknown email: 404 EMAIL_NOT_FOUND', async () => {
      const res = await reset('ghost@example.com', '123456');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'Email not found', code: 'EMAIL_NOT_FOUND' });
    });

    it('still-pending registration: 403 ACCOUNT_NOT_VERIFIED', async () => {
      const user = await registerPending(1);
      const res = await reset(user.email, latestOtpFor(user.email));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ACCOUNT_NOT_VERIFIED');
    });

    it('a registration OTP cannot be used to reset a password', async () => {
      const user = await createActiveUser(1);
      const res = await reset(user.email, '123456');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_OTP');
    });
  });

  describe('validation', () => {
    it('weak newPassword: 400 VALIDATION_ERROR with the standard message, OTP untouched', async () => {
      const { user, otp } = await withForgotOtp();
      const res = await reset(user.email, otp, 'weak');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: PASSWORD_MESSAGE, code: 'VALIDATION_ERROR' });
      const [row] = await getOtps(user.id, 'Forgot Password');
      expect(row!.consumed_at).toBeNull();
      expect(row!.attempts_count).toBe(0);
    });

    it.each(['12345', 'abcdef', '1234567'])(
      'otp %j: 400 "OTP must be a 6-digit code"',
      async (otp) => {
        const { user } = await withForgotOtp();
        const res = await reset(user.email, otp);
        expect(res.status).toBe(400);
        expect(res.body).toEqual({
          message: 'OTP must be a 6-digit code',
          code: 'VALIDATION_ERROR',
        });
      },
    );

    it.each([
      [{ otp: '123456', newPassword: NEW_PASSWORD }, 'Email is required'],
      [{ email: 'a@example.com', newPassword: NEW_PASSWORD }, 'OTP is required'],
      [{ email: 'a@example.com', otp: '123456' }, 'New password is required'],
      [{ email: 5, otp: '123456', newPassword: NEW_PASSWORD }, 'Email must be a string'],
      [{ email: 'a@example.com', otp: 123456, newPassword: NEW_PASSWORD }, 'OTP must be a string'],
      [
        { email: 'a@example.com', otp: '123456', newPassword: 12345678 },
        'New password must be a string',
      ],
      [
        { email: 'a@example.com', otp: '123456', newPassword: NEW_PASSWORD, password: 'x' },
        'Request contains unexpected fields',
      ],
    ])('%j: 400 %s', async (body, message) => {
      const res = await post('/auth/reset-password').send(body);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message, code: 'VALIDATION_ERROR' });
    });
  });
});

describe('POST /auth/unlock (Stage 31c)', () => {
  async function lockedUser(n = 1) {
    const user = await createActiveUser(n);
    await setLoginLockState(user.id, { lockLevel: 1, lockedUntilMinutesFromNow: 60 });
    const row = (await getUserById(user.id))!;
    const token = signTestUnlockToken({ sub: user.id, lck: Math.floor(row.login_locked_until!.getTime() / 1000) });
    return { user, token };
  }

  it('a valid token: 200 UNLOCKED, and the user can then log in', async () => {
    const { user, token } = await lockedUser(1);
    const res = await post('/auth/unlock').send({ token });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Your account has been unlocked', code: 'UNLOCKED' });
    expect((await loginUser(user, PASSWORD)).status).toBe(200);
  });

  it('the same token used again: 200 ALREADY_UNLOCKED', async () => {
    const { token } = await lockedUser(1);
    await post('/auth/unlock').send({ token });
    const res = await post('/auth/unlock').send({ token });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Your account is no longer locked', code: 'ALREADY_UNLOCKED' });
  });

  it('a malformed, tampered, or expired token: 401 INVALID_UNLOCK_TOKEN', async () => {
    const malformed = await post('/auth/unlock').send({ token: 'not-a-jwt' });
    expect(malformed.status).toBe(401);
    expect(malformed.body).toEqual({ message: 'This link is invalid or has expired', code: 'INVALID_UNLOCK_TOKEN' });

    const { token } = await lockedUser(2);
    const tampered = await post('/auth/unlock').send({ token: tamperSignature(token) });
    expect(tampered.status).toBe(401);
    expect(tampered.body.code).toBe('INVALID_UNLOCK_TOKEN');

    // Wrong typ (an access token).
    const atToken = signToken();
    const wrongType = await post('/auth/unlock').send({ token: atToken });
    expect(wrongType.status).toBe(401);
    expect(wrongType.body.code).toBe('INVALID_UNLOCK_TOKEN');
  });

  it('works without an Authorization header, and ignores one that is present', async () => {
    const { token } = await lockedUser(1);
    const withAuth = await post('/auth/unlock')
      .set('Authorization', 'Bearer not-a-real-token')
      .send({ token });
    expect(withAuth.status).toBe(200);
    expect(withAuth.body.code).toBe('UNLOCKED');
  });

  it('a locked super admin can unlock via the link', async () => {
    const sa = await createUserWithRole(1, 'super admin');
    await setLoginLockState(sa.id, { lockLevel: 1, lockedUntilMinutesFromNow: 60 });
    const row = (await getUserById(sa.id))!;
    const token = signTestUnlockToken({ sub: sa.id, lck: Math.floor(row.login_locked_until!.getTime() / 1000) });
    const res = await post('/auth/unlock').send({ token });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe('UNLOCKED');
  });

  it('writes no audit row', async () => {
    const { user, token } = await lockedUser(1);
    await post('/auth/unlock').send({ token });
    expect(await getAuditLogRowsForTarget(user.id)).toHaveLength(0);
  });

  it('admin POST /users/:id/unlock still requires auth and still audits (unchanged by this stage)', async () => {
    const admin = await createUserWithRole(2, 'admin');
    const { accessToken } = await loginTokens(admin);
    const { user } = await lockedUser(3);

    const noAuth = await api().post(`/users/${user.id}/unlock`);
    expect(noAuth.status).toBe(401);

    const res = await api()
      .post(`/users/${user.id}/unlock`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(await getAuditLogRowsForTarget(user.id)).toHaveLength(1);
  });

  describe('validation', () => {
    it('missing token: 400 "Token is required"', async () => {
      const res = await post('/auth/unlock').send({});
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'Token is required', code: 'VALIDATION_ERROR' });
    });

    it('empty token: 400 "Token is required"', async () => {
      const res = await post('/auth/unlock').send({ token: '' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'Token is required', code: 'VALIDATION_ERROR' });
    });

    it('non-string token: 400 "Token must be a string"', async () => {
      const res = await post('/auth/unlock').send({ token: 12345 });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'Token must be a string', code: 'VALIDATION_ERROR' });
    });

    it('an unknown body key: 400 "Request contains unexpected fields"', async () => {
      const { token } = await lockedUser(1);
      const res = await post('/auth/unlock').send({ token, extra: 'x' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'Request contains unexpected fields', code: 'VALIDATION_ERROR' });
    });
  });
});
