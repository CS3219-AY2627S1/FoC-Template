/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: In-memory sliding-window limit for N2 extraction calls that reach the LLM (spec 3.2 and 3.3).
 * Author review: Reviewed and approved by @mattis.
 */

/**
 * 3 calls per user in any 60 s, counted in this process only (a restart resets it; each replica counts on its own).
 * Only calls that reach the LLM are recorded, at the moment they are sent, whether they then succeed or fail.
 */
export class ExtractionRateLimiter {
  private readonly calls = new Map<string, number[]>();

  constructor(
    private readonly limit = 3,
    private readonly windowMs = 60_000,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  /** null when a call may go ahead now; otherwise the Retry-After in whole seconds. Records nothing. */
  check(userId: string): number | null {
    const now = this.clock();
    return this.wait(this.recent(userId, now), now);
  }

  /**
   * Checks and, when allowed, records the call, in one synchronous step: two concurrent requests can't both
   * take the last slot. Call it immediately before the LLM call.
   */
  take(userId: string): number | null {
    const now = this.clock();
    const recent = this.recent(userId, now);
    const wait = this.wait(recent, now);
    if (wait === null) this.calls.set(userId, [...recent, now]);
    return wait;
  }

  private wait(recent: number[], now: number): number | null {
    if (recent.length < this.limit) return null;
    // Whole seconds until the oldest call leaves the window, never 0
    return Math.max(1, Math.ceil((recent[0] + this.windowMs - now) / 1000));
  }

  /** The user's call times still in the window, oldest first; drops the user when none are left. */
  private recent(userId: string, now: number): number[] {
    const kept = (this.calls.get(userId) ?? []).filter((t) => t > now - this.windowMs);
    if (kept.length === 0) this.calls.delete(userId);
    else this.calls.set(userId, kept);
    return kept;
  }
}
