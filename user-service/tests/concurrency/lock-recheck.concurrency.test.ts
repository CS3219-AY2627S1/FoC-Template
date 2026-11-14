// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-26
// 26/09/2026: Stage 7 - deterministic re-check-after-lock tests (a held row lock forces the interleaving)
// Author review:
// 27/09/2026: Stage 9 - changeUserStatus re-checks the locked row
// Author review:
// 27/09/2026: Stage 10 - changeUserRole re-checks the locked row
// Author review:
// 2026-11-04: Stage 20 - changeUserStatus calls pass the new requesterId param (fixture, not
//   a new assertion: these tests are about the re-check race, not email masking).
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-06: Stage 26b - changeUserStatus/changeUserRole calls pass the new reason/userAgent
//   params (fixture values, not a new assertion: these tests are about the re-check race).
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-09: Stage 27b - changeUserStatus/changeUserRole calls pass a fixture sid and a valid
//   Elevated-Token (elevationFor), since both now require elevation for a real change (fixture
//   values, not a new assertion: these tests are about the re-check race).
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-10: Bug fix - verifyRegistrationOtp/resendRegistrationOtp calls in the "registration
//   OTP flows re-check the locked row" describe block now pass the calling test's own
//   registerPending pendingToken, since those service functions now require it (the new
//   cross-check against the account named by `email`). No assertions or race setup changed.
//   Tool: Claude Code (model: claude-sonnet-5). Governing decision: bug report + team decisions
//   recorded in this task's conversation (pending-token cookie mechanism). No requirements,
//   architecture, schema, or API decisions were made by the AI tool.
// Author review:
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as authService from '../../src/services/auth.service.js';
import * as usersService from '../../src/services/users.service.js';
import { AppError } from '../../src/utils/AppError.js';
import { signElevationToken } from '../../src/utils/jwt.js';
import { NEW_PASSWORD, PASSWORD } from '../helpers/constants.js';
import {
  expireOtps,
  getOtps,
  getRefreshTokens,
  getUserByEmail,
  seedOtp,
  seedRefreshToken,
  truncateAll,
  waitForLockWaiters,
  withHeldUserLock,
} from '../helpers/db.js';
import { latestOtpFor, resetEmailMock } from '../helpers/email.js';
import {
  createActiveUser,
  createUserWithRole,
  registerPending,
  userInput,
} from '../helpers/fixtures.js';
import jwt from 'jsonwebtoken';

resetEmailMock();
beforeEach(truncateAll);
afterEach(truncateAll);

// Fixture device id and a matching valid elevation token (Stage 27b): these tests call the
// service layer directly, bypassing the HTTP header.
const SID = 'test-sid-1';
function elevationFor(userId: string): string {
  return signElevationToken({ userId, role: 'admin', sid: SID });
}

// These tests are about the lock re-check race, not email masking, so any id that is not the
// target's own works as the requester.
const ACTOR_ID = '00000000-0000-4000-8000-000000000000';

// Holds the user's row lock, starts `start()` (which must block on that lock), applies `change`
// inside the held transaction, commits, then returns how `start()` settled. This forces the
// "state changed while the request waited for the lock" interleaving deterministically.
async function raceAgainstChange<T>(
  userId: string,
  start: () => Promise<T>,
  change: (client: import('pg').PoolClient) => Promise<void>,
): Promise<{ value?: T; error?: unknown }> {
  // Wrapped in an object: returning the promise itself would make withHeldUserLock wait for it
  // before committing, and it cannot settle until the commit releases the lock.
  const { pending } = await withHeldUserLock(userId, async (client) => {
    const p = start().then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await waitForLockWaiters();
    await change(client);
    return { pending: p };
  });
  return pending;
}

function expectAppError(error: unknown, status: number, code: string) {
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ status, code });
}

