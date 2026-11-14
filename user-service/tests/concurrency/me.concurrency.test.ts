/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Generated a Vitest concurrency test (real test DB) for PUT /users/me/active-view,
 *        covering the Stage 11b concurrent-toggle Verification bullet in instructions.md.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-23
 * Scope: Added the two Stage 12 concurrency Verification bullets that had no coverage at all:
 *        concurrent PUT /users/me/username targeting the same new username from two different
 *        accounts (Stage 12b), and concurrent POST /users/me/confirm-password-change with the
 *        correct OTP (Stage 12e). No requirements, architecture, schema, or API decisions were
 *        made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-fable-5-1), date: 2026-11-10
 * Scope: Fix F2 - debugged the ECONNRESET / "socket hang up" flake; replaced per-call
 *        `request(app)` supertest servers with the shared loopback server in
 *        tests/helpers/server.ts (`api()`). No test logic or assertions changed.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api } from '../helpers/server.js';
import { CONCURRENT_REQUESTS as N, LOOP_ITERATIONS, NEW_PASSWORD } from '../helpers/constants.js';
import { getRefreshTokens, getUserByEmail, truncateAll } from '../helpers/db.js';
import { latestOtpFor, resetEmailMock } from '../helpers/email.js';
import { accessTokenFor, bearer, createActiveUser, loginUser } from '../helpers/fixtures.js';

resetEmailMock();
beforeEach(truncateAll);
afterEach(truncateAll);

describe('concurrent PUT /users/me/active-view', () => {
  it('different values from the same user: no deadlock, no 500, last write wins', async () => {
    for (let i = 0; i < LOOP_ITERATIONS; i++) {
      const user = await createActiveUser(`activeview${i}`);
      const token = await accessTokenFor(user);

      const values = Array.from({ length: N }, (_, k) => (k % 2 === 0 ? 'courier' : 'requester'));
      const rs = await Promise.all(
        values.map((activeView) =>
          api()
            .put('/users/me/active-view')
            .set('Authorization', bearer(token))
            .send({ activeView }),
        ),
      );

      expect(rs.filter((r) => r.status === 500)).toHaveLength(0);
      expect(rs.every((r) => r.status === 200)).toBe(true);

      // There is no lock here, so this only confirms the endpoint survives concurrent writes,
      // not that any particular request's value wins.
      const finalValue = (await getUserByEmail(user.email))!.active_view;
      expect(['requester', 'courier']).toContain(finalValue);
    }
  });
});

describe('concurrent PUT /users/me/username', () => {
  it('two different accounts targeting the same new username: exactly one 200, the other 409 USERNAME_TAKEN, never 500', async () => {
    for (let i = 0; i < LOOP_ITERATIONS; i++) {
      const [a, b] = await Promise.all([
        createActiveUser(`unamea${i}`),
        createActiveUser(`unameb${i}`),
      ]);
      const [tokenA, tokenB] = await Promise.all([accessTokenFor(a), accessTokenFor(b)]);
      const target = `taken${i}`;

      const rs = await Promise.all(
        [tokenA, tokenB].map((token) =>
          api()
            .put('/users/me/username')
            .set('Authorization', bearer(token))
            .send({ newUsername: target }),
        ),
      );

      expect(rs.filter((r) => r.status === 500)).toHaveLength(0);
      expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
      expect(rs.filter((r) => r.status === 409 && r.body.code === 'USERNAME_TAKEN')).toHaveLength(1);
    }
  });
});

describe('concurrent POST /users/me/confirm-password-change', () => {
  it(`${N} requests with the correct OTP sent at once: exactly one 200, the rest 400 INVALID_OTP, password changed once`, async () => {
    const user = await createActiveUser('confirmrace');
    const token = await accessTokenFor(user);
    await api()
      .put('/users/me/password')
      .set('Authorization', bearer(token))
      .send({ currentPassword: user.password, newPassword: NEW_PASSWORD });
    const otp = latestOtpFor(user.email);
    // A distinct password per request, same technique as the equivalent concurrent-reset-password
    // case in races.concurrency.test.ts: this isolates the OTP-consumption race from the
    // unrelated PASSWORD_UNCHANGED check (every loser would otherwise see the winner's
    // already-applied password and fail with that error instead, before ever reaching the OTP
    // check).
    const passwords = Array.from({ length: N }, (_, i) => `N3w!Passw0rd${i}`);

    const rs = await Promise.all(
      passwords.map((newPassword) =>
        api()
          .post('/users/me/confirm-password-change')
          .set('Authorization', bearer(token))
          .send({ otp, newPassword }),
      ),
    );

    expect(rs.filter((r) => r.status === 500)).toHaveLength(0);
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 400 && r.body.code === 'INVALID_OTP')).toHaveLength(N - 1);

    // Checked before the login calls below, which would themselves mint new, unrevoked tokens.
    const tokens = await getRefreshTokens(user.id);
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens.every((t) => t.is_revoked)).toBe(true);

    const winner = passwords[rs.findIndex((r) => r.status === 200)]!;
    expect((await loginUser(user, winner)).status).toBe(200);
    for (const p of passwords.filter((p) => p !== winner)) {
      expect((await loginUser(user, p)).status).toBe(401);
    }
  });
});
