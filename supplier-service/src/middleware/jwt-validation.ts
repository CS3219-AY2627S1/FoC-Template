import {Request, Response, NextFunction} from "express";

import jwt from 'jsonwebtoken';
import fs from 'node:fs';

// Lazy so GET /suppliers can start even when the compose bind-mount is missing.
// Docker turns a missing ./keys/public.pem into a directory named public.pem.
//Aided by AI @ cursor
function readPublicKey(): string {
  const keyPath = process.env.USER_SERVICE_PUBLIC_KEY_PATH;
  if (!keyPath) {
    throw new Error('USER_SERVICE_PUBLIC_KEY_PATH is not set');
  }
  try {
    const stat = fs.statSync(keyPath);
    if (!stat.isFile()) {
      throw new Error(
        `USER_SERVICE_PUBLIC_KEY_PATH is not a file: ${keyPath}. Generate keys with yarn keys:generate`,
      );
    }
    return fs.readFileSync(keyPath, 'utf8');
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('USER_SERVICE_PUBLIC_KEY_PATH')) {
      throw err;
    }
    throw new Error(`USER_SERVICE_PUBLIC_KEY_PATH not found: ${keyPath}. Generate keys with yarn keys:generate`);
  }
}

// Same claim values the user service puts on RS256 tokens
export const USER = 'USER';
export const ADMINISTRATOR = 'ADMINISTRATOR';
export type Role = typeof USER | typeof ADMINISTRATOR;

declare global {
    namespace Express {
    interface Request {
      user?: { id: string; roles: Role[] };
    }
  }
}

export function authenticate(req:Request, res:Response, next:NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(header.slice(7), readPublicKey(), { algorithms: ['RS256'] }) as jwt.JwtPayload & { roles?: Role[] };
    // pin RS256
    if (typeof payload.sub !== 'string') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = { id: payload.sub, roles: payload.roles ?? [] };
    return next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

//must run after authenticate; 401 if there is no req.user, 403 if none of the roles match
export const requireRole = (...allowed: string[]) => (req:Request, res:Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return req.user.roles.some((r) => allowed.includes(r))
    ? next()
    : res.status(403).json({ error: 'Forbidden' });
};

