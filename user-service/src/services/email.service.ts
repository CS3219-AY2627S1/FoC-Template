// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-25
// 25/09/2026: Stage 5b - email service
// Author review:
// 25/09/2026: Stage 6 pre-work - Forgot Password email template
// Author review:
// 27/09/2026: Stage 12c - Change Email template
// Author review:
// 2026-10-22: Added the missing Change Password template. Change Password has sent
//   OTPs since Stage 12e (me.service.ts), but PURPOSE_COPY had no entry for it, so
//   sendOtpEmail threw whenever SMTP was actually configured (masked locally by the
//   dev console-log fallback). Found while fixing an unrelated stale test.
// Author review:
// 2026-11-04: Stage 19 - sendOtpEmail gains username and a retry loop: per-attempt 5s cap,
//   full-jitter backoff (1/2/4s caps), a 30s overall deadline, and a console log line per
//   attempt (masked email, no OTP). Transient vs. non-transient classification and the log
//   format are per instructions.md Stage 19. No requirements, architecture, schema, or API
//   decisions were made by the AI tool.
// Author review:
// 2026-11-04: Stage 20 - moved maskEmail to src/utils/maskEmail.ts so userResponse.ts can
//   reuse it; this file now imports it. Output unchanged. No requirements, architecture,
//   schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-09: Stage 27a - add the "Admin Action" entry to PURPOSE_COPY, per instructions.md
//   Stage 27's OTP table (exact subject line given there). No requirements, architecture,
//   schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-10: Stage 31b - extracted sendOtpEmail's attempt loop into the shared
//   sendMailWithRetry (same attempts/backoff/per-attempt cap/overall deadline/[OTP EMAIL] log
//   line; sendOtpEmail's own behaviour, log lines and dev fallback are unchanged), and added
//   sendUnlockEmail, which reuses it with purpose='account_unlock' for the lockout unlock
//   email (its own dev-fallback line distinguishes it from an OTP, since it carries a link,
//   not a code). Tool: Claude Code (model: claude-fable-5-1). Governing decision:
//   instructions.md Stage 31 ("When the email is sent" / "The unlock link and token" tables).
//   No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:

import nodemailer from "nodemailer";
import { config } from "../config.js";
import { maskEmail } from "../utils/maskEmail.js";

const MAX_SEND_ATTEMPTS = 4;
const BASE_BACKOFF_SECONDS = 1;
const MAX_BACKOFF_SECONDS = 300;
const PER_ATTEMPT_TIMEOUT_MS = 5_000;
const OVERALL_DEADLINE_MS = 30_000;

const ALWAYS_TRANSIENT_CODES = new Set(["ETIMEDOUT", "ESOCKET", "ECONNECTION", "EDNS"]);
const RESPONSE_CODE_GATED_CODES = new Set(["EENVELOPE", "EMESSAGE", "EAUTH"]);

const PURPOSE_COPY: Record<string, { subject: string; intro: string }> = {
  Registration: {
    subject: "Your FoC verification code",
    intro: "Use the code below to finish creating your FoC account.",
  },
  "Forgot Password": {
    subject: "Your FoC password reset code",
    intro: "Use the code below to reset your FoC password.",
  },
  "Change Email": {
    subject: "Confirm your new FoC email address",
    intro: "Use the code below to confirm your new FoC email address.",
  },
  "Change Password": {
    subject: "Confirm your FoC password change",
    intro: "Use the code below to confirm your password change.",
  },
  "Admin Action": {
    subject: "Your FoC admin privileges elevation verification code",
    intro: "Use the code below to elevate your admin privileges.",
  },
};

// Dev fallback is only reachable when NODE_ENV=development and SMTP is not configured.
const useDevFallback = config.env === "development" && config.email.host === "";

const transport = useDevFallback
  ? null
  : nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.port === 465,
      auth: { user: config.email.user, pass: config.email.pass },
      connectionTimeout: PER_ATTEMPT_TIMEOUT_MS,
      greetingTimeout: PER_ATTEMPT_TIMEOUT_MS,
      socketTimeout: PER_ATTEMPT_TIMEOUT_MS,
      dnsTimeout: PER_ATTEMPT_TIMEOUT_MS,
    });

class AttemptTimeoutError extends Error {
  constructor() {
    super("OTP email attempt timed out");
    this.name = "AttemptTimeoutError";
  }
}

function getErrorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && typeof (err as { code?: unknown }).code === "string") {
    return (err as { code: string }).code;
  }
  return undefined;
}

function getResponseCode(err: unknown): number | undefined {
  if (
    err &&
    typeof err === "object" &&
    typeof (err as { responseCode?: unknown }).responseCode === "number"
  ) {
    return (err as { responseCode: number }).responseCode;
  }
  return undefined;
}

// Per instructions.md Stage 19's transient/non-transient table.
function isTransientError(err: unknown): boolean {
  if (err instanceof AttemptTimeoutError) return true;
  const code = getErrorCode(err);
  if (!code) return false;
  if (ALWAYS_TRANSIENT_CODES.has(code)) return true;
  if (RESPONSE_CODE_GATED_CODES.has(code)) {
    const responseCode = getResponseCode(err);
    return responseCode !== undefined && responseCode >= 400 && responseCode <= 499;
  }
  return false;
}

