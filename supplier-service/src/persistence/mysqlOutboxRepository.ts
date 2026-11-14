/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: MySQL implementation of OutboxRepository (Phase 4 plan Task 3). No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { OutboxRepository } from './outboxRepository.js';

export function createMysqlOutboxRepository(pool: Pool): OutboxRepository {
  return {
    async fetchBatch(limit) {
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT id, task_name, payload, version FROM outbox ORDER BY version ASC, id ASC LIMIT ?',
        [limit],
      );
      return rows.map((row) => ({
        id: Number(row.id),
        taskName: String(row.task_name),
        // mysql2 normally parses JSON columns; tolerate a string in case the driver returns raw text.
        payload: typeof row.payload === 'string' ? (JSON.parse(row.payload) as unknown) : row.payload,
        version: Number(row.version),
      }));
    },

    async delete(id) {
      await pool.query('DELETE FROM outbox WHERE id = ?', [id]);
    },
  };
}
