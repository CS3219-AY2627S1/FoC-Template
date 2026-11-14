/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Generated Vitest HTTP tests (supertest, real test DB) for GET /users, GET /users/:id
 *        and PUT /users/:id/status, covering the Stage 9 Verification bullets in
 *        instructions.md.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Added HTTP tests for PUT /users/:id/role, covering the Stage 10 Verification bullets.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Updated the expected keys for the new active_view column (Stage 11); no new test cases.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: Updated the expected GET /users keys for isLocked/lockedUntil/lockLevel, and added
 *        HTTP tests for the `locked` filter and POST /users/:id/unlock, covering the Stage 18d
 *        Verification bullets in instructions.md.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: GET /users/:id now asserts the email is masked for a different caller and unmasked
 *        for the caller's own row; added GET /users/:id/full-email HTTP tests covering
 *        instructions.md Stage 20a's Verification bullets (NFR3.1.1).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: PUT /users/:id/status, PUT /users/:id/role and POST /users/:id/unlock now require a
 *        reason; updated every existing request body and added Stage 26b's reason-validation
 *        and audit-row Verification bullets, plus unlock's new no-op-when-not-locked case.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Per author direction in chat (instructions.md Stage 26 "Reasons" amendment): unlock
 *        and full-email no longer require or accept a reason. Replaced their reason-validation
 *        tests with an unexpected-field-is-rejected test each, and updated the stored-audit-row
 *        assertions to expect reason "N/A".
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: PUT /users/:id/status and PUT /users/:id/role now require elevation (Stage 27b). The
 *        `put` helper auto-attaches a matching Elevated-Token derived from the caller's own
 *        access token by default (so every pre-existing success-path test keeps passing
 *        unchanged), with an `elevatedToken` option to omit it (`null`) or override it (a
 *        specific string) for the new elevation-specific test cases added below.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-fable-5-1), date: 2026-11-10
 * Scope: Fix F4 - added the "response bodies carry exactly the documented keys" block: for
 *        unlock (unlocked and no-op paths), PUT status / PUT role (changed and no-op paths),
 *        GET /users/:id and each GET /users item, the body's keys equal USER_RESPONSE_KEYS and
 *        the serialised body contains neither "password_hash" nor "passwordHash".
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-fable-5-1), date: 2026-11-10
 * Scope: Fix F2 - debugged the ECONNRESET / "socket hang up" flake; replaced per-call
 *        `request(app)` supertest servers with the shared loopback server in
 *        tests/helpers/server.ts (`api()`). No test logic or assertions changed.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-10, Codex, model: GPT-6): Updated response shape assertions for the existing preferred language field.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 */
import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../helpers/server.js';
import { signElevationToken } from '../../src/utils/jwt.js';
import {
  dbNow,
  getAuditLogRowsForTarget,
  getRefreshTokens,
  getUserByEmail,
  setLoginLockState,
  seedRefreshToken,
  setUserStatus,
  truncateAll,
} from '../helpers/db.js';
import { resetEmailMock } from '../helpers/email.js';
import {
  accessTokenFor,
  bearer,
  createActiveUser,
  createUserWithRole,
  loginTokens,
  refreshCookie,
  registerPending,
  type TestUser,
} from '../helpers/fixtures.js';
import { privateKey, signExpiredToken } from '../helpers/keys.js';

resetEmailMock();
beforeEach(truncateAll);
afterEach(truncateAll);

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
const UNAUTHORIZED = { message: 'Unauthorized', code: 'UNAUTHORIZED' };
const FORBIDDEN = { message: 'Forbidden', code: 'FORBIDDEN' };

// The documented user object (toUserResponse): Stage 9 fields + activeView and preferredLang +
// isLocked/lockedUntil/lockLevel (Stage 18d). Fix F4 asserts every admin endpoint's body has
// exactly these keys and no trace of the password hash under either naming.
const USER_RESPONSE_KEYS = [
  'activeView',
  'createdAt',
  'email',
  'id',
  'isLocked',
  'lockLevel',
  'preferredLang',
  'lockedUntil',
  'role',
  'status',
  'updatedAt',
  'username',
].sort();
function expectExactUserResponse(body: unknown): void {
  expect(Object.keys(body as object).sort()).toEqual(USER_RESPONSE_KEYS);
  const serialised = JSON.stringify(body);
  expect(serialised).not.toContain('password_hash');
  expect(serialised).not.toContain('passwordHash');
}

// Caller fixtures: each logs in after the role is set, so the access token carries that role.
async function callerToken(role: 'user' | 'admin' | 'super admin', n: number | string = 'caller') {
  const user = await createUserWithRole(n, role);
  return { user, token: await accessTokenFor(user) };
}

const get = (path: string, token?: string) => {
  const r = api().get(path);
  return token ? r.set('Authorization', bearer(token)) : r;
};
// Stage 27b: a matching Elevated-Token for an access token, decoded for its sub/sid. Role is
// irrelevant to the elevation check (only sub+sid are compared), so a fixed value is fine.
function elevationForAccessToken(accessToken: string): string {
  const decoded = jwt.decode(accessToken) as { sub: string; sid: string };
  return signElevationToken({ userId: decoded.sub, role: 'admin', sid: decoded.sid });
}

// `elevatedToken` lets a test omit (null) or override (a specific string) the header that is
// otherwise auto-derived from `token`, for the new Stage 27b elevation-specific test cases.
const put = (
  path: string,
  token: string | undefined,
  body: unknown,
  { elevatedToken }: { elevatedToken?: string | null } = {},
) => {
  const r = api().put(path);
  let req = token ? r.set('Authorization', bearer(token)) : r;
  const headerValue = elevatedToken === null ? undefined : elevatedToken ?? (token ? elevationForAccessToken(token) : undefined);
  if (headerValue !== undefined) {
    req = req.set('Elevated-Token', headerValue);
  }
  return req.send(body as object);
};

// Stage 26b: every audited action requires a reason. These helpers default to a valid preset
// code for whichever target value is given, so tests written before Stage 26 keep working;
// `body` lets a test override or add fields (e.g. `otherReason`, or an explicit `reason`).
const REASON_FOR_STATUS: Record<string, string> = { suspended: 'FRAUD_OR_SCAM', active: 'ISSUE_RESOLVED' };
const putStatus = (
  token: string | undefined,
  target: TestUser | { id: string },
  status: unknown,
  body: Record<string, unknown> = {},
  opts: { elevatedToken?: string | null } = {},
) =>
  put(
    `/users/${target.id}/status`,
    token,
    {
      status,
      ...(typeof status === 'string' && status in REASON_FOR_STATUS
        ? { reason: REASON_FOR_STATUS[status] }
        : {}),
      ...body,
    },
    opts,
  );

