/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Generated Vitest integration tests (real test DB) for users.service.ts, covering the
 *        Stage 9 Verification bullets in instructions.md.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Added tests for changeUserRole, covering the Stage 10 Verification bullets.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Updated the expected keys for the new active_view column (Stage 11); no new test cases.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: Updated the expected UserResponse keys for isLocked/lockedUntil/lockLevel, and added
 *        coverage for listUsers' `locked` filter and unlockUser's permission rules and effect
 *        (clears the login lock and the OTP send blocks), per instructions.md Stage 18d.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: listUsers/getUserById/changeUserStatus/unlockUser calls pass the new requesterId
 *        param (fixture, not a new assertion, except the new masking test below). Added a
 *        getUserById masking test, and a getFullEmail/logUnmaskValidationFailure suite
 *        covering instructions.md Stage 20's 20a Verification bullets (NFR3.1.1).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: changeUserStatus/changeUserRole/unlockUser calls pass the new reason/userAgent
 *        params (fixture values; existing assertions are unchanged). Per instructions.md
 *        Stage 26b.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Replaced the "getFullEmail / logUnmaskValidationFailure" console-log suite with
 *        "getFullEmail (Stage 26c)": asserts EMAIL_UNMASK audit rows instead of `[UNMASK
 *        EMAIL]` console lines, since getFullEmail now takes a `reason` and writes a row
 *        instead of logging. Per instructions.md Stage 26c.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Per author direction in chat (instructions.md Stage 26 "Reasons" amendment):
 *        unlockUser and getFullEmail no longer take a `reason` param; dropped it from every
 *        call site and the one assertion that checked the stored value (now "N/A").
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: changeUserStatus/changeUserRole calls now pass a fixture `sid` and a valid
 *        Elevated-Token (elevationFor), since both now require elevation for a real change
 *        (Stage 27b); existing assertions are unchanged. No requirements, architecture,
 *        schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-fable-5-1), date: 2026-11-10
 * Scope: Fix F3 - added "isLocked and the locked filter use the DB clock": a lock 1 s in the
 *        future / 1 s in the past, asserting isLocked and locked=true|false agree, and that
 *        unlock on the just-expired row is a no-op with no audit row.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as usersService from '../../src/services/users.service.js';
import { signElevationToken } from '../../src/utils/jwt.js';
import {
  dbNow,
  getAuditLogRowsForTarget,
  getOtps,
  getRefreshTokens,
  getUserByEmail,
  getUserById,
  seedRefreshToken,
  setLoginLockState,
  setOtpSendBlock,
  setUserRole,
  setUserStatus,
  truncateAll,
} from '../helpers/db.js';
import { resetEmailMock } from '../helpers/email.js';
import { createActiveUser, createUserWithRole, registerPending } from '../helpers/fixtures.js';

resetEmailMock();
beforeEach(truncateAll);
afterEach(truncateAll);

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

// Fixture device id and a matching valid elevation token, since changeUserStatus/changeUserRole
// now require elevation for a real change (Stage 27b) and these tests call the service layer
// directly, bypassing the HTTP header.
const SID = 'test-sid-1';
function elevationFor(userId: string): string {
  return signElevationToken({ userId, role: 'admin', sid: SID });
}

