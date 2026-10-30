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
  secure: env.NODE_ENV === 'production',
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

// POST /users/register
export const register: RequestHandler = async (req, res) => {
  const result = await userService.register(req.body as RegisterInput);

  if (!result.ok) {
    res.status(409).json({
      error: 'Conflict',
      message: `An account with this ${result.field} already exists.`,
    });
    return;
  }

  res.status(201).json({ user: result.user });
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