describe('GET /users', () => {
  it('rejects a request with no Authorization header with 401 UNAUTHORIZED', async () => {
    const res = await get('/users');
    expect(res.status).toBe(401);
    expect(res.body).toEqual(UNAUTHORIZED);
  });

  it('rejects an expired token with 401 UNAUTHORIZED', async () => {
    const res = await get('/users', signExpiredToken({ role: 'admin' }));
    expect(res.status).toBe(401);
    expect(res.body).toEqual(UNAUTHORIZED);
  });

  it('rejects a regular user with 403 FORBIDDEN', async () => {
    const { token } = await callerToken('user');
    const res = await get('/users', token);
    expect(res.status).toBe(403);
    expect(res.body).toEqual(FORBIDDEN);
  });

  it.each(['admin', 'super admin'] as const)(
    'allows a %s and returns the paginated shape',
    async (role) => {
      const { token } = await callerToken(role);
      const res = await get('/users', token);
      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual(
        ['page', 'pageSize', 'total', 'totalPages', 'users'].sort(),
      );
      expect(res.body.page).toBe(1);
      expect(res.body.pageSize).toBe(50);
      expect(Array.isArray(res.body.users)).toBe(true);
      expect(res.body.users).toHaveLength(1);
    },
  );

  it('returns pending, active and suspended users, each with a status and no password_hash', async () => {
    const { token } = await callerToken('admin');
    const pending = await registerPending(1);
    const suspended = await createActiveUser(2);
    await setUserStatus(suspended.id, 'suspended');
    const active = await createActiveUser(3);

    const res = await get('/users', token);
    expect(res.status).toBe(200);
    const byId = new Map<string, { status: string }>(
      res.body.users.map((u: { id: string; status: string }) => [u.id, u]),
    );
    expect(byId.get(pending.id)!.status).toBe('pending');
    expect(byId.get(suspended.id)!.status).toBe('suspended');
    expect(byId.get(active.id)!.status).toBe('active');
    for (const u of res.body.users) {
      expect(u).not.toHaveProperty('password_hash');
      expect(Object.keys(u).sort()).toEqual(
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
    }
  });
});

describe('GET /users locked filter and fields (Stage 18d)', () => {
  it('returns isLocked/lockedUntil/lockLevel, and locked=true|false filters the result set', async () => {
    const { token } = await callerToken('admin');
    const locked = await createActiveUser(1);
    await setLoginLockState(locked.id, { lockLevel: 1, lockedUntilMinutesFromNow: 60 });
    const notLocked = await createActiveUser(2);

    const lockedRes = await get('/users?locked=true', token);
    expect(lockedRes.status).toBe(200);
    expect(lockedRes.body.users.map((u: { id: string }) => u.id)).toEqual([locked.id]);
    expect(lockedRes.body.users[0]).toMatchObject({ isLocked: true, lockLevel: 1 });
    expect(typeof lockedRes.body.users[0].lockedUntil).toBe('string');

    const notLockedRes = await get('/users?locked=false', token);
    const notLockedIds = notLockedRes.body.users.map((u: { id: string }) => u.id);
    // Also includes the admin caller created by callerToken(), which is active and not locked.
    expect(notLockedIds).toContain(notLocked.id);
    expect(notLockedIds).not.toContain(locked.id);
  });

  it("rejects an invalid locked value with 400 VALIDATION_ERROR \"locked must be 'true' or 'false'\"", async () => {
    const { token } = await callerToken('admin');
    const res = await get('/users?locked=maybe', token);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      message: "locked must be 'true' or 'false'",
      code: 'VALIDATION_ERROR',
    });
  });
});

describe('POST /users/:id/unlock', () => {
  // No reason required (instructions.md Stage 26 "Reasons" amendment); pass `body` to send an
  // unexpected field for the rejection test below.
  const unlock = (
    token: string | undefined,
    target: { id: string },
    body: Record<string, unknown> = {},
  ) => {
    const r = api().post(`/users/${target.id}/unlock`);
    return (token ? r.set('Authorization', bearer(token)) : r).send(body);
  };

  it('rejects a request with no Authorization header with 401 UNAUTHORIZED', async () => {
    const target = await createActiveUser(1);
    const res = await unlock(undefined, target);
    expect(res.status).toBe(401);
    expect(res.body).toEqual(UNAUTHORIZED);
  });

  it('rejects a regular user with 403 FORBIDDEN', async () => {
    const { token } = await callerToken('user');
    const target = await createActiveUser(1);
    const res = await unlock(token, target);
    expect(res.status).toBe(403);
    expect(res.body).toEqual(FORBIDDEN);
  });

  it('an admin can unlock a plain user: 200, isLocked false, lockedUntil null, lockLevel 0', async () => {
    const { token } = await callerToken('admin');
    const target = await createActiveUser(1);
    await setLoginLockState(target.id, { lockLevel: 1, lockedUntilMinutesFromNow: 60 });

    const res = await unlock(token, target);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ isLocked: false, lockedUntil: null, lockLevel: 0 });
  });

  it('rejects an admin unlocking another admin with 403 FORBIDDEN, but a super admin may', async () => {
    const { token: adminToken } = await callerToken('admin', 'caller1');
    const target = await createUserWithRole('target', 'admin');
    await setLoginLockState(target.id, { lockLevel: 1, lockedUntilMinutesFromNow: 60 });

    const res = await unlock(adminToken, target);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      message: 'Only a super admin may unlock an admin',
      code: 'FORBIDDEN',
    });

    const { token: saToken } = await callerToken('super admin', 'caller2');
    const saRes = await unlock(saToken, target);
    expect(saRes.status).toBe(200);
    expect(saRes.body.isLocked).toBe(false);
  });

  it('rejects unlocking a super admin with 403 SUPER_ADMIN_IMMUTABLE', async () => {
    const { token } = await callerToken('super admin', 'caller1');
    const target = await createUserWithRole('target', 'super admin');
    await setLoginLockState(target.id, { lockLevel: 1, lockedUntilMinutesFromNow: 60 });

    const res = await unlock(token, target);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      message: 'Cannot modify a super administrator',
      code: 'SUPER_ADMIN_IMMUTABLE',
    });
  });

  it('returns 404 USER_NOT_FOUND for an id that does not exist', async () => {
    const { token } = await callerToken('admin');
    const res = await unlock(token, { id: UNKNOWN_ID });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'User not found', code: 'USER_NOT_FOUND' });
  });

  it('returns 400 VALIDATION_ERROR "Invalid user ID" for a non-UUID id', async () => {
    const { token } = await callerToken('admin');
    const res = await unlock(token, { id: 'not-a-uuid' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Invalid user ID', code: 'VALIDATION_ERROR' });
  });

  describe('no-op and audit rows (Stage 26b)', () => {
    it('unlocking a locked user writes one USER_UNLOCK audit row with reason "N/A"', async () => {
      const { token, user: actor } = await callerToken('admin');
      const target = await createActiveUser(1);
      await setLoginLockState(target.id, { lockLevel: 1, lockedUntilMinutesFromNow: 60 });

      const res = await unlock(token, target);
      expect(res.status).toBe(200);
      const rows = await getAuditLogRowsForTarget(target.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actor_id: actor.id,
        action: 'USER_UNLOCK',
        target_id: target.id,
        before: { isLocked: true },
        after: { isLocked: false },
        reason: 'N/A',
      });
    });

    it('unlocking a user who is not login-locked is a no-op: 200, unchanged, nothing cleared, no row', async () => {
      const { token } = await callerToken('admin');
      const target = await createActiveUser(1);
      const before = (await getUserByEmail(target.email))!;

      const res = await unlock(token, target);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ isLocked: false, lockedUntil: null, lockLevel: 0 });
      const after = (await getUserByEmail(target.email))!;
      expect(after.updated_at).toEqual(before.updated_at);
      expect(after.login_failed_attempts).toBe(before.login_failed_attempts);
      expect(await getAuditLogRowsForTarget(target.id)).toHaveLength(0);
    });

    it('rejects an unexpected field in the body with 400, no row', async () => {
      const { token } = await callerToken('admin');
      const target = await createActiveUser(1);
      await setLoginLockState(target.id, { lockLevel: 1, lockedUntilMinutesFromNow: 60 });

      const res = await unlock(token, target, { reason: 'IDENTITY_VERIFIED' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'Request contains unexpected fields', code: 'VALIDATION_ERROR' });
      expect(await getAuditLogRowsForTarget(target.id)).toHaveLength(0);
    });

    it('each existing rejection writes no audit row', async () => {
      const { token } = await callerToken('admin', 'caller1');
      const admin2 = await createUserWithRole('admin2', 'admin');
      await setLoginLockState(admin2.id, { lockLevel: 1, lockedUntilMinutesFromNow: 60 });

      const res = await unlock(token, admin2);
      expect(res.status).toBe(403);
      expect(await getAuditLogRowsForTarget(admin2.id)).toHaveLength(0);
    });
  });
});

