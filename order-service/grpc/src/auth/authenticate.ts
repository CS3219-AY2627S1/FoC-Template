// AI Assistance Disclosure: ChatGPT (Codex), 2026-10-22.
// Scope: Implemented author-approved Order validation/authentication/RPC integration.
// Author review: Pending; see ../../../usage-log.md.
import { createPublicKey } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { RequestHandler } from 'express';

// The caller supplies User Service's verification key; Order never signs tokens.
export function createAuthenticate(publicKey: string): RequestHandler {
  const key = createPublicKey(publicKey);
  return (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    try {
      const payload = jwt.verify(authorization.slice(7), key, { algorithms: ['RS256'] });
      if (typeof payload === 'string' || typeof payload.sub !== 'string' || !payload.sub.trim()
        || typeof payload.exp !== 'number' || !Array.isArray(payload.roles)
        || payload.roles.length === 0
        || !payload.roles.every((role: unknown) => role === 'USER' || role === 'ADMINISTRATOR')) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      res.locals.user = { id: payload.sub, roles: payload.roles };
      next();
    } catch {
      res.status(401).json({ error: 'unauthorized' });
    }
  };
}

export const requireUser: RequestHandler = (_req, res, next) => {
  const user = res.locals.user;
  if (!user) { res.status(401).json({ error: 'unauthorized' }); return; }
  if (!user.roles.includes('USER')) { res.status(403).json({ error: 'forbidden' }); return; }
  next();
};

export const requireAdministrator: RequestHandler = (_req, res, next) => {
  const user = res.locals.user;
  if (!user) { res.status(401).json({ error: 'unauthorized' }); return; }
  if (!user.roles.includes('ADMINISTRATOR')) { res.status(403).json({ error: 'forbidden' }); return; }
  next();
};
