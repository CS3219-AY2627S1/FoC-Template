/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Copied from credit-service/src/dbAvailability.ts (branch_credit), itself adapted from
 *        user-service/src/dbAvailability.ts, unchanged.
 * Author review: Reviewed and approved by @mattis.
 */
import { DB_RESILIENCE } from "./config";

// Temporary "can't reach the database" failures. Anything else (SQL errors, bugs, wrong
// passwords) is not retried.
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
    console.error(`Database unavailable (${reason(err)})`);
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
