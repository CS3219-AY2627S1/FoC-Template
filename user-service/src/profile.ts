/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
 * Scope: Implemented GET /whoami and PATCH /whoami as specified by the author
 *        (view own profile; change own displayName only, other fields ignored).
 * Author review: Reviewed and approved by @t-leongchuan
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: /whoami also returns the caller's email and account creation date (author's
 *        decision for the profile page).
 * Author review of additional changes: Reviewed and approved by @t-leongchuan
 */
import { Router, Request, Response } from "express";
import { pool } from "./db";
import { authenticate, currentUser } from "./authenticate";

export const profileRouter = Router();

const DISPLAY_NAME_MAX = 50; // US-F7.1.2

// The caller's own profile (US-F7.1).
// Own profile fields; email and creation date are read here, not on every request in authenticate
async function ownProfile(id: string) {
  const result = await pool.query("SELECT username, display_name, role, email, created_at FROM users WHERE id = $1", [id]);
  const u = result.rows[0];
  return { username: u.username, displayName: u.display_name, role: u.role, email: u.email, createdAt: (u.created_at as Date).toISOString() };
}

// The caller's own profile (US-F7.1).
profileRouter.get("/whoami", authenticate, async (req: Request, res: Response) => {
  res.json(await ownProfile(currentUser(res).id));
});

// Only displayName can be changed; other fields are never read, and a body without
// displayName is a no-op. The account is always the caller's own (US-F7.1.1).
profileRouter.patch("/whoami", authenticate, async (req: Request, res: Response) => {
  const user = currentUser(res);
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};

  if (!("displayName" in body)) {
    res.json(await ownProfile(user.id));
    return;
  }

  const raw = body.displayName;
  const displayName = typeof raw === "string" ? raw.trim() : undefined;
  if (displayName === undefined || displayName.length < 1 || displayName.length > DISPLAY_NAME_MAX) {
    res.status(400).json({
      error: "VALIDATION_FAILED",
      message: "Some fields are invalid",
      details: { displayName: `Must be 1-${DISPLAY_NAME_MAX} characters` },
    });
    return;
  }

  await pool.query("UPDATE users SET display_name = $1, updated_at = now() WHERE id = $2", [displayName, user.id]);
  res.json(await ownProfile(user.id));
});
