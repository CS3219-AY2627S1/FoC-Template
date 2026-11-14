/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: OutboxRepository port for the relay (Phase 4 plan Task 3); columns per the team's answer of
 *        2026-09-30. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
export interface OutboxRow {
  id: number;
  /** The Redis task name (also selects the queue). */
  taskName: string;
  /** The original job payload. */
  payload: unknown;
  /** The supplier version written by the same transaction. */
  version: number;
}

export interface OutboxRepository {
  /** Up to `limit` rows, lowest supplier version first, then lowest id. */
  fetchBatch(limit: number): Promise<OutboxRow[]>;
  delete(id: number): Promise<void>;
}
