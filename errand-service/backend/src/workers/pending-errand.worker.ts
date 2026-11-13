// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-10-17
// Scope: Implemented author-defined pending/expiry processing and event/outbox publication behavior.
// Author review: Reviewed and refined the AI-assisted integration required by backend changes; the
// processing and event behavior remained author-defined.

import { ErrandRepository } from '../repositories/errand.repository.js'

export class PendingErrandWorker {
  private timer?: ReturnType<typeof setInterval>
  private running = false

  constructor(private readonly repository: ErrandRepository) {}

  start(): void {
    if (this.timer) return
    const tick = () =>
      void this.runOnce().catch((error) => {
        console.error('Pending errand recovery failed:', error)
      })
    tick()
    this.timer = setInterval(tick, 5_000)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  async runOnce(now = new Date()): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      await this.repository.recoverExpiredPending(new Date(now.getTime() - 30_000))
    } finally {
      this.running = false
    }
  }
}
