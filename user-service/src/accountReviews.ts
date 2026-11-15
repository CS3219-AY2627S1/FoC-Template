/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: Account reviews (N2H1b) implementing the author's decisions: open (reason required,
 *        one open review per account), decide (outcome by the status at opening, reasoning
 *        reused as the suspend/restore reason, refused if the status changed, evidence
 *        snapshot of login and audit counts), cancel, list and read; each writes an audit entry.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { Router, Request, Response } from "express";
import { Pool, PoolClient } from "pg";
import { applyStatusChange } from "./accountStatus";
import { AppendedEntry, appendAudit } from "./audit";
import { authenticate, currentUser, requireRole } from "./authenticate";
import { pool } from "./db";
import { InvalidStatusTransitionError, NotAllowedError, runAdminAction, UserNotFoundError } from "./roles";

export const accountReviewsRouter = Router();

export const REVIEW_STATUSES = ["OPEN", "DECIDED", "CANCELLED"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export type ReviewOutcome = "REINSTATE" | "KEEP_SUSPENDED" | "SUSPEND" | "NO_ACTION";
// Author's decision: the outcomes depend on the account's status when the review was opened
export const OUTCOMES_BY_STATUS: Record<"ACTIVE" | "SUSPENDED", readonly ReviewOutcome[]> = {
  SUSPENDED: ["REINSTATE", "KEEP_SUSPENDED"],
  ACTIVE: ["SUSPEND", "NO_ACTION"],
};
const TEXT_MAX = 500; // fits the suspend/restore reason, which the reasoning is reused as
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_RE = /^[1-9][0-9]{0,18}$/;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export class CannotReviewSelfError extends Error {}   // -> 403
export class ReviewNotFoundError extends Error {}     // -> 404
export class ReviewNotOpenError extends Error {}      // -> 409
export class AccountStatusChangedError extends Error {} // -> 409
export class ReviewAlreadyOpenError extends Error {   // -> 409
  constructor(readonly reviewId: string) { super(); }
}
export class InvalidOutcomeError extends Error {      // -> 400
  constructor(readonly allowed: readonly ReviewOutcome[]) { super(); }
}

/**
 * The numbers the User Service can count itself (author's decision B6): failed and blocked
 * logins and audit entries for this account. Saved with the decision, so they survive after
 * the login rows are deleted at 90 days.
 */
export async function evidenceSnapshot(db: Pool | PoolClient, accountId: string) {
  const logins = await db.query(
    `SELECT
       count(*) FILTER (WHERE outcome = 'FAILED'  AND occurred_at > now() - interval '7 days')  AS failed_7,
       count(*) FILTER (WHERE outcome = 'BLOCKED' AND occurred_at > now() - interval '7 days')  AS blocked_7,
       count(*) FILTER (WHERE outcome = 'FAILED')  AS failed_90,
       count(*) FILTER (WHERE outcome = 'BLOCKED') AS blocked_90
     FROM login_events WHERE account_id = $1 AND occurred_at > now() - interval '90 days'`,
    [accountId],
  );
  const audit = await db.query(
    "SELECT count(*) AS n FROM audit_log WHERE target_id = $1 AND occurred_at > now() - interval '90 days'",
    [accountId],
  );
  const l = logins.rows[0];
  return {
    capturedAt: new Date().toISOString(),
    failedLoginsLast7Days: Number(l.failed_7),
    blockedLoginsLast7Days: Number(l.blocked_7),
    failedLoginsLast90Days: Number(l.failed_90),
    blockedLoginsLast90Days: Number(l.blocked_90),
    auditEntriesLast90Days: Number(audit.rows[0].n),
  };
}

const REVIEW_SELECT = `
  SELECT r.*, acc.username AS account_username, acc.display_name AS account_display_name, acc.status AS account_status,
         opener.username AS opened_by_username, closer.username AS closed_by_username
  FROM account_reviews r
  JOIN users acc ON acc.id = r.account_id
  JOIN users opener ON opener.id = r.opened_by
  LEFT JOIN users closer ON closer.id = r.closed_by`;

function toReview(r: Record<string, any>) {
  return {
    id: String(r.id),
    account: { id: r.account_id, username: r.account_username, displayName: r.account_display_name, status: r.account_status },
    status: r.status as ReviewStatus,
    statusAtOpen: r.status_at_open as "ACTIVE" | "SUSPENDED",
    allowedOutcomes: OUTCOMES_BY_STATUS[r.status_at_open as "ACTIVE" | "SUSPENDED"],
    openedBy: { id: r.opened_by, username: r.opened_by_username },
    openedAt: (r.opened_at as Date).toISOString(),
    openReason: r.open_reason as string,
    closedBy: r.closed_by ? { id: r.closed_by, username: r.closed_by_username } : null,
    closedAt: r.closed_at ? (r.closed_at as Date).toISOString() : null,
    outcome: (r.outcome ?? null) as ReviewOutcome | null,
    reasoning: (r.reasoning ?? null) as string | null,
    evidence: r.evidence ?? null,
  };
}

async function readReview(db: Pool | PoolClient, id: string) {
  const result = await db.query(`${REVIEW_SELECT} WHERE r.id = $1`, [id]);
  return result.rows[0] ? toReview(result.rows[0]) : null;
}

export async function openReview(actorId: string, accountId: string, reason: string) {
  if (actorId === accountId) throw new CannotReviewSelfError();
  let id = "";
  await runAdminAction(actorId, accountId, async (client, t) => {
    if (t.status !== "ACTIVE" && t.status !== "SUSPENDED") throw new InvalidStatusTransitionError();
    const open = await client.query("SELECT id FROM account_reviews WHERE account_id = $1 AND status = 'OPEN'", [accountId]);
    if (open.rows[0]) throw new ReviewAlreadyOpenError(String(open.rows[0].id));
    const inserted = await client.query(
      `INSERT INTO account_reviews (account_id, status_at_open, opened_by, open_reason)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [accountId, t.status, actorId, reason],
    );
    id = String(inserted.rows[0].id);
    const appended = await appendAudit(client, {
      actorType: "USER", actorId, action: "REVIEW_OPENED", targetId: accountId,
      previousValue: "NONE", newValue: `OPEN #${id}`, reason,
    });
    return { result: undefined, appended };
  });
  return (await readReview(pool, id))!;
}

