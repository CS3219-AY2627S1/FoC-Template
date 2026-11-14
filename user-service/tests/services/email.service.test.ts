// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-26
// 26/09/2026: Stage 7 - tests for the real email.service.ts (nodemailer mocked)
// Author review:
// 2026-10-22: Fixed a stale fixture - "throws for a purpose that has no template" used
//   'Change Email', which has had a template since Stage 12c. Switched to 'Admin
//   Action', the one purpose_enum value with no implemented flow yet (not 'Change
//   Password': that purpose IS wired up (Stage 12e) and sends real OTP emails, but
//   PURPOSE_COPY has no entry for it - a separate pre-existing gap, flagged, not fixed
//   here). Fixture update, not a new test case.
// Author review:
// 2026-11-04: Stage 19 - sendOtpEmail now requires username, so every call in this file was
//   updated to pass one. Two dev-fallback assertions ("is not used in development when
//   SMTP_HOST is set" and the production/test it.each) used to check that console.log was
//   never called at all, as a proxy for "the dev fallback didn't run"; the real SMTP path now
//   also logs an [OTP EMAIL] success line, so that proxy no longer holds and the assertions
//   were narrowed to what they actually meant: no [DEV EMAIL] line was logged. Added a new
//   describe block covering the retry loop, backoff, per-attempt cap, overall deadline and
//   logging/masking, per instructions.md Stage 19's Verification list. Governing decision:
//   instructions.md Stage 19.
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-09: Stage 27a - added coverage for the new "Admin Action" PURPOSE_COPY entry.
//   "throws for a purpose that has no template" now uses a synthetic purpose string instead of
//   'Admin Action' (which now has a template), since every purpose_enum value is now
//   implemented. Governing decision: instructions.md Stage 27. No requirements, architecture,
//   schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-10: Stage 31e - added coverage for sendUnlockEmail: SMTP-path content (subject,
//   link, no OTP/password/lock-length wording, no username in the body), the dev-fallback log
//   line, and that it logs with purpose=account_unlock in the exact Stage 19 line format -
//   proving it shares sendMailWithRetry rather than a copy (the retry/backoff/timeout/deadline
//   logic itself is deliberately not re-tested purpose-by-purpose here, since it is already
//   generic and covered by the sendOtpEmail retry describe block above; one transient-failure
//   case is included only to show sendUnlockEmail goes through the same retry path).
//   Governing decision: instructions.md Stage 31b ("When the email is sent" table).
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMail, createTransport } = vi.hoisted(() => {
  const sendMail = vi.fn(async (_mail: Record<string, string>) => ({}));
  return { sendMail, createTransport: vi.fn(() => ({ sendMail })) };
});

vi.mock('nodemailer', () => ({ default: { createTransport } }));

type EmailModule = typeof import('../../src/services/email.service.js');
type Cfg = typeof import('../../src/config.js').config;

// Loads the real email service (the setup file mocks it globally) against a chosen config.
async function loadEmailService(overrides: {
  env?: string;
  smtpHost?: string;
}): Promise<EmailModule> {
  vi.resetModules();
  vi.doMock('../../src/config.js', async () => {
    const actual = await vi.importActual<{ config: Cfg }>('../../src/config.js');
    return {
      config: {
        ...actual.config,
        env: overrides.env ?? actual.config.env,
        email: {
          ...actual.config.email,
          host: overrides.smtpHost ?? actual.config.email.host,
        },
      },
    };
  });
  return vi.importActual<EmailModule>('../../src/services/email.service.js');
}

// A synthetic error shaped like a Nodemailer send failure (code, optional responseCode).
function makeError(code?: string, responseCode?: number): Error {
  const err = new Error(code ?? 'unknown failure') as Error & {
    code?: string;
    responseCode?: number;
  };
  if (code !== undefined) err.code = code;
  if (responseCode !== undefined) err.responseCode = responseCode;
  return err;
}

beforeEach(() => {
  sendMail.mockClear();
  sendMail.mockReset();
  sendMail.mockImplementation(async () => ({}));
  createTransport.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.doUnmock('../../src/config.js');
});

