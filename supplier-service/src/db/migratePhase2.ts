/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Command-line runner (`npm run migrate:phase2`) that upgrades an existing database created
 *        from the pre-Phase 2 init.sql. Safe to run more than once. No requirements, architecture,
 *        schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 */
import { pool } from './pool.js';
import { upgradeHoursSchema } from './phase2Schema.js';

try {
  await upgradeHoursSchema(pool);
  console.log('Phase 2 schema upgrade complete.');
  await pool.end();
} catch (error) {
  console.error('Phase 2 schema upgrade failed:', error);
  await pool.end().catch(() => undefined);
  process.exitCode = 1;
}
