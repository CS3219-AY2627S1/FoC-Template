/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Sonnet 5.5), date: 2026-11-08
 * Scope: Recording of login attempts (N2H1a) and the admin listing query, following the
 *        author's decisions in milestones/D3/notes/17-n2h1-decisions.md.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { isIP } from "node:net";
import { Request } from "express";
import { Pool } from "pg";
import { pool } from "./db";

export const LOGIN_OUTCOMES = ["SUCCESS", "FAILED", "BLOCKED"] as const;
export type LoginOutcome = (typeof LOGIN_OUTCOMES)[number];
export const LOGIN_REASONS = ["WRONG_PASSWORD", "NO_SUCH_ACCOUNT", "SUSPENDED", "CLOSED", "NOT_VERIFIED"] as const;
export type LoginReason = (typeof LOGIN_REASONS)[number];

export const USER_AGENT_MAX_CHARS = 500;

export interface LoginEventInput {
  accountId: string | null;
  outcome: LoginOutcome;
  reason: LoginReason | null;
  ip: string | null;
  userAgent: string | null;
}

/** An address Postgres INET will accept, or null. A bad address must never stop a login. */
export function cleanIp(raw: string | undefined | null): string | null {
  if (!raw) return null;
  // net.isIP accepts IPv6 zone ids ("fe80::1%eth0"); INET does not
  if (raw.includes("%")) return null;
  return isIP(raw) === 0 ? null : raw;
}

/** At most 500 characters; empty becomes null. Long values are cut, never rejected. */
export function cleanUserAgent(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const text = raw.replaceAll("\u0000", "");
  if (text === "") return null;
  // Array.from counts characters (not UTF-16 units), matching Postgres char_length
  const chars = Array.from(text);
  return chars.length > USER_AGENT_MAX_CHARS ? chars.slice(0, USER_AGENT_MAX_CHARS).join("") : text;
}

/** What the request says about the caller. req.ip honours Express 'trust proxy' (see index.ts). */
export function clientDetails(req: Request): { ip: string | null; userAgent: string | null } {
  return { ip: cleanIp(req.ip), userAgent: cleanUserAgent(req.get("user-agent")) };
}

export async function recordLoginEvent(event: LoginEventInput, db: Pool = pool): Promise<void> {
  await db.query(
    `INSERT INTO login_events (account_id, outcome, reason, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [event.accountId, event.outcome, event.reason, event.ip, event.userAgent],
  );
}

export interface LoginEventQuery {
  accountId?: string;
  outcome?: LoginOutcome;
  reason?: LoginReason;
  before?: string;
  limit: number;
}

/** Newest first, keyset-paged by id (same scheme as the audit viewer). Usernames are joined at read time. */
export async function listLoginEvents(q: LoginEventQuery, db: Pool = pool) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace("?", `$${params.length}`));
  };
  if (q.accountId) add("e.account_id = ?", q.accountId);
  if (q.outcome) add("e.outcome = ?", q.outcome);
  if (q.reason) add("e.reason = ?", q.reason);
  if (q.before) add("e.id < ?", q.before);
  params.push(q.limit + 1); // one extra row tells us whether there is a next page

  const result = await db.query(
    `SELECT e.id, e.occurred_at, e.account_id, u.username, e.outcome, e.reason,
            host(e.ip_address) AS ip_address, e.user_agent
     FROM login_events e
     LEFT JOIN users u ON u.id = e.account_id
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY e.id DESC
     LIMIT $${params.length}`,
    params,
  );
  const rows = result.rows.slice(0, q.limit);
  return {
    events: rows.map((r) => ({
      id: String(r.id),
      occurredAt: r.occurred_at.toISOString(),
      account: r.account_id ? { id: r.account_id, username: r.username ?? null } : null,
      outcome: r.outcome,
      reason: r.reason,
      ipAddress: r.ip_address,
      userAgent: r.user_agent,
    })),
    nextCursor: result.rows.length > q.limit ? String(rows[rows.length - 1].id) : null,
  };
}
