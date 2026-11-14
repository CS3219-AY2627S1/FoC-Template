// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-26
// 26/09/2026: Stage 7 - concurrency suite: simultaneous requests against the real test DB
// Author review:
// 2026-11-04: Stage 18b - updated two pre-existing tests whose repeated wrong-password login
//   attempts now interact with the login lockout: "concurrent reset-password" accepts 429
//   ACCOUNT_LOCKED alongside 401 for a stale password, and "login racing reset-password"
//   additionally tolerates 429 mid-race and clears any lock between rounds so it cannot carry
//   over. No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// Tool: Claude Code (model: claude-fable-5-1), date: 2026-11-10
// Scope: Fix F2 - debugged the ECONNRESET / "socket hang up" flake; replaced per-call
//        `request(app)` supertest servers with the shared loopback server in
//        tests/helpers/server.ts (`api()`); the two background-worker loops now collect
//        their outcome with Promise.allSettled at start so a throwing worker fails the test
//        instead of becoming an unhandled rejection. No assertions, worker counts or iteration
//        counts changed. No requirements, architecture, schema, or API decisions were made by
//        the AI tool.
// Author review:
// Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-10
// Scope: Bug fix - the 'concurrent verify-otp' and the registration case of 'concurrent
//        resend-otp / forgot-password' now attach that test's own registerPending pendingToken
//        cookie (via the new pendingCookie fixture helper), since those endpoints now require
//        it. The forgot_password cases are untouched. No assertions, worker counts or iteration
//        counts changed. Governing decision: bug report + team decisions recorded in this
//        task's conversation (pending-token cookie mechanism). No requirements, architecture,
//        schema, or API decisions were made by the AI tool.
// Author review:
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api } from '../helpers/server.js';
import pool from '../../src/db/pool.js';
import {
  CONCURRENT_REQUESTS as N,
  LOOP_ITERATIONS,
  NEW_PASSWORD,
  PASSWORD,
} from '../helpers/constants.js';
import {
  backdateOtps,
  countUsers,
  getOtps,
  getRefreshTokens,
  getUserByEmail,
  seedOtp,
  seedRefreshToken,
  setLoginLockState,
  truncateAll,
} from '../helpers/db.js';
import { latestOtpFor, resetEmailMock } from '../helpers/email.js';
import {
  createActiveUser,
  loginTokens,
  loginUser,
  pendingCookie,
  refreshCookie,
  registerPending,
  userInput,
} from '../helpers/fixtures.js';

resetEmailMock();
beforeEach(truncateAll);
afterEach(truncateAll);

const post = (path: string) => api().post(path);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const statuses = (rs: { status: number }[]) => rs.map((r) => r.status).sort();

function expectOneWinner(
  rs: { status: number; body: { code?: string } }[],
  loserStatus: number,
  loserCode: string,
) {
  expect(rs.filter((r) => r.status === 500)).toHaveLength(0);
  expect(rs.filter((r) => r.status === 200 || r.status === 201)).toHaveLength(1);
  const losers = rs.filter((r) => r.status !== 200 && r.status !== 201);
  expect(losers).toHaveLength(rs.length - 1);
  for (const l of losers) {
    expect(l.status).toBe(loserStatus);
    expect(l.body.code).toBe(loserCode);
  }
}

// Background workers below are started, left running while the test does other things, and only
// awaited later. Their settlement is collected the moment they start (Promise.allSettled attaches
// the handler immediately), so a worker that throws - e.g. a transport error from a request -
// fails the test here with its message instead of surfacing as an unhandled rejection.
function expectAllFulfilled(outcomes: PromiseSettledResult<unknown>[]) {
  const failures = outcomes.filter((o): o is PromiseRejectedResult => o.status === 'rejected');
  expect(failures.map((f) => String(f.reason)), 'a background worker threw').toEqual([]);
}

