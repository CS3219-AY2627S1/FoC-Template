/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-09
 * Scope: Implemented the author's resilience rules: tell temporary database-connection
 *        failures apart from other errors, retry connections with capped exponential backoff
 *        for a limited total time, and log only state changes (never the database URL).
 * Author review: Reviewed and approved by @t-leongchuan
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-09
 * Scope: Log connection timeouts with wording that doesn't claim an outage (author's option e).
 * Author review of additional changes: Reviewed and approved by @t-leongchuan
 */
import { DB_RESILIENCE } from "./config";

// Temporary "can't reach the database" failures. Anything else (SQL errors, bugs, wrong
// passwords) is not retried and is not reported as 503.
const NETWORK_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "EHOSTUNREACH", "EPIPE"]);
const POSTGRES_CODES = new Set([
  "57P01", // admin_shutdown: the server is stopping
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now: the server is starting up
]);
const MESSAGES = [
  "Connection terminated",            // pg: the connection dropped mid-request
  "timeout exceeded when trying to connect", // pg pool: connectionTimeoutMillis passed
];

// No connection within poolConnectionTimeoutMs. This happens when the database is down, but
// also when this service is too busy to finish connecting in time: password hashing
// (bcryptjs) runs on Node's main thread, so a burst of logins can delay new connections
// (measured 2026-10-09, see README "Known limitations"). Logged without claiming an outage.
function isConnectionTimeout(err: Error): boolean {
  return err.message.includes("timeout exceeded when trying to connect") ||
    err.message.includes("Connection terminated due to connection timeout");
}

export function isDatabaseUnavailable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: unknown }).code;
  if (typeof code === "string") {
    if (NETWORK_CODES.has(code) || POSTGRES_CODES.has(code) || code.startsWith("08")) return true; // 08xxx: connection exceptions
  }
  return MESSAGES.some((m) => err.message.includes(m));
}

// Short reason for logs. Driver messages include host and port at most, never the password;
// the DATABASE_URL itself is never printed.
function reason(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---- State-change logging: one line when the database goes away, one when it is back ----

let available = true;

export function markDatabaseDown(err: unknown): void {
  if (available) {
    available = false;
    if (err instanceof Error && isConnectionTimeout(err)) {
      console.error(
        `No database connection within ${DB_RESILIENCE.poolConnectionTimeoutMs} ms ` +
        "(database down, or this service busy, e.g. a burst of logins); answering 503 until connections work again",
      );
    } else {
      console.error(`Database unavailable (${reason(err)}); answering 503 until it is back`);
    }
  }
}

export function markDatabaseUp(): void {
  if (!available) {
    available = true;
    console.log("Database connections working again");
  }
}

// ---- Startup retries ---------------------------------------------------------------------

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `attempt` until it succeeds. Retries only temporary connection failures, waiting
 * 0.5 s, 1 s, 2 s, 4 s, then 5 s each time, and gives up after 60 s in total (values in
 * DB_RESILIENCE). Any other error is thrown at once.
 */
export async function retryWhileDatabaseUnavailable<T>(what: string, attempt: () => Promise<T>): Promise<T> {
  const started = Date.now();
  let delay: number = DB_RESILIENCE.retryInitialDelayMs;
  for (let tries = 1; ; tries++) {
    try {
      const result = await attempt();
      if (tries > 1) {
        console.log(`${what}: database reachable after ${tries} attempts (${((Date.now() - started) / 1000).toFixed(1)} s)`);
      }
      return result;
    } catch (err) {
      if (!isDatabaseUnavailable(err)) throw err;
      const elapsed = Date.now() - started;
      if (elapsed + delay > DB_RESILIENCE.retryGiveUpAfterMs) {
        console.error(`${what}: database still unavailable after ${Math.round(elapsed / 1000)} s; giving up (${reason(err)})`);
        throw err;
      }
      console.error(`${what}: database unavailable (${reason(err)}); retry ${tries} in ${delay} ms`);
      await sleep(delay);
      delay = Math.min(delay * DB_RESILIENCE.retryMultiplier, DB_RESILIENCE.retryMaxDelayMs);
    }
  }
}
