// AI Assistance Disclosure:
// Tool: Claude Code (Claude Opus), date: 2026-09-28
// Scope: AI asked which error codes to use, then generated the role check
// middleware.
// Author review: Author specified the behaviour, confirmed the error codes,
// reviewed the code and approved. See user-service/ai/usage-log.md, entry 007.

import type { RequestHandler } from 'express';
import type { Roles } from '@prisma/client';

// RBAC guard: allow the request only if the caller holds at least one of the
// given roles. Must run *after* `authenticate` (it reads req.user). 
export function requireRole(...allowed: Roles[]): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', message: 'Authentication required.' });
      return;
    }
    if (!req.user.roles.some((role) => allowed.includes(role))) {
      res.status(403).json({ error: 'Forbidden', message: 'Insufficient role.' });
      return;
    }
    next();
  };
}
