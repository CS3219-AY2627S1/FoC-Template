/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
 * Scope: Admin-only HTTP route for role changes, mapping the rules in roles.ts to the
 *        author's status codes.
 * Author review: Reviewed and approved by @t-leongchuan
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-10
 * Scope: Suspend/restore routes, the optional/required reason, the author's new error codes,
 *        and application-log warnings for rejected admin attempts.
 * Author review of additional changes: Reviewed and approved by @t-leongchuan
 */
import { Router, Request, Response } from "express";
import { authenticate, currentUser, requireRole } from "./authenticate";
import { Role } from "./accounts";
import {
  changeRole,
  ROLES,
  NotAllowedError,
  OwnRoleError,
  UserNotFoundError,
  LastAdministratorError,
  InvalidStatusTransitionError,
} from "./roles";
import { changeAccountStatus, SelfSuspendError } from "./accountStatus";

export const usersRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASON_MAX = 500;

// Reason text: 1-500 characters after trimming. Guideline for callers: describe the
// evidence (e.g. order or report IDs), not personal details; audit entries are permanent.
function parseReason(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const reason = raw.trim();
  return reason.length >= 1 && reason.length <= REASON_MAX ? reason : undefined;
}

function validationError(res: Response, field: string, message: string): void {
  res.status(400).json({ error: "VALIDATION_FAILED", message: "Some fields are invalid", details: { [field]: message } });
}

// Rejected admin attempts go to the application log, not the audit table (author's rule:
// audit entries record changes that happened). Not tamper-evident.
function warnRejected(res: Response, action: string, targetId: string, code: string): void {
  console.warn(`admin.action.rejected ${JSON.stringify({ actorId: currentUser(res).id, action, targetId, code })}`);
}

// Maps the shared admin-action errors to responses; returns false for unknown errors
function sendAdminError(res: Response, err: unknown, action: string, targetId: string): boolean {
  const known: [new () => Error, number, string, string][] = [
    [OwnRoleError, 403, "CANNOT_CHANGE_OWN_ROLE", "You cannot change your own role"],
    [SelfSuspendError, 403, "CANNOT_SUSPEND_SELF", "You cannot suspend your own account"],
    [NotAllowedError, 403, "FORBIDDEN", "You do not have permission to do this"],
    [UserNotFoundError, 404, "USER_NOT_FOUND", "No such user"],
    [LastAdministratorError, 409, "LAST_ADMINISTRATOR", "This change would leave no active administrator"],
    [InvalidStatusTransitionError, 409, "INVALID_STATUS_TRANSITION", "This action is not possible for the account's current status"],
  ];
  for (const [type, status, code, message] of known) {
    if (err instanceof type) {
      warnRejected(res, action, targetId, code);
      res.status(status).json({ error: code, message });
      return true;
    }
  }
  return false;
}

// Public path: PUT /api/v1/users/{id}/role, body { role, reason? }
usersRouter.put(
  "/users/:id/role",
  authenticate,
  requireRole("ADMINISTRATOR"),
  async (req: Request, res: Response) => {
    const targetId = String(req.params.id);
    const role = req.body?.role;
    const rawReason = req.body?.reason;

    if (!ROLES.includes(role)) {
      validationError(res, "role", "Must be MEMBER or ADMINISTRATOR");
      return;
    }
    // Optional for role changes (author's decision); validated when present
    const reason = rawReason === undefined || rawReason === null ? null : parseReason(rawReason);
    if (reason === undefined) {
      validationError(res, "reason", `If given, must be 1-${REASON_MAX} characters`);
      return;
    }
    if (!UUID_RE.test(targetId)) {
      res.status(404).json({ error: "USER_NOT_FOUND", message: "No such user" });
      return;
    }

    try {
      const updated = await changeRole(currentUser(res).id, targetId, role as Role, reason);
      res.json(updated);
    } catch (err) {
      if (!sendAdminError(res, err, "ROLE_CHANGE", targetId)) throw err;
    }
  },
);

// Public paths: POST /api/v1/users/{id}/suspend and /restore, body { reason } (required)
for (const action of ["suspend", "restore"] as const) {
  usersRouter.post(
    `/users/:id/${action}`,
    authenticate,
    requireRole("ADMINISTRATOR"),
    async (req: Request, res: Response) => {
      const targetId = String(req.params.id);
      const reason = parseReason(req.body?.reason);
      if (reason === undefined) {
        validationError(res, "reason", `Required, 1-${REASON_MAX} characters`);
        return;
      }
      if (!UUID_RE.test(targetId)) {
        res.status(404).json({ error: "USER_NOT_FOUND", message: "No such user" });
        return;
      }

      try {
        const updated = await changeAccountStatus(action, currentUser(res).id, targetId, reason);
        res.json(updated);
      } catch (err) {
        if (!sendAdminError(res, err, action.toUpperCase(), targetId)) throw err;
      }
    },
  );
}