describe('sendOtpEmail (SMTP path)', () => {
  it('creates one transport from config.email, with the 5s phase timeouts, and sends to the recipient', async () => {
    const { sendOtpEmail } = await loadEmailService({});
    await sendOtpEmail({ to: 'a@example.com', otp: '123456', purpose: 'Registration', username: 'alice' });

    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.test.invalid',
        port: 587,
        secure: false,
        auth: { user: 'test-user', pass: 'test-pass' },
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 5000,
        dnsTimeout: 5000,
      }),
    );
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0]![0]).toMatchObject({
      to: 'a@example.com',
      from: 'noreply@test.invalid',
    });
  });

  it('Registration: subject "Your FoC verification code"; text and html carry the OTP and expiry', async () => {
    const { sendOtpEmail } = await loadEmailService({});
    await sendOtpEmail({ to: 'a@example.com', otp: '123456', purpose: 'Registration', username: 'alice' });

    const mail = sendMail.mock.calls[0]![0] as { subject: string; text: string; html: string };
    expect(mail.subject).toBe('Your FoC verification code');
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain('123456');
      expect(body).toContain('10 minutes');
    }
  });

  it('Forgot Password: subject "Your FoC password reset code"; text and html carry the OTP and expiry', async () => {
    const { sendOtpEmail } = await loadEmailService({});
    await sendOtpEmail({ to: 'a@example.com', otp: '654321', purpose: 'Forgot Password', username: 'alice' });

    const mail = sendMail.mock.calls[0]![0] as { subject: string; text: string; html: string };
    expect(mail.subject).toBe('Your FoC password reset code');
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain('654321');
      expect(body).toContain('10 minutes');
    }
  });

  it('Admin Action: subject "Your FoC admin privileges elevation verification code"; text and html carry the OTP and expiry', async () => {
    const { sendOtpEmail } = await loadEmailService({});
    await sendOtpEmail({ to: 'a@example.com', otp: '112233', purpose: 'Admin Action', username: 'alice' });

    const mail = sendMail.mock.calls[0]![0] as { subject: string; text: string; html: string };
    expect(mail.subject).toBe('Your FoC admin privileges elevation verification code');
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain('112233');
      expect(body).toContain('10 minutes');
    }
  });

  it('contains no links', async () => {
    const { sendOtpEmail } = await loadEmailService({});
    for (const purpose of ['Registration', 'Forgot Password']) {
      sendMail.mockClear();
      await sendOtpEmail({ to: 'a@example.com', otp: '123456', purpose, username: 'alice' });
      const mail = sendMail.mock.calls[0]![0] as { text: string; html: string };
      expect(mail.text).not.toMatch(/https?:|www\./i);
      expect(mail.html).not.toMatch(/<a\s|https?:|www\./i);
    }
  });

  it('throws immediately when the transport fails with an unrecognised (no-code) error', async () => {
    const { sendOtpEmail } = await loadEmailService({});
    sendMail.mockRejectedValueOnce(new Error('SMTP down'));
    await expect(
      sendOtpEmail({ to: 'a@example.com', otp: '123456', purpose: 'Registration', username: 'alice' }),
    ).rejects.toThrow('SMTP down');
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('throws for a purpose that has no template, without sending', async () => {
    const { sendOtpEmail } = await loadEmailService({});
    await expect(
      sendOtpEmail({ to: 'a@example.com', otp: '123456', purpose: 'Not A Real Purpose', username: 'alice' }),
    ).rejects.toThrow();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('does not log the OTP', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sendOtpEmail } = await loadEmailService({});
    await sendOtpEmail({ to: 'a@example.com', otp: '123456', purpose: 'Registration', username: 'alice' });
    expect(JSON.stringify([log.mock.calls, error.mock.calls])).not.toContain('123456');
  });
});

describe('sendOtpEmail (development fallback)', () => {
  it('logs [DEV EMAIL] and does not use SMTP when NODE_ENV=development and SMTP_HOST is empty', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { sendOtpEmail } = await loadEmailService({ env: 'development', smtpHost: '' });

    await sendOtpEmail({ to: 'a@example.com', otp: '123456', purpose: 'Registration', username: 'alice' });

    expect(log).toHaveBeenCalledWith(
      '[DEV EMAIL] to=a@example.com purpose=Registration otp=123456',
    );
    expect(createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('is not used in development when SMTP_HOST is set, and logs no [DEV EMAIL] line', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { sendOtpEmail } = await loadEmailService({ env: 'development', smtpHost: 'smtp.real' });
    await sendOtpEmail({ to: 'a@example.com', otp: '123456', purpose: 'Registration', username: 'alice' });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('[DEV EMAIL]'));
  });

  it.each(['production', 'test'])(
    'is unreachable when NODE_ENV=%s, even with an empty SMTP_HOST, and logs no [DEV EMAIL] line',
    async (env) => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { sendOtpEmail } = await loadEmailService({ env, smtpHost: '' });
      await sendOtpEmail({ to: 'a@example.com', otp: '123456', purpose: 'Registration', username: 'alice' });
      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(log).not.toHaveBeenCalledWith(expect.stringContaining('[DEV EMAIL]'));
    },
  );
});

