// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-10-19
//  2026-10-19: Week 9 - authentication and authorization middleware. "Administrator"
//    means rank >= admin, so super admin is included (team decision 2026-10-19).
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError.js';
import { ELEVATED_ROLE, ROLE_RANK, canReadBalance } from '../auth/roleRank.js';
import type { TokenVerifier } from '../auth/verifyAccessToken.js';

/**
 * Verifies the bearer token and attaches the caller to the request.
 *
 * Errors from the verifier are passed through untouched: it already distinguishes a bad
 * token (401) from an unreachable key set (503), and flattening that here would undo
 * the whole point of the distinction.
 */
export function requireAuth(verify: TokenVerifier) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      next(new AppError(401, 'Authentication required.', 'UNAUTHORIZED'));
      return;
    }

    try {
      req.user = await verify(header.slice('Bearer '.length));
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** F20.2.1 - the transaction log is for administrators. Runs after requireAuth. */
export function requireElevated(req: Request, _res: Response, next: NextFunction): void {
  const rank = req.user ? (ROLE_RANK[req.user.role] ?? -1) : -1;
  if (rank >= ROLE_RANK[ELEVATED_ROLE]!) {
    next();
    return;
  }
  next(new AppError(403, 'This is restricted to administrators.', 'FORBIDDEN'));
}

/** F19.5.1 - your own balance, or anyone's if you are elevated. Runs after requireAuth. */
export function requireSelfOrElevated(req: Request, _res: Response, next: NextFunction): void {
  const targetUserId = req.params.userId;
  if (req.user && targetUserId && canReadBalance(req.user, targetUserId)) {
    next();
    return;
  }
  next(new AppError(403, 'You may not read this balance.', 'FORBIDDEN'));
}