describe('login re-checks the locked row', () => {
  it('a password changed while login waited: 401 INVALID_CREDENTIALS, no refresh token issued', async () => {
    const u = await createActiveUser(1);
    const { error } = await raceAgainstChange(
      u.id,
      () => authService.login({ identifier: u.email, password: PASSWORD }, null, null),
      async (c) => {
        await c.query(`UPDATE users SET password_hash = 'changed-hash' WHERE id = $1`, [u.id]);
      },
    );
    expectAppError(error, 401, 'INVALID_CREDENTIALS');
    expect(await getRefreshTokens(u.id)).toHaveLength(0);
  });

  it('a suspension that committed while login waited: 403 ACCOUNT_SUSPENDED, no refresh token issued', async () => {
    const u = await createActiveUser(1);
    const { error } = await raceAgainstChange(
      u.id,
      () => authService.login({ identifier: u.email, password: PASSWORD }, null, null),
      async (c) => {
        await c.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [u.id]);
      },
    );
    expectAppError(error, 403, 'ACCOUNT_SUSPENDED');
    expect(await getRefreshTokens(u.id)).toHaveLength(0);
  });

  it('a user deleted while login waited: 401 INVALID_CREDENTIALS', async () => {
    const u = await createActiveUser(1);
    const { error } = await raceAgainstChange(
      u.id,
      () => authService.login({ identifier: u.email, password: PASSWORD }, null, null),
      async (c) => {
        await c.query('DELETE FROM users WHERE id = $1', [u.id]);
      },
    );
    expectAppError(error, 401, 'INVALID_CREDENTIALS');
  });

  it('a role change while login waited: the token and response use the freshly locked role', async () => {
    const u = await createActiveUser(1);
    const { value } = await raceAgainstChange(
      u.id,
      () => authService.login({ identifier: u.email, password: PASSWORD }, null, null),
      async (c) => {
        await c.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [u.id]);
      },
    );
    expect(value!.user.role).toBe('admin');
    expect(jwt.decode(value!.accessToken)).toMatchObject({ role: 'admin' });
  });
});

describe('refresh re-checks the locked rows', () => {
  it('a logout that committed while refresh waited: 401 INVALID_REFRESH_TOKEN', async () => {
    const u = await createActiveUser(1);
    await seedRefreshToken(u.id, 'tok');
    const { error } = await raceAgainstChange(
      u.id,
      () => authService.refresh('tok'),
      async (c) => {
        await c.query(
          'UPDATE refresh_tokens SET is_revoked = TRUE, revoked_at = NOW() WHERE user_id = $1',
          [u.id],
        );
      },
    );
    expectAppError(error, 401, 'INVALID_REFRESH_TOKEN');
  });

  it('a suspension that committed while refresh waited: 403 ACCOUNT_SUSPENDED', async () => {
    const u = await createActiveUser(1);
    await seedRefreshToken(u.id, 'tok');
    const { error } = await raceAgainstChange(
      u.id,
      () => authService.refresh('tok'),
      async (c) => {
        await c.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [u.id]);
      },
    );
    expectAppError(error, 403, 'ACCOUNT_SUSPENDED');
  });

  it('a promotion that committed while refresh waited: the new token carries the new role', async () => {
    const u = await createActiveUser(1);
    await seedRefreshToken(u.id, 'tok');
    const { value } = await raceAgainstChange(
      u.id,
      () => authService.refresh('tok'),
      async (c) => {
        await c.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [u.id]);
      },
    );
    expect(jwt.decode(value!.accessToken)).toMatchObject({ role: 'admin' });
  });

  it('a user deleted while refresh waited: 401 INVALID_REFRESH_TOKEN', async () => {
    const u = await createActiveUser(1);
    await seedRefreshToken(u.id, 'tok');
    const { error } = await raceAgainstChange(
      u.id,
      () => authService.refresh('tok'),
      async (c) => {
        await c.query('DELETE FROM users WHERE id = $1', [u.id]);
      },
    );
    expectAppError(error, 401, 'INVALID_REFRESH_TOKEN');
  });
});