// Loads the review's account first: runAdminAction locks and re-reads it in the transaction
async function reviewAccount(reviewId: string): Promise<string> {
  const result = await pool.query("SELECT account_id FROM account_reviews WHERE id = $1", [reviewId]);
  if (!result.rows[0]) throw new ReviewNotFoundError();
  return result.rows[0].account_id;
}

export async function decideReview(actorId: string, reviewId: string, outcome: string, reasoning: string) {
  const accountId = await reviewAccount(reviewId);
  if (actorId === accountId) throw new CannotReviewSelfError();
  await runAdminAction(actorId, accountId, async (client, t) => {
    const review = (await client.query("SELECT * FROM account_reviews WHERE id = $1 FOR UPDATE", [reviewId])).rows[0];
    if (review.status !== "OPEN") throw new ReviewNotOpenError();
    const allowed = OUTCOMES_BY_STATUS[review.status_at_open as "ACTIVE" | "SUSPENDED"];
    if (!allowed.includes(outcome as ReviewOutcome)) throw new InvalidOutcomeError(allowed);
    // Author's decision B5ii: someone changed the account meanwhile -> the admin looks again
    if (t.status !== review.status_at_open) throw new AccountStatusChangedError();

    const evidence = await evidenceSnapshot(client, accountId);
    let appended: AppendedEntry | undefined;
    // Author's decision B5i: the reasoning is the suspend/restore reason
    if (outcome === "SUSPEND") appended = await applyStatusChange(client, t, "suspend", actorId, reasoning);
    if (outcome === "REINSTATE") appended = await applyStatusChange(client, t, "restore", actorId, reasoning);
    await client.query(
      `UPDATE account_reviews SET status = 'DECIDED', closed_by = $2, closed_at = now(),
         outcome = $3, reasoning = $4, evidence = $5 WHERE id = $1`,
      [reviewId, actorId, outcome, reasoning, JSON.stringify(evidence)],
    );
    appended = await appendAudit(client, {
      actorType: "USER", actorId, action: "REVIEW_DECIDED", targetId: accountId,
      previousValue: `OPEN #${reviewId}`, newValue: `DECIDED #${reviewId}: ${outcome}`, reason: reasoning,
    });
    return { result: undefined, appended };
  });
  return (await readReview(pool, reviewId))!;
}