describe('sendOtpEmail (Stage 19: retry, backoff, deadline, logging)', () => {
  it('succeeds on the first attempt: exactly one outcome=sent line, attempt 1/4', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { sendOtpEmail } = await loadEmailService({});
    await sendOtpEmail({ to: 'a@example.com', otp: '123456', purpose: 'Registration', username: 'alice' });

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      '[OTP EMAIL] outcome=sent user=alice to=a***@example.com purpose=Registration attempt=1/4',
    );
  });

  it('retries a transient failure twice, succeeds on attempt 3, with the same OTP every attempt', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendMail
      .mockRejectedValueOnce(makeError('ETIMEDOUT'))
      .mockRejectedValueOnce(makeError('ETIMEDOUT'))
      .mockResolvedValueOnce({});

    const { sendOtpEmail } = await loadEmailService({});
    const promise = sendOtpEmail({ to: 'a@example.com', otp: '123456', purpose: 'Registration', username: 'alice' });
    await vi.advanceTimersByTimeAsync(10_000);
    await promise;

    expect(sendMail).toHaveBeenCalledTimes(3);
    for (const call of sendMail.mock.calls) {
      expect(call[0]).toMatchObject({ to: 'a@example.com', subject: 'Your FoC verification code' });
      expect((call[0] as { text: string }).text).toContain('123456');
    }
    expect(error).toHaveBeenCalledTimes(2);
    expect(error.mock.calls[0]![0]).toBe(
      '[OTP EMAIL] outcome=failed user=alice to=a***@example.com purpose=Registration attempt=1/4 error=ETIMEDOUT',
    );
    expect(error.mock.calls[1]![0]).toBe(
      '[OTP EMAIL] outcome=failed user=alice to=a***@example.com purpose=Registration attempt=2/4 error=ETIMEDOUT',
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining('attempt=3/4'));
  });

  it('exhausts all 4 attempts on persistent transient failures and rethrows the last error', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendMail.mockRejectedValue(makeError('ETIMEDOUT'));

    const { sendOtpEmail } = await loadEmailService({});
    const result = sendOtpEmail({ to: 'a@example.com', otp: '123456', purpose: 'Registration', username: 'alice' }).catch(
      (e: unknown) => e,
    );
    await vi.advanceTimersByTimeAsync(30_000);
    const err = (await result) as { code?: string };

    expect(err.code).toBe('ETIMEDOUT');
    expect(sendMail).toHaveBeenCalledTimes(4);
    expect(error).toHaveBeenCalledTimes(4);
    for (let i = 0; i < 4; i++) {
      expect(error.mock.calls[i]![0]).toContain(`attempt=${i + 1}/4 error=ETIMEDOUT`);
    }
  });

  it.each(['ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'EDNS'])(
    '%s is always retried',
    async (code) => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(0);
      sendMail.mockRejectedValueOnce(makeError(code)).mockResolvedValueOnce({});
      const { sendOtpEmail } = await loadEmailService({});
      const promise = sendOtpEmail({ to: 'a@example.com', otp: '123456', purpose: 'Registration', username: 'alice' });
      await vi.advanceTimersByTimeAsync(10_000);
      await promise;
      expect(sendMail).toHaveBeenCalledTimes(2);
    },
  );

  it.each(['EENVELOPE', 'EMESSAGE', 'EAUTH'])(
    '%s is retried when responseCode is 400 or 499',
    async (code) => {
      for (const responseCode of [400, 499]) {
        vi.useFakeTimers();
        vi.spyOn(Math, 'random').mockReturnValue(0);
        sendMail.mockReset();
        sendMail.mockRejectedValueOnce(makeError(code, responseCode)).mockResolvedValueOnce({});
        const { sendOtpEmail } = await loadEmailService({});
        const promise = sendOtpEmail({ to: 'a@example.com', otp: '123456', purpose: 'Registration', username: 'alice' });
        await vi.advanceTimersByTimeAsync(10_000);
        await promise;
        expect(sendMail).toHaveBeenCalledTimes(2);
        vi.useRealTimers();
      }
    },
  );

  it.each(['EENVELOPE', 'EMESSAGE', 'EAUTH'])(
    '%s fails immediately when responseCode is 399, 500 or 550',
    async (code) => {
      for (const responseCode of [399, 500, 550]) {
        sendMail.mockReset();
        sendMail.mockRejectedValueOnce(makeError(code, responseCode));
        const { sendOtpEmail } = await loadEmailService({});
        await expect(
          sendOtpEmail({ to: 'a@example.com', otp: '123456', purpose: 'Registration', username: 'alice' }),
        ).rejects.toMatchObject({ code, responseCode });
        expect(sendMail).toHaveBeenCalledTimes(1);
      }
    },
  );

  it.each([
    ['EAUTH with no responseCode (missing credentials)', makeError('EAUTH')],
    ['EPROTOCOL', makeError('EPROTOCOL')],
    ['an error with no recognised code', new Error('mystery failure')],
  ])('%s fails immediately: one failed line, no retry, no wait', async (_label, err) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendMail.mockRejectedValueOnce(err);
    const { sendOtpEmail } = await loadEmailService({});
    await expect(
      sendOtpEmail({ to: 'a@example.com', otp: '123456', purpose: 'Registration', username: 'alice' }),
    ).rejects.toBe(err);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]![0]).toContain('attempt=1/4');
  });

  it('each wait between attempts falls within its cap (0-1s, 0-2s, 0-4s)', async () => {
    vi.useFakeTimers();
    const timestamps: number[] = [];
    sendMail.mockImplementation(async () => {
      timestamps.push(Date.now());
      throw makeError('ETIMEDOUT');
    });
    const { sendOtpEmail } = await loadEmailService({});
    const promise = sendOtpEmail({
      to: 'a@example.com',
      otp: '123456',
      purpose: 'Registration',
      username: 'alice',
    }).catch(() => {});
    await vi.advanceTimersByTimeAsync(30_000);
    await promise;

    expect(timestamps).toHaveLength(4);
    const gaps = [
      timestamps[1]! - timestamps[0]!,
      timestamps[2]! - timestamps[1]!,
      timestamps[3]! - timestamps[2]!,
    ];
    const caps = [1000, 2000, 4000];
    for (let i = 0; i < 3; i++) {
      expect(gaps[i]).toBeGreaterThanOrEqual(0);
      expect(gaps[i]).toBeLessThanOrEqual(caps[i]!);
    }
  });

  it('cuts an unsettled attempt off after 5s, logs ATTEMPT_TIMEOUT, retries, and ignores the abandoned send once it later settles', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    let settleAbandoned!: (err: unknown) => void;

    sendMail
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            settleAbandoned = reject;
          }),
      )
      .mockResolvedValueOnce({});

    const { sendOtpEmail } = await loadEmailService({});
    const promise = sendOtpEmail({ to: 'a@example.com', otp: '123456', purpose: 'Registration', username: 'alice' });
    await vi.advanceTimersByTimeAsync(10_000);
    await promise;

    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]![0]).toBe(
      '[OTP EMAIL] outcome=failed user=alice to=a***@example.com purpose=Registration attempt=1/4 error=ATTEMPT_TIMEOUT',
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining('attempt=2/4'));

    // The abandoned first send finally rejects; it must not surface as an unhandled rejection
    // or produce another log line.
    settleAbandoned(makeError('ETIMEDOUT'));
    await vi.advanceTimersByTimeAsync(0);
    expect(error).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('does not start a wait that would end after the 30s deadline, and fails without exhausting all 4 attempts', async () => {
    let now = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    vi.spyOn(Math, 'random').mockReturnValue(1); // maximum jitter
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    sendMail.mockImplementationOnce(async () => {
      // Simulate the first attempt alone having consumed nearly the whole 30s budget.
      now = 29_999;
      throw makeError('ETIMEDOUT');
    });

    const { sendOtpEmail } = await loadEmailService({});
    await expect(
      sendOtpEmail({ to: 'a@example.com', otp: '123456', purpose: 'Registration', username: 'alice' }),
    ).rejects.toMatchObject({ code: 'ETIMEDOUT' });

    // The 1s-cap wait after attempt 1 (random=1 => full 1000ms) would end at 30999ms, past the
    // 30s deadline, so no wait starts and no attempt 2 runs.
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('never logs the OTP, the full email address, or SMTP response text', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const smtpErr = makeError('EENVELOPE', 452) as Error & { response?: string };
    smtpErr.response = '452 4.2.2 Mailbox full of secrets';
    sendMail.mockRejectedValueOnce(smtpErr).mockResolvedValueOnce({});

    const { sendOtpEmail } = await loadEmailService({});
    const promise = sendOtpEmail({
      to: 'gabriel@example.com',
      otp: '123456',
      purpose: 'Registration',
      username: 'alice',
    });
    await vi.advanceTimersByTimeAsync(5_000);
    await promise;

    const allLines = JSON.stringify([...log.mock.calls, ...error.mock.calls]);
    expect(allLines).not.toContain('123456');
    expect(allLines).not.toContain('gabriel@example.com');
    expect(allLines).not.toContain('Mailbox full of secrets');
    expect(allLines).toContain('g***@example.com');
  });

  it.each(['Registration', 'Forgot Password', 'Change Email', 'Change Password'])(
    'logs the given username and purpose for %s',
    async (purpose) => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { sendOtpEmail } = await loadEmailService({});
      await sendOtpEmail({ to: 'a@example.com', otp: '123456', purpose, username: 'bob' });
      expect(log).toHaveBeenCalledWith(
        `[OTP EMAIL] outcome=sent user=bob to=a***@example.com purpose=${purpose} attempt=1/4`,
      );
    },
  );

  it('Change Email: logs the masked new email it was told to send to, not some other address', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { sendOtpEmail } = await loadEmailService({});
    await sendOtpEmail({ to: 'newaddr@example.com', otp: '123456', purpose: 'Change Email', username: 'bob' });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('to=n***@example.com'));
  });
});

