/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-10
 * Scope: Command-line chain check, as the author decided (npm run audit:verify).
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { pool } from "./db";
import { verifyAuditChain } from "./audit";

// Run inside the container: docker compose exec user-service npm run audit:verify
// Exit code 0 if the chain is intact, 1 if not (or on error).
verifyAuditChain()
  .then(async (check) => {
    console.log(JSON.stringify(check, null, 2));
    await pool.end();
    process.exit(check.valid ? 0 : 1);
  })
  .catch(async (err) => {
    console.error("Audit check failed:", err instanceof Error ? err.message : err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
