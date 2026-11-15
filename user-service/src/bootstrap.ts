// Additional AI assistance: Codex (GPT-6), 2026-10-18. Scope: account-status publishing and verification. Author review: Reviewed and approved by @phuc.
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-09
 * Scope: The BOOTSTRAP_ADMIN_* settings are now read through config.ts.
 *        This disclosure covers only that change.
 * Author review: Reviewed and approved by @t-leongchuan
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-10
 * Scope: First-admin creation and its FIRST_ADMIN_CREATED audit entry in one transaction.
 * Author review of additional changes: Reviewed and approved by @t-leongchuan
 */
import { pool } from "./db";
import { prepareAccount, insertPreparedAccount, ValidationError, ConflictError } from "./accounts";
import { wakePublisher } from "./publisherWake";
import { loadAppConfig } from "./config";
import { appendAudit, logAuditAppended } from "./audit";

// Any fixed number, shared by every instance of this service
const BOOTSTRAP_LOCK_ID = 3219001;

export async function bootstrapFirstAdmin(): Promise<void> {
  const { username, email, password } = loadAppConfig().bootstrapAdmin;

  const provided = [username, email, password].filter(Boolean).length;
  if (provided === 0) {
    console.log("Admin bootstrap: not configured, skipping");
    return;
  }
  if (provided < 3) {
    throw new Error("Admin bootstrap: set all of BOOTSTRAP_ADMIN_USERNAME, _EMAIL and _PASSWORD, or none");
  }

  // The advisory lock makes check-then-create atomic across instances: if two
  // replicas start at once, the second waits here, then sees the admin and skips.
  // Hash before acquiring a connection. The locked existence check below remains authoritative.
  const prepared = await prepareAccount({ username, email, password, role: "ADMINISTRATOR" });
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [BOOTSTRAP_LOCK_ID]);

    const existing = await client.query("SELECT 1 FROM users WHERE role = 'ADMINISTRATOR' LIMIT 1");
    if ((existing.rowCount ?? 0) > 0) {
      console.log("Admin bootstrap: an administrator already exists, skipping");  // US-F5.3
      return;
    }

    // The account and its audit entry commit together, or neither does (US-NFR1.1.2)
    await client.query("BEGIN");
    let appended;
    try {
      const admin = await insertPreparedAccount(prepared, client);
      appended = await appendAudit(client, {
        actorType: "SYSTEM", actorId: null, action: "FIRST_ADMIN_CREATED", targetId: admin.id,
        previousValue: null, newValue: "ADMINISTRATOR", reason: null,
      });
      await client.query("COMMIT");
      wakePublisher();
      console.log(`Admin bootstrap: created first administrator '${admin.username}'`);  // never log the password
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
    logAuditAppended(appended);
  } catch (err) {
    if (err instanceof ValidationError) {
      throw new Error(`Admin bootstrap: invalid settings ${JSON.stringify(err.details)}`);
    }
    if (err instanceof ConflictError) {
      throw new Error(`Admin bootstrap: ${err.code}. An existing account already uses that username or email`);
    }
    throw err;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [BOOTSTRAP_LOCK_ID]);
    client.release();
  }
}
