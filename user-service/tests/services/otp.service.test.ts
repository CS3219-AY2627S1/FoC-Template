// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-26
// 26/09/2026: Stage 7 - integration tests for otp.service.ts (issueOtp, requestOtp, checkOtp)
// Author review:
// 2026-11-04: Stage 18c - added coverage for requestOtp's send-escalation block (exact
//   Retry-After, carry-forward onto the new row, quiet-window reset) and checkOtp's reset of
//   the escalation level on a successful consuming verify. Updated two pre-existing
//   `reason: 'limit'` assertions from toEqual to toMatchObject, since that result now also
//   carries level/retryAfterSeconds. Governing decision: instructions.md Stage 18.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-04: Stage 19 - issueOtp/requestOtp calls pass the new required username param
//   (fixture, not a new assertion). Governing decision: instructions.md Stage 19.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as otpQueries from '../../src/db/queries/otp.queries.js';
import * as userQueries from '../../src/db/queries/users.queries.js';
import { withTransaction } from '../../src/db/transaction.js';
import { checkOtp, issueOtp, requestOtp, throwOtpFailure } from '../../src/services/otp.service.js';
import { AppError } from '../../src/utils/AppError.js';
import { sha256 } from '../../src/utils/hash.js';
import {
  backdateOtps,
  expireOtps,
  getOtps,
  seedOtp,
  setOtpSendBlock,
  setUserStatus,
  truncateAll,
} from '../helpers/db.js';
import {
  emailCallsFor,
  failNextEmail,
  resetEmailMock,
  sendOtpEmailMock,
} from '../helpers/email.js';

resetEmailMock();

let userId: string;
const email = 'alice@example.com';
const username = 'alice';

beforeEach(async () => {
  await truncateAll();
  userId = (
    await userQueries.createUser({ username, email, passwordHash: 'h', status: 'active' })
  ).id;
});
afterEach(truncateAll);

describe('issueOtp', () => {
  it('stores a SHA-256 hash (never the plaintext) and emails the plaintext code', async () => {
    await withTransaction((c) => issueOtp({ userId, email, purpose: 'Forgot Password', username }, c));

    const [row] = await getOtps(userId);
    const [call] = emailCallsFor(email);
    expect(call!.otp).toMatch(/^\d{6}$/);
    expect(call!.purpose).toBe('Forgot Password');
    expect(row!.otp_hash).toBe(sha256(call!.otp));
    expect(row!.otp_hash).not.toContain(call!.otp);
    expect(row!.new_email).toBeNull();
    expect(row!.expires_at.getTime() - row!.created_at.getTime()).toBe(10 * 60 * 1000);
  });

  it('invalidates the previous active OTP of the same purpose only', async () => {
    await seedOtp(userId, 'Forgot Password', '111111');
    await seedOtp(userId, 'Registration', '222222');
    await withTransaction((c) => issueOtp({ userId, email, purpose: 'Forgot Password', username }, c));

    const forgot = await getOtps(userId, 'Forgot Password');
    expect(forgot).toHaveLength(2);
    expect(forgot[0]!.consumed_at).not.toBeNull();
    expect(forgot[1]!.consumed_at).toBeNull();
    expect((await getOtps(userId, 'Registration'))[0]!.consumed_at).toBeNull();
  });

  it('sends to newEmail when given and stores it on the row', async () => {
    await withTransaction((c) =>
      issueOtp({ userId, email, purpose: 'Registration', newEmail: 'new@example.com', username }, c),
    );
    expect(emailCallsFor('new@example.com')).toHaveLength(1);
    expect(emailCallsFor(email)).toHaveLength(0);
    expect((await getOtps(userId))[0]!.new_email).toBe('new@example.com');
  });

  it('throws 503 EMAIL_SEND_FAILED when sending fails, and the caller’s transaction rolls back', async () => {
    await seedOtp(userId, 'Forgot Password', '111111');
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    failNextEmail();

    const err = await withTransaction((c) =>
      issueOtp({ userId, email, purpose: 'Forgot Password', username }, c),
    ).catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({
      status: 503,
      code: 'EMAIL_SEND_FAILED',
      message: 'Unable to send verification email. Please try again.',
    });
    // Rolled back: still exactly the seeded, still-active OTP.
    const rows = await getOtps(userId, 'Forgot Password');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.consumed_at).toBeNull();
    // The error log never contains an OTP.
    expect(JSON.stringify(errorLog.mock.calls)).not.toMatch(/\b\d{6}\b/);
    errorLog.mockRestore();
  });
});

