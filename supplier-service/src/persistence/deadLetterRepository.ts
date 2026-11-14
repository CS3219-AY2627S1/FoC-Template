/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: DeadLetterRepository port over the decided dead_letter_jobs table (Phase 4 plan Task 9;
 *        SupplierServiceArchitecture.md §6.4, §8.1). No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review:
 */
export interface DeadLetterEntry {
  jobId: string;
  taskName: string;
  payload: unknown;
  /** The last attempt's error. */
  errorTrace: string;
  /** Singapore wall-clock 'YYYY-MM-DD HH:MM:SS' (Arch §9 item 11). */
  failedAt: string;
}

export interface DeadLetterRepository {
  /** Inserts one row; `status` takes the table default UNRESOLVED. */
  insert(entry: DeadLetterEntry): Promise<void>;
}
