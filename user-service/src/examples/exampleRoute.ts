/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-10
 * Scope: Template for teammates adding an endpoint, following the User Service author's
 *        existing conventions. Not mounted; nothing here is reachable.
 * Author review: Reviewed and approved by @t-leongchuan
 *
 * When you copy this file, replace this header with your own (your tool, date and scope,
 * and add your entry to ai/usage-log.md). Don't keep the author's name on your work.
 */

/*
 * HOW TO ADD AN ENDPOINT (read "Rules for changing this service" in ../../README.md first)
 *
 * 1. Copy this file to src/<yourFeature>.ts and rename the router.
 * 2. Mount it in src/index.ts next to the other routers:   app.use(yourRouter);
 * 3. If browsers should reach it, add the public /api/v1/... path to BOTH gateways:
 *      frontend/nginx.conf      (production gateway)
 *      frontend/vite.config.ts  (development proxy)
 *    Leave it out of both if only other services call it (like GET /auth/verify).
 * 4. Need a new table or column? Add a NEW numbered migration in migrations/ (never edit an
 *    old one) and GRANT user_app only what the code needs.
 * 5. Add a row to the Endpoints table (and any new error codes) in README.md.
 * 6. Open a PR; the User Service owner reviews anything under user-service/.
 */
import { Router, Request, Response } from "express";
import { pool } from "../db";
import { authenticate, currentUser, requireRole } from "../authenticate";

export const exampleRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---- Example 1: a read endpoint for any logged-in user ------------------------------
// GET /examples/:id   (public path would be /api/v1/examples/{id})
exampleRouter.get("/examples/:id", authenticate, async (req: Request, res: Response) => {
  // Validate input first. Errors always look like { error, message, details? }.
  const id = String(req.params.id);
  if (!UUID_RE.test(id)) {
    res.status(404).json({ error: "USER_NOT_FOUND", message: "No such user" });
    return;
  }

  // The caller, as loaded by authenticate (re-read from the database on every request).
  const caller = currentUser(res);

  // Parameterised queries only ($1, $2 ...), never string concatenation.
  // Don't catch database errors here: let them reach the error handler in index.ts, which
  // turns "database unavailable" into 503 SERVICE_UNAVAILABLE (never 401, which would log
  // users out) and anything else into 500.
  const result = await pool.query("SELECT id, username, display_name FROM users WHERE id = $1", [id]);
  const row = result.rows[0];
  if (!row) {
    res.status(404).json({ error: "USER_NOT_FOUND", message: "No such user" });
    return;
  }

  // Return only what callers need. Never return email addresses (US-F7.1.4),
  // password hashes or anything secret.
  res.json({ id: row.id, username: row.username, displayName: row.display_name, requestedBy: caller.id });
});

// ---- Example 2: an admin-only endpoint with body validation --------------------------
// POST /examples/:id/note   body { text }
exampleRouter.post("/examples/:id/note", authenticate, requireRole("ADMINISTRATOR"), async (req: Request, res: Response) => {
  const raw = req.body?.text;
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text.length < 1 || text.length > 500) {
    res.status(400).json({
      error: "VALIDATION_FAILED",
      message: "Some fields are invalid",
      details: { text: "Must be 1-500 characters" },
    });
    return;
  }

  // Anything that changes roles or account status must go through runAdminAction() in
  // roles.ts (one shared lock, the acting admin re-checked, an audit entry in the same
  // transaction via appendAudit()). Don't update users.role or users.status directly.

  res.status(501).json({ error: "NOT_IMPLEMENTED", message: "Example only" });
});