describe('registration OTP flows re-check the locked row', () => {
  it('verify: a user activated while verify waited gets INVALID_OTP and the OTP is not consumed by verify', async () => {
    const u = await registerPending(1);
    const otp = latestOtpFor(u.email);
    const { error } = await raceAgainstChange(
      u.id,
      () => authService.verifyRegistrationOtp({ email: u.email, otp, pendingToken: u.pendingToken }),
      async (c) => {
        await c.query(`UPDATE users SET status = 'active' WHERE id = $1`, [u.id]);
      },
    );
    expectAppError(error, 400, 'INVALID_OTP');
    expect((await getOtps(u.id))[0]!.consumed_at).toBeNull();
  });

  it('verify: a user deleted while verify waited gets INVALID_OTP', async () => {
    const u = await registerPending(1);
    const otp = latestOtpFor(u.email);
    const { error } = await raceAgainstChange(
      u.id,
      () => authService.verifyRegistrationOtp({ email: u.email, otp, pendingToken: u.pendingToken }),
      async (c) => {
        await c.query('DELETE FROM users WHERE id = $1', [u.id]);
      },
    );
    expectAppError(error, 400, 'INVALID_OTP');
  });

  it('resend: a user activated while resend waited gets NO_PENDING_REGISTRATION and no new OTP', async () => {
    const u = await registerPending(1);
    const { error } = await raceAgainstChange(
      u.id,
      () => authService.resendRegistrationOtp({ email: u.email, pendingToken: u.pendingToken }),
      async (c) => {
        await c.query(`UPDATE users SET status = 'active' WHERE id = $1`, [u.id]);
      },
    );
    expectAppError(error, 400, 'NO_PENDING_REGISTRATION');
    expect(await getOtps(u.id)).toHaveLength(1);
  });
});

describe('forgot-password flows re-check the locked row', () => {
  it('forgotPassword: a user deleted while waiting gets 404 EMAIL_NOT_FOUND', async () => {
    const u = await createActiveUser(1);
    const { error } = await raceAgainstChange(
      u.id,
      () => authService.forgotPassword({ email: u.email }),
      async (c) => {
        await c.query('DELETE FROM users WHERE id = $1', [u.id]);
      },
    );
    expectAppError(error, 404, 'EMAIL_NOT_FOUND');
  });

  it('forgotPassword: a user who became pending while waiting gets 403 ACCOUNT_NOT_VERIFIED, no OTP', async () => {
    const u = await createActiveUser(1);
    const { error } = await raceAgainstChange(
      u.id,
      () => authService.forgotPassword({ email: u.email }),
      async (c) => {
        await c.query(`UPDATE users SET status = 'pending' WHERE id = $1`, [u.id]);
      },
    );
    expectAppError(error, 403, 'ACCOUNT_NOT_VERIFIED');
    expect(await getOtps(u.id, 'Forgot Password')).toHaveLength(0);
  });

  it('verifyForgotPasswordOtp: a user who became pending while waiting gets 403 ACCOUNT_NOT_VERIFIED', async () => {
    const u = await createActiveUser(1);
    await seedOtp(u.id, 'Forgot Password', '123456');
    const { error } = await raceAgainstChange(
      u.id,
      () => authService.verifyForgotPasswordOtp({ email: u.email, otp: '123456' }),
      async (c) => {
        await c.query(`UPDATE users SET status = 'pending' WHERE id = $1`, [u.id]);
      },
    );
    expectAppError(error, 403, 'ACCOUNT_NOT_VERIFIED');
  });

  it('verifyForgotPasswordOtp: a user deleted while waiting gets 404 EMAIL_NOT_FOUND', async () => {
    const u = await createActiveUser(1);
    await seedOtp(u.id, 'Forgot Password', '123456');
    const { error } = await raceAgainstChange(
      u.id,
      () => authService.verifyForgotPasswordOtp({ email: u.email, otp: '123456' }),
      async (c) => {
        await c.query('DELETE FROM users WHERE id = $1', [u.id]);
      },
    );
    expectAppError(error, 404, 'EMAIL_NOT_FOUND');
  });

  it('resetPassword: a user who became pending while waiting gets 403 and nothing changes', async () => {
    const u = await createActiveUser(1);
    await seedOtp(u.id, 'Forgot Password', '123456');
    await seedRefreshToken(u.id, 'tok');
    const before = (await getUserByEmail(u.email))!.password_hash;

    const { error } = await raceAgainstChange(
      u.id,
      () => authService.resetPassword({ email: u.email, otp: '123456', newPassword: NEW_PASSWORD }),
      async (c) => {
        await c.query(`UPDATE users SET status = 'pending' WHERE id = $1`, [u.id]);
      },
    );

    expectAppError(error, 403, 'ACCOUNT_NOT_VERIFIED');
    expect((await getUserByEmail(u.email))!.password_hash).toBe(before);
    expect((await getOtps(u.id, 'Forgot Password'))[0]!.consumed_at).toBeNull();
    expect((await getRefreshTokens(u.id))[0]!.is_revoked).toBe(false);
  });

  it('resetPassword: a user deleted while waiting gets 404 EMAIL_NOT_FOUND', async () => {
    const u = await createActiveUser(1);
    await seedOtp(u.id, 'Forgot Password', '123456');
    const { error } = await raceAgainstChange(
      u.id,
      () => authService.resetPassword({ email: u.email, otp: '123456', newPassword: NEW_PASSWORD }),
      async (c) => {
        await c.query('DELETE FROM users WHERE id = $1', [u.id]);
      },
    );
    expectAppError(error, 404, 'EMAIL_NOT_FOUND');
  });
});

