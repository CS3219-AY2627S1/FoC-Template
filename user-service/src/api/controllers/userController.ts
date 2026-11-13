// AI Assistance Disclosure:
// Tool: Claude Code (Claude Opus), dates: 2026-09-27 – 2026-10-19
// Scope: AI generated the register, login (JWT signing), getMe, list,
// getUserById, refresh, updateMe, grantAdmin and revokeAdmin handlers, and the
// refresh cookie handling; reviewed the author's logout handler (idempotent
// 204).
// Author review: Author decided the layers, endpoint behaviour, JWT and
// session settings, wrote the logout handler, reviewed the code and approved.
// See user-service/ai/usage-log.md, entries 004, 008, 009, 010, 011, 013, 015,
// 017, 020.
// Author specified the layers, endpoint behavior, JWT and session settings,
// and wrote the logout handler. OpenAI Codex also added DELETE /users/me and
// restore-confirmation registration handling.
// registration handling (entries 025 and 027); both were reviewed, manually
// tested, and approved.
//
import type { RequestHandler, Response } from 'express';
import type { Roles } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { env, jwtPrivateKey } from '../../env';
import type { RegisterInput } from '../dto/registerDto';
import type { LoginInput } from '../dto/loginDto';
import type { UpdateProfileInput } from '../dto/updateProfileDto';
import * as userService from '../../services/userService';
import * as sessionService from '../../services/sessionService';
import * as adminService from '../../services/adminService';
import * as passwordService from '../../services/passwordService';
import type {
  CompleteResetPasswordInput,
  RegisterVerifyInput,
} from '../dto/otpDto';

const REFRESH_COOKIE = 'refreshToken';

function signAccessToken(userId: string, roles: Roles[]) {
  return jwt.sign({ roles }, jwtPrivateKey, {
    algorithm: 'RS256',
    subject: userId,
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    jwtid: randomUUID(),
  });
}

// httpOnly: JS can't read it (XSS-safe). path: only sent to /users/* routes.
const refreshCookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/users',
} as const;

function setRefreshCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(REFRESH_COOKIE, token, { ...refreshCookieOptions, expires: expiresAt });
}

// Must use the same options (esp. path) as when set.
function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions);
}


function sendRegisterConflict(res: Response, field: 'email' | 'username') {
  res.status(409).json({
    error: 'Conflict',
    message: `An account with this ${field} already exists.`,
  });
}

function sendOtpFailure(
  res: Response,
  result: { reason: string; retryAfterSeconds?: number },
) {
  if (result.retryAfterSeconds) {
    res.setHeader('Retry-After', String(result.retryAfterSeconds));
  }
  if (result.reason === 'throttled' || result.reason === 'locked') {
    res.status(429).json({ error: 'Too Many Requests', message: 'Try again after some time.' });
    return;
  }
  if (result.reason === 'not_found') {
    res.status(404).json({ error: 'Not Found', message: 'User not found.' });
    return;
  }
  if (result.reason === 'challenge') {
    res.status(400).json({ error: 'Bad Request', message: 'This OTP is no longer valid.' });
    return;
  }
  if (result.reason === 'missing') {
    res.status(400).json({ error: 'Bad Request', message: 'OTP expired or not found.' });
    return;
  }
  res.status(400).json({ error: 'Bad Request', message: 'Invalid OTP.' });
}

// POST /users/register — stash pending signup and email an OTP. No User row yet.
export const register: RequestHandler = async (req, res) => {
  try {
    const result = await userService.initiateRegister(req.body as RegisterInput);
    if (!result.ok) {
      if ('reason' in result && result.reason === 'restore_confirmation_required') {
        res.status(409).json({
          error: 'Restore Confirmation Required',
          message: 'A deleted account exists for this email. Confirm to restore only the previous credit balance; other account data will not be restored.',
        });
        return;
      }
      if ('reason' in result && result.reason === 'signup_in_progress') {
        res.status(409).json({
          error: 'Sign-up In Progress',
          message: 'A sign-up for this email is already waiting for its code. Use that code, or try again in 2 minutes.',
        });
        return;
      }
      if ('field' in result) {
        sendRegisterConflict(res, result.field);
        return;
      }
      sendOtpFailure(res, result);
      return;
    }
    res.status(200).json({ message: 'OTP sent' });
  } catch {
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to send OTP.' });
  }
};

// POST /users/register/verify — consume OTP and create the account from pending info.
export const verifyRegister: RequestHandler = async (req, res) => {
  try {
    const result = await userService.completeRegister(req.body as RegisterVerifyInput);
    if (!result.ok) {
      if ('field' in result) {
        sendRegisterConflict(res, result.field);
        return;
      }
      sendOtpFailure(res, result);
      return;
    }
    res.status(201).json({ user: result.user });
  } catch {
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to verify registration.' });
  }
};

// POST /users/login
export const login: RequestHandler = async (req, res) => {
  const result = await userService.login(req.body as LoginInput);

  if (!result.ok) {
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid email or password.' });
    return;
  }

  // Logging in again on this browser replaces its old session.
  const oldToken = req.cookies?.[REFRESH_COOKIE];
  if (oldToken) await sessionService.revokeSession(oldToken);

  const session = await sessionService.createSession(result.userId);
  setRefreshCookie(res, session.token, session.expiresAt);

  res.status(200).json({ token: signAccessToken(result.userId, result.roles) });
};