describe('concurrent registration', () => {
  it('same username, different emails: one 201, the rest 409 USERNAME_TAKEN, never 500', async () => {
    const rs = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        post('/auth/register').send({ ...userInput(i), username: 'samename' }),
      ),
    );
    expectOneWinner(rs, 409, 'USERNAME_TAKEN');
    expect(await countUsers()).toBe(1);
  });

  it('same email, different usernames: one 201, the rest 409 EMAIL_TAKEN, never 500', async () => {
    const rs = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        post('/auth/register').send({ ...userInput(i), email: 'same@example.com' }),
      ),
    );
    expectOneWinner(rs, 409, 'EMAIL_TAKEN');
    expect(await countUsers()).toBe(1);
  });

  it('identical requests: one 201, the rest 409 (username or email taken), never 500', async () => {
    const rs = await Promise.all(
      Array.from({ length: N }, () => post('/auth/register').send(userInput(1))),
    );
    expect(rs.filter((r) => r.status === 500)).toHaveLength(0);
    expect(statuses(rs)).toEqual([201, ...Array(N - 1).fill(409)]);
    for (const r of rs.filter((x) => x.status === 409)) {
      expect(['USERNAME_TAKEN', 'EMAIL_TAKEN']).toContain(r.body.code);
    }
    expect(await countUsers()).toBe(1);
  });

  it('exactly one OTP row exists for the winner', async () => {
    await Promise.all(Array.from({ length: N }, () => post('/auth/register').send(userInput(1))));
    const user = (await getUserByEmail('user1@example.com'))!;
    expect(await getOtps(user.id)).toHaveLength(1);
  });
});

describe('concurrent verify-otp', () => {
  it('correct OTP sent N times at once: one 200, the rest 400 INVALID_OTP; user activated once', async () => {
    const user = await registerPending(1);
    const otp = latestOtpFor(user.email);

    const rs = await Promise.all(
      Array.from({ length: N }, () =>
        post('/auth/verify-otp')
          .set('Cookie', pendingCookie(user.pendingToken))
          .send({ email: user.email, otp, purpose: 'registration' }),
      ),
    );

    expectOneWinner(rs, 400, 'INVALID_OTP');
    expect((await getUserByEmail(user.email))!.status).toBe('active');
    const otps = await getOtps(user.id);
    expect(otps).toHaveLength(1);
    expect(otps[0]!.consumed_at).not.toBeNull();
  });

  it('wrong guesses at once are all counted (no lost increments)', async () => {
    const user = await registerPending(1);
    const good = latestOtpFor(user.email);
    const bad = good === '000000' ? '111111' : '000000';

    const rs = await Promise.all(
      Array.from({ length: 4 }, () =>
        post('/auth/verify-otp')
          .set('Cookie', pendingCookie(user.pendingToken))
          .send({ email: user.email, otp: bad, purpose: 'registration' }),
      ),
    );

    expect(statuses(rs)).toEqual([400, 400, 400, 400]);
    expect((await getOtps(user.id))[0]!.attempts_count).toBe(4);
  });
});

