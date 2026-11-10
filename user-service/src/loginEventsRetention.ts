/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Sonnet 5.5), date: 2026-11-08
 * Scope: The author's 90-day cleanup of login events: a timer inside the service that runs once
 *        at startup and then once a day, calling the stored function from migration 0004.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { Pool } from "pg";

export const LOGIN_EVENTS_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Runs the cleanup now, then every interval. Errors are logged, never thrown (the next run retries). */
export function startLoginEventsCleanup(db: Pool, intervalMs = LOGIN_EVENTS_CLEANUP_INTERVAL_MS) {
  let running: Promise<void> | undefined;

  const runOnce = (): Promise<void> => {
    // Several copies of the service may run this at the same time; deleting is idempotent
    running = db.query("SELECT purge_old_login_events() AS removed")
      .then((result) => {
        const removed = Number(result.rows[0].removed);
        if (removed > 0) console.log(`Login-events cleanup: removed ${removed} rows older than 90 days`);
      })
      .catch((err) => console.error("Login-events cleanup failed:", err instanceof Error ? err.message : err))
      .finally(() => { running = undefined; });
    return running;
  };

  void runOnce();
  const timer = setInterval(() => { if (!running) void runOnce(); }, intervalMs);
  timer.unref();

  return {
    runOnce,
    /** Stops the timer and waits for a cleanup in progress, so the pool can be closed safely. */
    async stop() {
      clearInterval(timer);
      await running;
    },
  };
}