describe('sendUnlockEmail (Stage 31b)', () => {
  const unlockUrl = 'http://localhost:5173/unlock-account?token=abc.def.ghi';

  it('sends to the recipient with subject "Your FoC account has been locked"; text and html carry the link', async () => {
    const { sendUnlockEmail } = await loadEmailService({});
    await sendUnlockEmail({ to: 'a@example.com', username: 'alice', unlockUrl });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0]![0] as { to: string; subject: string; text: string; html: string };
    expect(mail.to).toBe('a@example.com');
    expect(mail.subject).toBe('Your FoC account has been locked');
    expect(mail.text).toContain(unlockUrl);
    expect(mail.html).toContain(unlockUrl);
  });

  it('states the account was locked after too many failed attempts, without naming the lock length', async () => {
    const { sendUnlockEmail } = await loadEmailService({});
    await sendUnlockEmail({ to: 'a@example.com', username: 'alice', unlockUrl });
    const mail = sendMail.mock.calls[0]![0] as { text: string; html: string };
    for (const body of [mail.text, mail.html]) {
      expect(body).toMatch(/too many failed attempts/i);
      expect(body).not.toMatch(/hour|4 hours|24 hours|day/i);
    }
  });

  it('never contains an OTP, a password, or a password hint', async () => {
    const { sendUnlockEmail } = await loadEmailService({});
    await sendUnlockEmail({ to: 'a@example.com', username: 'alice', unlockUrl });
    const mail = sendMail.mock.calls[0]![0] as { text: string; html: string };
    for (const body of [mail.text, mail.html]) {
      expect(body).not.toMatch(/password/i);
      expect(body).not.toMatch(/\b\d{6}\b/);
    }
  });

  it('logs with purpose=account_unlock in the Stage 19 line format (proving it shares sendMailWithRetry)', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { sendUnlockEmail } = await loadEmailService({});
    await sendUnlockEmail({ to: 'a@example.com', username: 'alice', unlockUrl });
    expect(log).toHaveBeenCalledWith(
      '[OTP EMAIL] outcome=sent user=alice to=a***@example.com purpose=account_unlock attempt=1/4',
    );
  });

  it('retries a transient failure once, through the same retry path as sendOtpEmail', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    sendMail.mockRejectedValueOnce(makeError('ETIMEDOUT')).mockResolvedValueOnce({});
    const { sendUnlockEmail } = await loadEmailService({});
    const promise = sendUnlockEmail({ to: 'a@example.com', username: 'alice', unlockUrl });
    await vi.advanceTimersByTimeAsync(10_000);
    await promise;
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it('logs [DEV EMAIL] with the unlock url (not an otp) when NODE_ENV=development and SMTP_HOST is empty', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { sendUnlockEmail } = await loadEmailService({ env: 'development', smtpHost: '' });
    await sendUnlockEmail({ to: 'a@example.com', username: 'alice', unlockUrl });
    expect(log).toHaveBeenCalledWith(`[DEV EMAIL] to=a@example.com purpose=account_unlock url=${unlockUrl}`);
    expect(createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('does not log the username in the email body itself (sendOtpEmail contract: username is log-only)', async () => {
    const { sendUnlockEmail } = await loadEmailService({});
    await sendUnlockEmail({ to: 'a@example.com', username: 'alice', unlockUrl });
    const mail = sendMail.mock.calls[0]![0] as { text: string; html: string };
    expect(mail.text).not.toContain('alice');
    expect(mail.html).not.toContain('alice');
  });
});
