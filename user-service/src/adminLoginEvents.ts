/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Sonnet 5.5), date: 2026-11-08
 * Scope: The author's admin-only login-events list (GET /admin/login-events) with the author's
 *        paging and filter rules (50 per page, 100 at most, cursor by id).
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { Router, Request, Response } from "express";
import { authenticate, requireRole } from "./authenticate";
import { LOGIN_OUTCOMES, LOGIN_REASONS, LoginOutcome, LoginReason, listLoginEvents } from "./loginEvents";

export const adminLoginEventsRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// Public path: GET /api/v1/admin/login-events?accountId&outcome&reason&before&limit
// Without accountId, attempts on unknown usernames (no account) are included.
adminLoginEventsRouter.get("/admin/login-events", authenticate, requireRole("ADMINISTRATOR"), async (req: Request, res: Response) => {
  const q = req.query;
  const details: Record<string, string> = {};
  const text = (v: unknown) => (typeof v === "string" && v !== "" ? v : undefined);

  const accountId = text(q.accountId);
  const outcome = text(q.outcome);
  const reason = text(q.reason);
  const before = text(q.before);
  const limitRaw = text(q.limit);

  if (accountId && !UUID_RE.test(accountId)) details.accountId = "Must be a user id";
  if (outcome && !LOGIN_OUTCOMES.includes(outcome as LoginOutcome)) details.outcome = `Must be one of ${LOGIN_OUTCOMES.join(", ")}`;
  if (reason && !LOGIN_REASONS.includes(reason as LoginReason)) details.reason = `Must be one of ${LOGIN_REASONS.join(", ")}`;
  if (before && !/^[1-9][0-9]{0,18}$/.test(before)) details.before = "Must be an event id (nextCursor)";
  const limit = limitRaw === undefined ? DEFAULT_LIMIT : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) details.limit = `Must be 1-${MAX_LIMIT}`;

  if (Object.keys(details).length > 0) {
    res.status(400).json({ error: "VALIDATION_FAILED", message: "Some fields are invalid", details });
    return;
  }
  res.json(await listLoginEvents({
    accountId, outcome: outcome as LoginOutcome | undefined, reason: reason as LoginReason | undefined, before, limit,
  }));
});
