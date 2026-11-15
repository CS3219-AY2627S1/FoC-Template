/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Session authentication and role check middleware, in the style of user-service/src/authenticate.ts.
 * Author review: Reviewed and approved by @mattis.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-18
 * Scope: 503, never 401, when the session can't be verified (User Service unreachable).
 * Author review of additional changes: Reviewed and approved by @phuc
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-18
 * Scope: removed the SessionVerificationUnavailableError handling; HttpSessionVerifier's errors
 *        reach the error handler (503 or 500), per the author.
 * Author review: Reviewed and approved by @mattis.
 */
import type { NextFunction, Request, Response } from "express";
import type { Principal, SessionVerifier } from "../adapters/sessionVerifier";
import { sendError } from "./errors";

/**
 * Rejects requests without a valid session (401 UNAUTHENTICATED); otherwise sets res.locals.user.
 * When User Service can't be asked the verifier throws, and the error handler answers 503 (or 500).
 */
export function authenticate(verifier: SessionVerifier) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const principal = await verifier.verify(req.header("authorization"));
    if (principal === null) {
      sendError(res, 401, "UNAUTHENTICATED", "A valid session is required");
      return;
    }
    res.locals.user = principal;
    next();
  };
}

export function requireRole(role: Principal["role"]) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    if ((res.locals.user as Principal).role !== role) {
      sendError(res, 403, "FORBIDDEN", "You do not have permission to do this");
      return;
    }
    next();
  };
}
