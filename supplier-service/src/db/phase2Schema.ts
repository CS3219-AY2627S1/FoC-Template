/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Idempotent upgrade of an existing database's `supplier_hours` table to the Phase 2 schema in
 *        SupplierServiceArchitecture.md §6.4 and §9 item 21: adds `is_24h`, moves `day_of_week` from
 *        0-6 to 1-7 (Sunday 0 becomes 7) and widens the check to 1-8. The lookup foreign keys need no
 *        change because MySQL already treats an omitted ON DELETE as RESTRICT. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 */
import type { Pool, RowDataPacket } from 'mysql2/promise';

const NEW_CHECK = 'day_of_week BETWEEN 1 AND 8';

export async function upgradeHoursSchema(pool: Pool): Promise<void> {
  const [columns] = await pool.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_hours' AND COLUMN_NAME = 'is_24h'`,
  );
  if (columns.length === 0) {
    await pool.query(
      'ALTER TABLE supplier_hours ADD COLUMN is_24h BOOLEAN NOT NULL DEFAULT FALSE AFTER close_time',
    );
  }

  const [checks] = await pool.query<RowDataPacket[]>(
    `SELECT CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'chk_supplier_hours_day'`,
  );
  const clause = checks[0] === undefined ? null : String(checks[0].CHECK_CLAUSE);
  const alreadyUpgraded = clause !== null && /between 1 and 8/i.test(clause);
  if (alreadyUpgraded) return;

  // The old check (0-6) would reject the converted rows, so drop it before converting.
  if (clause !== null) {
    await pool.query('ALTER TABLE supplier_hours DROP CHECK chk_supplier_hours_day');
  }
  await pool.query('UPDATE supplier_hours SET day_of_week = 7 WHERE day_of_week = 0');
  await pool.query(
    `ALTER TABLE supplier_hours ADD CONSTRAINT chk_supplier_hours_day CHECK (${NEW_CHECK})`,
  );
}