describe('response bodies carry exactly the documented keys (fix F4)', () => {
  it('POST /users/:id/unlock on a locked user (lock cleared) and on a non-locked user (no-op)', async () => {
    const { token } = await callerToken('admin');
    const lockedTarget = await createActiveUser(1);
    await setLoginLockState(lockedTarget.id, { lockLevel: 1, lockedUntilMinutesFromNow: 60 });
    const idleTarget = await createActiveUser(2);

    const unlocked = await api()
      .post(`/users/${lockedTarget.id}/unlock`)
      .set('Authorization', bearer(token));
    expect(unlocked.status).toBe(200);
    expect(unlocked.body).toMatchObject({ id: lockedTarget.id, isLocked: false, lockedUntil: null, lockLevel: 0 });
    expectExactUserResponse(unlocked.body);

    const noop = await api()
      .post(`/users/${idleTarget.id}/unlock`)
      .set('Authorization', bearer(token));
    expect(noop.status).toBe(200);
    expect(noop.body).toMatchObject({ id: idleTarget.id, isLocked: false });
    expectExactUserResponse(noop.body);
  });

  it('PUT /users/:id/status, changed and no-op', async () => {
    const { token } = await callerToken('admin');
    const target = await createActiveUser(1);

    const changed = await putStatus(token, target, 'suspended');
    expect(changed.status).toBe(200);
    expect(changed.body.status).toBe('suspended');
    expectExactUserResponse(changed.body);

    const noop = await putStatus(token, target, 'suspended');
    expect(noop.status).toBe(200);
    expectExactUserResponse(noop.body);
  });

  it('PUT /users/:id/role, changed and no-op', async () => {
    const { token } = await callerToken('super admin');
    const target = await createActiveUser(1);

    const changed = await putRole(token, target, 'admin');
    expect(changed.status).toBe(200);
    expect(changed.body.role).toBe('admin');
    expectExactUserResponse(changed.body);

    const noop = await putRole(token, target, 'admin');
    expect(noop.status).toBe(200);
    expectExactUserResponse(noop.body);
  });

  it('GET /users/:id and every item of GET /users', async () => {
    const { token } = await callerToken('admin');
    const target = await createActiveUser(1);

    const one = await get(`/users/${target.id}`, token);
    expect(one.status).toBe(200);
    expectExactUserResponse(one.body);

    const list = await get('/users', token);
    expect(list.status).toBe(200);
    expect(list.body.users).toHaveLength(2);
    for (const u of list.body.users) expectExactUserResponse(u);
    expect(JSON.stringify(list.body)).not.toContain('password');
  });
});

describe('GET /users/:id', () => {
  it('rejects a request with no token with 401 and a regular user with 403', async () => {
    const target = await createActiveUser(1);
    expect((await get(`/users/${target.id}`)).status).toBe(401);
    const { token } = await callerToken('user');
    const res = await get(`/users/${target.id}`, token);
    expect(res.status).toBe(403);
    expect(res.body).toEqual(FORBIDDEN);
  });

  it('returns an existing user minus password_hash, with the email masked (Stage 20, NFR3.1.1)', async () => {
    const { token } = await callerToken('admin');
    const target = await createActiveUser(1);
    const res = await get(`/users/${target.id}`, token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: target.id,
      username: target.username,
      status: 'active',
      role: 'user',
    });
    expect(res.body.email).not.toBe(target.email);
    expect(res.body.email).toMatch(/^.\*\*\*@example\.com$/);
    expect(res.body).not.toHaveProperty('password_hash');
  });

  it("does not mask the caller's own row (Stage 20, NFR3.1.1)", async () => {
    const { user, token } = await callerToken('admin');
    const res = await get(`/users/${user.id}`, token);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(user.email);
  });

  it("returns a pending user's record with status 'pending'", async () => {
    const { token } = await callerToken('admin');
    const pending = await registerPending(1);
    const res = await get(`/users/${pending.id}`, token);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
    expect(res.body).not.toHaveProperty('password_hash');
  });

  it("returns a suspended user's record with status 'suspended'", async () => {
    const { token } = await callerToken('admin');
    const target = await createActiveUser(1);
    await setUserStatus(target.id, 'suspended');
    const res = await get(`/users/${target.id}`, token);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('suspended');
  });

  it('returns 404 USER_NOT_FOUND for a well-formed UUID that does not exist', async () => {
    const { token } = await callerToken('admin');
    const res = await get(`/users/${UNKNOWN_ID}`, token);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'User not found', code: 'USER_NOT_FOUND' });
  });

  it('returns 400 VALIDATION_ERROR "Invalid user ID" for a non-UUID id', async () => {
    const { token } = await callerToken('admin');
    const res = await get('/users/abc123', token);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Invalid user ID', code: 'VALIDATION_ERROR' });
  });
});

