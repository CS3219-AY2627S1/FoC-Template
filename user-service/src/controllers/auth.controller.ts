// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-25
// 25/09/2026: Stage 4b - registration controller
// Author review:
// 25/09/2026: Stage 4c - login controller
// Author review:
// 25/09/2026: Stage 4d - logout + refresh controllers
// Author review:
// 25/09/2026: Stage 4e - verify controller
// Author review:
// 25/09/2026: Stage 5d - register returns OTP_SENT
// Author review:
// 25/09/2026: Stage 5e - verifyOtp and resendOtp controllers
// Author review:
// 25/09/2026: Stage 5 - normalise email and username (lowercase) at the request boundary
// Author review:
// 25/09/2026: Stage 6b - forgotPassword controller
// Author review:
// 25/09/2026: Stage 6c - verify-otp accepts forgot_password purpose
// Author review:
// 25/09/2026: Stage 6d - resetPassword controller
// Author review:
// 25/09/2026: Stage 6e - resend-otp accepts forgot_password purpose
// Author review:
// 27/09/2026: Stage 12c - exported emailField for reuse in me.controller.ts
// Author review:
// 2026-10-17: Stage 13b - removed the verify controller (GET /auth/verify); added jwks
//   (GET /auth/.well-known/jwks.json). Governing decision: instructions.md Stage 13b.
// Author review:
// 2026-11-05: Stage 23b - login and refresh responses include sessionTimeLeftSeconds, taken
//   from authService. Governing decision: instructions.md Stage 23b. No requirements,
//   architecture, schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-10: Stage 31c - added the unlock controller for POST /auth/unlock. Tool: Claude Code
//   (model: claude-sonnet-5). Governing decision: instructions.md Stage 31 ("Backend endpoint"
//   row). No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// 2026-11-10: Bug fix - register now sets a `pendingToken` cookie (REFRESH_COOKIE_OPTIONS,
//   maxAge = config.otp.ttlMinutes minutes) from the now non-void authService.register(). The
//   verifyOtp/resendOtp 'Registration' branches read that cookie and pass it through to
//   authService as `pendingToken`; verifyOtp's 'Registration' branch also clears the cookie on
//   success. The 'Forgot Password' branches of both are unchanged. Tool: Claude Code (model:
//   claude-sonnet-5). Governing decision: bug report + team decisions recorded in this task's
//   conversation (pending-token cookie mechanism, EMAIL_MISMATCH 403 with no OTP-counter
//   interaction, TTL = config.otp.ttlMinutes). No requirements, architecture, schema, or API
//   decisions were made by the AI tool.
// Author review:

import { z } from 'zod';
import { config } from '../config.js';
import * as authService from '../services/auth.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { REFRESH_COOKIE_OPTIONS } from '../utils/cookies.js';
import { getJwks } from '../utils/jwt.js';

// Emails are matched case-sensitively in the DB, so normalise them once here.
// Exported so other controllers (e.g. me.controller.ts) reuse the same normalisation
// and messages instead of redefining the field.
export const emailField = z
  .string({
    required_error: 'Email is required',
    invalid_type_error: 'Email must be a string',
  })
  .trim()
  .toLowerCase();

// Usernames are matched case-insensitively too. Not trimmed, so leading/trailing
// spaces still fail the service's "no spaces" rule.
const usernameField = z
  .string({
    required_error: 'Username is required',
    invalid_type_error: 'Username must be a string',
  })
  .toLowerCase();

const registerSchema = z
  .object({
    username: usernameField,
    email: emailField,
    password: z.string({
      required_error: 'Password is required',
      invalid_type_error: 'Password must be a string',
    }),
  })
  .strict();

export const register = asyncHandler(async (req, res) => {
  const { username, email, password } = registerSchema.parse(req.body);
  const { pendingToken } = await authService.register({ username, email, password });
  res.cookie('pendingToken', pendingToken, {
    ...REFRESH_COOKIE_OPTIONS,
    maxAge: config.otp.ttlMinutes * 60 * 1000,
  });
  res.status(201).json({ message: 'Verification code sent to your email', code: 'OTP_SENT' });
});

const loginSchema = z
  .object({
    // Both usernames and emails are stored lowercase, so match on the lowercase form.
    identifier: z
      .string({
        required_error: 'Username/Email is required',
        invalid_type_error: 'Username/Email must be a string',
      })
      .trim()
      .toLowerCase(),
    password: z.string({
      required_error: 'Password is required',
      invalid_type_error: 'Password must be a string',
    }),
  })
  .strict();

export const login = asyncHandler(async (req, res) => {
  const { identifier, password } = loginSchema.parse(req.body);

  const { accessToken, refreshToken, user, sessionTimeLeftSeconds } = await authService.login(
    { identifier, password },
    req.headers['user-agent'] ?? null,
    req.ip ?? null,
  );

  res.cookie('refreshToken', refreshToken, {
    ...REFRESH_COOKIE_OPTIONS,
    maxAge: config.jwt.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
  });

  res.status(200).json({ accessToken, user, sessionTimeLeftSeconds });
});