describe('listUsers', () => {
  it('returns every status with a status field and never a password_hash', async () => {
    await createActiveUser(1);
    await registerPending(2);
    const suspended = await createActiveUser(3);
    await setUserStatus(suspended.id, 'suspended');

    const result = await usersService.listUsers({
      page: 1,
      sortBy: 'createdAt',
      sortDir: 'desc',
      requesterId: UNKNOWN_ID,
    });
    expect(result.users.map((u) => u.status).sort()).toEqual(['active', 'pending', 'suspended']);
    for (const u of result.users) {
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

describe('getUserById', () => {
  it.each(['active', 'pending', 'suspended'] as const)(
    'returns a %s user with its status and no password_hash',
    async (status) => {
      const u = await createActiveUser(1);
      await setUserStatus(u.id, status);
      // Requester is the target's own id (self-view), so email comes back unmasked here;
      // masking itself is covered separately below.
      const got = await usersService.getUserById(u.id, u.id);
      expect(got).toMatchObject({ id: u.id, username: u.username, email: u.email, status });
      expect(got).not.toHaveProperty('password_hash');
    },
  );

  it('masks the email unless the requester is the target themselves (Stage 20, NFR3.1.1)', async () => {
    const u = await createActiveUser(1);
    const masked = await usersService.getUserById(u.id, UNKNOWN_ID);
    expect(masked.email).not.toBe(u.email);
    expect(masked.email).toMatch(/^.\*\*\*@/);

    const unmasked = await usersService.getUserById(u.id, u.id);
    expect(unmasked.email).toBe(u.email);
  });

  it('throws 404 USER_NOT_FOUND for an id that does not exist', async () => {
    await expect(usersService.getUserById(UNKNOWN_ID, UNKNOWN_ID)).rejects.toMatchObject({
      status: 404,
      code: 'USER_NOT_FOUND',
    });
  });
});

describe('changeUserStatus', () => {
  it('suspends an active user, revokes all their refresh tokens and strips password_hash', async () => {
    const target = await createActiveUser(1);
    await seedRefreshToken(target.id, 'tok-a');
    await seedRefreshToken(target.id, 'tok-b');

    const result = await usersService.changeUserStatus(UNKNOWN_ID, 'admin', SID, target.id, 'suspended', 'TEST_REASON', null, elevationFor(UNKNOWN_ID));
    expect(result.status).toBe('suspended');
    expect(result).not.toHaveProperty('password_hash');
    const tokens = await getRefreshTokens(target.id);
    expect(tokens).toHaveLength(2);
    expect(tokens.every((t) => t.is_revoked)).toBe(true);
  });

  it('unsuspends a suspended user without touching their tokens', async () => {
    const target = await createActiveUser(1);
    await seedRefreshToken(target.id, 'tok-a');
    await usersService.changeUserStatus(UNKNOWN_ID, 'admin', SID, target.id, 'suspended', 'TEST_REASON', null, elevationFor(UNKNOWN_ID));
    const before = await getRefreshTokens(target.id);

    const result = await usersService.changeUserStatus(UNKNOWN_ID, 'admin', SID, target.id, 'active', 'TEST_REASON', null, elevationFor(UNKNOWN_ID));
    expect(result.status).toBe('active');
    expect(await getRefreshTokens(target.id)).toEqual(before);
  });

  it('throws 404 USER_NOT_FOUND for a nonexistent target', async () => {
    await expect(
      usersService.changeUserStatus(UNKNOWN_ID, 'admin', SID, UNKNOWN_ID, 'suspended', 'TEST_REASON', null, elevationFor(UNKNOWN_ID)),
    ).rejects.toMatchObject({ status: 404, code: 'USER_NOT_FOUND' });
  });

  describe('target role restriction', () => {
    it('admin may suspend a plain user', async () => {
      const t = await createUserWithRole(1, 'user');
      expect(
        (await usersService.changeUserStatus(UNKNOWN_ID, 'admin', SID, t.id, 'suspended', 'TEST_REASON', null, elevationFor(UNKNOWN_ID))).status,
      ).toBe('suspended');
    });

    it('admin may not suspend an admin: 403 FORBIDDEN, nothing changes', async () => {
      const t = await createUserWithRole(1, 'admin');
      await seedRefreshToken(t.id, 'tok-a');
      await expect(
        usersService.changeUserStatus(UNKNOWN_ID, 'admin', SID, t.id, 'suspended', 'TEST_REASON', null, elevationFor(UNKNOWN_ID)),
      ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
      expect((await getUserByEmail(t.email))!.status).toBe('active');
      expect((await getRefreshTokens(t.id))[0]!.is_revoked).toBe(false);
    });

    it.each(['admin', 'super admin'])(
      '%s may not suspend a super admin: 403 SUPER_ADMIN_IMMUTABLE',
      async (requestorRole) => {
        const t = await createUserWithRole(1, 'super admin');
        await expect(
          usersService.changeUserStatus(UNKNOWN_ID, requestorRole, SID, t.id, 'suspended', 'TEST_REASON', null, elevationFor(UNKNOWN_ID)),
        ).rejects.toMatchObject({ status: 403, code: 'SUPER_ADMIN_IMMUTABLE' });
        expect((await getUserByEmail(t.email))!.status).toBe('active');
      },
    );

    it('super admin may suspend a plain user and an admin', async () => {
      const u = await createUserWithRole(1, 'user');
      const a = await createUserWithRole(2, 'admin');
      expect(
        (await usersService.changeUserStatus(UNKNOWN_ID, 'super admin', SID, u.id, 'suspended', 'TEST_REASON', null, elevationFor(UNKNOWN_ID))).status,
      ).toBe('suspended');
      expect(
        (await usersService.changeUserStatus(UNKNOWN_ID, 'super admin', SID, a.id, 'suspended', 'TEST_REASON', null, elevationFor(UNKNOWN_ID))).status,
      ).toBe('suspended');
    });

    it('checks the role restriction before the pending-target rule', async () => {
      const t = await createUserWithRole(1, 'super admin');
      await setUserStatus(t.id, 'pending');
      await expect(
        usersService.changeUserStatus(UNKNOWN_ID, 'admin', SID, t.id, 'suspended', 'TEST_REASON', null, elevationFor(UNKNOWN_ID)),
      ).rejects.toMatchObject({ code: 'SUPER_ADMIN_IMMUTABLE' });
    });
  });

  describe('pending target', () => {
    it.each(['suspended', 'active'] as const)(
      'cannot be set to %s: 422 CANNOT_CHANGE_STATUS_PENDING_USER, stays pending',
      async (status) => {
        const pending = await registerPending(1);
        await expect(
          usersService.changeUserStatus(UNKNOWN_ID, 'admin', SID, pending.id, status, 'TEST_REASON', null, elevationFor(UNKNOWN_ID)),
        ).rejects.toMatchObject({
          status: 422,
          message: 'Cannot change the status of a pending user',
          code: 'CANNOT_CHANGE_STATUS_PENDING_USER',
        });
        expect((await getUserByEmail(pending.email))!.status).toBe('pending');
      },
    );
  });

  describe('no-op requests', () => {
    it('suspending an already-suspended user returns it unchanged: same updated_at and revoked_at', async () => {
      const t = await createActiveUser(1);
      await seedRefreshToken(t.id, 'tok-a');
      await usersService.changeUserStatus(UNKNOWN_ID, 'admin', SID, t.id, 'suspended', 'TEST_REASON', null, elevationFor(UNKNOWN_ID));
      const userBefore = (await getUserByEmail(t.email))!;
      const tokensBefore = await getRefreshTokens(t.id);

      const result = await usersService.changeUserStatus(UNKNOWN_ID, 'admin', SID, t.id, 'suspended', 'TEST_REASON', null, elevationFor(UNKNOWN_ID));
      expect(result.status).toBe('suspended');
      expect(result.updatedAt).toEqual(userBefore.updated_at);
      expect((await getUserByEmail(t.email))!.updated_at).toEqual(userBefore.updated_at);
      expect((await getRefreshTokens(t.id)).map((x) => x.revoked_at)).toEqual(
        tokensBefore.map((x) => x.revoked_at),
      );
    });

    it('unsuspending an already-active user returns it unchanged and revokes nothing', async () => {
      const t = await createActiveUser(1);
      await seedRefreshToken(t.id, 'tok-a');
      const userBefore = (await getUserByEmail(t.email))!;

      const result = await usersService.changeUserStatus(UNKNOWN_ID, 'admin', SID, t.id, 'active', 'TEST_REASON', null, elevationFor(UNKNOWN_ID));
      expect(result.status).toBe('active');
      expect(result.updatedAt).toEqual(userBefore.updated_at);
      expect((await getUserByEmail(t.email))!.updated_at).toEqual(userBefore.updated_at);
      expect((await getRefreshTokens(t.id))[0]!.is_revoked).toBe(false);
    });
  });

  it('does not change the target role', async () => {
    const t = await createUserWithRole(1, 'user');
    await setUserRole(t.id, 'user');
    const result = await usersService.changeUserStatus(UNKNOWN_ID, 'admin', SID, t.id, 'suspended', 'TEST_REASON', null, elevationFor(UNKNOWN_ID));
    expect(result.role).toBe('user');
  });
});

describe('changeUserRole', () => {
  async function superAdmin() {
    return createUserWithRole('sa', 'super admin');
  }

  it('promotes a user to admin, revokes all their refresh tokens and strips password_hash', async () => {
    const sa = await superAdmin();
    const target = await createActiveUser(1);
    await seedRefreshToken(target.id, 'tok-a');
    await seedRefreshToken(target.id, 'tok-b');

    const result = await usersService.changeUserRole(sa.id, SID, target.id, 'admin', 'TEST_REASON', null, elevationFor(sa.id));
    expect(result.role).toBe('admin');
    expect(result).not.toHaveProperty('password_hash');
    expect((await getUserByEmail(target.email))!.role).toBe('admin');
    const tokens = await getRefreshTokens(target.id);
    expect(tokens).toHaveLength(2);
    expect(tokens.every((t) => t.is_revoked)).toBe(true);
  });

  it('demotes an admin to user and revokes all their refresh tokens', async () => {
    const sa = await superAdmin();
    const target = await createUserWithRole(1, 'admin');
    await seedRefreshToken(target.id, 'tok-a');

    const result = await usersService.changeUserRole(sa.id, SID, target.id, 'user', 'TEST_REASON', null, elevationFor(sa.id));
    expect(result.role).toBe('user');
    expect((await getRefreshTokens(target.id)).every((t) => t.is_revoked)).toBe(true);
  });

  it('does not change the target status', async () => {
    const sa = await superAdmin();
    const target = await createActiveUser(1);
    expect((await usersService.changeUserRole(sa.id, SID, target.id, 'admin', 'TEST_REASON', null, elevationFor(sa.id))).status).toBe('active');
  });

  it('rejects changing your own role: 403 SELF_ROLE_CHANGE, before touching the DB', async () => {
    const sa = await superAdmin();
    await expect(usersService.changeUserRole(sa.id, SID, sa.id, 'user', 'TEST_REASON', null, elevationFor(sa.id))).rejects.toMatchObject({
      status: 403,
      message: 'Cannot modify your own role',
      code: 'SELF_ROLE_CHANGE',
    });
    expect((await getUserByEmail(sa.email))!.role).toBe('super admin');
  });

  it('self-targeting is rejected even for an id that does not exist', async () => {
    await expect(
      usersService.changeUserRole(UNKNOWN_ID, SID, UNKNOWN_ID, 'admin', 'TEST_REASON', null, elevationFor(UNKNOWN_ID)),
    ).rejects.toMatchObject({ code: 'SELF_ROLE_CHANGE' });
  });

  it('rejects a super admin target (a second super admin): 403 SUPER_ADMIN_IMMUTABLE', async () => {
    const sa = await superAdmin();
    const other = await createUserWithRole('sa2', 'super admin');
    await seedRefreshToken(other.id, 'tok-a');
    await expect(usersService.changeUserRole(sa.id, SID, other.id, 'user', 'TEST_REASON', null, elevationFor(sa.id))).rejects.toMatchObject({
      status: 403,
      message: 'Cannot modify a super administrator',
      code: 'SUPER_ADMIN_IMMUTABLE',
    });
    expect((await getUserByEmail(other.email))!.role).toBe('super admin');
    expect((await getRefreshTokens(other.id))[0]!.is_revoked).toBe(false);
  });

  it('throws 404 USER_NOT_FOUND for a nonexistent target', async () => {
    const sa = await superAdmin();
    await expect(usersService.changeUserRole(sa.id, SID, UNKNOWN_ID, 'admin', 'TEST_REASON', null, elevationFor(sa.id))).rejects.toMatchObject({
      status: 404,
      code: 'USER_NOT_FOUND',
    });
  });

  describe('non-active target', () => {
    it.each(['admin', 'user'] as const)(
      'a pending user cannot be set to %s: 422 CANNOT_CHANGE_ROLE_PENDING_USER, role unchanged',
      async (role) => {
        const sa = await superAdmin();
        const pending = await registerPending(1);
        await expect(usersService.changeUserRole(sa.id, SID, pending.id, role, 'TEST_REASON', null, elevationFor(sa.id))).rejects.toMatchObject({
          status: 422,
          message: 'Cannot change the role of a pending user',
          code: 'CANNOT_CHANGE_ROLE_PENDING_USER',
        });
        expect((await getUserByEmail(pending.email))!.role).toBe('user');
      },
    );

    it.each(['admin', 'user'] as const)(
      'a suspended user cannot be set to %s: 422 CANNOT_CHANGE_ROLE_SUSPENDED_USER, tokens untouched',
      async (role) => {
        const sa = await superAdmin();
        const target = await createActiveUser(1);
        await seedRefreshToken(target.id, 'tok-a');
        await setUserStatus(target.id, 'suspended');
        await expect(usersService.changeUserRole(sa.id, SID, target.id, role, 'TEST_REASON', null, elevationFor(sa.id))).rejects.toMatchObject({
          status: 422,
          message: 'Cannot change the role of a suspended user',
          code: 'CANNOT_CHANGE_ROLE_SUSPENDED_USER',
        });
        expect((await getUserByEmail(target.email))!.role).toBe('user');
        expect((await getRefreshTokens(target.id))[0]!.is_revoked).toBe(false);
      },
    );

    it('is rejected before the no-op case: a suspended user "set" to their current role', async () => {
      const sa = await superAdmin();
      const target = await createUserWithRole(1, 'admin');
      await setUserStatus(target.id, 'suspended');
      await expect(usersService.changeUserRole(sa.id, SID, target.id, 'admin', 'TEST_REASON', null, elevationFor(sa.id))).rejects.toMatchObject({
        code: 'CANNOT_CHANGE_ROLE_SUSPENDED_USER',
      });
    });

    it('checks the super admin rule before the non-active rule', async () => {
      const sa = await superAdmin();
      const other = await createUserWithRole('sa2', 'super admin');
      await setUserStatus(other.id, 'suspended');
      await expect(usersService.changeUserRole(sa.id, SID, other.id, 'user', 'TEST_REASON', null, elevationFor(sa.id))).rejects.toMatchObject({
        code: 'SUPER_ADMIN_IMMUTABLE',
      });
    });
  });

  describe('no-op requests', () => {
    it('promoting an admin to admin returns it unchanged: same updated_at, no revocation', async () => {
      const sa = await superAdmin();
      const target = await createUserWithRole(1, 'admin');
      await seedRefreshToken(target.id, 'tok-a');
      const before = (await getUserByEmail(target.email))!;

      const result = await usersService.changeUserRole(sa.id, SID, target.id, 'admin', 'TEST_REASON', null, elevationFor(sa.id));
      expect(result.role).toBe('admin');
      expect(result.updatedAt).toEqual(before.updated_at);
      expect((await getUserByEmail(target.email))!.updated_at).toEqual(before.updated_at);
      expect((await getRefreshTokens(target.id))[0]!.is_revoked).toBe(false);
    });

    it('demoting a user to user returns it unchanged: same updated_at, no revocation', async () => {
      const sa = await superAdmin();
      const target = await createActiveUser(1);
      await seedRefreshToken(target.id, 'tok-a');
      const before = (await getUserByEmail(target.email))!;

      const result = await usersService.changeUserRole(sa.id, SID, target.id, 'user', 'TEST_REASON', null, elevationFor(sa.id));
      expect(result.role).toBe('user');
      expect(result.updatedAt).toEqual(before.updated_at);
      expect((await getUserByEmail(target.email))!.updated_at).toEqual(before.updated_at);
      expect((await getRefreshTokens(target.id))[0]!.is_revoked).toBe(false);
    });
  });
});

describe('listUsers locked filter (Stage 18d)', () => {
  it('locked=true/false partition the result set', async () => {
    const locked = await createActiveUser(1);
    await setLoginLockState(locked.id, { lockLevel: 1, lockedUntilMinutesFromNow: 60 });
    const notLocked = await createActiveUser(2);

    const lockedOnly = await usersService.listUsers({
      page: 1,
      locked: true,
      sortBy: 'createdAt',
      sortDir: 'desc',
      requesterId: UNKNOWN_ID,
    });
    expect(lockedOnly.users.map((u) => u.id)).toEqual([locked.id]);
    expect(lockedOnly.users[0]!.isLocked).toBe(true);
    expect(lockedOnly.users[0]!.lockLevel).toBe(1);

    const notLockedOnly = await usersService.listUsers({
      page: 1,
      locked: false,
      sortBy: 'createdAt',
      sortDir: 'desc',
      requesterId: UNKNOWN_ID,
    });
    expect(notLockedOnly.users.map((u) => u.id)).toEqual([notLocked.id]);
  });

  it('an expired lock counts as not locked', async () => {
    const u = await createActiveUser(1);
    await setLoginLockState(u.id, { lockLevel: 1, lockedUntilMinutesFromNow: -1 });
    const result = await usersService.listUsers({
      page: 1,
      locked: false,
      sortBy: 'createdAt',
      sortDir: 'desc',
      requesterId: UNKNOWN_ID,
    });
    expect(result.users.map((r) => r.id)).toContain(u.id);
  });
});

// Fix F3: isLocked, the `locked` filter and unlock's lock-vs-no-op decision all come from one
// SQL expression against clock_timestamp(), so they cannot disagree even 1 s either side of the
// boundary (the old mapper compared against the app server's Date.now()).
describe('isLocked and the locked filter use the DB clock (fix F3)', () => {
  const listIds = async (locked: boolean) =>
    (
      await usersService.listUsers({
        page: 1,
        locked,
        sortBy: 'createdAt',
        sortDir: 'desc',
        requesterId: UNKNOWN_ID,
      })
    ).users.map((u) => u.id);

  it('a lock ending 1 s in the future: isLocked true, in locked=true, not in locked=false', async () => {
    const u = await createActiveUser(1);
    await setLoginLockState(u.id, { lockLevel: 1, lockedUntilSecondsFromNow: 1 });

    const shown = await usersService.getUserById(u.id, UNKNOWN_ID);
    expect(shown.isLocked).toBe(true);
    expect(await listIds(true)).toEqual([u.id]);
    expect(await listIds(false)).toEqual([]);
  });

  it('a lock that ended 1 s ago: isLocked false, in locked=false, not in locked=true', async () => {
    const u = await createActiveUser(1);
    await setLoginLockState(u.id, { lockLevel: 1, lockedUntilSecondsFromNow: -1 });

    const shown = await usersService.getUserById(u.id, UNKNOWN_ID);
    expect(shown.isLocked).toBe(false);
    expect(shown.lockedUntil).not.toBeNull();
    expect(await listIds(false)).toEqual([u.id]);
    expect(await listIds(true)).toEqual([]);
  });

  it('unlock on a lock that ended 1 s ago is a no-op: nothing cleared, no audit row', async () => {
    const target = await createActiveUser(1);
    await setLoginLockState(target.id, {
      lockLevel: 2,
      lockedUntilSecondsFromNow: -1,
      failedAttempts: 3,
    });
    const before = (await getUserById(target.id))!;

    const result = await usersService.unlockUser(UNKNOWN_ID, 'admin', target.id, null);
    expect(result.isLocked).toBe(false);
    expect(result.lockLevel).toBe(2);
    expect(result.lockedUntil).toEqual(before.login_locked_until);

    const after = (await getUserById(target.id))!;
    expect(after.login_locked_until).toEqual(before.login_locked_until);
    expect(after.login_lock_level).toBe(2);
    expect(after.login_failed_attempts).toBe(3);
    expect(after.updated_at).toEqual(before.updated_at);
    expect(await getAuditLogRowsForTarget(target.id)).toEqual([]);
  });

  it('unlock on a lock ending 1 s in the future clears it and writes one USER_UNLOCK row', async () => {
    const target = await createActiveUser(1);
    await setLoginLockState(target.id, { lockLevel: 1, lockedUntilSecondsFromNow: 1 });

    const result = await usersService.unlockUser(UNKNOWN_ID, 'admin', target.id, null);
    expect(result).toMatchObject({ isLocked: false, lockedUntil: null, lockLevel: 0 });

    const rows = await getAuditLogRowsForTarget(target.id);
    expect(rows.map((r) => r.action)).toEqual(['USER_UNLOCK']);
  });
});

describe('unlockUser (Stage 18d)', () => {
  it('clears the login lock and its escalation', async () => {
    await createUserWithRole('sa', 'super admin');
    const target = await createActiveUser(1);
    await setLoginLockState(target.id, {
      lockLevel: 2,
      lockedUntilMinutesFromNow: 60,
      failedAttempts: 5,
    });

    const result = await usersService.unlockUser(UNKNOWN_ID, 'super admin', target.id, null);
    expect(result).toMatchObject({ isLocked: false, lockedUntil: null, lockLevel: 0 });

    const row = (await getUserById(target.id))!;
    expect(row.login_failed_attempts).toBe(0);
    expect(row.login_failure_window_start).toBeNull();
    expect(row.login_locked_until).toBeNull();
    expect(row.login_lock_level).toBe(0);
  });

  it('clears the OTP send blocks and their escalation for all three purposes', async () => {
    const target = await createActiveUser(1);
    for (const purpose of ['Forgot Password', 'Change Email', 'Change Password'] as const) {
      await setOtpSendBlock(target.id, purpose, { level: 2, blockedUntilMinutesFromNow: 60 });
    }

    await usersService.unlockUser(UNKNOWN_ID, 'super admin', target.id, null);

    for (const purpose of ['Forgot Password', 'Change Email', 'Change Password'] as const) {
      const rows = await getOtps(target.id, purpose);
      for (const row of rows) {
        expect(row.send_escalation_level).toBe(0);
        expect(row.send_blocked_until).toBeNull();
      }
    }
  });

  it('throws 404 USER_NOT_FOUND for an id that does not exist', async () => {
    await expect(usersService.unlockUser(UNKNOWN_ID, 'admin', UNKNOWN_ID, null)).rejects.toMatchObject({
      status: 404,
      code: 'USER_NOT_FOUND',
    });
  });

  it('throws 403 SUPER_ADMIN_IMMUTABLE on a super-admin target', async () => {
    const otherSa = await createUserWithRole('sa2', 'super admin');
    await setLoginLockState(otherSa.id, { lockLevel: 1, lockedUntilMinutesFromNow: 60 });
    await expect(
      usersService.unlockUser(UNKNOWN_ID, 'super admin', otherSa.id, null),
    ).rejects.toMatchObject({
      status: 403,
      code: 'SUPER_ADMIN_IMMUTABLE',
    });
  });

  it('throws 403 FORBIDDEN when an admin targets another admin, but a super admin may unlock an admin', async () => {
    const admin2 = await createUserWithRole('admin2', 'admin');
    await setLoginLockState(admin2.id, { lockLevel: 1, lockedUntilMinutesFromNow: 60 });
    await expect(usersService.unlockUser(UNKNOWN_ID, 'admin', admin2.id, null)).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });

    const result = await usersService.unlockUser(UNKNOWN_ID, 'super admin', admin2.id, null);
    expect(result.isLocked).toBe(false);
  });

  it('an admin may unlock a plain user', async () => {
    const target = await createActiveUser(1);
    await setLoginLockState(target.id, { lockLevel: 1, lockedUntilMinutesFromNow: 60 });
    const result = await usersService.unlockUser(UNKNOWN_ID, 'admin', target.id, null);
    expect(result.isLocked).toBe(false);
  });
});

describe('getFullEmail (Stage 26c, NFR3.1.1)', () => {
  const UA = 'Mozilla/5.0 Test Agent';

  it('an admin may unmask a plain user, a pending user, a suspended user and another admin, each with one EMAIL_UNMASK row', async () => {
    const admin = await createUserWithRole('admin', 'admin');
    const user = await createActiveUser(1);
    const pending = await registerPending(2);
    const suspended = await createActiveUser(3);
    await setUserStatus(suspended.id, 'suspended');
    const admin2 = await createUserWithRole('admin2', 'admin');

    for (const target of [user, pending, suspended, admin2]) {
      const result = await usersService.getFullEmail(admin.id, target.id, UA);
      expect(result).toEqual({ email: target.email });
      const rows = await getAuditLogRowsForTarget(target.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actor_id: admin.id,
        action: 'EMAIL_UNMASK',
        target_id: target.id,
        before: null,
        after: null,
        reason: 'N/A',
        user_agent: UA,
      });
    }
  });

  it('a super admin may unmask a plain user and an admin', async () => {
    const sa = await createUserWithRole('sa', 'super admin');
    const user = await createActiveUser(1);
    const admin = await createUserWithRole('admin', 'admin');

    for (const target of [user, admin]) {
      expect(await usersService.getFullEmail(sa.id, target.id, UA)).toEqual({
        email: target.email,
      });
      expect(await getAuditLogRowsForTarget(target.id)).toHaveLength(1);
    }
  });

  it('any caller targeting a super admin is denied FORBIDDEN, with no row', async () => {
    const admin = await createUserWithRole('admin', 'admin');
    const sa = await createUserWithRole('sa', 'super admin');

    await expect(usersService.getFullEmail(admin.id, sa.id, UA)).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
      message: "Cannot unmask a super administrator's email",
    });
    expect(await getAuditLogRowsForTarget(sa.id)).toHaveLength(0);
  });

  it('a super admin targeting their own id is also denied (no self-exception), no row', async () => {
    const sa = await createUserWithRole('sa', 'super admin');
    await expect(usersService.getFullEmail(sa.id, sa.id, UA)).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
    expect(await getAuditLogRowsForTarget(sa.id)).toHaveLength(0);
  });

  it('an admin targeting their own id is granted, with one row', async () => {
    const admin = await createUserWithRole('admin', 'admin');
    const result = await usersService.getFullEmail(admin.id, admin.id, UA);
    expect(result).toEqual({ email: admin.email });
    expect(await getAuditLogRowsForTarget(admin.id)).toHaveLength(1);
  });

  it('an unknown target UUID is denied USER_NOT_FOUND, no row', async () => {
    const admin = await createUserWithRole('admin', 'admin');

    await expect(usersService.getFullEmail(admin.id, UNKNOWN_ID, UA)).rejects.toMatchObject({
      status: 404,
      code: 'USER_NOT_FOUND',
    });
  });

  it('a NULL user agent is stored as NULL', async () => {
    const admin = await createUserWithRole('admin', 'admin');
    const target = await createActiveUser(1);

    await usersService.getFullEmail(admin.id, target.id, null);

    const [row] = await getAuditLogRowsForTarget(target.id);
    expect(row!.user_agent).toBeNull();
  });

  it("created_at comes from the database clock, not the service's own clock", async () => {
    const admin = await createUserWithRole('admin', 'admin');
    const target = await createActiveUser(1);

    const before = await dbNow();
    await usersService.getFullEmail(admin.id, target.id, UA);
    const after = await dbNow();

    const [row] = await getAuditLogRowsForTarget(target.id);
    expect(row!.created_at.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(row!.created_at.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('force insertAuditLog to throw: the error propagates and the email is not returned', async () => {
    const admin = await createUserWithRole('admin', 'admin');
    const target = await createActiveUser(1);
    const auditLogQueries = await import('../../src/db/queries/auditLog.queries.js');
    const spy = vi
      .spyOn(auditLogQueries, 'insertAuditLog')
      .mockRejectedValueOnce(new Error('insert failed'));

    await expect(usersService.getFullEmail(admin.id, target.id, UA)).rejects.toThrow(
      'insert failed',
    );
    expect(await getAuditLogRowsForTarget(target.id)).toHaveLength(0);
    spy.mockRestore();
  });
});
