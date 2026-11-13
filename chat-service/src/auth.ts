// AI-assisted (Claude), reviewed and tested by Maliha
// Checks user-service's RS256 access tokens, same as supplier-service does
import type { NextFunction, Request, Response } from 'express';
import fs from 'node:fs';
import jwt from 'jsonwebtoken';
import { env } from './env';

export type AuthUser = { id: string; roles: string[]; token: string };

let publicKey: string | undefined;

// read on first use so /health works even if the key mount is missing
const getPublicKey = () => (publicKey ??= fs.readFileSync(env.USER_SERVICE_PUBLIC_KEY_PATH, 'utf8'));

// null if the token is missing, expired or not signed by user-service
export function verifyToken(token: unknown): AuthUser | null {
  if (typeof token !== 'string' || !token) return null;
  try {
    const payload = jwt.verify(token, getPublicKey(), { algorithms: ['RS256'] }) as jwt.JwtPayload;
    if (typeof payload.sub !== 'string') return null;
    return { id: payload.sub, roles: Array.isArray(payload.roles) ? payload.roles : [], token };
  } catch {
    return null;
  }
}

// Express: admin-only routes
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const user = verifyToken(header?.startsWith('Bearer ') ? header.slice(7) : undefined);
  if (!user) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  if (!user.roles.includes('ADMINISTRATOR')) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  res.locals.user = user;
  next();
}