export async function cancelReview(actorId: string, reviewId: string, reason: string) {
  const accountId = await reviewAccount(reviewId);
  if (actorId === accountId) throw new CannotReviewSelfError();
  await runAdminAction(actorId, accountId, async (client) => {
    const review = (await client.query("SELECT status FROM account_reviews WHERE id = $1 FOR UPDATE", [reviewId])).rows[0];
    if (review.status !== "OPEN") throw new ReviewNotOpenError();
    await client.query(
      "UPDATE account_reviews SET status = 'CANCELLED', closed_by = $2, closed_at = now(), reasoning = $3 WHERE id = $1",
      [reviewId, actorId, reason],
    );
    const appended = await appendAudit(client, {
      actorType: "USER", actorId, action: "REVIEW_CANCELLED", targetId: accountId,
      previousValue: `OPEN #${reviewId}`, newValue: `CANCELLED #${reviewId}`, reason,
    });
    return { result: undefined, appended };
  });
  return (await readReview(pool, reviewId))!;
}

export interface ReviewQuery { accountId?: string; status?: ReviewStatus; before?: string; limit: number }

/** Newest first, keyset-paged by id, like the login and audit lists */
export async function listReviews(q: ReviewQuery, db: Pool = pool) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => { params.push(value); where.push(sql.replace("?", `$${params.length}`)); };
  if (q.accountId) add("r.account_id = ?", q.accountId);
  if (q.status) add("r.status = ?", q.status);
  if (q.before) add("r.id < ?", q.before);
  params.push(q.limit + 1);
  const result = await db.query(
    `${REVIEW_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY r.id DESC LIMIT $${params.length}`,
    params,
  );
  const rows = result.rows.slice(0, q.limit);
  return {
    reviews: rows.map(toReview),
    nextCursor: result.rows.length > q.limit ? String(rows[rows.length - 1].id) : null,
  };
}

// ---- HTTP --------------------------------------------------------------------------------

function parseText(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const text = raw.trim();
  return text.length >= 1 && text.length <= TEXT_MAX ? text : undefined;
}

function sendReviewError(res: Response, err: unknown): boolean {
  const simple: [new (...a: any[]) => Error, number, string, string][] = [
    [CannotReviewSelfError, 403, "CANNOT_REVIEW_SELF", "You cannot review your own account"],
    [NotAllowedError, 403, "FORBIDDEN", "You do not have permission to do this"],
    [UserNotFoundError, 404, "USER_NOT_FOUND", "No such user"],
    [ReviewNotFoundError, 404, "REVIEW_NOT_FOUND", "No such review"],
    [ReviewNotOpenError, 409, "REVIEW_NOT_OPEN", "This review is already closed"],
    [AccountStatusChangedError, 409, "ACCOUNT_STATUS_CHANGED", "The account's status changed after this review was opened. Look at it again before deciding."],
    [InvalidStatusTransitionError, 409, "INVALID_STATUS_TRANSITION", "Only active or suspended accounts can be reviewed"],
  ];
  if (err instanceof ReviewAlreadyOpenError) {
    res.status(409).json({ error: "REVIEW_ALREADY_OPEN", message: "This account already has an open review", reviewId: err.reviewId });
    return true;
  }
  if (err instanceof InvalidOutcomeError) {
    res.status(400).json({ error: "VALIDATION_FAILED", message: "Some fields are invalid", details: { outcome: `Must be one of ${err.allowed.join(", ")}` } });
    return true;
  }
  for (const [type, status, code, message] of simple) {
    if (err instanceof type) { res.status(status).json({ error: code, message }); return true; }
  }
  return false;
}

const invalid = (res: Response, details: Record<string, string>) =>
  res.status(400).json({ error: "VALIDATION_FAILED", message: "Some fields are invalid", details });