describe('concurrent resend-otp / forgot-password', () => {
  it('registration resend (cooldown passed): one 200, the rest 429; only one unconsumed OTP remains', async () => {
    const user = await registerPending(1);
    await backdateOtps(user.id, 2);

    const rs = await Promise.all(
      Array.from({ length: N }, () =>
        post('/auth/resend-otp')
          .set('Cookie', pendingCookie(user.pendingToken))
          .send({ email: user.email, purpose: 'registration' }),
      ),
    );

    expectOneWinner(rs, 429, 'OTP_RESEND_COOLDOWN');
    const otps = await getOtps(user.id);
    expect(otps).toHaveLength(2);
    expect(otps.filter((o) => o.consumed_at === null)).toHaveLength(1);
  });

  it('forgot-password resend (cooldown passed): one 200, the rest 429; one unconsumed OTP remains', async () => {
    const user = await createActiveUser(1);
    await seedOtp(user.id, 'Forgot Password', '123456');
    await backdateOtps(user.id, 2, 'Forgot Password');

    const rs = await Promise.all(
      Array.from({ length: N }, () =>
        post('/auth/resend-otp').send({ email: user.email, purpose: 'forgot_password' }),
      ),
    );

    expectOneWinner(rs, 429, 'OTP_RESEND_COOLDOWN');
    const otps = await getOtps(user.id, 'Forgot Password');
    expect(otps.filter((o) => o.consumed_at === null)).toHaveLength(1);
  });

  it('forgot-password from nothing: one 200, the rest 429, exactly one OTP row', async () => {
    const user = await createActiveUser(1);

    const rs = await Promise.all(
      Array.from({ length: N }, () => post('/auth/forgot-password').send({ email: user.email })),
    );

    expectOneWinner(rs, 429, 'OTP_RESEND_COOLDOWN');
    expect(await getOtps(user.id, 'Forgot Password')).toHaveLength(1);
  });

  it('throttled callers never kill the live OTP', async () => {
    const user = await createActiveUser(1);
    await post('/auth/forgot-password').send({ email: user.email });
    const otp = latestOtpFor(user.email);

    await Promise.all(
      Array.from({ length: N }, () => post('/auth/forgot-password').send({ email: user.email })),
    );

    const res = await post('/auth/verify-otp').send({
      email: user.email,
      otp,
      purpose: 'forgot_password',
    });
    expect(res.status).toBe(200);
  });
});

describe('concurrent reset-password', () => {
  it('correct OTP sent N times at once: one 200, the rest 400 INVALID_OTP; password changed exactly once', async () => {
    const user = await createActiveUser(1);
    await seedOtp(user.id, 'Forgot Password', '123456');
    const passwords = Array.from({ length: N }, (_, i) => `N3w!Passw0rd${i}`);

    const rs = await Promise.all(
      passwords.map((newPassword) =>
        post('/auth/reset-password').send({ email: user.email, otp: '123456', newPassword }),
      ),
    );

    expectOneWinner(rs, 400, 'INVALID_OTP');
    const winner = passwords[rs.findIndex((r) => r.status === 200)]!;
    expect((await loginUser(user, winner)).status).toBe(200);
    // Each wrong password below also counts as a login failure (Stage 18b): by the 5th one
    // (including the stale original PASSWORD), the shared counter may have locked the account,
    // so a login attempt can legitimately get 429 ACCOUNT_LOCKED instead of 401 — either way,
    // it is never let in.
    for (const p of [...passwords.filter((p) => p !== winner), PASSWORD]) {
      expect([401, 429]).toContain((await loginUser(user, p)).status);
    }
  });
});

describe('concurrent logout', () => {
  it('same cookie N times at once: exactly one 200, the rest 401 INVALID_REFRESH_TOKEN', async () => {
    const user = await createActiveUser(1);
    const { accessToken, refreshToken } = await loginTokens(user);

    const rs = await Promise.all(
      Array.from({ length: N }, () =>
        post('/auth/logout')
          .set('Authorization', `Bearer ${accessToken}`)
          .set('Cookie', refreshCookie(refreshToken)),
      ),
    );

    expectOneWinner(rs, 401, 'INVALID_REFRESH_TOKEN');
    expect((await getRefreshTokens(user.id))[0]!.is_revoked).toBe(true);
  });
});

describe('refresh racing logout', () => {
  it('once logout has returned 200, every refresh that starts afterwards gets 401 INVALID_REFRESH_TOKEN', async () => {
    const user = await createActiveUser(1);
    const { refreshToken } = await loginTokens(user);

    const results: { startedAt: number; status: number; code?: string }[] = [];
    let running = true;
    const worker = async () => {
      while (running) {
        const startedAt = performance.now();
        const res = await post('/auth/refresh').set('Cookie', refreshCookie(refreshToken));
        results.push({ startedAt, status: res.status, code: res.body.code });
      }
    };
    const settled = Promise.allSettled(Array.from({ length: 3 }, worker));

    await sleep(100);
    const logout = await post('/auth/logout').set('Cookie', refreshCookie(refreshToken));
    const logoutDoneAt = performance.now();
    await sleep(150);
    running = false;
    expectAllFulfilled(await settled);

    expect(logout.status).toBe(200);
    const before = results.filter((r) => r.startedAt < logoutDoneAt);
    const after = results.filter((r) => r.startedAt > logoutDoneAt);
    expect(before.some((r) => r.status === 200)).toBe(true); // the loop really was refreshing
    expect(after.length).toBeGreaterThan(0);
    for (const r of after) {
      expect(r.status).toBe(401);
      expect(r.code).toBe('INVALID_REFRESH_TOKEN');
    }
    expect(results.every((r) => r.status === 200 || r.status === 401)).toBe(true);
  });
});