export const logout = asyncHandler(async (req, res) => {
  const refreshToken: string =
    typeof req.cookies.refreshToken === 'string' ? req.cookies.refreshToken : '';

  await authService.logout(refreshToken);

  res.clearCookie('refreshToken', REFRESH_COOKIE_OPTIONS);
  res.status(200).json({ message: 'Logged out successfully', code: 'LOGOUT_SUCCESS' });
});

export const refresh = asyncHandler(async (req, res) => {
  const refreshToken: string =
    typeof req.cookies.refreshToken === 'string' ? req.cookies.refreshToken : '';

  const { accessToken, sessionTimeLeftSeconds } = await authService.refresh(refreshToken);

  res.status(200).json({ accessToken, sessionTimeLeftSeconds });
});

export const jwks = asyncHandler(async (_req, res) => {
  res.status(200).json(getJwks());
});

// API-facing purpose -> DB enum value. Extend here in later stages.
const PURPOSE_MAP = { registration: 'Registration', forgot_password: 'Forgot Password' } as const;

const purposeErrorMap: z.ZodErrorMap = (issue) => {
  if (issue.code === 'invalid_enum_value') return { message: 'Invalid purpose' };
  if (issue.code === 'invalid_type' && issue.received === 'undefined') {
    return { message: 'Purpose is required' };
  }
  return { message: 'Purpose must be a string' };
};

// Each endpoint lists the purposes it supports.
const verifyPurposeSchema = z.enum(['registration', 'forgot_password'], {
  errorMap: purposeErrorMap,
});
const resendPurposeSchema = z.enum(['registration', 'forgot_password'], {
  errorMap: purposeErrorMap,
});

const verifyOtpSchema = z
  .object({
    email: emailField,
    otp: z.string({
      required_error: 'OTP is required',
      invalid_type_error: 'OTP must be a string',
    }),
    purpose: verifyPurposeSchema,
  })
  .strict();

const resendOtpSchema = z.object({ email: emailField, purpose: resendPurposeSchema }).strict();

export const verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp, purpose } = verifyOtpSchema.parse(req.body);
  switch (PURPOSE_MAP[purpose]) {
    case 'Registration': {
      const pendingToken =
        typeof req.cookies.pendingToken === 'string' ? req.cookies.pendingToken : undefined;
      await authService.verifyRegistrationOtp({ email, otp, pendingToken });
      res.clearCookie('pendingToken', REFRESH_COOKIE_OPTIONS);
      res.status(200).json({
        message: 'Registration complete. You can now log in.',
        code: 'REGISTER_SUCCESS',
      });
      return;
    }
    case 'Forgot Password':
      await authService.verifyForgotPasswordOtp({ email, otp });
      res.status(200).json({
        message: 'Code verified. You can now set a new password.',
        code: 'OTP_VERIFIED',
      });
      return;
  }
});

export const resendOtp = asyncHandler(async (req, res) => {
  const { email, purpose } = resendOtpSchema.parse(req.body);
  switch (PURPOSE_MAP[purpose]) {
    case 'Registration': {
      const pendingToken =
        typeof req.cookies.pendingToken === 'string' ? req.cookies.pendingToken : undefined;
      await authService.resendRegistrationOtp({ email, pendingToken });
      break;
    }
    case 'Forgot Password':
      await authService.resendForgotPasswordOtp({ email });
      break;
  }
  res.status(200).json({
    message: 'A new verification code has been sent to your email',
    code: 'OTP_SENT',
  });
});

const forgotPasswordSchema = z.object({ email: emailField }).strict();

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = forgotPasswordSchema.parse(req.body);
  await authService.forgotPassword({ email });
  res.status(200).json({ message: 'A reset code has been sent to your email', code: 'OTP_SENT' });
});

const resetPasswordSchema = z
  .object({
    email: emailField,
    otp: z.string({
      required_error: 'OTP is required',
      invalid_type_error: 'OTP must be a string',
    }),
    newPassword: z.string({
      required_error: 'New password is required',
      invalid_type_error: 'New password must be a string',
    }),
  })
  .strict();

export const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = resetPasswordSchema.parse(req.body);
  await authService.resetPassword({ email, otp, newPassword });
  res.status(200).json({
    message: 'Password reset successful. Please log in with your new password.',
    code: 'PASSWORD_RESET_SUCCESS',
  });
});

const unlockSchema = z
  .object({
    token: z.string({
      required_error: 'Token is required',
      invalid_type_error: 'Token must be a string',
    }).min(1, 'Token is required'),
  })
  .strict();

export const unlock = asyncHandler(async (req, res) => {
  const { token } = unlockSchema.parse(req.body);
  const code = await authService.unlockByToken(token);
  const message =
    code === 'UNLOCKED' ? 'Your account has been unlocked' : 'Your account is no longer locked';
  res.status(200).json({ message, code });
});
