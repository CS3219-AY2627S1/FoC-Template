/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-11
 * Scope: Reads a supplier's is_deleted / is_active flags for the suspension handler's reactivation
 *        check (team decision in chat, 2026-11-11). No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review:
 */
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { SupplierStatusReader } from '../worker/handlers.js';

export function createMysqlSupplierStatusReader(pool: Pick<Pool, 'query'>): SupplierStatusReader {
  return {
    async getStatus(supplierId) {
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT supplier_name, is_deleted, is_active FROM supplier WHERE supplier_id = ?',
        [supplierId],
      );
      const row = rows[0];
      if (row === undefined) return null;
      return { name: String(row.supplier_name), isDeleted: Boolean(row.is_deleted), isActive: Boolean(row.is_active) };
    },
  };
}