// Public path: POST /api/v1/admin/reviews { accountId, reason }
accountReviewsRouter.post("/admin/reviews", authenticate, requireRole("ADMINISTRATOR"), async (req: Request, res: Response) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const details: Record<string, string> = {};
  const accountId = typeof body.accountId === "string" ? body.accountId : "";
  const reason = parseText(body.reason);
  if (!UUID_RE.test(accountId)) details.accountId = "Must be a user id";
  if (reason === undefined) details.reason = `Required, 1-${TEXT_MAX} characters`;
  if (Object.keys(details).length > 0) { invalid(res, details); return; }
  try {
    res.status(201).json(await openReview(currentUser(res).id, accountId, reason!));
  } catch (err) {
    if (!sendReviewError(res, err)) throw err;
  }
});

// Public path: GET /api/v1/admin/reviews?accountId&status&before&limit
accountReviewsRouter.get("/admin/reviews", authenticate, requireRole("ADMINISTRATOR"), async (req: Request, res: Response) => {
  const q = req.query;
  const text = (v: unknown) => (typeof v === "string" && v !== "" ? v : undefined);
  const details: Record<string, string> = {};
  const accountId = text(q.accountId);
  const status = text(q.status);
  const before = text(q.before);
  const limitRaw = text(q.limit);
  if (accountId && !UUID_RE.test(accountId)) details.accountId = "Must be a user id";
  if (status && !(REVIEW_STATUSES as readonly string[]).includes(status)) details.status = `Must be one of ${REVIEW_STATUSES.join(", ")}`;
  if (before && !ID_RE.test(before)) details.before = "Must be a review id (nextCursor)";
  const limit = limitRaw === undefined ? DEFAULT_LIMIT : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) details.limit = `Must be 1-${MAX_LIMIT}`;
  if (Object.keys(details).length > 0) { invalid(res, details); return; }
  res.json(await listReviews({ accountId, status: status as ReviewStatus | undefined, before, limit }));
});

// Public path: GET /api/v1/admin/reviews/{id}; an open review also gets the numbers as they are now
accountReviewsRouter.get("/admin/reviews/:id", authenticate, requireRole("ADMINISTRATOR"), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const review = ID_RE.test(id) ? await readReview(pool, id) : null;
  if (!review) { res.status(404).json({ error: "REVIEW_NOT_FOUND", message: "No such review" }); return; }
  res.json({ ...review, currentEvidence: review.status === "OPEN" ? await evidenceSnapshot(pool, review.account.id) : null });
});

// Public path: POST /api/v1/admin/reviews/{id}/decision { outcome, reasoning }
accountReviewsRouter.post("/admin/reviews/:id/decision", authenticate, requireRole("ADMINISTRATOR"), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  if (!ID_RE.test(id)) { res.status(404).json({ error: "REVIEW_NOT_FOUND", message: "No such review" }); return; }
  const reasoning = parseText(body.reasoning);
  const details: Record<string, string> = {};
  if (typeof body.outcome !== "string") details.outcome = "Required";
  if (reasoning === undefined) details.reasoning = `Required, 1-${TEXT_MAX} characters`;
  if (Object.keys(details).length > 0) { invalid(res, details); return; }
  try {
    res.json(await decideReview(currentUser(res).id, id, body.outcome, reasoning!));
  } catch (err) {
    if (!sendReviewError(res, err)) throw err;
  }
});

// Public path: POST /api/v1/admin/reviews/{id}/cancel { reason }
accountReviewsRouter.post("/admin/reviews/:id/cancel", authenticate, requireRole("ADMINISTRATOR"), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  if (!ID_RE.test(id)) { res.status(404).json({ error: "REVIEW_NOT_FOUND", message: "No such review" }); return; }
  const reason = parseText(body.reason);
  if (reason === undefined) { invalid(res, { reason: `Required, 1-${TEXT_MAX} characters` }); return; }
  try {
    res.json(await cancelReview(currentUser(res).id, id, reason));
  } catch (err) {
    if (!sendReviewError(res, err)) throw err;
  }
});