describe('requestOtp', () => {
  const run = (uid = userId, purpose: otpQueries.OtpPurpose = 'Forgot Password') =>
    withTransaction((c) => requestOtp({ userId: uid, email, purpose, username }, c));

  it('sends and reports sent for an active user', async () => {
    expect(await run()).toEqual({ status: 'sent' });
    expect(emailCallsFor(email)).toHaveLength(1);
    expect(await getOtps(userId, 'Forgot Password')).toHaveLength(1);
  });

  it('allows a suspended user', async () => {
    await setUserStatus(userId, 'suspended');
    expect(await run()).toEqual({ status: 'sent' });
  });

  it('reports no-user for an unknown user id', async () => {
    expect(await run('00000000-0000-0000-0000-000000000000')).toEqual({ status: 'no-user' });
    expect(sendOtpEmailMock).not.toHaveBeenCalled();
  });

  it('reports not-verified for a pending user, without sending', async () => {
    await setUserStatus(userId, 'pending');
    expect(await run()).toEqual({ status: 'not-verified' });
    expect(sendOtpEmailMock).not.toHaveBeenCalled();
    expect(await getOtps(userId)).toHaveLength(0);
  });

  it('throttles inside the cooldown with retryAfterSeconds, sending nothing and keeping the live OTP', async () => {
    await run();
    sendOtpEmailMock.mockClear();

    const result = await run();
    expect(result).toMatchObject({ status: 'throttled', reason: 'cooldown' });
    const retry = (result as { retryAfterSeconds: number }).retryAfterSeconds;
    expect(retry).toBeGreaterThan(0);
    expect(retry).toBeLessThanOrEqual(60);

    expect(sendOtpEmailMock).not.toHaveBeenCalled();
    const rows = await getOtps(userId, 'Forgot Password');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.consumed_at).toBeNull();
  });

  it('allows a resend once the cooldown has passed and invalidates the previous OTP', async () => {
    await run();
    await backdateOtps(userId, 2);
    expect(await run()).toEqual({ status: 'sent' });

    const rows = await getOtps(userId, 'Forgot Password');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.consumed_at).not.toBeNull();
    expect(rows[1]!.consumed_at).toBeNull();
  });

  it('allows the initial request plus 5 resends inside the window, then throttles with reason limit', async () => {
    for (let i = 0; i < 6; i++) {
      expect(await run()).toEqual({ status: 'sent' });
      await backdateOtps(userId, 2);
    }
    sendOtpEmailMock.mockClear();

    const result = await run();
    expect(result).toMatchObject({ status: 'throttled', reason: 'limit', level: 1 });
    expect((result as { retryAfterSeconds: number }).retryAfterSeconds).toBe(3600);
    expect(sendOtpEmailMock).not.toHaveBeenCalled();
    expect(await getOtps(userId, 'Forgot Password')).toHaveLength(6);
  });

  it('the limit is a rolling window: rows older than resendWindowMinutes stop counting', async () => {
    for (let i = 0; i < 6; i++) {
      await run();
      await backdateOtps(userId, 2);
    }
    expect(await run()).toMatchObject({ status: 'throttled', reason: 'limit' });

    // The rolling window excludes the old rows, but the Stage 18c escalating block (1h) is a
    // separate, longer-lived gate; expire it directly so this isolates the window's own effect.
    await backdateOtps(userId, 61);
    await setOtpSendBlock(userId, 'Forgot Password', { level: 1, blockedUntilMinutesFromNow: -1 });
    expect(await run()).toEqual({ status: 'sent' });
  });

  describe('send escalation (Stage 18c)', () => {
    it('a cap hit blocks sends until send_blocked_until, reporting the exact retryAfterSeconds', async () => {
      for (let i = 0; i < 6; i++) {
        await run();
        await backdateOtps(userId, 2);
      }
      await run(); // the cap hit: blocks for 1h

      sendOtpEmailMock.mockClear();
      const result = await run();
      expect(result).toMatchObject({ status: 'throttled', reason: 'limit', level: 1 });
      const retry = (result as { retryAfterSeconds: number }).retryAfterSeconds;
      expect(retry).toBeGreaterThan(3500);
      expect(retry).toBeLessThanOrEqual(3600);
      expect(sendOtpEmailMock).not.toHaveBeenCalled();
      expect(await getOtps(userId, 'Forgot Password')).toHaveLength(6);
    });

    it('a second cap hit (no verify in between) escalates to 4h, carried forward onto the new row', async () => {
      await run();
      await setOtpSendBlock(userId, 'Forgot Password', { level: 1, blockedUntilMinutesFromNow: -1 });
      await backdateOtps(userId, 2);

      for (let i = 0; i < 6; i++) {
        await run();
        await backdateOtps(userId, 2);
      }
      expect(await run()).toMatchObject({ status: 'throttled', reason: 'limit', level: 2 });

      const rows = await getOtps(userId, 'Forgot Password');
      expect(rows.at(-1)!.send_escalation_level).toBe(2);
    });

    it('24h after the last cap hit with no new cap hit, the level resets to 1h', async () => {
      await run();
      await setOtpSendBlock(userId, 'Forgot Password', {
        level: 2,
        // Last hit derived as blockEnd - durationHoursForLevel(2) (4h) = 25h ago: past the
        // 24h quiet window.
        blockedUntilMinutesFromNow: -(25 * 60 - 4 * 60),
      });
      await backdateOtps(userId, 2);

      for (let i = 0; i < 6; i++) {
        await run();
        await backdateOtps(userId, 2);
      }
      expect(await run()).toMatchObject({ status: 'throttled', reason: 'limit', level: 1 });
    });

    it('verifying an already-sent OTP still works while sending is blocked', async () => {
      await seedOtp(userId, 'Forgot Password', '123456');
      await setOtpSendBlock(userId, 'Forgot Password', { level: 1, blockedUntilMinutesFromNow: 60 });

      expect(await run()).toMatchObject({ status: 'throttled', reason: 'limit' });

      const result = await withTransaction((c) =>
        checkOtp({ userId, purpose: 'Forgot Password', otp: '123456' }, c),
      );
      expect(result.ok).toBe(true);
    });
  });

  it('propagates EMAIL_SEND_FAILED as 503 and leaves the previous OTP valid', async () => {
    await run();
    await backdateOtps(userId, 2);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    failNextEmail();

    await expect(run()).rejects.toMatchObject({ status: 503, code: 'EMAIL_SEND_FAILED' });

    const rows = await getOtps(userId, 'Forgot Password');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.consumed_at).toBeNull();
  });

  it('is scoped per purpose', async () => {
    await run(userId, 'Forgot Password');
    expect(await run(userId, 'Change Password')).toEqual({ status: 'sent' });
  });
});

