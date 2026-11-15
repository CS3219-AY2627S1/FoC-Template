/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-10
 * Scope: The author's admin-only audit viewer and chain check (GET /admin/audit,
 *        GET /admin/audit/verify) with the author's paging, filter and size rules.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { Router, Request, Response } from "express";
import { authenticate, requireRole } from "./authenticate";
import { AUDIT_ACTIONS, AuditAction, listAudit, verifyAuditChain } from "./audit";

export const adminAuditRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// Public path: GET /api/v1/admin/audit?targetId&actorId&action&before&limit
adminAuditRouter.get("/admin/audit", authenticate, requireRole("ADMINISTRATOR"), async (req: Request, res: Response) => {
  const q = req.query;
  const details: Record<string, string> = {};
  const text = (v: unknown) => (typeof v === "string" && v !== "" ? v : undefined);

  const targetId = text(q.targetId);
  const actorId = text(q.actorId);
  const action = text(q.action);
  const before = text(q.before);
  const limitRaw = text(q.limit);

  if (targetId && !UUID_RE.test(targetId)) details.targetId = "Must be a user id";
  if (actorId && !UUID_RE.test(actorId)) details.actorId = "Must be a user id";
  if (action && !AUDIT_ACTIONS.includes(action as AuditAction)) details.action = `Must be one of ${AUDIT_ACTIONS.join(", ")}`;
  if (before && !/^[1-9][0-9]{0,18}$/.test(before)) details.before = "Must be an entry id (nextCursor)";
  const limit = limitRaw === undefined ? DEFAULT_LIMIT : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) details.limit = `Must be 1-${MAX_LIMIT}`;

  if (Object.keys(details).length > 0) {
    res.status(400).json({ error: "VALIDATION_FAILED", message: "Some fields are invalid", details });
    return;
  }
  res.json(await listAudit({ targetId, actorId, action: action as AuditAction | undefined, before, limit }));
});

// Public path: GET /api/v1/admin/audit/verify -> { valid, checkedEntries, firstInvalidId, latestHash }
adminAuditRouter.get("/admin/audit/verify", authenticate, requireRole("ADMINISTRATOR"), async (req: Request, res: Response) => {
  res.json(await verifyAuditChain());
});
