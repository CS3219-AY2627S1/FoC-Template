// Additional AI assistance: Codex (GPT-6), 2026-10-18. Scope: account-status publishing and verification. Author review: Reviewed and approved by @phuc.
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
 * Scope: Mounted the profile router (/whoami) and users router (/users/:id/role).
 *        This disclosure covers only those lines.
 * Author review: Reviewed and approved by @t-leongchuan
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-09
 * Scope: Removed the startup schema creation (now done by the separate migration step,
 *        src/migrate.ts) and read PORT/CORS_ORIGINS through config.ts.
 * Author review of additional changes: Reviewed and approved by @t-leongchuan
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-09
 * Scope: The author's resilience decisions: /health as a readiness check (like Supplier),
 *        503 SERVICE_UNAVAILABLE while the database is unreachable, startup retries before
 *        listening, and graceful shutdown on SIGTERM.
 * Author review of additional changes: Reviewed and approved by @t-leongchuan
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-10
 * Scope: Mounted the admin audit routes; refuse to start without a valid AUDIT_HMAC_KEY.
 * Author review of additional changes: Reviewed and approved by @t-leongchuan
 * Additional AI assistance: Claude Code (Claude Sonnet 5.5), date: 2026-11-08
 * Scope: Mounted the admin login-events router and started/stopped the daily 90-day cleanup (N2H1a).
 * Author review of additional changes: Reviewed and approved by @t-leongchuan
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: Mounted the admin accounts router (N2H1 admin pages).
 * Author review of additional changes: Reviewed and approved by @t-leongchuan
 */
import { authRouter } from "./auth";
import { profileRouter } from "./profile";
import { usersRouter } from "./users";
import { bootstrapFirstAdmin } from "./bootstrap";
import cors from "cors";
import express, { Request, Response, NextFunction } from "express";
import { loadAppConfig, loadAuditKey, DB_RESILIENCE } from "./config";
import { adminAuditRouter } from "./adminAudit";
import { pool } from "./db";
import { adminLoginEventsRouter } from "./adminLoginEvents";
import { adminAccountsRouter } from "./adminAccounts";
import { startLoginEventsCleanup } from "./loginEventsRetention";
import { createProducer } from "./kafka";
import { startOutboxPublisher } from "./publisher";
import {
  isDatabaseUnavailable,
  markDatabaseDown,
  markDatabaseUp,
  retryWhileDatabaseUnavailable,
} from "./dbAvailability";

const app = express();
const config = loadAppConfig();

// Browsers may only call this service from these origins. Server-to-server calls
// (e.g. Supplier -> /auth/verify) are unaffected: CORS is enforced by browsers only.
app.use(cors({ origin: config.corsOrigins }));


app.use(express.json());

// Readiness, matching Supplier: 200 only if the database answers within 1 s, else 503.
// Used by the Compose healthcheck; not exposed by the gateway.
app.get("/health", async (req: Request, res: Response) => {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("readiness check timed out")), DB_RESILIENCE.readinessTimeoutMs);
  });
  try {
    await Promise.race([pool.query("SELECT 1"), timeout]);
    markDatabaseUp();
    res.json({ status: "ok" });
  } catch (err) {
    markDatabaseDown(err);
    res.status(503).json({ status: "not_ready" });
  } finally {
    clearTimeout(timer);
  }
});

app.use("/auth", authRouter);
app.use(profileRouter);
app.use(usersRouter);
app.use(adminAuditRouter);
app.use(adminLoginEventsRouter);
app.use(adminAccountsRouter);

app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  // Expected: the database is temporarily unreachable. Tell callers to try again later.
  // Never 401 here: Supplier and the frontend treat 401 as "logged out".
  if (isDatabaseUnavailable(err)) {
    markDatabaseDown(err); // logs once per outage, not once per request
    res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "Service temporarily unavailable, please try again" });
    return;
  }
  console.error("Unhandled error:", err instanceof Error ? err.message : err);
  res.status(500).json({ error: "INTERNAL_ERROR", message: "Something went wrong" });
});

const PORT = config.port;

// The schema is created and changed by the migration step (src/migrate.ts), which
// runs to completion before this service starts.
//
// Startup waits for the database (retrying up to 60 s, see DB_RESILIENCE) before listening.
// If it gives up, the process exits and Compose's `restart: unless-stopped` starts it again,
// so in practice it retries forever. NOTE for deployment: revisit this "forever" before
// running outside local Compose (cloud, Kubernetes), e.g. alerting on repeated restarts.
async function main(): Promise<void> {
  // Refuse to start rather than write audit entries that can never be verified
  loadAuditKey();
  await retryWhileDatabaseUnavailable("Startup", () => pool.query("SELECT 1"));
  await retryWhileDatabaseUnavailable("First-admin bootstrap", bootstrapFirstAdmin);
  // Connect/retry in the background; Kafka outages must not block HTTP readiness.
  const publisher = startOutboxPublisher(pool, createProducer());
  // 90-day retention of login events: once now, then daily
  const loginEventsCleanup = startLoginEventsCleanup(pool);
  const server = app.listen(PORT, () => console.log(`user-service listening on ${PORT}`));

  // Graceful shutdown (docker compose stop sends SIGTERM, then force-kills after 10 s):
  // stop accepting connections, let in-flight requests finish, close the pool, exit.
  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`${signal} received: finishing in-flight requests, then exiting`);
    setTimeout(() => {
      console.error(`Shutdown took longer than ${DB_RESILIENCE.shutdownTimeoutMs / 1000} s; exiting anyway`);
      process.exit(1);
    }, DB_RESILIENCE.shutdownTimeoutMs).unref();
    server.close(async () => {
      try {
        await publisher.stop();
        await loginEventsCleanup.stop();
        await pool.end();
        console.log("Shutdown complete");
        process.exit(0);
      } catch (err) {
        console.error("Shutdown failed:", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });
    server.closeIdleConnections(); // idle keep-alive connections would otherwise hold close() open
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("Startup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
