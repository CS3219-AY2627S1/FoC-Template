/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-27
 * Scope: Generated the authorize middleware factory (minimum-role check) as specified in
 *        instructions.md Stage 8.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Verified that the code follows the correct RBAC logic. 
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';

export const ROLE_RANK: Record<string, number> = {
  user: 0,
  admin: 1,
  'super admin': 2,
};

// Minimum-role check: authorize('admin') lets admin and super admin through. Must run after
// `authenticate`, which sets req.user. Never throws and does no async work.
export function authorize(minimumRole: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    // An unknown role on either side makes the comparison false, so it is rejected.
    if (ROLE_RANK[req.user.role]! >= ROLE_RANK[minimumRole]!) {
      next();
      return;
    }

    res.status(403).json({ message: 'Forbidden', code: 'FORBIDDEN' });
  };
}
