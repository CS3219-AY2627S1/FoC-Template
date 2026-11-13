// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-11-03
// Scope: Implemented the initial author-defined rate-limit behavior.
// Author review: Reviewed outputs, corrected phrasing and syntax, and adjusted implementation
// details to fit project requirements. All design decisions remained author-authored.

export class SlidingWindowRateLimiter {
  private requests: number[] = []
  private readonly windowMs: number
  private readonly maxRequests: number

  constructor(options: { windowMs?: number; maxRequests?: number } = {}) {
    this.windowMs = options.windowMs ?? 60 * 1000 // 1 minute default
    this.maxRequests = options.maxRequests ?? 20 // 20 requests per minute default
  }

  tryAcquire(): boolean {
    const now = Date.now()
    const windowStart = now - this.windowMs

    // Remove old requests outside the window
    this.requests = this.requests.filter((timestamp) => timestamp > windowStart)

    // Check if we can make a request
    if (this.requests.length < this.maxRequests) {
      this.requests.push(now)
      return true
    }

    return false
  }

  getRemaining(): number {
    const now = Date.now()
    const windowStart = now - this.windowMs
    const currentCount = this.requests.filter((timestamp) => timestamp > windowStart).length
    return Math.max(0, this.maxRequests - currentCount)
  }

  getNextReset(): number {
    if (this.requests.length === 0) return 0
    const oldest = this.requests[0]
    return Math.max(0, oldest + this.windowMs - Date.now())
  }
}