describe('POST /users/:id/full-email (Stage 26c, NFR3.1.1)', () => {
  // No reason required (instructions.md Stage 26 "Reasons" amendment); pass `body` to send an
  // unexpected field for the rejection test below.
  const unmask = (
    path: string,
    token: string | undefined,
    body: Record<string, unknown> = {},
    ua?: string,
  ) => {
    const r = api().post(path);
    const withToken = token ? r.set('Authorization', bearer(token)) : r;
    return (ua === undefined ? withToken : withToken.set('User-Agent', ua)).send(body);
  };

  it('rejects a request with no token with 401, a regular user with 403; no row either way', async () => {
    const target = await createActiveUser(1);

    const noToken = await unmask(`/users/${target.id}/full-email`, undefined);
    expect(noToken.status).toBe(401);
    expect(noToken.body).toEqual(UNAUTHORIZED);

    const { token } = await callerToken('user');
    const res = await unmask(`/users/${target.id}/full-email`, token);
    expect(res.status).toBe(403);
    expect(res.body).toEqual(FORBIDDEN);

    expect(await getAuditLogRowsForTarget(target.id)).toHaveLength(0);
  });

  it.each(['admin', 'super admin'] as const)(
    '%s unmasks a user, a pending user, a suspended user and an admin, each with one EMAIL_UNMASK row',
    async (role) => {
      const { user: actor, token } = await callerToken(role);
      const user = await createActiveUser(1);
      const pending = await registerPending(2);
      const suspended = await createActiveUser(3);
      await setUserStatus(suspended.id, 'suspended');
      const admin2 = await createUserWithRole('admin2', 'admin');

      for (const target of [user, pending, suspended, admin2]) {
        const res = await unmask(`/users/${target.id}/full-email`, token);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ email: target.email });
        const rows = await getAuditLogRowsForTarget(target.id);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          actor_id: actor.id,
          action: 'EMAIL_UNMASK',
          target_id: target.id,
          before: null,
          after: null,
          reason: 'N/A',
        });
      }
    },
  );

  it('any caller targeting a super admin gets 403 FORBIDDEN, no row', async () => {
    const { token } = await callerToken('admin');
    const sa = await createUserWithRole('sa', 'super admin');
    const res = await unmask(`/users/${sa.id}/full-email`, token);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      message: "Cannot unmask a super administrator's email",
      code: 'FORBIDDEN',
    });
    expect(await getAuditLogRowsForTarget(sa.id)).toHaveLength(0);
  });

  it('returns 404 USER_NOT_FOUND for an unknown UUID', async () => {
    const { token } = await callerToken('admin');
    const res = await unmask(`/users/${UNKNOWN_ID}/full-email`, token);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'User not found', code: 'USER_NOT_FOUND' });
  });

  it('returns 400 VALIDATION_ERROR "Invalid user ID" for a non-UUID id', async () => {
    const { token } = await callerToken('admin');
    const res = await unmask('/users/not-a-uuid/full-email', token);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Invalid user ID', code: 'VALIDATION_ERROR' });
  });

  it('admin targeting their own id is granted; super admin targeting their own id is denied', async () => {
    const { user: admin, token: adminToken } = await callerToken('admin', 'ownadmin');
    const own = await unmask(`/users/${admin.id}/full-email`, adminToken);
    expect(own.status).toBe(200);
    expect(own.body).toEqual({ email: admin.email });
    expect(await getAuditLogRowsForTarget(admin.id)).toHaveLength(1);

    const { user: sa, token: saToken } = await callerToken('super admin', 'ownsa');
    const ownSa = await unmask(`/users/${sa.id}/full-email`, saToken);
    expect(ownSa.status).toBe(403);
    expect(ownSa.body.code).toBe('FORBIDDEN');
    expect(await getAuditLogRowsForTarget(sa.id)).toHaveLength(0);
  });

  it('stores the given user agent, or NULL when none is sent', async () => {
    const { token } = await callerToken('admin');

    const withUa = await createActiveUser(1);
    await unmask(`/users/${withUa.id}/full-email`, token, {}, 'Mozilla/5.0 Test');
    expect((await getAuditLogRowsForTarget(withUa.id))[0]!.user_agent).toBe('Mozilla/5.0 Test');

    const withoutUa = await createActiveUser(2);
    await unmask(`/users/${withoutUa.id}/full-email`, token);
    expect((await getAuditLogRowsForTarget(withoutUa.id))[0]!.user_agent).toBeNull();
  });

  it('rejects an unexpected field in the body with 400 VALIDATION_ERROR, no email, no row', async () => {
    const { token } = await callerToken('admin');
    const target = await createActiveUser(1);

    const res = await unmask(`/users/${target.id}/full-email`, token, { reason: 'SUPPORT_REQUEST' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Request contains unexpected fields', code: 'VALIDATION_ERROR' });
    expect(res.body).not.toHaveProperty('email');
    expect(await getAuditLogRowsForTarget(target.id)).toHaveLength(0);
  });

  it("created_at comes from the database clock, not the service's own clock", async () => {
    const { token } = await callerToken('admin');
    const target = await createActiveUser(1);
    const before = await dbNow();

    await unmask(`/users/${target.id}/full-email`, token);

    const after = await dbNow();
    const [row] = await getAuditLogRowsForTarget(target.id);
    expect(row!.created_at.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(row!.created_at.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('force insertAuditLog to throw: 500 INTERNAL_ERROR, no email, no row', async () => {
    const { token } = await callerToken('admin');
    const target = await createActiveUser(1);
    const auditLogQueries = await import('../../src/db/queries/auditLog.queries.js');
    const spy = vi
      .spyOn(auditLogQueries, 'insertAuditLog')
      .mockRejectedValueOnce(new Error('insert failed'));

    const res = await unmask(`/users/${target.id}/full-email`, token);
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
    expect(res.body).not.toHaveProperty('email');
    expect(await getAuditLogRowsForTarget(target.id)).toHaveLength(0);
    spy.mockRestore();
  });

  it('GET /users/:id/full-email no longer exists', async () => {
    const { token } = await callerToken('admin');
    const target = await createActiveUser(1);
    const res = await get(`/users/${target.id}/full-email`, token);
    expect(res.status).toBe(404);
  });

  it('the audit row never contains the email, masked or full (the response does, by design)', async () => {
    const { token } = await callerToken('admin');
    const target = await createActiveUser(1);

    const res = await unmask(`/users/${target.id}/full-email`, token);
    const [row] = await getAuditLogRowsForTarget(target.id);
    expect(JSON.stringify(row)).not.toContain('@');
    expect(res.body.email).toBe(target.email);
  });
});

describe('PUT /users/:id/status', () => {
  describe('authentication and authorization', () => {
    it('rejects a request with no token with 401 UNAUTHORIZED', async () => {
      const target = await createActiveUser(1);
      const res = await put(`/users/${target.id}/status`, undefined, { status: 'suspended' });
      expect(res.status).toBe(401);
      expect(res.body).toEqual(UNAUTHORIZED);
    });

    it('rejects a regular user with 403 FORBIDDEN and changes nothing', async () => {
      const { token } = await callerToken('user');
      const target = await createActiveUser(1);
      const res = await putStatus(token, target, 'suspended');
      expect(res.status).toBe(403);
      expect(res.body).toEqual(FORBIDDEN);
      expect((await getUserByEmail(target.email))!.status).toBe('active');
    });
  });

  describe('elevation (Stage 27b)', () => {
    it('no Elevated-Token: 403 ELEVATION_REQUIRED, no change, no audit row', async () => {
      const { token } = await callerToken('admin');
      const target = await createActiveUser(1);
      const res = await putStatus(token, target, 'suspended', {}, { elevatedToken: null });
      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        message: 'Verify your identity to perform this action.',
        code: 'ELEVATION_REQUIRED',
      });
      expect((await getUserByEmail(target.email))!.status).toBe('active');
      expect(await getAuditLogRowsForTarget(target.id)).toHaveLength(0);
    });

    it('an invalid Elevated-Token: 403 ELEVATION_REQUIRED, no change', async () => {
      const { token } = await callerToken('admin');
      const target = await createActiveUser(1);
      const res = await putStatus(token, target, 'suspended', {}, { elevatedToken: 'not-a-token' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ELEVATION_REQUIRED');
      expect((await getUserByEmail(target.email))!.status).toBe('active');
    });

    it('an expired Elevated-Token: 403 ELEVATION_REQUIRED, no change', async () => {
      const { token } = await callerToken('admin');
      const target = await createActiveUser(1);
      const { sub, sid } = jwt.decode(token) as { sub: string; sid: string };
      const expired = jwt.sign(
        { role: 'admin', sid, exp: Math.floor(Date.now() / 1000) - 60 },
        privateKey(),
        {
          algorithm: 'RS256',
          subject: sub,
          keyid: process.env.JWT_KEY_ID,
          header: { alg: 'RS256', typ: 'ep+JWT' },
        },
      );
      const res = await putStatus(token, target, 'suspended', {}, { elevatedToken: expired });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ELEVATION_REQUIRED');
    });

    it('a token issued to a different admin (sub mismatch): 403 ELEVATION_REQUIRED', async () => {
      const { token } = await callerToken('admin', 1);
      const other = await callerToken('admin', 2);
      const target = await createActiveUser(3);
      const { sid } = jwt.decode(token) as { sid: string };
      const wrongSubToken = signElevationToken({ userId: other.user.id, role: 'admin', sid });
      const res = await putStatus(token, target, 'suspended', {}, { elevatedToken: wrongSubToken });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ELEVATION_REQUIRED');
    });

    it('a token from another login of the same admin (sid mismatch): 403 ELEVATION_REQUIRED', async () => {
      const admin = await createUserWithRole(1, 'admin');
      const { accessToken: token } = await loginTokens(admin);
      const { accessToken: otherLoginToken } = await loginTokens(admin);
      const { sid: otherSid } = jwt.decode(otherLoginToken) as { sid: string };
      const target = await createActiveUser(2);
      const wrongSidToken = signElevationToken({ userId: admin.id, role: 'admin', sid: otherSid });
      const res = await putStatus(token, target, 'suspended', {}, { elevatedToken: wrongSidToken });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ELEVATION_REQUIRED');
    });

    it('a valid Elevated-Token with a valid reason: 200, with the Stage 26 audit row', async () => {
      const { token } = await callerToken('admin');
      const target = await createActiveUser(1);
      const res = await putStatus(token, target, 'suspended');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('suspended');
      expect(await getAuditLogRowsForTarget(target.id)).toHaveLength(1);
    });

    it('a self-targeting-style rejection (super-admin target) returns its own error first, not ELEVATION_REQUIRED', async () => {
      const { token } = await callerToken('admin');
      const target = await createUserWithRole(1, 'super admin');
      const res = await putStatus(token, target, 'suspended', {}, { elevatedToken: null });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SUPER_ADMIN_IMMUTABLE');
    });

    it('a no-op status request returns 200 unchanged without elevation', async () => {
      const { token } = await callerToken('admin');
      const target = await createActiveUser(1);
      const res = await putStatus(token, target, 'active', {}, { elevatedToken: null });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('active');
    });

    it('an invalid reason still returns 400 first, before the elevation check', async () => {
      const { token } = await callerToken('admin');
      const target = await createActiveUser(1);
      const res = await putStatus(token, target, 'suspended', { reason: 'NOT_A_REAL_CODE' }, { elevatedToken: null });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('suspend and unsuspend', () => {
    it('suspends an active user: status suspended in the DB and all their refresh tokens revoked', async () => {
      const { token } = await callerToken('admin');
      const target = await createActiveUser(1);
      await loginTokens(target);
      await seedRefreshToken(target.id, 'extra-token');

      const res = await putStatus(token, target, 'suspended');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: target.id, status: 'suspended' });
      expect(res.body).not.toHaveProperty('password_hash');
      expect((await getUserByEmail(target.email))!.status).toBe('suspended');
      const tokens = await getRefreshTokens(target.id);
      expect(tokens.length).toBeGreaterThanOrEqual(2);
      expect(tokens.every((t) => t.is_revoked)).toBe(true);
    });

    it('unsuspends a suspended user: status flips back and no token rows are touched', async () => {
      const { token } = await callerToken('admin');
      const target = await createActiveUser(1);
      await seedRefreshToken(target.id, 'tok-a');
      await putStatus(token, target, 'suspended');
      const tokensBefore = await getRefreshTokens(target.id);

      const res = await putStatus(token, target, 'active');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('active');
      expect((await getUserByEmail(target.email))!.status).toBe('active');
      expect(await getRefreshTokens(target.id)).toEqual(tokensBefore);
    });

    it("after a suspend, POST /auth/refresh with the user's pre-suspension cookie gets 401", async () => {
      const { token } = await callerToken('admin');
      const target = await createActiveUser(1);
      const { refreshToken } = await loginTokens(target);

      await putStatus(token, target, 'suspended');
      const res = await api()
        .post('/auth/refresh')
        .set('Cookie', refreshCookie(refreshToken));
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('returns 404 USER_NOT_FOUND for a nonexistent target', async () => {
      const { token } = await callerToken('admin');
      const res = await putStatus(token, { id: UNKNOWN_ID }, 'suspended');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'User not found', code: 'USER_NOT_FOUND' });
    });
  });

  describe('request validation', () => {
    it("rejects status 'pending' with 400 VALIDATION_ERROR", async () => {
      const { token } = await callerToken('admin');
      const target = await createActiveUser(1);
      const res = await putStatus(token, target, 'pending');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        message: "Status must be 'active' or 'suspended'",
        code: 'VALIDATION_ERROR',
      });
      expect((await getUserByEmail(target.email))!.status).toBe('active');
    });

    it('rejects a missing status with "Status is required"', async () => {
      const { token } = await callerToken('admin');
      const target = await createActiveUser(1);
      const res = await put(`/users/${target.id}/status`, token, {});
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'Status is required', code: 'VALIDATION_ERROR' });
    });

    it('rejects a non-string status with "Status must be a string"', async () => {
      const { token } = await callerToken('admin');
      const target = await createActiveUser(1);
      const res = await putStatus(token, target, 123);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'Status must be a string', code: 'VALIDATION_ERROR' });
    });

    it('rejects an extra field with "Request contains unexpected fields"', async () => {
      const { token } = await callerToken('admin');
      const target = await createActiveUser(1);
      const res = await put(`/users/${target.id}/status`, token, {
        status: 'suspended',
        role: 'admin',
      });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        message: 'Request contains unexpected fields',
        code: 'VALIDATION_ERROR',
      });
      expect((await getUserByEmail(target.email))!.status).toBe('active');
    });

    it('rejects a non-UUID id with 400 "Invalid user ID"', async () => {
      const { token } = await callerToken('admin');
      const res = await put('/users/abc123/status', token, { status: 'suspended' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'Invalid user ID', code: 'VALIDATION_ERROR' });
    });
  });

  describe('reason validation and audit rows (Stage 26b)', () => {
    it('suspending with a valid reason writes one USER_SUSPEND audit row', async () => {
      const { token, user: actor } = await callerToken('admin');
      const target = await createActiveUser(1);

      const res = await putStatus(token, target, 'suspended');
      expect(res.status).toBe(200);
      const rows = await getAuditLogRowsForTarget(target.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actor_id: actor.id,
        action: 'USER_SUSPEND',
        target_id: target.id,
        before: { status: 'active' },
        after: { status: 'suspended' },
        reason: 'FRAUD_OR_SCAM',
        user_agent: null,
      });
    });

    it('unsuspending with a valid reason writes one USER_UNSUSPEND audit row', async () => {
      const { token } = await callerToken('admin');
      const target = await createActiveUser(1);
      await putStatus(token, target, 'suspended');

      const res = await putStatus(token, target, 'active');
      expect(res.status).toBe(200);
      const rows = await getAuditLogRowsForTarget(target.id);
      expect(rows).toHaveLength(2);
      expect(rows[1]).toMatchObject({
        action: 'USER_UNSUSPEND',
        before: { status: 'suspended' },
        after: { status: 'active' },
        reason: 'ISSUE_RESOLVED',
      });
    });

    it('OTHER with otherReason stores "OTHER: <trimmed text>"; 9 or 501 chars is rejected, 10 and 500 accepted', async () => {
      const { token } = await callerToken('admin');

      const tooShort = await createActiveUser(1);
      const shortRes = await putStatus(token, tooShort, 'suspended', {
        reason: 'OTHER',
        otherReason: '123456789',
      });
      expect(shortRes.status).toBe(400);
      expect(shortRes.body).toEqual({
        message: 'Details must be between 10 and 500 characters',
        code: 'VALIDATION_ERROR',
      });

      const tooLong = await createActiveUser(2);
      const longRes = await putStatus(token, tooLong, 'suspended', {
        reason: 'OTHER',
        otherReason: 'x'.repeat(501),
      });
      expect(longRes.status).toBe(400);

      const atMin = await createActiveUser(3);
      const minRes = await putStatus(token, atMin, 'suspended', {
        reason: 'OTHER',
        otherReason: '  0123456789  ',
      });
      expect(minRes.status).toBe(200);
      expect((await getAuditLogRowsForTarget(atMin.id))[0]).toMatchObject({
        reason: 'OTHER: 0123456789',
      });

      const atMax = await createActiveUser(4);
      const maxRes = await putStatus(token, atMax, 'suspended', {
        reason: 'OTHER',
        otherReason: 'x'.repeat(500),
      });
      expect(maxRes.status).toBe(200);
    });

    it.each([
      ['missing reason', {}, 'Reason is required'],
      ['non-string reason', { reason: 123 }, 'Reason must be a string'],
      ['a code from a different action', { reason: 'APPOINTED_MODERATOR' }, 'Invalid reason'],
      ['OTHER without otherReason', { reason: 'OTHER' }, 'Details are required when the reason is Other'],
      [
        'otherReason with a non-OTHER code',
        { reason: 'FRAUD_OR_SCAM', otherReason: 'some free text here' },
        'Request contains unexpected fields',
      ],
      [
        'an extra field',
        { reason: 'FRAUD_OR_SCAM', foo: 'bar' },
        'Request contains unexpected fields',
      ],
    ])('rejects %s with 400 VALIDATION_ERROR "%s", no change, no row', async (_label, overrides, message) => {
      const { token } = await callerToken('admin');
      const target = await createActiveUser(1);
      const res = await put(`/users/${target.id}/status`, token, { status: 'suspended', ...overrides });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message, code: 'VALIDATION_ERROR' });
      expect((await getUserByEmail(target.email))!.status).toBe('active');
      expect(await getAuditLogRowsForTarget(target.id)).toHaveLength(0);
    });

    it('an invalid reason on a request that would have been a no-op is still 400', async () => {
      const { token } = await callerToken('admin');
      const target = await createActiveUser(1);

      const res = await put(`/users/${target.id}/status`, token, { status: 'active' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('each existing rejection writes no audit row', async () => {
      const { token: adminToken } = await callerToken('admin', 'caller1');
      const admin2 = await createUserWithRole('admin2', 'admin');
      const resForbidden = await putStatus(adminToken, admin2, 'suspended');
      expect(resForbidden.status).toBe(403);

      const { token: saToken } = await callerToken('super admin', 'caller2');
      const pending = await registerPending(2);
      const resPending = await putStatus(saToken, pending, 'suspended');
      expect(resPending.status).toBe(422);

      const resNotFound = await putStatus(saToken, { id: UNKNOWN_ID }, 'suspended');
      expect(resNotFound.status).toBe(404);

      expect(await getAuditLogRowsForTarget(admin2.id)).toHaveLength(0);
      expect(await getAuditLogRowsForTarget(pending.id)).toHaveLength(0);
    });

    it('force insertAuditLog to throw: 500 INTERNAL_ERROR, the status change and token revocation roll back', async () => {
      const { token } = await callerToken('admin');
      const target = await createActiveUser(1);
      await seedRefreshToken(target.id, 'tok-a');
      const auditLogQueries = await import('../../src/db/queries/auditLog.queries.js');
      const spy = vi
        .spyOn(auditLogQueries, 'insertAuditLog')
        .mockRejectedValueOnce(new Error('insert failed'));

      const res = await putStatus(token, target, 'suspended');
      expect(res.status).toBe(500);
      expect(res.body.code).toBe('INTERNAL_ERROR');
      expect((await getUserByEmail(target.email))!.status).toBe('active');
      expect((await getRefreshTokens(target.id))[0]!.is_revoked).toBe(false);
      expect(await getAuditLogRowsForTarget(target.id)).toHaveLength(0);

      spy.mockRestore();
    });

    it("created_at comes from the database clock", async () => {
      const { token } = await callerToken('admin');
      const target = await createActiveUser(1);
      const before = await dbNow();

      await putStatus(token, target, 'suspended');
      const after = await dbNow();

      const [row] = await getAuditLogRowsForTarget(target.id);
      expect(row!.created_at.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(row!.created_at.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('target role restriction', () => {
    it('admin suspends a plain user: 200', async () => {
      const { token } = await callerToken('admin');
      const target = await createUserWithRole(1, 'user');
      expect((await putStatus(token, target, 'suspended')).status).toBe(200);
    });

    it('admin suspends an admin: 403 FORBIDDEN, target unchanged', async () => {
      const { token } = await callerToken('admin');
      const target = await createUserWithRole(1, 'admin');
      const res = await putStatus(token, target, 'suspended');
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
      expect((await getUserByEmail(target.email))!.status).toBe('active');
    });

    it('admin suspends the super admin: 403 SUPER_ADMIN_IMMUTABLE', async () => {
      const { token } = await callerToken('admin');
      const target = await createUserWithRole(1, 'super admin');
      const res = await putStatus(token, target, 'suspended');
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SUPER_ADMIN_IMMUTABLE');
      expect((await getUserByEmail(target.email))!.status).toBe('active');
    });

    it('super admin suspends a plain user: 200', async () => {
      const { token } = await callerToken('super admin');
      const target = await createUserWithRole(1, 'user');
      expect((await putStatus(token, target, 'suspended')).status).toBe(200);
    });

    it('super admin suspends an admin: 200', async () => {
      const { token } = await callerToken('super admin');
      const target = await createUserWithRole(1, 'admin');
      const res = await putStatus(token, target, 'suspended');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('suspended');
    });

    it('super admin attempts to suspend the super admin account: 403 SUPER_ADMIN_IMMUTABLE', async () => {
      const { user, token } = await callerToken('super admin');
      const res = await putStatus(token, user, 'suspended');
      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        message: 'Cannot modify a super administrator',
        code: 'SUPER_ADMIN_IMMUTABLE',
      });
      expect((await getUserByEmail(user.email))!.status).toBe('active');
    });
  });

  describe('pending target', () => {
    it.each(['suspended', 'active'] as const)(
      'status %s on a pending user: 422 CANNOT_CHANGE_STATUS_PENDING_USER, user stays pending',
      async (status) => {
        const { token } = await callerToken('admin');
        const pending = await registerPending(1);
        const res = await putStatus(token, pending, status);
        expect(res.status).toBe(422);
        expect(res.body).toEqual({
          message: 'Cannot change the status of a pending user',
          code: 'CANNOT_CHANGE_STATUS_PENDING_USER',
        });
        expect((await getUserByEmail(pending.email))!.status).toBe('pending');
      },
    );
  });

  describe('no-op requests', () => {
    it('suspending an already-suspended user: 200, unchanged user, updated_at and revoked_at untouched', async () => {
      const { token } = await callerToken('admin');
      const target = await createActiveUser(1);
      await seedRefreshToken(target.id, 'tok-a');
      await putStatus(token, target, 'suspended');
      const userBefore = (await getUserByEmail(target.email))!;
      const tokensBefore = await getRefreshTokens(target.id);

      const res = await putStatus(token, target, 'suspended');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('suspended');
      expect(new Date(res.body.updatedAt)).toEqual(userBefore.updated_at);
      expect((await getUserByEmail(target.email))!.updated_at).toEqual(userBefore.updated_at);
      expect((await getRefreshTokens(target.id)).map((t) => t.revoked_at)).toEqual(
        tokensBefore.map((t) => t.revoked_at),
      );
      // One row for the first (real) suspend, none for this no-op repeat.
      expect(await getAuditLogRowsForTarget(target.id)).toHaveLength(1);
    });

    it('unsuspending an already-active user: 200, unchanged user, no revocation', async () => {
      const { token } = await callerToken('admin');
      const target = await createActiveUser(1);
      await seedRefreshToken(target.id, 'tok-a');
      const userBefore = (await getUserByEmail(target.email))!;

      const res = await putStatus(token, target, 'active');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('active');
      expect(new Date(res.body.updatedAt)).toEqual(userBefore.updated_at);
      expect((await getUserByEmail(target.email))!.updated_at).toEqual(userBefore.updated_at);
      expect((await getRefreshTokens(target.id))[0]!.is_revoked).toBe(false);
      expect(await getAuditLogRowsForTarget(target.id)).toHaveLength(0);
    });
  });
});

const REASON_FOR_ROLE: Record<string, string> = { admin: 'APPOINTED_MODERATOR', user: 'ROLE_ENDED' };
const putRole = (
  token: string | undefined,
  target: TestUser | { id: string },
  role: unknown,
  body: Record<string, unknown> = {},
  opts: { elevatedToken?: string | null } = {},
) =>
  put(
    `/users/${target.id}/role`,
    token,
    {
      role,
      ...(typeof role === 'string' && role in REASON_FOR_ROLE ? { reason: REASON_FOR_ROLE[role] } : {}),
      ...body,
    },
    opts,
  );

describe('PUT /users/:id/role', () => {
  describe('authentication and authorization', () => {
    it('rejects a request with no token with 401 UNAUTHORIZED', async () => {
      const target = await createActiveUser(1);
      const res = await put(`/users/${target.id}/role`, undefined, { role: 'admin' });
      expect(res.status).toBe(401);
      expect(res.body).toEqual(UNAUTHORIZED);
    });

    it('rejects a regular admin with 403 FORBIDDEN, before the handler runs (role unchanged)', async () => {
      const { token } = await callerToken('admin');
      const target = await createActiveUser(1);
      const res = await putRole(token, target, 'admin');
      expect(res.status).toBe(403);
      expect(res.body).toEqual(FORBIDDEN);
      expect((await getUserByEmail(target.email))!.role).toBe('user');
    });

    it('rejects an admin even for an invalid body or id: authorize runs first', async () => {
      const { token } = await callerToken('admin');
      const res = await put('/users/abc123/role', token, { role: 'super admin' });
      expect(res.status).toBe(403);
      expect(res.body).toEqual(FORBIDDEN);
    });

    it('rejects a regular user with 403 FORBIDDEN', async () => {
      const { token } = await callerToken('user');
      const target = await createActiveUser(1);
      const res = await putRole(token, target, 'admin');
      expect(res.status).toBe(403);
      expect(res.body).toEqual(FORBIDDEN);
      expect((await getUserByEmail(target.email))!.role).toBe('user');
    });
  });

  describe('elevation (Stage 27b)', () => {
    it('no Elevated-Token: 403 ELEVATION_REQUIRED, no change, no audit row', async () => {
      const { token } = await callerToken('super admin');
      const target = await createActiveUser(1);
      const res = await putRole(token, target, 'admin', {}, { elevatedToken: null });
      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        message: 'Verify your identity to perform this action.',
        code: 'ELEVATION_REQUIRED',
      });
      expect((await getUserByEmail(target.email))!.role).toBe('user');
      expect(await getAuditLogRowsForTarget(target.id)).toHaveLength(0);
    });

    it('a token issued to a different admin (sub mismatch): 403 ELEVATION_REQUIRED', async () => {
      const { token } = await callerToken('super admin', 1);
      const other = await callerToken('super admin', 2);
      const target = await createActiveUser(3);
      const { sid } = jwt.decode(token) as { sid: string };
      const wrongSubToken = signElevationToken({ userId: other.user.id, role: 'super admin', sid });
      const res = await putRole(token, target, 'admin', {}, { elevatedToken: wrongSubToken });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ELEVATION_REQUIRED');
    });

    it('a token from another login of the same admin (sid mismatch): 403 ELEVATION_REQUIRED', async () => {
      const admin = await createUserWithRole(1, 'super admin');
      const { accessToken: token } = await loginTokens(admin);
      const { accessToken: otherLoginToken } = await loginTokens(admin);
      const { sid: otherSid } = jwt.decode(otherLoginToken) as { sid: string };
      const target = await createActiveUser(2);
      const wrongSidToken = signElevationToken({ userId: admin.id, role: 'super admin', sid: otherSid });
      const res = await putRole(token, target, 'admin', {}, { elevatedToken: wrongSidToken });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ELEVATION_REQUIRED');
    });

    it('a valid Elevated-Token with a valid reason: 200, with the Stage 26 audit row', async () => {
      const { token } = await callerToken('super admin');
      const target = await createActiveUser(1);
      const res = await putRole(token, target, 'admin');
      expect(res.status).toBe(200);
      expect(res.body.role).toBe('admin');
      expect(await getAuditLogRowsForTarget(target.id)).toHaveLength(1);
    });

    it('a self-targeting rejection returns its own error first, not ELEVATION_REQUIRED', async () => {
      const { token, user } = await callerToken('super admin');
      const res = await putRole(token, user, 'admin', {}, { elevatedToken: null });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SELF_ROLE_CHANGE');
    });

    it('a no-op role request returns 200 unchanged without elevation', async () => {
      const { token } = await callerToken('super admin');
      const target = await createUserWithRole(1, 'admin');
      const res = await putRole(token, target, 'admin', {}, { elevatedToken: null });
      expect(res.status).toBe(200);
      expect(res.body.role).toBe('admin');
    });

    it('an invalid reason still returns 400 first, before the elevation check', async () => {
      const { token } = await callerToken('super admin');
      const target = await createActiveUser(1);
      const res = await putRole(token, target, 'admin', { reason: 'NOT_A_REAL_CODE' }, { elevatedToken: null });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('promote and demote', () => {
    it('promotes a regular user to admin: 200, role updated, all their refresh tokens revoked', async () => {
      const { token } = await callerToken('super admin');
      const target = await createActiveUser(1);
      await loginTokens(target);
      await seedRefreshToken(target.id, 'extra-token');

      const res = await putRole(token, target, 'admin');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: target.id, role: 'admin', status: 'active' });
      expect(res.body).not.toHaveProperty('password_hash');
      expect((await getUserByEmail(target.email))!.role).toBe('admin');
      const tokens = await getRefreshTokens(target.id);
      expect(tokens.length).toBeGreaterThanOrEqual(2);
      expect(tokens.every((t) => t.is_revoked)).toBe(true);
    });

    it('demotes an admin to user: 200, tokens revoked', async () => {
      const { token } = await callerToken('super admin');
      const target = await createUserWithRole(1, 'admin');
      await loginTokens(target);

      const res = await putRole(token, target, 'user');
      expect(res.status).toBe(200);
      expect(res.body.role).toBe('user');
      expect((await getUserByEmail(target.email))!.role).toBe('user');
      expect((await getRefreshTokens(target.id)).every((t) => t.is_revoked)).toBe(true);
    });
  });

  describe('targets that cannot be changed', () => {
    it('super admin targeting their own id: 403 SELF_ROLE_CHANGE', async () => {
      const { user, token } = await callerToken('super admin');
      const res = await putRole(token, user, 'user');
      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        message: 'Cannot modify your own role',
        code: 'SELF_ROLE_CHANGE',
      });
      expect((await getUserByEmail(user.email))!.role).toBe('super admin');
    });

    it('super admin targeting another super admin account: 403 SUPER_ADMIN_IMMUTABLE', async () => {
      const { token } = await callerToken('super admin');
      const other = await createUserWithRole('sa2', 'super admin');
      const res = await putRole(token, other, 'user');
      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        message: 'Cannot modify a super administrator',
        code: 'SUPER_ADMIN_IMMUTABLE',
      });
      expect((await getUserByEmail(other.email))!.role).toBe('super admin');
    });

    it('nonexistent target: 404 USER_NOT_FOUND', async () => {
      const { token } = await callerToken('super admin');
      const res = await putRole(token, { id: UNKNOWN_ID }, 'admin');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'User not found', code: 'USER_NOT_FOUND' });
    });

    it('a pending user: 422 CANNOT_CHANGE_ROLE_PENDING_USER, role unchanged', async () => {
      const { token } = await callerToken('super admin');
      const pending = await registerPending(1);
      const res = await putRole(token, pending, 'admin');
      expect(res.status).toBe(422);
      expect(res.body).toEqual({
        message: 'Cannot change the role of a pending user',
        code: 'CANNOT_CHANGE_ROLE_PENDING_USER',
      });
      expect((await getUserByEmail(pending.email))!.role).toBe('user');
    });

    it('a suspended user: 422 CANNOT_CHANGE_ROLE_SUSPENDED_USER, role unchanged, no token rows touched', async () => {
      const { token } = await callerToken('super admin');
      const target = await createActiveUser(1);
      await seedRefreshToken(target.id, 'tok-a');
      await setUserStatus(target.id, 'suspended');
      const tokensBefore = await getRefreshTokens(target.id);

      const res = await putRole(token, target, 'admin');
      expect(res.status).toBe(422);
      expect(res.body).toEqual({
        message: 'Cannot change the role of a suspended user',
        code: 'CANNOT_CHANGE_ROLE_SUSPENDED_USER',
      });
      expect((await getUserByEmail(target.email))!.role).toBe('user');
      expect(await getRefreshTokens(target.id)).toEqual(tokensBefore);
    });
  });

  describe('request validation', () => {
    it("rejects role 'super admin' with 400 \"Role must be 'admin' or 'user'\"", async () => {
      const { token } = await callerToken('super admin');
      const target = await createActiveUser(1);
      const res = await putRole(token, target, 'super admin');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        message: "Role must be 'admin' or 'user'",
        code: 'VALIDATION_ERROR',
      });
      expect((await getUserByEmail(target.email))!.role).toBe('user');
    });

    it('rejects a missing role with "Role is required"', async () => {
      const { token } = await callerToken('super admin');
      const target = await createActiveUser(1);
      const res = await put(`/users/${target.id}/role`, token, {});
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'Role is required', code: 'VALIDATION_ERROR' });
    });

    it('rejects a non-string role with "Role must be a string"', async () => {
      const { token } = await callerToken('super admin');
      const target = await createActiveUser(1);
      const res = await putRole(token, target, 123);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'Role must be a string', code: 'VALIDATION_ERROR' });
    });

    it('rejects an extra field with "Request contains unexpected fields"', async () => {
      const { token } = await callerToken('super admin');
      const target = await createActiveUser(1);
      const res = await put(`/users/${target.id}/role`, token, { role: 'admin', status: 'active' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        message: 'Request contains unexpected fields',
        code: 'VALIDATION_ERROR',
      });
      expect((await getUserByEmail(target.email))!.role).toBe('user');
    });

    it('rejects a non-UUID target id with 400 "Invalid user ID"', async () => {
      const { token } = await callerToken('super admin');
      const res = await put('/users/abc123/role', token, { role: 'admin' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'Invalid user ID', code: 'VALIDATION_ERROR' });
    });
  });

  describe('reason validation and audit rows (Stage 26b)', () => {
    it('promoting with a valid reason writes one USER_PROMOTE audit row', async () => {
      const { token, user: actor } = await callerToken('super admin');
      const target = await createActiveUser(1);

      const res = await putRole(token, target, 'admin');
      expect(res.status).toBe(200);
      const rows = await getAuditLogRowsForTarget(target.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actor_id: actor.id,
        action: 'USER_PROMOTE',
        target_id: target.id,
        before: { role: 'user' },
        after: { role: 'admin' },
        reason: 'APPOINTED_MODERATOR',
      });
    });

    it('demoting with a valid reason writes one USER_DEMOTE audit row', async () => {
      const { token } = await callerToken('super admin');
      const target = await createUserWithRole(1, 'admin');

      const res = await putRole(token, target, 'user');
      expect(res.status).toBe(200);
      expect(await getAuditLogRowsForTarget(target.id)).toMatchObject([
        { action: 'USER_DEMOTE', before: { role: 'admin' }, after: { role: 'user' }, reason: 'ROLE_ENDED' },
      ]);
    });

    it('rejects a missing reason with 400, no change, no row', async () => {
      const { token } = await callerToken('super admin');
      const target = await createActiveUser(1);
      const res = await put(`/users/${target.id}/role`, token, { role: 'admin' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'Reason is required', code: 'VALIDATION_ERROR' });
      expect((await getUserByEmail(target.email))!.role).toBe('user');
      expect(await getAuditLogRowsForTarget(target.id)).toHaveLength(0);
    });

    it('rejects a reason code that belongs to a different action', async () => {
      const { token } = await callerToken('super admin');
      const target = await createActiveUser(1);
      const res = await put(`/users/${target.id}/role`, token, { role: 'admin', reason: 'FRAUD_OR_SCAM' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'Invalid reason', code: 'VALIDATION_ERROR' });
    });

    it('no-op promote (admin to admin again) writes no audit row', async () => {
      const { token } = await callerToken('super admin');
      const target = await createUserWithRole(1, 'admin');

      const res = await putRole(token, target, 'admin');
      expect(res.status).toBe(200);
      expect(await getAuditLogRowsForTarget(target.id)).toHaveLength(0);
    });

    it('each existing rejection writes no audit row', async () => {
      const { token, user } = await callerToken('super admin');
      const resSelf = await putRole(token, user, 'user');
      expect(resSelf.status).toBe(403);

      const pending = await registerPending(1);
      const resPending = await putRole(token, pending, 'admin');
      expect(resPending.status).toBe(422);

      expect(await getAuditLogRowsForTarget(user.id)).toHaveLength(0);
      expect(await getAuditLogRowsForTarget(pending.id)).toHaveLength(0);
    });
  });

  describe('stale access tokens and revoked refresh tokens', () => {
    it('after a promotion, the pre-promotion access token (role user) is still rejected by an admin route with 403', async () => {
      const { token } = await callerToken('super admin');
      const target = await createActiveUser(1);
      const { accessToken: oldToken } = await loginTokens(target);

      expect((await putRole(token, target, 'admin')).status).toBe(200);
      const res = await get('/users', oldToken);
      expect(res.status).toBe(403);
      expect(res.body).toEqual(FORBIDDEN);
    });

    it('after a promotion, refreshing with the pre-promotion cookie gets 401 INVALID_REFRESH_TOKEN', async () => {
      const { token } = await callerToken('super admin');
      const target = await createActiveUser(1);
      const { refreshToken } = await loginTokens(target);

      await putRole(token, target, 'admin');
      const res = await api()
        .post('/auth/refresh')
        .set('Cookie', refreshCookie(refreshToken));
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it("after a demotion, the demoted admin's old access token still works on an admin route within its lifetime", async () => {
      const { token } = await callerToken('super admin');
      const target = await createUserWithRole(1, 'admin');
      const { accessToken: oldToken } = await loginTokens(target);

      expect((await putRole(token, target, 'user')).status).toBe(200);
      const res = await get('/users', oldToken);
      expect(res.status).toBe(200);
    });

    it('after a demotion, refreshing with the old cookie gets 401 INVALID_REFRESH_TOKEN', async () => {
      const { token } = await callerToken('super admin');
      const target = await createUserWithRole(1, 'admin');
      const { refreshToken } = await loginTokens(target);

      await putRole(token, target, 'user');
      const res = await api()
        .post('/auth/refresh')
        .set('Cookie', refreshCookie(refreshToken));
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
    });
  });

  describe('no-op requests', () => {
    it('promoting an admin to admin again: 200, unchanged user, no refresh tokens revoked', async () => {
      const { token } = await callerToken('super admin');
      const target = await createUserWithRole(1, 'admin');
      await seedRefreshToken(target.id, 'tok-a');
      const before = (await getUserByEmail(target.email))!;

      const res = await putRole(token, target, 'admin');
      expect(res.status).toBe(200);
      expect(res.body.role).toBe('admin');
      expect(new Date(res.body.updatedAt)).toEqual(before.updated_at);
      expect((await getUserByEmail(target.email))!.updated_at).toEqual(before.updated_at);
      expect((await getRefreshTokens(target.id))[0]!.is_revoked).toBe(false);
    });

    it('demoting a user to user again: 200, unchanged user, no refresh tokens revoked', async () => {
      const { token } = await callerToken('super admin');
      const target = await createActiveUser(1);
      await seedRefreshToken(target.id, 'tok-a');
      const before = (await getUserByEmail(target.email))!;

      const res = await putRole(token, target, 'user');
      expect(res.status).toBe(200);
      expect(res.body.role).toBe('user');
      expect(new Date(res.body.updatedAt)).toEqual(before.updated_at);
      expect((await getUserByEmail(target.email))!.updated_at).toEqual(before.updated_at);
      expect((await getRefreshTokens(target.id))[0]!.is_revoked).toBe(false);
    });
  });
});