describe('refresh racing reset-password (lock ordering)', () => {
  it(`${LOOP_ITERATIONS} rounds of refresh + reset-password together: no 500s, no deadlocks, token revoked afterwards`, async () => {
    const user = await createActiveUser(1);

    for (let i = 0; i < LOOP_ITERATIONS; i++) {
      const token = `race-token-${i}`;
      await seedRefreshToken(user.id, token);
      await seedOtp(user.id, 'Forgot Password', '123456');

      const [reset, ...refreshes] = await Promise.all([
        post('/auth/reset-password').send({
          email: user.email,
          otp: '123456',
          newPassword: NEW_PASSWORD,
        }),
        ...Array.from({ length: N - 1 }, () =>
          post('/auth/refresh').set('Cookie', refreshCookie(token)),
        ),
      ]);

      expect(reset!.status, `round ${i}: reset`).toBe(200);
      for (const r of refreshes) {
        expect(
          [200, 401],
          `round ${i}: refresh gave ${r.status} ${JSON.stringify(r.body)}`,
        ).toContain(r.status);
      }
      const row = (await getRefreshTokens(user.id)).find(
        (t) => t.user_id === user.id && !t.is_revoked,
      );
      expect(row, `round ${i}: a refresh token survived the reset`).toBeUndefined();
    }
  });
});

describe('login racing reset-password', () => {
  it('no non-revoked refresh token exists afterwards from an old-password login', async () => {
    const user = await createActiveUser(1);
    let current = PASSWORD;
    const rounds = Math.min(LOOP_ITERATIONS, 8);

    for (let i = 0; i < rounds; i++) {
      const next = current === PASSWORD ? NEW_PASSWORD : PASSWORD;
      await seedOtp(user.id, 'Forgot Password', '123456');

      let running = true;
      const loginStatuses: number[] = [];
      const worker = async () => {
        while (running) {
          const res = await loginUser(user, current);
          loginStatuses.push(res.status);
        }
      };
      const settled = Promise.allSettled(Array.from({ length: 3 }, worker));

      await sleep(30);
      const reset = await post('/auth/reset-password').send({
        email: user.email,
        otp: '123456',
        newPassword: next,
      });
      await sleep(80);
      running = false;
      expectAllFulfilled(await settled);

      expect(reset.status, `round ${i}: reset`).toBe(200);
      // Three workers hammering login with the now-stale password can rack up enough failures
      // within the race window to trip the Stage 18b lock, which then also rejects a
      // correct-password attempt with 429 rather than letting it through as 200 — still "never
      // let in with the old password", the invariant this test actually cares about.
      expect(
        loginStatuses.every((s) => s === 200 || s === 401 || s === 429),
        `round ${i}: ${loginStatuses}`,
      ).toBe(true);
      const live = (await getRefreshTokens(user.id)).filter((t) => !t.is_revoked);
      expect(live, `round ${i}: live tokens from old-password logins`).toHaveLength(0);
      // Clear any lock the burst of old-password failures above may have set, so it cannot
      // carry over and poison the next round.
      await setLoginLockState(user.id, {});
      current = next;
    }
  });
});

describe('sanity: the concurrency helpers are wired to the real database', () => {
  it('sees the same pool as the app', async () => {
    const r = await pool.query('SELECT current_database() AS db');
    expect(r.rows[0].db).toBe('user_service_test');
  });
});