describe('stale pending cleanup skips locked rows (FOR UPDATE SKIP LOCKED)', () => {
  it('register neither waits for nor deletes a locked expired pending user: it reports USERNAME_TAKEN', async () => {
    const u = await registerPending(1);
    await expireOtps(u.id);

    const { err, elapsed } = await withHeldUserLock(u.id, async () => {
      const started = Date.now();
      const err = await authService.register(userInput(1)).then(
        () => null,
        (e) => e,
      );
      return { err, elapsed: Date.now() - started };
    });

    expectAppError(err, 409, 'USERNAME_TAKEN');
    expect(elapsed).toBeLessThan(5000); // it did not wait on the lock
    expect((await getUserByEmail(u.email))!.id).toBe(u.id); // and the row survived

    // Once the lock is gone, the expired reservation is released as usual.
    await authService.register(userInput(1));
    expect((await getUserByEmail(u.email))!.id).not.toBe(u.id);
  });
});

describe('changeUserStatus re-checks the locked row', () => {
  it('a target promoted to super admin while the request waited: 403 SUPER_ADMIN_IMMUTABLE, status unchanged', async () => {
    const u = await createActiveUser(1);
    const { error } = await raceAgainstChange(
      u.id,
      () => usersService.changeUserStatus(ACTOR_ID, 'admin', SID, u.id, 'suspended', 'TEST_REASON', null, elevationFor(ACTOR_ID)),
      async (c) => {
        await c.query(`UPDATE users SET role = 'super admin' WHERE id = $1`, [u.id]);
      },
    );
    expectAppError(error, 403, 'SUPER_ADMIN_IMMUTABLE');
    expect((await getUserByEmail(u.email))!.status).toBe('active');
  });

  it('a target that became pending while the request waited: 422 CANNOT_CHANGE_STATUS_PENDING_USER', async () => {
    const u = await createActiveUser(1);
    const { error } = await raceAgainstChange(
      u.id,
      () => usersService.changeUserStatus(ACTOR_ID, 'admin', SID, u.id, 'suspended', 'TEST_REASON', null, elevationFor(ACTOR_ID)),
      async (c) => {
        await c.query(`UPDATE users SET status = 'pending' WHERE id = $1`, [u.id]);
      },
    );
    expectAppError(error, 422, 'CANNOT_CHANGE_STATUS_PENDING_USER');
    expect((await getUserByEmail(u.email))!.status).toBe('pending');
  });

  it('a target already suspended while the request waited: no-op, no token revocation', async () => {
    const u = await createActiveUser(1);
    await seedRefreshToken(u.id, 'tok-a');
    const { value, error } = await raceAgainstChange(
      u.id,
      () => usersService.changeUserStatus(ACTOR_ID, 'admin', SID, u.id, 'suspended', 'TEST_REASON', null, elevationFor(ACTOR_ID)),
      async (c) => {
        await c.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [u.id]);
      },
    );
    expect(error).toBeUndefined();
    expect(value).toMatchObject({ id: u.id, status: 'suspended' });
    expect((await getRefreshTokens(u.id))[0]!.is_revoked).toBe(false);
  });

  it('a target deleted while the request waited: 404 USER_NOT_FOUND', async () => {
    const u = await createActiveUser(1);
    const { error } = await raceAgainstChange(
      u.id,
      () => usersService.changeUserStatus(ACTOR_ID, 'admin', SID, u.id, 'suspended', 'TEST_REASON', null, elevationFor(ACTOR_ID)),
      async (c) => {
        await c.query(`DELETE FROM users WHERE id = $1`, [u.id]);
      },
    );
    expectAppError(error, 404, 'USER_NOT_FOUND');
  });
});