// POST /users/refresh
export const refresh: RequestHandler = async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  const result = token
    ? await sessionService.rotateSession(token)
    : { ok: false as const, reason: 'invalid' as const };

  if (!result.ok) {
    // Superseded = another tab just rotated it; this response may arrive after
    // that one's Set-Cookie, so clearing here would delete the newer cookie.
    if (result.reason === 'invalid') clearRefreshCookie(res);
    res.status(401).json({ error: 'Unauthorized', message: 'Session expired. Please log in again.' });
    return;
  }

  setRefreshCookie(res, result.token, result.expiresAt);
  res.status(200).json({ token: signAccessToken(result.userId, result.roles) });
};

// POST /users/logout
// Idempotent: always 204, even with no cookie or an already-revoked session.
export const logout: RequestHandler = async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) await sessionService.revokeSession(token);

  clearRefreshCookie(res);
  res.status(204).end();
};

// GET /users/me
export const getMe: RequestHandler = async (req, res) => {
  const user = await userService.getProfile(req.user!.id);
  if (!user) {
    res.status(404).json({ error: 'Not Found', message: 'User no longer exists.' });
    return;
  }
  res.status(200).json({ user });
};

// PATCH /users/me
export const updateMe: RequestHandler = async (req, res) => {
  const result = await userService.updateProfile(req.user!.id, req.body as UpdateProfileInput);

  if (!result.ok) {
    if (result.reason === 'not_found') {
      res.status(404).json({ error: 'Not Found', message: 'User no longer exists.' });
    } else {
      res.status(409).json({ error: 'Conflict', message: 'This username is already in use.' });
    }
    return;
  }

  res.status(200).json({ user: result.user });
};

// DELETE /users/me
export const deleteMe: RequestHandler = async (req, res) => {
  const result = await userService.deleteAccount(req.user!.id);
  if (!result.ok) {
    if (result.reason === 'not_found') {
      res.status(404).json({ error: 'Not Found', message: 'User no longer exists.' });
    } else if (result.reason === 'last_admin') {
      res.status(409).json({ error: 'Conflict', message: 'Cannot delete the last remaining active administrator.' });
    } else if (result.reason === 'eligibility_unavailable') {
      res.status(503).json({ error: 'Service Unavailable', message: "Can't delete your account right now. Please try again later." });
    } else {
      res.status(409).json({ error: 'Conflict', message: `Cannot delete an account with ${result.activeOrders} active orders.` });
    }
    return;
  }

  clearRefreshCookie(res);
  res.status(200).json({
    message: 'Account deleted. Re-registering with the same email within 4 years will restore your previous credit balance, but not your other account information.',
  });
};

// GET /users
export const listUsers: RequestHandler = async (_req, res) => {
  const users = await userService.listProfiles();
  res.status(200).json({ users });
};

// GET /users/:id
export const getUserById: RequestHandler = async (req, res) => {
  const id = String(req.params.id);
  const user = await userService.getProfile(id);
  if (!user) {
    res.status(404).json({ error: 'Not Found', message: 'User not found.' });
    return;
  }
  res.status(200).json({ user });
};


// Shared by the admin-role endpoints.
function sendAdminError(res: Response, reason: 'forbidden' | 'not_found' | 'last_admin') {
  if (reason === 'forbidden') {
    res.status(403).json({ error: 'Forbidden', message: 'Only an active administrator can change admin roles.' });
  } else if (reason === 'not_found') {
    res.status(404).json({ error: 'Not Found', message: 'User not found.' });
  } else {
    res.status(409).json({ error: 'Conflict', message: 'Cannot revoke the last remaining active administrator.' });
  }
}

// POST /users/:id/admin
// Idempotent: 200 whether the role was granted now or already held.
export const grantAdmin: RequestHandler = async (req, res) => {
  const result = await adminService.grantAdmin(req.user!.id, String(req.params.id));
  if (!result.ok) {
    sendAdminError(res, result.reason);
    return;
  }
  res.status(200).json({ user: result.user });
};

// DELETE /users/:id/admin
// Idempotent: 200 whether the role was revoked now or not held.
export const revokeAdmin: RequestHandler = async (req, res) => {
  const result = await adminService.revokeAdmin(req.user!.id, String(req.params.id));
  if (!result.ok) {
    sendAdminError(res, result.reason);
    return;
  }
  res.status(200).json({ user: result.user });
};

// POST /users/reset-password/request
export const requestResetPassword: RequestHandler = async (req, res) => {
  try {
    const result = await passwordService.requestResetPassword(req.user!.id);
    if (!result.ok) {
      sendOtpFailure(res, result);
      return;
    }
    res.status(200).json({ message: 'OTP sent' });
  } catch {
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to send OTP.' });
  }
};

// POST /users/reset-password/verify
export const completeResetPassword: RequestHandler = async (req, res) => {
  const user = await userService.getProfile(req.user!.id);
  if (!user) {
    res.status(404).json({ error: 'Not Found', message: 'User not found.' });
    return;
  }

  const { otp, newPassword } = req.body as CompleteResetPasswordInput;
  try {
    const result = await passwordService.completeForgotPassword({
      email: user.email,
      otp,
      password: newPassword,
    });
    if (!result.ok) {
      sendOtpFailure(res, result);
      return;
    }
    clearRefreshCookie(res);
    res.status(200).json({ message: 'Password updated.' });
  } catch {
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to reset password.' });
  }
};
