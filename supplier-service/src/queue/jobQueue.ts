/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Redis job producer for the {id, task_name, payload} contract (Phase 3 plan Task 1;
 *        SupplierServiceArchitecture.md §8.1). No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): removed createRedisJobQueue and the ioredis import (Phase 4 plan Task 7).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
/** Generic job shape shared by every Redis job (Arch §8.1). */
export interface Job {
  id: string;
  task_name: string;
  payload: unknown;
}

export interface JobQueue {
  enqueue(queueKey: string, job: Job): Promise<void>;
}
