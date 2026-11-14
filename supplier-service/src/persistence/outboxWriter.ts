/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Writes outbox rows inside a caller's transaction (Phase 4 plan Task 3), so a supplier write
 *        and its background tasks commit together (team answer, 2026-09-30). No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import type { PoolConnection } from 'mysql2/promise';
import type { OutboxTask } from '../queue/tasks.js';

/** Inserts one outbox row per task, all stamped with the supplier version this transaction writes. */
export async function insertOutboxRows(conn: PoolConnection, version: number, tasks: OutboxTask[]): Promise<void> {
  if (tasks.length === 0) return;
  await conn.query('INSERT INTO outbox (task_name, payload, version) VALUES ?', [
    tasks.map((task) => [task.taskName, JSON.stringify(task.payload), version]),
  ]);
}
