/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: Admin accounts list and one-account lookup (N2H1 admin pages), implementing the
 *        author's decisions (search, filters, newest first with a cursor, email shown,
 *        last successful login).
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { Router, Request, Response } from "express";
import { Pool } from "pg";
import { authenticate, requireRole } from "./authenticate";
import { pool } from "./db";

export const adminAccountsRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ACCOUNT_STATUSES = ["PENDING_VERIFICATION", "ACTIVE", "SUSPENDED", "CLOSED"] as const;
export const ACCOUNT_ROLES = ["MEMBER", "ADMINISTRATOR"] as const;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const SEARCH_MAX = 100;

export interface AccountQuery {
  search?: string;
  status?: string;
  role?: string;
  before?: string; // id of the last account shown (nextCursor)
  limit: number;
}

// Columns shared by the list and the one-account lookup. The last successful login comes from
// login_events, so it only reaches back as far as those rows are kept (90 days).
const ACCOUNT_SELECT = `
  SELECT u.id, u.username, u.display_name, u.email, u.role, u.status, u.created_at,
         last_login.occurred_at AS last_login_at
  FROM users u
  LEFT JOIN LATERAL (
    SELECT e.occurred_at FROM login_events e
    WHERE e.account_id = u.id AND e.outcome = 'SUCCESS'
    ORDER BY e.id DESC LIMIT 1
  ) last_login ON true`;

function toAccount(r: Record<string, any>) {
  return {
    id: r.id as string,
    username: r.username as string,
    displayName: r.display_name as string,
    email: r.email as string,
    role: r.role as string,
    status: r.status as string,
    createdAt: (r.created_at as Date).toISOString(),
    lastLoginAt: r.last_login_at ? (r.last_login_at as Date).toISOString() : null,
  };
}

// "50%_off" must match literally, so LIKE's wildcards and its escape character are escaped
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Newest accounts first; keyset-paged by (created_at, id), the cursor being the last id shown. */
export async function listAccounts(q: AccountQuery, db: Pool = pool) {
  const where: string[] = [];
  const params: unknown[] = [];
  const next = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  if (q.search) {
    const p = next(likePattern(q.search));
    where.push(`(u.username ILIKE ${p} ESCAPE '\\' OR u.email ILIKE ${p} ESCAPE '\\' OR u.display_name ILIKE ${p} ESCAPE '\\')`);
  }
  if (q.status) where.push(`u.status = ${next(q.status)}`);
  if (q.role) where.push(`u.role = ${next(q.role)}`);
  if (q.before) {
    where.push(`(u.created_at, u.id) < (SELECT c.created_at, c.id FROM users c WHERE c.id = ${next(q.before)})`);
  }
  const limit = next(q.limit + 1); // one extra row tells us whether there is a next page

  const result = await db.query(
    `${ACCOUNT_SELECT}
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY u.created_at DESC, u.id DESC
     LIMIT ${limit}`,
    params,
  );
  const rows = result.rows.slice(0, q.limit);
  return {
    accounts: rows.map(toAccount),
    nextCursor: result.rows.length > q.limit ? (rows[rows.length - 1].id as string) : null,
  };
}

export async function getAccount(id: string, db: Pool = pool) {
  const result = await db.query(`${ACCOUNT_SELECT} WHERE u.id = $1`, [id]);
  return result.rows[0] ? toAccount(result.rows[0]) : null;
}

// Public path: GET /api/v1/admin/accounts?search&status&role&before&limit
adminAccountsRouter.get("/admin/accounts", authenticate, requireRole("ADMINISTRATOR"), async (req: Request, res: Response) => {
  const q = req.query;
  const details: Record<string, string> = {};
  const text = (v: unknown) => (typeof v === "string" && v !== "" ? v : undefined);

  const search = text(q.search)?.trim() || undefined;
  const status = text(q.status);
  const role = text(q.role);
  const before = text(q.before);
  const limitRaw = text(q.limit);

  if (search && search.length > SEARCH_MAX) details.search = `Must be at most ${SEARCH_MAX} characters`;
  if (status && !(ACCOUNT_STATUSES as readonly string[]).includes(status)) details.status = `Must be one of ${ACCOUNT_STATUSES.join(", ")}`;
  if (role && !(ACCOUNT_ROLES as readonly string[]).includes(role)) details.role = `Must be one of ${ACCOUNT_ROLES.join(", ")}`;
  if (before && !UUID_RE.test(before)) details.before = "Must be an account id (nextCursor)";
  const limit = limitRaw === undefined ? DEFAULT_LIMIT : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) details.limit = `Must be 1-${MAX_LIMIT}`;

  if (Object.keys(details).length > 0) {
    res.status(400).json({ error: "VALIDATION_FAILED", message: "Some fields are invalid", details });
    return;
  }
  res.json(await listAccounts({ search, status, role, before, limit }));
});

// Public path: GET /api/v1/admin/accounts/{id}
adminAccountsRouter.get("/admin/accounts/:id", authenticate, requireRole("ADMINISTRATOR"), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const account = UUID_RE.test(id) ? await getAccount(id) : null;
  if (!account) {
    res.status(404).json({ error: "USER_NOT_FOUND", message: "No such user" });
    return;
  }
  res.json(account);
});
