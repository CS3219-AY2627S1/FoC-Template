/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
 * Scope: Extracted the bearer-token checks from /auth/verify into a reusable Express
 *        middleware so that /whoami (and later profile/admin routes) can share them.
 *        Added the requireRole RBAC middleware used by admin-only routes.
 * Author review: Reviewed and approved by @t-leongchuan
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-10
 * Scope: requireRole logs rejected attempts to the application log (author's Phase 1 rule).
 * Author review of additional changes: Reviewed and approved by @t-leongchuan
 */
import { Request, Response, NextFunction } from "express";
import { pool } from "./db";
import { verifyAccessToken } from "./token";
import { Role } from "./accounts";

// The account that made the current request, as loaded from the database
export interface AuthenticatedUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
}

// Rejects with 401 unless the request carries a valid token for an ACTIVE account;
// otherwise stores the account for the handler (see currentUser).
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!token) {
    res.status(401).json({ error: "UNAUTHENTICATED", message: "Missing bearer token" });
    return;
  }

  const userId = verifyAccessToken(token);
  if (!userId) {
    res.status(401).json({ error: "UNAUTHENTICATED", message: "Invalid or expired token" });
    return;
  }

  // Live lookup on every call: role changes and suspensions apply immediately (US-F4.1.4)
  const result = await pool.query(
    "SELECT id, username, display_name, role, status FROM users WHERE id = $1",
    [userId],
  );
  const user = result.rows[0];
  if (!user || user.status !== "ACTIVE") {
    res.status(401).json({ error: "UNAUTHENTICATED", message: "Account is not active" });
    return;
  }

  const authenticated: AuthenticatedUser = {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
  };
  res.locals.user = authenticated;
  next();
}

// The account stored by authenticate(); only valid in handlers registered after it.
export function currentUser(res: Response): AuthenticatedUser {
  return res.locals.user as AuthenticatedUser;
}

// RBAC: 403 unless the authenticated user has one of the given roles. Use after authenticate.
export function requireRole(...allowed: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!allowed.includes(currentUser(res).role)) {
      // Rejected attempts go to the application log, not the audit table
      console.warn(`admin.action.rejected ${JSON.stringify({ actorId: currentUser(res).id, path: req.path, code: "FORBIDDEN" })}`);
      res.status(403).json({ error: "FORBIDDEN", message: "You do not have permission to do this" });
      return;
    }
    next();
  };
}