describe('changeUserRole re-checks the locked row', () => {
  const requester = () => createUserWithRole('sa', 'super admin');

  it('a target promoted to super admin while the request waited: 403 SUPER_ADMIN_IMMUTABLE, role unchanged', async () => {
    const sa = await requester();
    const u = await createActiveUser(1);
    const { error } = await raceAgainstChange(
      u.id,
      () => usersService.changeUserRole(sa.id, SID, u.id, 'admin', 'TEST_REASON', null, elevationFor(sa.id)),
      async (c) => {
        await c.query(`UPDATE users SET role = 'super admin' WHERE id = $1`, [u.id]);
      },
    );
    expectAppError(error, 403, 'SUPER_ADMIN_IMMUTABLE');
    expect((await getUserByEmail(u.email))!.role).toBe('super admin');
  });

  it('a target suspended while the request waited: 422 CANNOT_CHANGE_ROLE_SUSPENDED_USER, no revocation', async () => {
    const sa = await requester();
    const u = await createActiveUser(1);
    await seedRefreshToken(u.id, 'tok-a');
    const { error } = await raceAgainstChange(
      u.id,
      () => usersService.changeUserRole(sa.id, SID, u.id, 'admin', 'TEST_REASON', null, elevationFor(sa.id)),
      async (c) => {
        await c.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [u.id]);
      },
    );
    expectAppError(error, 422, 'CANNOT_CHANGE_ROLE_SUSPENDED_USER');
    expect((await getUserByEmail(u.email))!.role).toBe('user');
    expect((await getRefreshTokens(u.id))[0]!.is_revoked).toBe(false);
  });

  it('a target that became pending while the request waited: 422 CANNOT_CHANGE_ROLE_PENDING_USER', async () => {
    const sa = await requester();
    const u = await createActiveUser(1);
    const { error } = await raceAgainstChange(
      u.id,
      () => usersService.changeUserRole(sa.id, SID, u.id, 'admin', 'TEST_REASON', null, elevationFor(sa.id)),
      async (c) => {
        await c.query(`UPDATE users SET status = 'pending' WHERE id = $1`, [u.id]);
      },
    );
    expectAppError(error, 422, 'CANNOT_CHANGE_ROLE_PENDING_USER');
    expect((await getUserByEmail(u.email))!.role).toBe('user');
  });

  it('a target that already got the requested role while the request waited: no-op, no token revocation', async () => {
    const sa = await requester();
    const u = await createActiveUser(1);
    await seedRefreshToken(u.id, 'tok-a');
    const { value, error } = await raceAgainstChange(
      u.id,
      () => usersService.changeUserRole(sa.id, SID, u.id, 'admin', 'TEST_REASON', null, elevationFor(sa.id)),
      async (c) => {
        await c.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [u.id]);
      },
    );
    expect(error).toBeUndefined();
    expect(value).toMatchObject({ id: u.id, role: 'admin' });
    expect((await getRefreshTokens(u.id))[0]!.is_revoked).toBe(false);
  });

  it('a target deleted while the request waited: 404 USER_NOT_FOUND', async () => {
    const sa = await requester();
    const u = await createActiveUser(1);
    const { error } = await raceAgainstChange(
      u.id,
      () => usersService.changeUserRole(sa.id, SID, u.id, 'admin', 'TEST_REASON', null, elevationFor(sa.id)),
      async (c) => {
        await c.query(`DELETE FROM users WHERE id = $1`, [u.id]);
      },
    );
    expectAppError(error, 404, 'USER_NOT_FOUND');
  });
});
