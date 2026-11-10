/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
 * Scope: Refactored GET /auth/verify to reuse the authenticate middleware (same responses).
 *        This disclosure covers only that change.
 * Author review: Reviewed and approved by @t-leongchuan
 * Additional AI assistance: Claude Code (Claude Sonnet 5.5), date: 2026-11-08
 * Scope: POST /auth/login records every attempt in login_events (N2H1a), following the author's
 *        decisions. This disclosure covers only that change.
 * Author review of additional changes: Reviewed and approved by @t-leongchuan
 */
import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { pool } from "./db";
import { signAccessToken, ACCESS_TOKEN_TTL_SECONDS } from "./token";
import { createAccount, ValidationError, ConflictError, BCRYPT_COST } from "./accounts";
import { authenticate, currentUser } from "./authenticate";
import { clientDetails, LoginEventInput, recordLoginEvent } from "./loginEvents";

export const authRouter = Router();

authRouter.post("/register", async (req: Request, res: Response) => {
  const body = req.body ?? {};
  try {
    // Role is fixed by the server and never read from the request (US-F4.1.1)
    const account = await createAccount({
      username: body.username,
      email: body.email,
      password: body.password,
      role: "MEMBER",
    });
    res.status(201).json(account);
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: "VALIDATION_FAILED", message: "Some fields are invalid", details: err.details });
      return;
    }
    if (err instanceof ConflictError) {
      res.status(409).json({
        error: err.code,
        message: err.code === "EMAIL_TAKEN" ? "Email is already registered" : "Username is taken",
      });
      return;
    }
    throw err;
  }
});

// Hash of a throwaway string. Unknown usernames are still compared against it, so a
// "no such user" response takes as long as a "wrong password" one.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password-just-for-timing", BCRYPT_COST);

authRouter.post("/login", async (req: Request, res: Response) => {
  const { identifier, password } = req.body ?? {};
  if (typeof identifier !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "VALIDATION_FAILED", message: "identifier and password are required" });
    return;
  }

  // Usernames cannot contain '@', so an identifier can never match one account's
  // username and another account's email at the same time
  const result = await pool.query(
    `SELECT id, password_hash, status FROM users
     WHERE lower(username) = lower($1) OR email = lower($1)`,
    [identifier],
  );
  const user = result.rows[0];

  const passwordOk = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);

  // Every attempt is recorded (never the text typed in identifier or password).
  const client = clientDetails(req);
  const event = (outcome: LoginEventInput["outcome"], reason: LoginEventInput["reason"]): LoginEventInput =>
    ({ accountId: user?.id ?? null, outcome, reason, ...client });

  // Failed and blocked attempts: the user is turned away either way, so a failure to save the
  // record is only reported to the developers.
  const recordRejected = async (rejected: LoginEventInput) => {
    try {
      await recordLoginEvent(rejected);
    } catch (err) {
      console.error("Could not record login event:", err instanceof Error ? err.message : err);
    }
  };

  // US-F3.1.1: one generic answer for unknown user, wrong password or closed account
  if (!user || !passwordOk || user.status === "CLOSED") {
    await recordRejected(
      !user ? event("FAILED", "NO_SUCH_ACCOUNT")
        : !passwordOk ? event("FAILED", "WRONG_PASSWORD")
        : event("BLOCKED", "CLOSED"),
    );
    res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Invalid username/email or password" });
    return;
  }

  // US-F3.1.2: status is revealed only after the password was correct
  if (user.status === "PENDING_VERIFICATION" || user.status === "SUSPENDED") {
    await recordRejected(event("BLOCKED", user.status === "SUSPENDED" ? "SUSPENDED" : "NOT_VERIFIED"));
    res.status(403).json({
      error: `ACCOUNT_${user.status}`,
      message: user.status === "SUSPENDED"
        ? "This account is suspended"
        : "Please verify your email before logging in",
    });
    return;
  }

  // Successful login: nobody gets in without a record. If the record cannot be saved, refuse.
  try {
    await recordLoginEvent(event("SUCCESS", null));
  } catch (err) {
    console.error("Could not record login event; refusing the login:", err instanceof Error ? err.message : err);
    res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "Service temporarily unavailable, please try again" });
    return;
  }

  res.json({
    accessToken: signAccessToken(user.id),
    tokenType: "Bearer",
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
});

// Called by other services, forwarding the frontend's Authorization header unchanged.
// Not exposed to browsers by the gateway.
authRouter.get("/verify", authenticate, (req: Request, res: Response) => {
  const user = currentUser(res);
  res.json({ id: user.id, role: user.role });
});