function describeAttemptError(err: unknown): string {
  if (err instanceof AttemptTimeoutError) return "ATTEMPT_TIMEOUT";
  const code = getErrorCode(err) ?? "UNKNOWN";
  const responseCode = getResponseCode(err);
  return responseCode !== undefined ? `${code} ${responseCode}` : code;
}

function logOtpEmailAttempt(
  outcome: "sent" | "failed",
  {
    username,
    to,
    purpose,
    attempt,
    error,
  }: { username: string; to: string; purpose: string; attempt: number; error?: string },
): void {
  const base = `[OTP EMAIL] outcome=${outcome} user=${username} to=${maskEmail(to)} purpose=${purpose} attempt=${attempt}/${MAX_SEND_ATTEMPTS}`;
  if (outcome === "sent") {
    console.log(base);
  } else {
    console.error(`${base} error=${error}`);
  }
}

// After the n-th failed attempt: random() x min(300, 1 x 2^(n-1)) seconds (full jitter).
function backoffMs(attemptNumber: number): number {
  const capSeconds = Math.min(MAX_BACKOFF_SECONDS, BASE_BACKOFF_SECONDS * 2 ** (attemptNumber - 1));
  return Math.random() * capSeconds * 1000;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type OtpMailOptions = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

// Races one sendMail() against a per-attempt cap. Nodemailer cannot cancel an in-flight send,
// so a send cut off by the cap is left to settle on its own; its eventual result is swallowed
// here (never logged, never rethrown) instead of becoming an unhandled rejection.
function sendWithCap(mailOptions: OtpMailOptions, capMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new AttemptTimeoutError());
    }, capMs);

    transport!.sendMail(mailOptions).then(
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      },
      (err: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// Stage 19's retry mechanism: same attempt count, per-attempt cap, full-jitter backoff, overall
// deadline and [OTP EMAIL] log line, shared by sendOtpEmail and sendUnlockEmail (Stage 31b).
// `purpose` is only ever used as the log line's value here (and, for sendOtpEmail, to pick the
// template beforehand) - callers that are not OTPs pass their own value, e.g. 'account_unlock'.
async function sendMailWithRetry(
  mailOptions: OtpMailOptions,
  { username, to, purpose }: { username: string; to: string; purpose: string },
): Promise<void> {
  const startedAt = Date.now();

  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
    try {
      await sendWithCap(mailOptions, PER_ATTEMPT_TIMEOUT_MS);
      logOtpEmailAttempt("sent", { username, to, purpose, attempt });
      return;
    } catch (err) {
      logOtpEmailAttempt("failed", {
        username,
        to,
        purpose,
        attempt,
        error: describeAttemptError(err),
      });

      if (!isTransientError(err) || attempt === MAX_SEND_ATTEMPTS) {
        throw err;
      }

      const waitMs = backoffMs(attempt);
      if (Date.now() - startedAt + waitMs > OVERALL_DEADLINE_MS) {
        throw err;
      }
      await delay(waitMs);
    }
  }
}

export async function sendOtpEmail({
  to,
  otp,
  purpose,
  username,
}: {
  to: string;
  otp: string;
  purpose: string;
  username: string;
}): Promise<void> {
  if (useDevFallback || !transport) {
    console.log(`[DEV EMAIL] to=${to} purpose=${purpose} otp=${otp}`);
    return;
  }

  const copy = PURPOSE_COPY[purpose];
  if (!copy) {
    throw new Error(`No email template for purpose '${purpose}'`);
  }
  const expiry = `This code expires in ${config.otp.ttlMinutes} minutes.`;
  const mailOptions = {
    from: config.email.from,
    to,
    subject: copy.subject,
    text: `${copy.intro}\n\nYour code: ${otp}\n\n${expiry}`,
    html: `<p>${copy.intro}</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${otp}</p><p>${expiry}</p>`,
  };

  await sendMailWithRetry(mailOptions, { username, to, purpose });
}

// Stage 31b: emailed on every login lock (not OTP send blocks), to the registered address,
// after the lock's transaction has committed. No OTP, password or lock length ever appears in
// it. Reuses sendMailWithRetry, logging with purpose='account_unlock' per instructions.md
// Stage 31's logging rule.
const UNLOCK_EMAIL_SUBJECT = "Your FoC account has been locked";
const UNLOCK_EMAIL_PURPOSE = "account_unlock";

export async function sendUnlockEmail({
  to,
  username,
  unlockUrl,
}: {
  to: string;
  username: string;
  unlockUrl: string;
}): Promise<void> {
  if (useDevFallback || !transport) {
    console.log(`[DEV EMAIL] to=${to} purpose=${UNLOCK_EMAIL_PURPOSE} url=${unlockUrl}`);
    return;
  }

  const intro =
    "Your FoC account was locked after too many failed attempts. Use the link below to unlock it.";
  const mailOptions = {
    from: config.email.from,
    to,
    subject: UNLOCK_EMAIL_SUBJECT,
    text: `${intro}\n\n${unlockUrl}`,
    html: `<p>${intro}</p><p><a href="${unlockUrl}">${unlockUrl}</a></p>`,
  };

  await sendMailWithRetry(mailOptions, { username, to, purpose: UNLOCK_EMAIL_PURPOSE });
}