describe('checkOtp', () => {
  const check = (
    otp: string,
    consume?: boolean,
    purpose: otpQueries.OtpPurpose = 'Forgot Password',
  ) => withTransaction((c) => checkOtp({ userId, purpose, otp }, c, consume));

  it('throws INVALID_OTP when the user has no OTP for the purpose', async () => {
    await expect(check('123456')).rejects.toMatchObject({ status: 400, code: 'INVALID_OTP' });
  });

  it('throws INVALID_OTP when the latest OTP is already consumed', async () => {
    await seedOtp(userId, 'Forgot Password', '123456');
    expect(await check('123456')).toEqual({ ok: true });
    await expect(check('123456')).rejects.toMatchObject({ status: 400, code: 'INVALID_OTP' });
  });

  it('returns reason "expired" once expires_at has passed, even for the correct code, and counts it as an attempt (Stage 25c)', async () => {
    await seedOtp(userId, 'Forgot Password', '123456');
    await expireOtps(userId);
    expect(await check('123456')).toEqual({ ok: false, reason: 'expired' });
    expect((await getOtps(userId))[0]!.attempts_count).toBe(1);

    expect(() => throwOtpFailure({ ok: false, reason: 'expired' })).toThrowError(
      expect.objectContaining({
        status: 400,
        code: 'OTP_EXPIRED',
        message: 'OTP has expired. Please request a new one.',
      }),
    );
  });

  it('the 5th failed attempt (wrong code) is reported as exhausted with a Retry-After, and a later submit throws 429 directly (Stage 25a/25c)', async () => {
    await seedOtp(userId, 'Forgot Password', '123456');
    for (let i = 0; i < 4; i++) {
      expect(await check('000000')).toEqual({ ok: false, reason: 'invalid' });
    }
    const fifth = await check('000000');
    expect(fifth).toMatchObject({ ok: false, reason: 'invalid', exhausted: true });
    const retry = (fifth as { retryAfterSeconds: number }).retryAfterSeconds;
    expect(retry).toBeGreaterThanOrEqual(0);
    expect(retry).toBeLessThanOrEqual(60);
    expect((await getOtps(userId))[0]!.attempts_count).toBe(5);

    // Even a correct code throws directly now: the attempts check runs before hashing.
    await expect(check('123456')).rejects.toMatchObject({
      status: 429,
      code: 'OTP_ATTEMPTS_EXCEEDED',
      retryAfterSeconds: retry,
    });
    // Repeated guesses against the exhausted code never push attempts_count past max_attempts.
    expect((await getOtps(userId))[0]!.attempts_count).toBe(5);
  });

  it('Retry-After is 0 once the resend cooldown has already elapsed when the 5th attempt lands', async () => {
    await seedOtp(userId, 'Forgot Password', '123456');
    await backdateOtps(userId, 2);
    for (let i = 0; i < 4; i++) await check('000000');
    const fifth = await check('000000');
    expect(fifth).toMatchObject({ ok: false, reason: 'invalid', exhausted: true, retryAfterSeconds: 0 });
  });

  it('counts a guess against an expired, already-exhausted code as OTP_ATTEMPTS_EXCEEDED with Retry-After 0 (check order, Stage 25)', async () => {
    await seedOtp(userId, 'Forgot Password', '123456');
    for (let i = 0; i < 5; i++) await check('000000');
    await backdateOtps(userId, 2);
    await expireOtps(userId);

    await expect(check('123456')).rejects.toMatchObject({
      status: 429,
      code: 'OTP_ATTEMPTS_EXCEEDED',
      retryAfterSeconds: 0,
    });
  });

  it('mixed wrong and expired guesses both count toward the same attempts_count', async () => {
    await seedOtp(userId, 'Forgot Password', '123456');
    expect(await check('000000')).toEqual({ ok: false, reason: 'invalid' });
    expect(await check('000000')).toEqual({ ok: false, reason: 'invalid' });
    expect(await check('000000')).toEqual({ ok: false, reason: 'invalid' });
    await expireOtps(userId);
    expect(await check('999999')).toEqual({ ok: false, reason: 'expired' }); // 4th failure
    const fifth = await check('999999');
    expect(fifth).toMatchObject({ ok: false, reason: 'expired', exhausted: true }); // 5th failure
    expect((await getOtps(userId))[0]!.attempts_count).toBe(5);
  });

  it('returns { ok: false, reason: "invalid" } for a wrong code and the attempt increment survives the commit', async () => {
    await seedOtp(userId, 'Forgot Password', '123456');
    expect(await check('000000')).toEqual({ ok: false, reason: 'invalid' });
    expect(await check('000001')).toEqual({ ok: false, reason: 'invalid' });
    expect((await getOtps(userId))[0]!.attempts_count).toBe(2);
  });

  it('a wrong code does not consume the OTP', async () => {
    await seedOtp(userId, 'Forgot Password', '123456');
    await check('000000');
    expect((await getOtps(userId))[0]!.consumed_at).toBeNull();
  });

  it('consumes the OTP on a correct code by default', async () => {
    await seedOtp(userId, 'Forgot Password', '123456');
    expect(await check('123456')).toEqual({ ok: true });
    expect((await getOtps(userId))[0]!.consumed_at).not.toBeNull();
  });

  it('with consume=false a correct code leaves the OTP unconsumed and re-checkable', async () => {
    await seedOtp(userId, 'Forgot Password', '123456');
    expect(await check('123456', false)).toEqual({ ok: true });
    expect((await getOtps(userId))[0]!.consumed_at).toBeNull();
    expect(await check('123456', false)).toEqual({ ok: true });
    expect(await check('123456', true)).toEqual({ ok: true });
    expect((await getOtps(userId))[0]!.consumed_at).not.toBeNull();
  });

  it('with consume=false a wrong guess still increments attempts', async () => {
    await seedOtp(userId, 'Forgot Password', '123456');
    expect(await check('000000', false)).toEqual({ ok: false, reason: 'invalid' });
    expect((await getOtps(userId))[0]!.attempts_count).toBe(1);
  });

  it('only the latest OTP is checked; an older code no longer works', async () => {
    await seedOtp(userId, 'Forgot Password', '111111');
    await seedOtp(userId, 'Forgot Password', '222222');
    expect(await check('111111')).toEqual({ ok: false, reason: 'invalid' });
    expect(await check('222222')).toEqual({ ok: true });
  });

  it('is scoped to the purpose', async () => {
    await seedOtp(userId, 'Registration', '123456');
    await expect(check('123456', true, 'Forgot Password')).rejects.toMatchObject({
      code: 'INVALID_OTP',
    });
  });

  describe('send-escalation reset on a consuming verify (Stage 18c)', () => {
    it('a successful consume=true verify resets the escalation level/block on that row', async () => {
      await seedOtp(userId, 'Forgot Password', '123456');
      await setOtpSendBlock(userId, 'Forgot Password', { level: 2, blockedUntilMinutesFromNow: 60 });
      expect(await check('123456', true)).toEqual({ ok: true });

      const row = (await getOtps(userId, 'Forgot Password'))[0]!;
      expect(row.send_escalation_level).toBe(0);
      expect(row.send_blocked_until).toBeNull();
    });

    it('consume=false (the forgot-password verify step) does not reset the escalation level', async () => {
      await seedOtp(userId, 'Forgot Password', '123456');
      await setOtpSendBlock(userId, 'Forgot Password', { level: 2, blockedUntilMinutesFromNow: 60 });
      expect(await check('123456', false)).toEqual({ ok: true });

      const row = (await getOtps(userId, 'Forgot Password'))[0]!;
      expect(row.send_escalation_level).toBe(2);
      expect(row.send_blocked_until).not.toBeNull();
    });

    it('a wrong guess does not reset the escalation level', async () => {
      await seedOtp(userId, 'Forgot Password', '123456');
      await setOtpSendBlock(userId, 'Forgot Password', { level: 2, blockedUntilMinutesFromNow: 60 });
      expect(await check('000000', true)).toEqual({ ok: false, reason: 'invalid' });

      const row = (await getOtps(userId, 'Forgot Password'))[0]!;
      expect(row.send_escalation_level).toBe(2);
    });
  });
});
